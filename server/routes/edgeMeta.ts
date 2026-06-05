/**
 * Edge metadata endpoints for the Cloudflare Worker that fronts the
 * Vercel-hosted frontend. The worker calls these to:
 *   1. Decide if a path needs a 301 redirect (Arabic slugs, /news/ paths).
 *   2. Fetch the SEO meta (title/description/og:image/canonical) to inject
 *      into the static HTML shell that Vercel serves.
 *
 * These are deliberately small endpoints — the full seoInjector
 * (server/seoInjector.ts) is Express-middleware-shaped and mutates `res`
 * directly. Re-extracting all 1300 lines as a JSON API is out of scope for
 * the experimental split. This module covers the high-traffic surfaces
 * (articles, categories) which is what crawlers actually fetch.
 *
 * All responses are cacheable at the edge for 60 seconds.
 */

import { Router } from "express";
import { db } from "../db";
import {
  articles,
  categories,
  users,
  enArticles,
  urArticles,
  enCategories,
  urCategories,
  deepAnalyses,
  worldDays,
  gulfEvents,
  tags,
  articleTags,
} from "@shared/schema";
import { eq, or, and, desc, ne, aliasedTable, sql } from "drizzle-orm";
import { buildNewsArticleSchemaExtras } from "../utils/newsArticleSchema";
import { TOPIC_HUBS } from "@shared/seo/topicHubs";
import { memoryCache, CACHE_TTL } from "../memoryCache";

const router = Router();
// `users` joined twice (staff author + chosen reporter) — mirror seoInjector.ts.
const reporterUsers = aliasedTable(users, "reporter_user");
const ARABIC_RE = /[؀-ۿ]/;
const containsArabic = (s: string) => ARABIC_RE.test(s);

// Pre-migration article URL prefixes (the old /<category>/<legacySlug> scheme,
// e.g. /saudia/k27fxz). These map 1:1 to a current /article/<englishSlug> via
// articles.legacySlug. Mirrors the legacy /<cat>/:id routes in client App.tsx.
// DELIBERATELY EXCLUDES current features that share the shape: `gulf` (gulf
// events), `omq` (deep analyses), `category`, `article`, `news`, `opinion`,
// `en`, `ur`, `world-day(s)`.
const LEGACY_ARTICLE_PREFIXES = new Set([
  "saudia", "saudi", "world", "arab", "local", "sport", "sports", "business",
  "economy", "politics", "society", "culture", "health", "tech", "technology",
  "cars", "tourism", "media", "entertainment", "accidents", "breaking",
  "mylife", "stations", "articles",
]);

const SITE_URL = process.env.PUBLIC_SITE_URL || "https://sabq.org";
const BRAND_OG_IMAGE = `${SITE_URL}/branding/sabq-og-image.png`;
const DEFAULT_OG_IMAGE = `${SITE_URL}/icon.png`;

function abs(url: string | null | undefined): string {
  if (!url) return DEFAULT_OG_IMAGE;
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

// Resolve the 301 target (or null) for a path. Pure DB logic — wrapped by the
// route below with an in-process cache. Returns the canonical redirect path.
async function computeSlugRedirect(path: string): Promise<string | null> {
  const articleMatch = path.match(/^\/(article|news)\/([^/?#]+)/);
  if (articleMatch) {
    const [, routeType, rawSlug] = articleMatch;
    const decodedSlug = decodeURIComponent(rawSlug);
    const needsLookup = containsArabic(decodedSlug) || routeType === "news";
    if (needsLookup) {
      const where = containsArabic(decodedSlug)
        ? eq(articles.slug, decodedSlug)
        : or(eq(articles.englishSlug, decodedSlug), eq(articles.slug, decodedSlug));
      const [row] = await db
        .select({ englishSlug: articles.englishSlug })
        .from(articles)
        .where(where!)
        .limit(1);
      if (row?.englishSlug) {
        return `/article/${row.englishSlug}`;
      }
      if (routeType === "news") {
        return `/article/${rawSlug}`;
      }
    }
  }

  const categoryMatch = path.match(/^\/category\/([^/?#]+)/);
  if (categoryMatch) {
    const [, rawSlug] = categoryMatch;
    const decodedSlug = decodeURIComponent(rawSlug);
    if (containsArabic(decodedSlug)) {
      const [row] = await db
        .select({ englishSlug: categories.englishSlug })
        .from(categories)
        .where(eq(categories.slug, decodedSlug))
        .limit(1);
      if (row?.englishSlug) {
        return `/category/${row.englishSlug}`;
      }
    }
  }

  // Legacy pre-migration article URLs: /saudia/<legacySlug>,
  // /world/<legacySlug>, /saudia/community/<legacySlug>, etc. These still
  // return 200 today (a self-canonical DUPLICATE of /article/<englishSlug>)
  // because the DB-backed legacyRedirects middleware runs on Express, which
  // edge-served HTML never reaches. That duplicate URL structure (every
  // migrated article reachable at TWO self-canonical URLs) is a major
  // crawl-budget + duplicate-content drag. Resolve the trailing segment via
  // the indexed `articles.legacySlug` and 301 to the canonical /article/ URL.
  // Excludes CURRENT features that share a /<x>/<id> shape (gulf, omq).
  const legacyMatch = path.match(/^\/([a-z]+)(?:\/[a-z0-9-]+)*\/([^/?#]+)\/?$/i);
  if (legacyMatch && LEGACY_ARTICLE_PREFIXES.has(legacyMatch[1].toLowerCase())) {
    const legacySlug = decodeURIComponent(legacyMatch[2]);
    const [row] = await db
      .select({ englishSlug: articles.englishSlug, slug: articles.slug })
      .from(articles)
      .where(eq(articles.legacySlug, legacySlug))
      .limit(1);
    const canonical = row?.englishSlug || row?.slug;
    if (canonical) {
      return `/article/${canonical}`;
    }
  }

  return null;
}

router.get("/api/edge/slug-redirect", async (req, res) => {
  res.set("Cache-Control", "public, max-age=60, s-maxage=60");
  try {
    const path = String(req.query.path || "");
    if (!path.startsWith("/")) return res.json({ redirect: null });

    // In-process cache: this endpoint is hit on (nearly) every HTML pageview by
    // the CF worker, but the redirect decision for a given path is stable. Cache
    // both positive AND negative ({redirect:null}) results for 5 min to avoid a
    // DB round-trip on the hot path. 301 targets are semantically stable, so a
    // short cache is safe for crawlers/indexing.
    const cacheKey = `edge:slug-redirect:${path}`;
    const cached = memoryCache.get<{ redirect: string | null }>(cacheKey);
    if (cached !== null) return res.json(cached);

    const payload = { redirect: await computeSlugRedirect(path) };
    memoryCache.set(cacheKey, payload, CACHE_TTL.MEDIUM);
    return res.json(payload);
  } catch (err) {
    console.error("[edge/slug-redirect] error:", err);
    return res.json({ redirect: null });
  }
});

function trunc(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n).trimEnd() + "…";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Mirrors server/seoInjector.ts — sanitize editor HTML before edge injection.
function stripUnsafeHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
}

/** Crawler-visible article body (hidden from users; React replaces #root on hydrate). */
function buildSemanticHtml(opts: {
  title: string;
  excerpt: string;
  content: string;
  publishedAt?: Date | string | null;
}): string | undefined {
  const safeBody = stripUnsafeHtml(opts.content || "");
  if (!safeBody) return undefined;
  const safeTitle = escapeHtml(opts.title);
  const safeExcerpt = escapeHtml(trunc(opts.excerpt, 300));
  const publishedIso = opts.publishedAt
    ? new Date(opts.publishedAt).toISOString()
    : undefined;
  return `<article style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><h1>${safeTitle}</h1>${publishedIso ? `<time datetime="${publishedIso}">${publishedIso}</time>` : ""}<p>${safeExcerpt}</p><div>${safeBody}</div></article>`;
}

/**
 * Crawler-visible hub of internal links, hidden from users (React replaces
 * #root on hydrate). This is the fix for "Google can't discover new articles":
 * the SPA shell exposes ZERO <a> links to crawlers, so Googlebot crawling "/"
 * or a section page finds nothing to follow (GSC: "no referring pages").
 * Injecting a real <a href="/article/…"> list gives it a link graph to crawl.
 */
function buildLinkListHtml(
  heading: string,
  links: { href: string; title: string }[],
): string | undefined {
  const items = links
    .filter((l) => l.href && l.title)
    .map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.title)}</a></li>`)
    .join("");
  if (!items) return undefined;
  return `<nav style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><h2>${escapeHtml(heading)}</h2><ul>${items}</ul></nav>`;
}

// Per-language publisher identity, OG locale, and <title> brand suffix.
const ARTICLE_BRAND = {
  ar: { name: "صحيفة سبق الإلكترونية", locale: "ar_SA", suffix: "سبق" },
  en: { name: "Sabq News", locale: "en_US", suffix: "Sabq" },
  ur: { name: "سبق نیوز", locale: "ur_PK", suffix: "سبق" },
} as const;

/**
 * For an old article whose `updatedAt` drifts far past `publishedAt` (e.g. a
 * bulk re-save months later), don't advertise a misleading "fresh" dateModified
 * to Google News. Mirrors the 30-day / 7-day clamp in seoInjector.ts.
 */
function clampModified(
  publishedAt?: Date | string | null,
  updatedAt?: Date | string | null,
  publishedIso?: string,
  modifiedIso?: string,
): string | undefined {
  if (publishedIso && modifiedIso && publishedAt && updatedAt) {
    const pubMs = new Date(publishedAt).getTime();
    const updMs = new Date(updatedAt).getTime();
    const ageMs = Date.now() - pubMs;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (ageMs > thirtyDaysMs && updMs - pubMs > sevenDaysMs) {
      return publishedIso;
    }
  }
  return modifiedIso;
}

/**
 * Age-based robots directives (mirrors seoInjector.ts). Google News should only
 * surface fresh articles, so > 30 days old we tell `googlebot-news` to noindex
 * (the article stays in web Search). > 1 year we also relax snippet limits and
 * set `noarchive`. Keeps the edge path consistent with the Express path.
 */
function computeArticleRobots(
  publishedAt?: Date | string | null,
  status?: string | null,
): { robots: string; googlebotNews?: string } {
  const base = "index, follow, max-image-preview:large";
  if (status !== "published") return { robots: "noindex, follow" };
  if (!publishedAt) return { robots: base };
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (ageMs >= 365 * day) {
    return {
      robots:
        "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1, noarchive",
      googlebotNews: "noindex",
    };
  }
  if (ageMs >= 30 * day) {
    return { robots: base, googlebotNews: "noindex" };
  }
  return { robots: base };
}

/**
 * Builds the full crawler payload for an article surface: NewsArticle JSON-LD,
 * hreflang chain, article:* / og:locale / og:site_name fields, plus the base
 * meta. The Cloudflare worker (frontend-edge-worker.js) turns these fields into
 * <head> tags. This is the parity port of seoInjector.ts's article handler —
 * the rich path that the edge-served production HTML was missing entirely.
 */
function articleMetaPayload(opts: {
  lang: "ar" | "en" | "ur";
  title: string;
  description: string;
  image: string;
  canonical: string;
  englishSlug?: string | null;
  slug: string;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  status?: string | null;
  author: string;
  section?: string | null;
  keywords?: string[];
  semanticHtml?: string;
  /** Raw article HTML — used for articleBody / wordCount in JSON-LD. */
  contentHtml?: string | null;
}) {
  const b = ARTICLE_BRAND[opts.lang];
  const publishedTime = opts.publishedAt
    ? new Date(opts.publishedAt).toISOString()
    : undefined;
  const updatedIso = opts.updatedAt
    ? new Date(opts.updatedAt).toISOString()
    : publishedTime;
  const modifiedTime = clampModified(
    opts.publishedAt,
    opts.updatedAt,
    publishedTime,
    updatedIso,
  );
  const keywords = (opts.keywords || []).filter(Boolean);

  // hreflang chain — each locale points at its siblings + x-default on Arabic.
  const arSlug = opts.englishSlug || opts.slug;
  const hreflang: { lang: string; href: string }[] = [];
  if (opts.lang === "ar") {
    hreflang.push(
      { lang: "ar", href: opts.canonical },
      { lang: "x-default", href: opts.canonical },
    );
    if (opts.englishSlug) {
      hreflang.push({ lang: "en", href: `${SITE_URL}/en/article/${opts.englishSlug}` });
    }
  } else if (opts.lang === "en") {
    hreflang.push({ lang: "en", href: opts.canonical });
    if (arSlug) {
      hreflang.push(
        { lang: "ar", href: `${SITE_URL}/article/${arSlug}` },
        { lang: "x-default", href: `${SITE_URL}/article/${arSlug}` },
      );
    }
  } else {
    hreflang.push({ lang: "ur", href: opts.canonical });
    if (arSlug) {
      hreflang.push(
        { lang: "ar", href: `${SITE_URL}/article/${arSlug}` },
        { lang: "x-default", href: `${SITE_URL}/article/${arSlug}` },
      );
    }
  }

  const schemaExtras = buildNewsArticleSchemaExtras(
    opts.contentHtml,
    opts.image,
    SITE_URL,
  );

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    mainEntityOfPage: { "@type": "WebPage", "@id": opts.canonical },
    headline: opts.title,
    description: opts.description,
    image: schemaExtras.image,
    datePublished: publishedTime,
    dateModified: modifiedTime,
    inLanguage: opts.lang,
    author: { "@type": "Person", name: opts.author },
    publisher: {
      "@type": "NewsMediaOrganization",
      name: b.name,
      logo: { "@type": "ImageObject", url: BRAND_OG_IMAGE },
    },
    speakable: schemaExtras.speakable,
  };
  if (schemaExtras.articleBody) jsonLd.articleBody = schemaExtras.articleBody;
  if (schemaExtras.wordCount) jsonLd.wordCount = schemaExtras.wordCount;
  if (opts.section) jsonLd.articleSection = opts.section;
  if (keywords.length) jsonLd.keywords = keywords;

  const { robots, googlebotNews } = computeArticleRobots(
    opts.publishedAt,
    opts.status,
  );

  return {
    title: `${opts.title} | ${b.suffix}`,
    description: opts.description,
    image: opts.image,
    canonical: opts.canonical,
    robots,
    googlebotNews,
    type: "article",
    locale: b.locale,
    siteName: b.name,
    imageWidth: 1200,
    imageHeight: 630,
    publishedTime,
    modifiedTime,
    section: opts.section || undefined,
    tags: keywords.length ? keywords : undefined,
    author: opts.author,
    twitterSite: "@sabq",
    hreflang,
    jsonLd,
    semanticHtml: opts.semanticHtml,
  };
}

/** Arabic-table article lookup with byline + section joins (ar + opinion). */
async function fetchArArticle(slug: string) {
  const where = or(eq(articles.englishSlug, slug), eq(articles.slug, slug));
  const [row] = await db
    .select({
      title: articles.title,
      categoryId: articles.categoryId,
      id: articles.id,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      excerpt: articles.excerpt,
      aiSummary: articles.aiSummary,
      content: articles.content,
      imageUrl: articles.imageUrl,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
      status: articles.status,
      seo: articles.seo,
      categoryName: categories.nameAr,
      categorySlug: categories.slug,
      categoryEnglishSlug: categories.englishSlug,
      reporterId: articles.reporterId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      reporterFirstName: reporterUsers.firstName,
      reporterLastName: reporterUsers.lastName,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .leftJoin(users, eq(articles.authorId, users.id))
    .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
    .where(where!)
    .limit(1);
  return row || null;
}

function buildArArticlePayload(
  row: NonNullable<Awaited<ReturnType<typeof fetchArArticle>>>,
  slug: string,
  canonical: string,
) {
  const seoData = (row.seo as any) || {};
  const title = row.title || seoData.metaTitle || "";
  // Description priority mirrors seoInjector.ts: editorial metaDescription, then
  // the AI summary (so the smart summary appears in shares), then the excerpt.
  const description = trunc(
    seoData.metaDescription || row.aiSummary || row.excerpt || title,
    220,
  );
  // Byline prefers the chosen reporter over the staff author, then the brand.
  const reporterName = [row.reporterFirstName, row.reporterLastName].filter(Boolean).join(" ");
  const editorName = [row.authorFirstName, row.authorLastName].filter(Boolean).join(" ");
  const author = reporterName || editorName || ARTICLE_BRAND.ar.name;
  return articleMetaPayload({
    lang: "ar",
    title,
    description,
    image: abs(row.imageUrl),
    canonical,
    englishSlug: row.englishSlug,
    slug,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    status: row.status,
    author,
    section: row.categoryName,
    keywords: Array.isArray(seoData.keywords) ? seoData.keywords : [],
    contentHtml: row.content,
    semanticHtml: buildSemanticHtml({
      title,
      excerpt: row.excerpt || row.aiSummary || "",
      content: row.content || "",
      publishedAt: row.publishedAt,
    }),
  });
}

/** English-table article lookup with byline join. */
async function fetchEnArticle(slug: string) {
  const where = or(eq(enArticles.englishSlug, slug), eq(enArticles.slug, slug));
  const [row] = await db
    .select({
      title: enArticles.title,
      slug: enArticles.slug,
      englishSlug: enArticles.englishSlug,
      excerpt: enArticles.excerpt,
      aiSummary: enArticles.aiSummary,
      content: enArticles.content,
      imageUrl: enArticles.imageUrl,
      publishedAt: enArticles.publishedAt,
      updatedAt: enArticles.updatedAt,
      status: enArticles.status,
      seo: enArticles.seo,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
    })
    .from(enArticles)
    .leftJoin(users, eq(enArticles.authorId, users.id))
    .where(where!)
    .limit(1);
  return row || null;
}

function buildEnArticlePayload(
  row: NonNullable<Awaited<ReturnType<typeof fetchEnArticle>>>,
  slug: string,
) {
  const seoData = (row.seo as any) || {};
  const title = row.title || seoData.metaTitle || "";
  const description = trunc(
    seoData.metaDescription || row.aiSummary || row.excerpt || title,
    220,
  );
  const author =
    [row.authorFirstName, row.authorLastName].filter(Boolean).join(" ") ||
    ARTICLE_BRAND.en.name;
  return articleMetaPayload({
    lang: "en",
    title,
    description,
    image: abs(row.imageUrl),
    canonical: `${SITE_URL}/en/article/${row.englishSlug || slug}`,
    englishSlug: row.englishSlug,
    slug,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    status: row.status,
    author,
    keywords: Array.isArray(seoData.keywords) ? seoData.keywords : [],
    contentHtml: row.content,
    semanticHtml: buildSemanticHtml({
      title,
      excerpt: row.excerpt || row.aiSummary || "",
      content: row.content || "",
      publishedAt: row.publishedAt,
    }),
  });
}

/** Urdu-table article lookup with byline join. */
async function fetchUrArticle(slug: string) {
  const where = or(eq(urArticles.englishSlug, slug), eq(urArticles.slug, slug));
  const [row] = await db
    .select({
      title: urArticles.title,
      slug: urArticles.slug,
      englishSlug: urArticles.englishSlug,
      excerpt: urArticles.excerpt,
      aiSummary: urArticles.aiSummary,
      content: urArticles.content,
      imageUrl: urArticles.imageUrl,
      publishedAt: urArticles.publishedAt,
      updatedAt: urArticles.updatedAt,
      status: urArticles.status,
      seo: urArticles.seo,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
    })
    .from(urArticles)
    .leftJoin(users, eq(urArticles.authorId, users.id))
    .where(where!)
    .limit(1);
  return row || null;
}

function buildUrArticlePayload(
  row: NonNullable<Awaited<ReturnType<typeof fetchUrArticle>>>,
  slug: string,
) {
  const seoData = (row.seo as any) || {};
  const title = row.title || seoData.metaTitle || "";
  const description = trunc(
    seoData.metaDescription || row.aiSummary || row.excerpt || title,
    220,
  );
  const author =
    [row.authorFirstName, row.authorLastName].filter(Boolean).join(" ") ||
    ARTICLE_BRAND.ur.name;
  return articleMetaPayload({
    lang: "ur",
    title,
    description,
    image: abs(row.imageUrl),
    canonical: `${SITE_URL}/ur/article/${row.englishSlug || slug}`,
    englishSlug: row.englishSlug,
    slug,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    status: row.status,
    author,
    keywords: Array.isArray(seoData.keywords) ? seoData.keywords : [],
    contentHtml: row.content,
    semanticHtml: buildSemanticHtml({
      title,
      excerpt: row.excerpt || row.aiSummary || "",
      content: row.content || "",
      publishedAt: row.publishedAt,
    }),
  });
}

function defaultMeta(path: string) {
  return {
    title: "سبق الذكية",
    description: "منصة إخبارية ذكية مدعومة بالذكاء الاصطناعي",
    image: DEFAULT_OG_IMAGE,
    canonical: `${SITE_URL}${path === "/" ? "" : path}`,
    robots: "index,follow",
    type: "website",
  };
}

interface RouteHandler {
  pattern: RegExp;
  handle: (match: RegExpMatchArray) => Promise<any | null>;
}

/**
 * Keyword/tag landing meta. Parity port of seoInjector.ts handleKeywordPage:
 * resolves the tag by slug, and — crucially — returns `noindex, follow` when no
 * PUBLISHED article carries the tag. Without this the edge fallback marked every
 * /keyword/* (even nonexistent ones) `index,follow`, minting thin/soft-404
 * indexable pages. Title prefers the real tag name when content exists.
 */
async function buildKeywordMeta(slug: string, isEn: boolean) {
  const [row] = await db
    .select({
      id: tags.id,
      nameAr: tags.nameAr,
      nameEn: tags.nameEn,
      publishedCount: sql<number>`count(${articles.id})::int`,
    })
    .from(articleTags)
    .innerJoin(tags, eq(tags.id, articleTags.tagId))
    .innerJoin(articles, eq(articles.id, articleTags.articleId))
    .where(and(
      eq(tags.slug, slug),
      eq(tags.status, "active"),
      eq(articles.status, "published"),
    ))
    .groupBy(tags.id, tags.nameAr, tags.nameEn)
    .limit(1);
  const minPublishedArticles =
    TOPIC_HUBS.find((hub) => hub.slug === slug)?.minPublishedArticles ?? 3;
  const publishedCount = row?.publishedCount || 0;
  const hasContent = publishedCount >= minPublishedArticles;
  const display =
    (isEn ? row?.nameEn : row?.nameAr) ||
    slug.replace(/[-_]+/g, " ");
  let semanticHtml: string | undefined;
  if (hasContent && row?.id) {
    const latestRows = await db
      .select({
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        title: articles.title,
      })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .innerJoin(articles, eq(articles.id, articleTags.articleId))
      .where(and(
        eq(tags.id, row.id),
        eq(tags.status, "active"),
        eq(articles.status, "published"),
      ))
      .orderBy(desc(articles.publishedAt))
      .limit(20);
    semanticHtml = buildLinkListHtml(
      isEn ? `Latest ${display} articles` : `أحدث أخبار ${display}`,
      latestRows.map((article) => ({
        href: `/article/${article.englishSlug || article.slug}`,
        title: article.title || "",
      })),
    );
  }
  return {
    title: isEn ? `${display} — Sabq` : `${display} — سبق`,
    description: isEn
      ? `Latest news and articles tagged with ${display} on Sabq News.`
      : `أحدث الأخبار والمقالات المتعلقة بـ ${display} على صحيفة سبق الإلكترونية.`,
    image: BRAND_OG_IMAGE,
    canonical: `${SITE_URL}${isEn ? "/en" : ""}/keyword/${encodeURIComponent(slug)}`,
    robots: hasContent ? "index,follow" : "noindex, follow",
    type: "website",
    locale: isEn ? "en_US" : "ar_SA",
    semanticHtml,
  };
}

/**
 * Reporter/author profile meta. Parity port of seoInjector.ts
 * handleReporterPage: looked up by users.id. Returns `noindex, follow` when the
 * id doesn't resolve (was `index,follow` on the generic edge fallback).
 */
async function buildReporterMeta(idOrSlug: string, isEn: boolean) {
  const [reporter] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, idOrSlug))
    .limit(1);
  const canonical = `${SITE_URL}${isEn ? "/en" : ""}/reporter/${encodeURIComponent(idOrSlug)}`;
  if (!reporter) {
    return {
      title: isEn ? "Reporter — Sabq" : "كاتب — سبق",
      description: isEn
        ? "Reporter profile on Sabq News."
        : "صفحة كاتب على صحيفة سبق الإلكترونية.",
      image: BRAND_OG_IMAGE,
      canonical,
      robots: "noindex, follow",
      type: "profile",
      locale: isEn ? "en_US" : "ar_SA",
    };
  }
  const fullName =
    [reporter.firstName, reporter.lastName].filter(Boolean).join(" ") || idOrSlug;
  return {
    title: isEn ? `${fullName} — Sabq` : `${fullName} — سبق`,
    description: isEn
      ? `Articles by ${fullName} on Sabq News.`
      : `مقالات وأخبار الكاتب ${fullName} على صحيفة سبق الإلكترونية.`,
    image: BRAND_OG_IMAGE,
    canonical,
    robots: "index,follow",
    type: "profile",
    locale: isEn ? "en_US" : "ar_SA",
  };
}

const ROUTE_HANDLERS: RouteHandler[] = [
  // Homepage — inject a crawlable list of the most recent article links so
  // Googlebot can DISCOVER new articles by crawling "/" (the SPA shell shows
  // crawlers no links at all). Title/canonical stay the site defaults.
  {
    pattern: /^\/$/,
    handle: async () => {
      // Two crawlable hubs: the section index (was MISSING — homepage exposed
      // zero /category/ links, so Googlebot had no path to the section pages
      // where Google News discovers new articles) + the latest-articles list.
      const [rows, cats] = await Promise.all([
        db
          .select({
            slug: articles.slug,
            englishSlug: articles.englishSlug,
            title: articles.title,
          })
          .from(articles)
          .where(eq(articles.status, "published"))
          .orderBy(desc(articles.publishedAt))
          .limit(60),
        db
          .select({
            nameAr: categories.nameAr,
            slug: categories.slug,
            englishSlug: categories.englishSlug,
          })
          .from(categories)
          // Shown sections use status='visible' (the schema default 'active'
          // is the "category status trap" — dashboard edits reset it and HIDE
          // the section). Mirror /sitemap-categories.xml so homepage links ==
          // the indexable category set.
          .where(and(eq(categories.status, "visible"), eq(categories.isIfoxCategory, false)))
          .orderBy(categories.displayOrder)
          .limit(25),
      ]);
      const sections = buildLinkListHtml(
        "أقسام سبق",
        cats.map((c) => ({
          href: `/category/${c.englishSlug || c.slug}`,
          title: c.nameAr || "",
        })),
      );
      const latest = buildLinkListHtml(
        "أحدث الأخبار على سبق",
        rows.map((r) => ({
          href: `/article/${r.englishSlug || r.slug}`,
          title: r.title || "",
        })),
      );
      const semanticHtml = [sections, latest].filter(Boolean).join("") || undefined;
      return {
        ...defaultMeta("/"),
        semanticHtml,
      };
    },
  },
  // Arabic article: /article/:slug
  {
    pattern: /^\/article\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const row = await fetchArArticle(slug);
      if (!row) return null;
      return buildArArticlePayload(row, slug, `${SITE_URL}/article/${row.englishSlug || slug}`);
    },
  },
  // Opinion article: /opinion/:slug
  // Lives in the same `articles` table with articleType='opinion' — same
  // schema as the article handler. Opinion articles are reachable at BOTH
  // /opinion/<slug> (frontend links) AND /article/<slug> (what the XML sitemap
  // emits — the sitemap query is not articleType-filtered). Two 200s with
  // self-canonicals = Google's "Duplicate, chose different canonical" (~44k in
  // GSC). Consolidate on /article/<slug> — the sitemap URL — so /opinion/
  // folds into it. (Do NOT 404 either side: /article/ versions are advertised
  // in the sitemap; 404ing them would create tens of thousands of 404s.)
  {
    pattern: /^\/opinion\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const row = await fetchArArticle(slug);
      if (!row) return null;
      return buildArArticlePayload(row, slug, `${SITE_URL}/article/${row.englishSlug || slug}`);
    },
  },
  // English article: /en/article/:slug
  {
    pattern: /^\/en\/article\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const row = await fetchEnArticle(slug);
      if (!row) return null;
      return buildEnArticlePayload(row, slug);
    },
  },
  // Urdu article: /ur/article/:slug
  {
    pattern: /^\/ur\/article\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const row = await fetchUrArticle(slug);
      if (!row) return null;
      return buildUrArticlePayload(row, slug);
    },
  },
  // Arabic category: /category/:slug
  {
    pattern: /^\/category\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const where = or(eq(categories.englishSlug, slug), eq(categories.slug, slug));
      const [row] = await db
        .select({
          id: categories.id,
          nameAr: categories.nameAr,
          nameEn: categories.nameEn,
          description: categories.description,
          heroImageUrl: categories.heroImageUrl,
          englishSlug: categories.englishSlug,
        })
        .from(categories)
        .where(where!)
        .limit(1);
      if (!row) return null;
      const displayName = row.nameAr || row.nameEn;
      // Crawlable list of this section's recent articles → a discovery hub so
      // Googlebot reaches the section's new articles by following links.
      const sectionArticles = await db
        .select({
          slug: articles.slug,
          englishSlug: articles.englishSlug,
          title: articles.title,
        })
        .from(articles)
        .where(and(eq(articles.categoryId, row.id), eq(articles.status, "published")))
        .orderBy(desc(articles.publishedAt))
        .limit(40);
      return {
        title: `${displayName} | سبق`,
        description: trunc(row.description || `أحدث الأخبار في ${displayName}`, 220),
        image: row.heroImageUrl ? abs(row.heroImageUrl) : BRAND_OG_IMAGE,
        canonical: `${SITE_URL}/category/${row.englishSlug || slug}`,
        robots: "index,follow",
        type: "website",
        locale: "ar_SA",
        semanticHtml: buildLinkListHtml(
          `أحدث الأخبار في ${displayName}`,
          sectionArticles.map((r) => ({
            href: `/article/${r.englishSlug || r.slug}`,
            title: r.title || "",
          })),
        ),
      };
    },
  },
  // English category: /en/category/:slug
  {
    pattern: /^\/en\/category\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const [row] = await db
        .select({
          name: enCategories.name,
          description: enCategories.description,
          heroImageUrl: enCategories.heroImageUrl,
          slug: enCategories.slug,
        })
        .from(enCategories)
        .where(eq(enCategories.slug, slug))
        .limit(1);
      if (!row) return null;
      return {
        title: `${row.name} | Sabq`,
        description: trunc(row.description || `Latest news in ${row.name}`, 220),
        image: row.heroImageUrl ? abs(row.heroImageUrl) : BRAND_OG_IMAGE,
        canonical: `${SITE_URL}/en/category/${row.slug}`,
        robots: "index,follow",
        type: "website",
        locale: "en_US",
      };
    },
  },
  // Urdu category: /ur/category/:slug
  {
    pattern: /^\/ur\/category\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const [row] = await db
        .select({
          name: urCategories.name,
          description: urCategories.description,
          heroImageUrl: urCategories.heroImageUrl,
          slug: urCategories.slug,
        })
        .from(urCategories)
        .where(eq(urCategories.slug, slug))
        .limit(1);
      if (!row) return null;
      return {
        title: `${row.name} | سبق`,
        description: trunc(row.description || `تازہ ترین خبریں: ${row.name}`, 220),
        image: row.heroImageUrl ? abs(row.heroImageUrl) : BRAND_OG_IMAGE,
        canonical: `${SITE_URL}/ur/category/${row.slug}`,
        robots: "index,follow",
        type: "website",
        locale: "ur_PK",
      };
    },
  },
  // Deep analysis: /omq/:id (also legacy /deep-analysis/:id resolves through omq)
  {
    pattern: /^\/omq\/([^/?#]+)/,
    handle: async (m) => {
      const id = decodeURIComponent(m[1]);
      // /omq/stats and /omq (without id) are SPA listings — skip DB lookup.
      if (id === "stats") return null;
      const [row] = await db
        .select({
          id: deepAnalyses.id,
          title: deepAnalyses.title,
          description: deepAnalyses.description,
          executiveSummary: deepAnalyses.executiveSummary,
          status: deepAnalyses.status,
        })
        .from(deepAnalyses)
        .where(eq(deepAnalyses.id, id))
        .limit(1);
      if (!row) {
        return {
          title: "تحليل عميق — سبق",
          description: "تحليل عميق على صحيفة سبق الإلكترونية.",
          image: BRAND_OG_IMAGE,
          canonical: `${SITE_URL}/omq/${encodeURIComponent(id)}`,
          robots: "noindex, follow",
          type: "article",
          locale: "ar_SA",
        };
      }
      const indexable = row.status === "published" || row.status === "completed";
      return {
        title: `${row.title} — سبق`,
        description: trunc(row.description || row.executiveSummary || "تحليل عميق على صحيفة سبق الإلكترونية.", 220),
        image: BRAND_OG_IMAGE,
        canonical: `${SITE_URL}/omq/${encodeURIComponent(id)}`,
        robots: indexable ? "index,follow" : "noindex, follow",
        type: "article",
        locale: "ar_SA",
      };
    },
  },
  // World days: /world-day/:id
  {
    pattern: /^\/world-day\/([^/?#]+)/,
    handle: async (m) => {
      const id = decodeURIComponent(m[1]);
      const [row] = await db
        .select({
          id: worldDays.id,
          nameAr: worldDays.nameAr,
          nameEn: worldDays.nameEn,
          description: worldDays.description,
        })
        .from(worldDays)
        .where(eq(worldDays.id, id))
        .limit(1);
      if (!row) return null;
      const displayName = row.nameAr || row.nameEn || "اليوم العالمي";
      return {
        title: `${displayName} — سبق`,
        description: trunc(row.description || `تغطية ${displayName} على صحيفة سبق الإلكترونية.`, 220),
        image: BRAND_OG_IMAGE,
        canonical: `${SITE_URL}/world-day/${encodeURIComponent(id)}`,
        robots: "index,follow",
        type: "article",
        locale: "ar_SA",
      };
    },
  },
  // Gulf events: /gulf/:id (event detail) — SPA archive page consumes the id
  {
    pattern: /^\/gulf\/([^/?#]+)/,
    handle: async (m) => {
      const id = decodeURIComponent(m[1]);
      const [row] = await db
        .select({
          id: gulfEvents.id,
          country: gulfEvents.country,
          eventType: gulfEvents.eventType,
          content: gulfEvents.content,
          status: gulfEvents.status,
        })
        .from(gulfEvents)
        .where(eq(gulfEvents.id, id))
        .limit(1);
      if (!row) return null;
      const title = `${row.country} — ${row.eventType} | سبق`;
      return {
        title,
        description: trunc(row.content, 220),
        image: BRAND_OG_IMAGE,
        canonical: `${SITE_URL}/gulf/${encodeURIComponent(id)}`,
        robots: row.status === "published" ? "index,follow" : "noindex, follow",
        type: "article",
        locale: "ar_SA",
      };
    },
  },
  // Keyword/tag landing: /keyword/:slug + /en/keyword/:slug
  {
    pattern: /^\/keyword\/([^/?#]+)/,
    handle: async (m) => buildKeywordMeta(decodeURIComponent(m[1]), false),
  },
  {
    pattern: /^\/en\/keyword\/([^/?#]+)/,
    handle: async (m) => buildKeywordMeta(decodeURIComponent(m[1]), true),
  },
  // Reporter/author profile: /reporter/:idOrSlug + /en/reporter/:idOrSlug
  {
    pattern: /^\/reporter\/([^/?#]+)/,
    handle: async (m) => buildReporterMeta(decodeURIComponent(m[1]), false),
  },
  {
    pattern: /^\/en\/reporter\/([^/?#]+)/,
    handle: async (m) => buildReporterMeta(decodeURIComponent(m[1]), true),
  },
  // Gulf live coverage landing
  {
    pattern: /^\/gulf-live\/?$/,
    handle: async () => ({
      title: "الخليج الآن — تغطية لحظة بلحظة | سبق",
      description: "آخر تطورات أحداث منطقة الخليج لحظة بلحظة على صحيفة سبق الإلكترونية.",
      image: BRAND_OG_IMAGE,
      canonical: `${SITE_URL}/gulf-live`,
      robots: "index,follow",
      type: "website",
      locale: "ar_SA",
    }),
  },
  // World days landing
  {
    pattern: /^\/world-days\/?$/,
    handle: async () => ({
      title: "الأيام العالمية — سبق",
      description: "تغطية الأيام العالمية والمناسبات على صحيفة سبق الإلكترونية.",
      image: BRAND_OG_IMAGE,
      canonical: `${SITE_URL}/world-days`,
      robots: "index,follow",
      type: "website",
      locale: "ar_SA",
    }),
  },
];

/**
 * Aggregated SSR bundle for the Next.js public frontend (web-next/).
 *
 * One request returns everything the Next `/article/[slug]` page needs to
 * render the full article server-side: the rich meta payload (title, OG,
 * hreflang, robots), the NewsArticle JSON-LD, AND the sanitized renderable
 * body — so the LCP image + full text appear in the first byte of HTML without
 * waiting for the SPA bundle. Reuses the exact same DB lookup and meta builder
 * as the edge seo-meta endpoint, so structured data stays identical across
 * surfaces. Arabic articles only for Phase 1; en/ur added in Phase 2.
 */
router.get("/api/articles/:slug/seo-bundle", async (req, res) => {
  res.set(
    "Cache-Control",
    "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  );
  try {
    const slug = decodeURIComponent(String(req.params.slug || ""));
    if (!slug) return res.status(400).json({ error: "missing slug" });
    const langParam = String(req.query.lang || "ar").toLowerCase();
    const lang: "ar" | "en" | "ur" =
      langParam === "en" ? "en" : langParam === "ur" ? "ur" : "ar";

    // Per-language lookup + meta build, reusing the exact functions that back
    // the edge seo-meta handlers so structured data stays identical.
    let row:
      | NonNullable<Awaited<ReturnType<typeof fetchArArticle>>>
      | NonNullable<Awaited<ReturnType<typeof fetchEnArticle>>>
      | NonNullable<Awaited<ReturnType<typeof fetchUrArticle>>>
      | null = null;
    let meta: ReturnType<typeof articleMetaPayload> | null = null;
    let category: string | null = null;
    let categoryHref: string | null = null;
    let categoryLatest: Array<{
      href: string;
      title: string;
      excerpt: string;
      imageUrl: string | null;
      publishedAt: Date | string | null;
      newsType?: string | null;
      category?: string | null;
      categoryColor?: string | null;
    }> = [];
    let articleTagLinks: Array<{
      id: string;
      slug: string;
      nameAr: string;
      nameEn: string | null;
      href: string;
    }> = [];
    let reporterHref: string | null = null;

    if (lang === "en") {
      const r = await fetchEnArticle(slug);
      if (r) {
        row = r;
        meta = buildEnArticlePayload(r, slug);
      }
    } else if (lang === "ur") {
      const r = await fetchUrArticle(slug);
      if (r) {
        row = r;
        meta = buildUrArticlePayload(r, slug);
      }
    } else {
      const r = await fetchArArticle(slug);
      if (r) {
        row = r;
        category = r.categoryName || null;
        const catSlug = r.categoryEnglishSlug || r.categorySlug;
        categoryHref = catSlug ? `/category/${catSlug}` : null;
        const reporterName = [r.reporterFirstName, r.reporterLastName]
          .filter(Boolean)
          .join(" ");
        reporterHref = r.reporterId && reporterName ? `/reporter/${r.reporterId}` : null;
        meta = buildArArticlePayload(
          r,
          slug,
          `${SITE_URL}/article/${r.englishSlug || r.slug}`,
        );
        if (r.status === "published") {
          const tagRows = await db
            .select({
              id: tags.id,
              slug: tags.slug,
              nameAr: tags.nameAr,
              nameEn: tags.nameEn,
            })
            .from(articleTags)
            .innerJoin(tags, eq(tags.id, articleTags.tagId))
            .where(and(
              eq(articleTags.articleId, r.id),
              eq(tags.status, "active"),
            ))
            .orderBy(desc(tags.usageCount), tags.nameAr)
            .limit(12);
          articleTagLinks = tagRows
            .filter((tag) => tag.slug && tag.nameAr)
            .map((tag) => ({
              id: tag.id,
              slug: tag.slug,
              nameAr: tag.nameAr,
              nameEn: tag.nameEn || null,
              href: `/keyword/${encodeURIComponent(tag.slug)}`,
            }));
        }
        if (r.categoryId) {
          const latestRows = await db
            .select({
              slug: articles.slug,
              englishSlug: articles.englishSlug,
              title: articles.title,
              excerpt: articles.excerpt,
              imageUrl: articles.imageUrl,
              publishedAt: articles.publishedAt,
              newsType: articles.newsType,
              categoryColor: categories.color,
            })
            .from(articles)
            .leftJoin(categories, eq(articles.categoryId, categories.id))
            .where(and(
              eq(articles.categoryId, r.categoryId),
              eq(articles.status, "published"),
              ne(articles.id, r.id),
            ))
            .orderBy(desc(articles.publishedAt))
            .limit(8);
          categoryLatest = latestRows
            .filter((item) => item.title && (item.englishSlug || item.slug))
            .map((item) => ({
              href: `/article/${item.englishSlug || item.slug}`,
              title: item.title || "",
              excerpt: trunc(item.excerpt || "", 160),
              imageUrl: item.imageUrl ? abs(item.imageUrl) : null,
              publishedAt: item.publishedAt,
              newsType: item.newsType || null,
              category,
              categoryColor: item.categoryColor || null,
            }));
        }
      }
    }

    if (!row || !meta) return res.status(404).json({ error: "not_found" });
    const seoData = (row.seo as any) || {};

    return res.json({
      lang,
      slug: row.slug,
      englishSlug: row.englishSlug,
      title: row.title,
      excerpt: row.excerpt || row.aiSummary || "",
      contentHtml: stripUnsafeHtml(row.content || ""),
      imageUrl: abs(row.imageUrl),
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      author: meta.author,
      reporterHref,
      category,
      categoryHref,
      categoryLatest,
      articleTags: articleTagLinks,
      keywords: Array.isArray(seoData.keywords) ? seoData.keywords : [],
      meta: {
        title: meta.title,
        description: meta.description,
        canonical: meta.canonical,
        image: meta.image,
        robots: meta.robots,
        googlebotNews: meta.googlebotNews,
        locale: meta.locale,
        siteName: meta.siteName,
        hreflang: meta.hreflang,
        publishedTime: meta.publishedTime,
        modifiedTime: meta.modifiedTime,
        section: meta.section,
        tags: meta.tags,
      },
      jsonLd: meta.jsonLd,
    });
  } catch (err) {
    console.error("[articles/seo-bundle] error:", err);
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * Aggregated SSR bundle for the Next.js category page. Resolves the category by
 * englishSlug or Arabic slug (matching the canonical URL the edge emits), then
 * returns category meta + a renderable list of recent published articles
 * (title, slug, image, excerpt) so the list paints server-side.
 */
router.get("/api/categories/:slug/seo-bundle", async (req, res) => {
  res.set(
    "Cache-Control",
    "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  );
  try {
    const slug = decodeURIComponent(String(req.params.slug || ""));
    if (!slug) return res.status(400).json({ error: "missing slug" });
    const limit = Math.min(parseInt(String(req.query.limit || "30"), 10) || 30, 60);

    const where = or(eq(categories.englishSlug, slug), eq(categories.slug, slug));
    const [cat] = await db
      .select({
        id: categories.id,
        nameAr: categories.nameAr,
        nameEn: categories.nameEn,
        description: categories.description,
        slug: categories.slug,
        englishSlug: categories.englishSlug,
        color: categories.color,
      })
      .from(categories)
      .where(where!)
      .limit(1);
    if (!cat) return res.status(404).json({ error: "not_found" });

    const displayName = cat.nameAr || cat.nameEn || "";
    const canonicalSlug = cat.englishSlug || cat.slug;
    const rows = await db
      .select({
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        title: articles.title,
        excerpt: articles.excerpt,
        imageUrl: articles.imageUrl,
        publishedAt: articles.publishedAt,
        newsType: articles.newsType,
      })
      .from(articles)
      .where(and(eq(articles.categoryId, cat.id), eq(articles.status, "published")))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);

    return res.json({
      slug: cat.slug,
      englishSlug: cat.englishSlug,
      name: displayName,
      description: trunc(cat.description || `أحدث الأخبار في ${displayName}`, 220),
      canonical: `${SITE_URL}/category/${canonicalSlug}`,
      color: cat.color || null,
      articles: rows.map((r) => ({
        href: `/article/${r.englishSlug || r.slug}`,
        title: r.title || "",
        excerpt: trunc(r.excerpt || "", 160),
        imageUrl: r.imageUrl ? abs(r.imageUrl) : null,
        publishedAt: r.publishedAt,
        newsType: r.newsType || null,
        category: displayName,
        categoryColor: cat.color || null,
      })),
    });
  } catch (err) {
    console.error("[categories/seo-bundle] error:", err);
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * Aggregated SSR bundle for the Next.js homepage: latest published articles
 * (renderable cards) + the section list. Mirrors the homepage edge handler's
 * queries but returns full card fields instead of a hidden link list.
 */
router.get("/api/edge/home-bundle", async (_req, res) => {
  res.set(
    "Cache-Control",
    "public, max-age=60, s-maxage=180, stale-while-revalidate=600",
  );
  try {
    const [rows, cats] = await Promise.all([
      db
        .select({
          slug: articles.slug,
          englishSlug: articles.englishSlug,
          title: articles.title,
          excerpt: articles.excerpt,
          imageUrl: articles.imageUrl,
          publishedAt: articles.publishedAt,
          newsType: articles.newsType,
          categoryName: categories.nameAr,
          categoryColor: categories.color,
        })
        .from(articles)
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .where(eq(articles.status, "published"))
        .orderBy(desc(articles.publishedAt))
        .limit(30),
      db
        .select({
          nameAr: categories.nameAr,
          slug: categories.slug,
          englishSlug: categories.englishSlug,
          color: categories.color,
        })
        .from(categories)
        .limit(40),
    ]);

    return res.json({
      canonical: SITE_URL,
      articles: rows.map((r) => ({
        href: `/article/${r.englishSlug || r.slug}`,
        title: r.title || "",
        excerpt: trunc(r.excerpt || "", 160),
        imageUrl: r.imageUrl ? abs(r.imageUrl) : null,
        publishedAt: r.publishedAt,
        newsType: r.newsType || null,
        category: r.categoryName || null,
        categoryColor: r.categoryColor || null,
      })),
      sections: cats
        .filter((c) => c.nameAr)
        .map((c) => ({
          href: `/category/${c.englishSlug || c.slug}`,
          title: c.nameAr || "",
          color: c.color || null,
        })),
    });
  } catch (err) {
    console.error("[edge/home-bundle] error:", err);
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * No-secret diagnostics for the Google Indexing API (the driver of instant
 * archiving). Reports whether credentials are configured + valid, a masked
 * client email, the private-key shape, and the last submission result + counts
 * since boot. Use to confirm "is instant indexing actually working right now?"
 */
router.get("/api/edge/indexing-status", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const { getIndexingDiagnostics } = await import(
      "../services/googleIndexingService"
    );
    return res.json(getIndexingDiagnostics());
  } catch (err) {
    console.error("[edge/indexing-status] error:", err);
    return res.status(500).json({ error: "internal" });
  }
});

router.get("/api/edge/seo-meta", async (req, res) => {
  res.set("Cache-Control", "public, max-age=60, s-maxage=60");
  try {
    const path = String(req.query.path || "");
    if (!path.startsWith("/")) return res.json(defaultMeta(path));

    for (const handler of ROUTE_HANDLERS) {
      const match = path.match(handler.pattern);
      if (!match) continue;
      const meta = await handler.handle(match);
      if (meta) return res.json(meta);
      // Pattern matched but row not found → fall through to default 404-ish meta.
      return res.json({
        ...defaultMeta(path),
        robots: "noindex, follow",
      });
    }

    return res.json(defaultMeta(path));
  } catch (err) {
    console.error("[edge/seo-meta] error:", err);
    return res.status(500).json({ error: "internal" });
  }
});

export default router;
