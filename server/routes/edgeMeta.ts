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
  angles,
  topics,
  staff,
} from "@shared/schema";
import { eq, or, and, desc, ne, aliasedTable, sql, inArray, like, ilike, notIlike } from "drizzle-orm";
import { buildNewsArticleSchemaExtras } from "../utils/newsArticleSchema";
import { sanitizeArticleHtml } from "../utils/sanitizeHtml";
import {
  buildArticleAuthorPerson,
  buildPersonJsonLd,
  buildProfilePageJsonLd,
  reporterProfileUrl,
  muqtarabAngleUrl,
  muqtarabWriterUrl,
  SABQ_ORG_AR,
  SABQ_ORG_EN,
} from "../utils/creatorSchema";
import { TOPIC_HUBS } from "@shared/seo/topicHubs";
import { MemoryCache, CACHE_TTL } from "../memoryCache";
import { resolveMuqtarabOgImage } from "../utils/muqtarabShareImage";
import { getTeamSeoMeta, getMatchSeoMeta } from "../services/saudiLeagueService";
import { getMeetingByInviteToken } from "../services/meetingsService";
import { getAcMatchDetail, getAcPlayerCard, getAcTeamProfile } from "../services/asianCupService";

const router = Router();

// Dedicated cache for the slug-redirect decisions, isolated from the shared
// `memoryCache`. The CF worker hits /api/edge/slug-redirect on (nearly) every
// HTML pageview, keyed by the FULL path — an inherently high-cardinality key:
// every article/category/legacy URL plus every crawler/bot 404 probe mints a
// distinct entry (positive AND negative {redirect:null} are cached for 15 min).
// On the shared 5000-entry cache that flood evicted genuinely hot entries
// (rbac:*, article:*, homepage SWR) under crawler traffic — the recurring
// "[Cache] memoryCache hit the 5000-entry cap" warning in Railway logs.
// Keeping it in its own bounded bucket lets the per-path churn self-evict here
// without starving the shared cache. These keys are never pattern-invalidated
// (they only expire by TTL), so isolation changes no invalidation behavior.
//
// Cap = 50k (was 5k): once isRedirectCandidate() filters out the random crawler
// 404 probes, the residual cardinality is LEGITIMATE traffic — one negative
// {redirect:null} entry per distinct published /article/<slug> viewed inside the
// 5-min negative TTL window. On a high-traffic news site that routinely exceeds
// 5k distinct article URLs per window, which pinned the old bucket at its cap and
// produced the recurring "[Cache] edgeSlugRedirectCache hit the cap" warning
// (and evicted still-hot redirect decisions, forcing needless DB re-probes).
// Each entry is a tiny {redirect, gone} object (<100 B), so 50k is a few MB —
// cheap insurance against that churn. Tune via EDGE_REDIRECT_CACHE_MAX if needed.
const EDGE_REDIRECT_CACHE_MAX = Number(process.env.EDGE_REDIRECT_CACHE_MAX) || 50_000;
const edgeRedirectCache = new MemoryCache(EDGE_REDIRECT_CACHE_MAX, "edgeSlugRedirectCache");
// `users` joined twice (staff author + chosen reporter) — mirror seoInjector.ts.
const reporterUsers = aliasedTable(users, "reporter_user");
const reporterStaff = aliasedTable(staff, "reporter_staff");
const authorStaff = aliasedTable(staff, "author_staff");
const angleManagerStaff = aliasedTable(staff, "angle_manager_staff");
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

// Fast structural test: can this path EVER produce a redirect or gone=true?
// computeSlugRedirect only matches /article|news/…, /category/…, and the legacy
// /<prefix>/…/slug shapes; computeArticleGone only matches (en|ur)?/article/….
// For anything else BOTH are a pure-regex non-match (no DB query), so the result
// is deterministically {redirect:null, gone:false}. We skip the cache write for
// such paths — this is the root cause of the unbounded edgeSlugRedirectCache key
// growth: bot/crawler 404 probes on random /foo/bar/baz paths each minted a
// distinct (never-reused) negative entry, pinning the cache at its cap. Being
// permissive here is safe — a false positive only means we cache as before.
function isRedirectCandidate(path: string): boolean {
  if (/^\/(?:en\/|ur\/)?article\//.test(path)) return true;
  if (/^\/news\//.test(path)) return true;
  if (/^\/category\//.test(path)) return true;
  const seg = path.match(/^\/([a-z]+)(?:\/|$)/i);
  return !!seg && LEGACY_ARTICLE_PREFIXES.has(seg[1].toLowerCase());
}

const SITE_URL = process.env.PUBLIC_SITE_URL || "https://sabq.org";
const BRAND_OG_IMAGE = `${SITE_URL}/branding/sabq-og-image.png`;
const DEFAULT_OG_IMAGE = `${SITE_URL}/icon.png`;

// Crawlers and corrupted/double-encoded URLs occasionally hit these edge
// endpoints with invalid percent-encoding (a lone `%`, bad `%XX`, or a
// truncated UTF-8 byte sequence). Raw decodeURIComponent() throws
// `URIError: URI malformed` on such input — return the raw string instead so
// the handler degrades gracefully (no redirect / default meta) rather than 500.
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

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
    const decodedSlug = safeDecode(rawSlug);
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
    const decodedSlug = safeDecode(rawSlug);
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
    const legacySlug = safeDecode(legacyMatch[2]);
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

// "Gone" detection for the edge. An article URL whose row EXISTS but is no
// longer published (archived = soft-deleted by editors, or draft/scheduled)
// should return HTTP 410 to crawlers — NOT a 200 + `noindex` shell that Google
// re-crawls forever and parks in the "Excluded by noindex tag" report. A
// MISSING row stays a 404 (web-next renders notFound()); only an
// existing-but-unpublished row is "gone". Mirrors the slug match in
// fetchArArticle / fetchEnArticle / fetchUrArticle.
async function computeArticleGone(path: string): Promise<boolean> {
  const m = path.match(/^\/(?:(en|ur)\/)?article\/([^/?#]+)/);
  if (!m) return false;
  const lang = m[1]; // undefined → ar
  const slug = safeDecode(m[2]);
  let row: { status: string | null } | undefined;
  if (lang === "en") {
    [row] = await db
      .select({ status: enArticles.status })
      .from(enArticles)
      .where(or(eq(enArticles.englishSlug, slug), eq(enArticles.slug, slug))!)
      .limit(1);
  } else if (lang === "ur") {
    [row] = await db
      .select({ status: urArticles.status })
      .from(urArticles)
      .where(or(eq(urArticles.englishSlug, slug), eq(urArticles.slug, slug))!)
      .limit(1);
  } else {
    [row] = await db
      .select({ status: articles.status })
      .from(articles)
      .where(or(eq(articles.englishSlug, slug), eq(articles.slug, slug))!)
      .limit(1);
  }
  return !!row && row.status !== "published";
}

router.get("/api/edge/slug-redirect", async (req, res) => {
  // Redirect decisions for a path are semantically stable (a published
  // article's canonical slug doesn't change), so let the edge absorb repeats:
  // 5 min fresh + 10 min stale-while-revalidate keeps the CF worker from
  // hitting origin on most repeat pageviews (was s-maxage=60 → ~1s DB scans on
  // every miss, [APM] Slow request warnings 2026-06-05).
  res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  try {
    const raw = String(req.query.path || "");
    if (!raw.startsWith("/")) return res.json({ redirect: null });

    // Normalize to the pathname only — drop ?query/#hash. The redirect rules
    // already ignore them, but an un-normalized key splits the cache per
    // tracking param (?utm_*), AND the legacy-prefix regex in
    // computeSlugRedirect fails outright on a trailing query string. One
    // canonical key per path → far higher hit rate + correct legacy redirects.
    const path = raw.replace(/[?#].*$/, "");

    // Skip the cache (and the DB) for paths that can NEVER redirect: the result
    // is a deterministic regex non-match. This stops bot/crawler 404 probes from
    // minting unbounded negative cache keys (the recurring edgeSlugRedirectCache
    // cap warning). The edge HTTP Cache-Control above still absorbs repeats.
    if (!isRedirectCandidate(path)) {
      return res.json({ redirect: null, gone: false });
    }

    // In-process cache: this endpoint is hit on (nearly) every HTML pageview by
    // the CF worker, but the redirect decision for a given path is stable. Cache
    // both positive AND negative ({redirect:null}) results to avoid a DB
    // round-trip on the hot path.
    const cacheKey = `edge:slug-redirect:${path}`;
    const cached = edgeRedirectCache.get<{ redirect: string | null; gone?: boolean }>(cacheKey);
    if (cached !== null) return res.json(cached);

    const redirect = await computeSlugRedirect(path);
    // Only probe "gone" when there's NO redirect: a redirect 301s first at the
    // edge so the gone flag would never be consulted, and this saves the extra
    // DB lookup on the (Arabic-slug) redirect path.
    const gone = redirect ? false : await computeArticleGone(path);
    const payload = { redirect, gone };
    // Positive results (a real 301 target, or an existing-but-unpublished "gone"
    // article) are stable AND bounded by article/category count → cache LONG.
    // Negative results are dominated by non-existent-slug probes (high
    // cardinality, low value): give them MEDIUM TTL (matches the 5-min edge
    // s-maxage) so the periodic sweep reclaims them ~3x faster and they don't
    // pin the bucket at its cap.
    const ttl = redirect || gone ? CACHE_TTL.LONG : CACHE_TTL.MEDIUM;
    edgeRedirectCache.set(cacheKey, payload, ttl);
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
// Delegates to the shared DOMPurify sanitizer (audit #5: the old regex left
// unquoted `onerror`/`<img>` handlers intact → stored XSS).
function stripUnsafeHtml(html: string): string {
  return sanitizeArticleHtml(html);
}

// مقالات المونديال تربط لهب /world-cup — الفحص مشترك بين معالج seo-meta
// (semanticHtml لقشرة SPA الاحتياطية) و seo-bundle (متن SSR في web-next،
// المسار الذي يخدم الزواحف فعليًا عبر dynamic rendering).
function isWorldCupTitle(title: string): boolean {
  return /مونديال|كأس العالم/.test(title) && !title.includes("للأندية");
}

const WORLD_CUP_HUB_FOOTER_HTML =
  '<p>تابع <a href="/world-cup">تغطية كأس العالم 2026 لحظة بلحظة — النتائج وجدول المباريات وترتيب المجموعات</a> على سبق.</p>';

// مواد محرك المونديال الجديدة تحمل الرابط داخل المتن أصلًا — لا تكرار.
function withWorldCupHubLink(html: string, title: string | null | undefined): string {
  if (!isWorldCupTitle(title || "")) return html;
  if (html.includes('href="/world-cup"')) return html;
  return `${html}\n${WORLD_CUP_HUB_FOOTER_HTML}`;
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
  authorPerson?: Record<string, unknown>;
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

  // SECURITY: only published articles may expose their body.
  //
  // `computeArticleRobots` below already knows an unpublished row must be
  // `noindex` — but noindex is a request to search engines, not access
  // control. The payload still carried the full text through
  // `jsonLd.articleBody` and `semanticHtml`, so any anonymous caller could
  // read drafts, embargoed/scheduled pieces and archived articles by slug.
  const isPublished = opts.status === "published";
  const schemaExtras = isPublished
    ? buildNewsArticleSchemaExtras(opts.contentHtml, opts.image, SITE_URL)
    : buildNewsArticleSchemaExtras(null, opts.image, SITE_URL);

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
    author: opts.authorPerson || { "@type": "Person", name: opts.author },
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
    // Same rule as articleBody above — the SPA fallback shell must not carry
    // the text of an article that isn't published.
    semanticHtml: isPublished ? opts.semanticHtml : undefined,
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
      authorId: articles.authorId,
      reporterId: articles.reporterId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      reporterFirstName: reporterUsers.firstName,
      reporterLastName: reporterUsers.lastName,
      reporterStaffSlug: reporterStaff.slug,
      authorStaffSlug: authorStaff.slug,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .leftJoin(users, eq(articles.authorId, users.id))
    .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
    .leftJoin(reporterStaff, eq(articles.reporterId, reporterStaff.userId))
    .leftJoin(authorStaff, eq(articles.authorId, authorStaff.userId))
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
  const authorPerson = buildArticleAuthorPerson(SITE_URL, {
    reporterName,
    editorName,
    reporterId: row.reporterId,
    reporterStaffSlug: row.reporterStaffSlug,
    authorId: row.authorId,
    authorStaffSlug: row.authorStaffSlug,
    fallbackName: ARTICLE_BRAND.ar.name,
  });
  // مقالات المونديال تربط للهب برابط يراه الزاحف — يبني الرسم الداخلي الذي
  // يدفع /world-cup كرابط فرعي (sitelink) ويغذي ترتيبه للكلمة المفتاحية.
  const worldCupHubLink = isWorldCupTitle(title)
    ? buildLinkListHtml("تغطية كأس العالم 2026", [
        {
          href: "/world-cup",
          title: "كأس العالم 2026 — نتائج مباشرة وجدول المباريات وترتيب المجموعات",
        },
      ])
    : undefined;

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
    authorPerson,
    section: row.categoryName,
    keywords: Array.isArray(seoData.keywords) ? seoData.keywords : [],
    contentHtml: row.content,
    semanticHtml:
      [
        buildSemanticHtml({
          title,
          excerpt: row.excerpt || row.aiSummary || "",
          content: row.content || "",
          publishedAt: row.publishedAt,
        }),
        worldCupHubLink,
      ]
        .filter(Boolean)
        .join("") || undefined,
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

// Locale of a path by its prefix: /en* → English, /ur* → Urdu, else Arabic.
// Drives the locale-correct default meta so unhandled English/Urdu surfaces
// (homepage, news, static pages…) never fall back to an Arabic <title>.
function localeOfPath(path: string): "ar" | "en" | "ur" {
  if (path === "/en" || path.startsWith("/en/")) return "en";
  if (path === "/ur" || path.startsWith("/ur/")) return "ur";
  return "ar";
}

// Per-language site-level defaults (title/description/locale/site name) used as
// the catch-all when no specific route handler matches.
const DEFAULT_SITE_META = {
  ar: {
    title: "سبق الذكية",
    description: "منصة إخبارية ذكية مدعومة بالذكاء الاصطناعي",
    locale: "ar_SA",
    siteName: ARTICLE_BRAND.ar.name,
  },
  en: {
    title: "Sabq News — Smart AI-Powered News",
    description: "Sabq News — a smart, AI-powered news platform delivering the latest from Saudi Arabia and the world.",
    locale: "en_US",
    siteName: ARTICLE_BRAND.en.name,
  },
  ur: {
    title: "سبق نیوز — اے آئی سے چلنے والا اسمارٹ نیوز پلیٹ فارم",
    description: "سبق نیوز — ایک اسمارٹ، اے آئی سے چلنے والا نیوز پلیٹ فارم جو سعودی عرب اور دنیا بھر کی تازہ ترین خبریں فراہم کرتا ہے۔",
    locale: "ur_PK",
    siteName: ARTICLE_BRAND.ur.name,
  },
} as const;

function defaultMeta(path: string) {
  const d = DEFAULT_SITE_META[localeOfPath(path)];
  return {
    title: d.title,
    description: d.description,
    image: DEFAULT_OG_IMAGE,
    canonical: `${SITE_URL}${path === "/" ? "" : path}`,
    robots: "index,follow",
    type: "website",
    locale: d.locale,
    siteName: d.siteName,
  };
}

// Localized landing pages (English + Urdu) that have a dedicated SPA route but
// no dynamic DB-backed handler. Mirrors the English/Urdu entries in
// seoInjector.ts STATIC_INDEXABLE_PAGES so the edge injector (production) emits
// the correct-language <title>/description instead of the Arabic default.
const LOCALIZED_STATIC_PAGES: Record<
  string,
  { title: string; desc: string; locale: string; siteName: string }
> = {
  // English
  "/en": { title: "Sabq News — Smart AI-Powered News", desc: "Sabq News — a smart, AI-powered news platform delivering the latest from Saudi Arabia and the world.", locale: "en_US", siteName: "Sabq News" },
  "/en/news": { title: "Latest News — Sabq", desc: "Browse the latest breaking news and updates on Sabq News.", locale: "en_US", siteName: "Sabq News" },
  "/en/categories": { title: "Categories — Sabq", desc: "Browse all news categories on Sabq.", locale: "en_US", siteName: "Sabq News" },
  "/en/about": { title: "About — Sabq", desc: "Learn about Sabq News.", locale: "en_US", siteName: "Sabq News" },
  "/en/privacy": { title: "Privacy Policy — Sabq", desc: "Privacy policy of Sabq News.", locale: "en_US", siteName: "Sabq News" },
  "/en/terms": { title: "Terms of Use — Sabq", desc: "Terms of use for Sabq News.", locale: "en_US", siteName: "Sabq News" },
  "/en/accessibility-statement": { title: "Accessibility Statement — Sabq", desc: "Accessibility statement of Sabq News.", locale: "en_US", siteName: "Sabq News" },
  "/en/daily-brief": { title: "Daily Brief — Sabq", desc: "A daily roundup of the most important news from Sabq.", locale: "en_US", siteName: "Sabq News" },
  "/en/moment-by-moment": { title: "Moment by Moment — Sabq", desc: "Live coverage of breaking events from Sabq News.", locale: "en_US", siteName: "Sabq News" },
  // Urdu
  "/ur": { title: "سبق نیوز — اے آئی سے چلنے والا اسمارٹ نیوز پلیٹ فارم", desc: "سبق نیوز — ایک اسمارٹ، اے آئی سے چلنے والا نیوز پلیٹ فارم جو تازہ ترین خبریں فراہم کرتا ہے۔", locale: "ur_PK", siteName: "سبق نیوز" },
  "/ur/news": { title: "تازہ خبریں — سبق نیوز", desc: "سبق نیوز پر تازہ ترین خبریں اور بریکنگ نیوز پڑھیں۔", locale: "ur_PK", siteName: "سبق نیوز" },
};

function staticPageMeta(path: string) {
  const entry = LOCALIZED_STATIC_PAGES[path];
  if (!entry) return null;
  return {
    title: entry.title,
    description: entry.desc,
    image: BRAND_OG_IMAGE,
    canonical: `${SITE_URL}${path}`,
    robots: "index,follow",
    type: "website",
    locale: entry.locale,
    siteName: entry.siteName,
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
  const [row] = await db
    .select({
      slug: staff.slug,
      userId: staff.userId,
      name: staff.name,
      nameAr: staff.nameAr,
      title: staff.title,
      titleAr: staff.titleAr,
      bio: staff.bio,
      bioAr: staff.bioAr,
      profileImage: staff.profileImage,
      userProfileImage: users.profileImageUrl,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(staff)
    .leftJoin(users, eq(staff.userId, users.id))
    .where(and(
      or(eq(staff.slug, idOrSlug), eq(staff.userId, idOrSlug)),
      eq(staff.isActive, true),
      inArray(staff.staffType, ["reporter", "writer", "opinion_author", "content_creator"]),
    ))
    .limit(1);

  const profileSlug = row?.slug || row?.userId || idOrSlug;
  const canonical = reporterProfileUrl(SITE_URL, profileSlug, isEn ? "en" : "ar");

  if (!row) {
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

  const fullName = (isEn ? row.name : row.nameAr)
    || [row.firstName, row.lastName].filter(Boolean).join(" ")
    || profileSlug;
  const bioText = (isEn ? row.bio : row.bioAr) || "";
  const description = isEn
    ? (bioText.slice(0, 220) || `Articles by ${fullName} on Sabq News.`)
    : (bioText.slice(0, 220) || `مقالات وأخبار الكاتب ${fullName} على صحيفة سبق الإلكترونية.`);
  const rawImage = row.profileImage || row.userProfileImage || "";
  const image = rawImage ? abs(rawImage) : BRAND_OG_IMAGE;
  const jobTitle = (isEn ? row.title : row.titleAr) || (isEn ? "Sabq Contributor" : "كاتب — سبق");
  const person = buildPersonJsonLd({
    name: fullName,
    url: canonical,
    image,
    description,
    jobTitle,
    worksFor: isEn ? SABQ_ORG_EN : SABQ_ORG_AR,
  });

  return {
    title: isEn ? `${fullName} — Sabq` : `${fullName} — سبق`,
    description,
    image,
    canonical,
    robots: "index, follow, max-image-preview:large",
    type: "profile",
    locale: isEn ? "en_US" : "ar_SA",
    jsonLd: buildProfilePageJsonLd({
      name: fullName,
      url: canonical,
      description,
      image,
      person,
    }),
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
  // Muqtarab topic: /muqtarab/:angleSlug/topic/:topicSlug — share meta + OG image.
  // MUST precede the angle handler below (its pattern would also match this URL).
  {
    pattern: /^\/muqtarab\/([^/?#]+)\/topic\/([^/?#]+)/,
    handle: async (m) => {
      const angleSlug = safeDecode(m[1]);
      const topicSlug = safeDecode(m[2]);
      const [row] = await db
        .select({
          title: topics.title,
          excerpt: topics.excerpt,
          content: topics.content,
          heroImageUrl: topics.heroImageUrl,
          status: topics.status,
          seoMeta: topics.seoMeta,
          topicSlug: topics.slug,
          angleNameAr: angles.nameAr,
          angleSlug: angles.slug,
          angleCover: angles.coverImageUrl,
        })
        .from(topics)
        .innerJoin(angles, eq(topics.angleId, angles.id))
        .where(and(eq(angles.slug, angleSlug), eq(topics.slug, topicSlug)))
        .limit(1);
      if (!row) return null;
      const seoMeta = (row.seoMeta as any) || {};
      const plain = (row.content as any)?.plainText as string | undefined;
      const title = seoMeta.metaTitle || row.title || "";
      const description = (
        seoMeta.metaDescription ||
        row.excerpt ||
        plain ||
        `${row.title} — زاوية ${row.angleNameAr} على مُقترب من صحيفة سبق الإلكترونية.`
      ).slice(0, 220);
      const { absolute: shareImage } = await resolveMuqtarabOgImage(
        SITE_URL,
        seoMeta.ogImage as string | undefined,
        row.heroImageUrl,
        row.angleCover,
      );
      return {
        title: `${title} — مُقترب — سبق`,
        description,
        image: shareImage,
        canonical: `${SITE_URL}/muqtarab/${encodeURIComponent(row.angleSlug)}/topic/${encodeURIComponent(row.topicSlug)}`,
        robots: row.status === "published" ? "index,follow" : "noindex, follow",
        type: "article",
        locale: "ar_SA",
      };
    },
  },
  // Muqtarab writer profile: /muqtarab/writer/:id
  // لا بد أن يسبق معالج الزاوية أدناه — نمط الزاوية /muqtarab/([^/]+) يلتقط
  // "writer" كـ slug، والإرسال يتوقف عند أول نمط مطابق.
  {
    pattern: /^\/muqtarab\/writer\/([^/?#]+)/,
    handle: async (m) => {
      const id = safeDecode(m[1]);
      const [w] = await db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          bio: users.bio,
          image: users.profileImageUrl,
          staffNameAr: staff.nameAr,
          staffBioAr: staff.bioAr,
          staffImage: staff.profileImage,
        })
        .from(users)
        .leftJoin(staff, eq(staff.userId, users.id))
        .where(eq(users.id, id))
        .limit(1);
      if (!w) return null;
      // كاتب عام فقط إن كان يدير زاوية فعّالة
      const [activeAngle] = await db
        .select({ nameAr: angles.nameAr })
        .from(angles)
        .where(and(eq(angles.managerUserId, id), eq(angles.isActive, true)))
        .limit(1);
      if (!activeAngle) return null;
      const name =
        w.staffNameAr ||
        [w.firstName, w.lastName].filter(Boolean).join(" ") ||
        "كاتب مُقترب";
      const description = (
        w.staffBioAr ||
        w.bio ||
        `${name} — كاتب في منصة مُقترب من صحيفة سبق الإلكترونية.`
      ).slice(0, 220);
      const canonical = muqtarabWriterUrl(SITE_URL, id);
      const { absolute: image } = await resolveMuqtarabOgImage(SITE_URL, w.staffImage, w.image);
      const person = buildPersonJsonLd({
        name,
        url: canonical,
        image,
        description,
        jobTitle: "كاتب في مُقترب",
        worksFor: SABQ_ORG_AR,
      });
      return {
        title: `${name} — كاتب في مُقترب — سبق`,
        description,
        image,
        canonical,
        robots: "index, follow, max-image-preview:large",
        type: "profile",
        locale: "ar_SA",
        jsonLd: buildProfilePageJsonLd({
          name,
          url: canonical,
          description,
          image,
          person,
        }),
      };
    },
  },
  // Muqtarab angle: /muqtarab/:angleSlug
  {
    pattern: /^\/muqtarab\/([^/?#]+)/,
    handle: async (m) => {
      const slug = safeDecode(m[1]);
      const [ang] = await db
        .select({
          nameAr: angles.nameAr,
          slug: angles.slug,
          shortDesc: angles.shortDesc,
          coverImageUrl: angles.coverImageUrl,
          isActive: angles.isActive,
          managerFirstName: users.firstName,
          managerLastName: users.lastName,
          managerBio: users.bio,
          managerImage: users.profileImageUrl,
          managerStaffSlug: angleManagerStaff.slug,
          managerStaffNameAr: angleManagerStaff.nameAr,
          managerStaffBioAr: angleManagerStaff.bioAr,
          managerStaffImage: angleManagerStaff.profileImage,
        })
        .from(angles)
        .leftJoin(users, eq(angles.managerUserId, users.id))
        .leftJoin(angleManagerStaff, eq(angles.managerUserId, angleManagerStaff.userId))
        .where(eq(angles.slug, slug))
        .limit(1);
      if (!ang || !ang.isActive) return null;
      const canonical = muqtarabAngleUrl(SITE_URL, ang.slug);
      const description = (
        ang.shortDesc || `زاوية ${ang.nameAr} على منصة مُقترب من صحيفة سبق الإلكترونية.`
      ).slice(0, 220);
      const { absolute: image } = await resolveMuqtarabOgImage(SITE_URL, ang.coverImageUrl);
      const writerName = ang.managerStaffNameAr
        || [ang.managerFirstName, ang.managerLastName].filter(Boolean).join(" ")
        || ang.nameAr;
      const writerBio = (ang.managerStaffBioAr || ang.managerBio || description).slice(0, 220);
      const writerImage = abs(ang.managerStaffImage || ang.managerImage || ang.coverImageUrl);
      const writerProfileUrl = ang.managerStaffSlug
        ? reporterProfileUrl(SITE_URL, ang.managerStaffSlug, "ar")
        : canonical;
      const person = buildPersonJsonLd({
        name: writerName,
        url: writerProfileUrl,
        image: writerImage,
        description: writerBio,
        jobTitle: `كاتب زاوية ${ang.nameAr} — مُقترب`,
        worksFor: SABQ_ORG_AR,
      });
      return {
        title: `${ang.nameAr} — مُقترب — سبق`,
        description,
        image,
        canonical,
        robots: "index, follow, max-image-preview:large",
        type: "profile",
        locale: "ar_SA",
        jsonLd: buildProfilePageJsonLd({
          name: `${ang.nameAr} — مُقترب`,
          url: canonical,
          description,
          image,
          person,
        }),
      };
    },
  },
  // Arabic article: /article/:slug
  {
    pattern: /^\/article\/([^/?#]+)/,
    handle: async (m) => {
      const slug = safeDecode(m[1]);
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
      const slug = safeDecode(m[1]);
      const row = await fetchArArticle(slug);
      if (!row) return null;
      return buildArArticlePayload(row, slug, `${SITE_URL}/article/${row.englishSlug || slug}`);
    },
  },
  // English article: /en/article/:slug
  {
    pattern: /^\/en\/article\/([^/?#]+)/,
    handle: async (m) => {
      const slug = safeDecode(m[1]);
      const row = await fetchEnArticle(slug);
      if (!row) return null;
      return buildEnArticlePayload(row, slug);
    },
  },
  // Urdu article: /ur/article/:slug
  {
    pattern: /^\/ur\/article\/([^/?#]+)/,
    handle: async (m) => {
      const slug = safeDecode(m[1]);
      const row = await fetchUrArticle(slug);
      if (!row) return null;
      return buildUrArticlePayload(row, slug);
    },
  },
  // Arabic category: /category/:slug
  {
    pattern: /^\/category\/([^/?#]+)/,
    handle: async (m) => {
      const slug = safeDecode(m[1]);
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
      const slug = safeDecode(m[1]);
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
      const slug = safeDecode(m[1]);
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
      const id = safeDecode(m[1]);
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
  // دعوات اجتماعات سبق: /meet/:token — معاينة لائقة عند مشاركة الرابط
  // (عنوان الاجتماع + اسم الصحيفة) في واتساب وأمثاله، مع noindex دائماً
  // لأن الرابط سري لحامليه ولا يُفهرس.
  {
    pattern: /^\/meet\/([^/?#]+)/,
    handle: async (m) => {
      const token = safeDecode(m[1]);
      const meeting = await getMeetingByInviteToken(token);
      // رابط غير صالح أو ملغى → يسقط للميتا الافتراضية بـ noindex
      if (!meeting || meeting.status === "cancelled") return null;
      const stateLabel =
        meeting.status === "live"
          ? "اجتماع مباشر الآن"
          : meeting.status === "ended"
            ? "اجتماع منتهٍ"
            : "دعوة اجتماع";
      return {
        title: `${meeting.title} — اجتماعات صحيفة سبق`,
        description: meeting.description
          ? trunc(meeting.description, 220)
          : `${stateLabel} عبر منصة سبق — افتح الرابط للانضمام بالصوت ومشاركة الشاشة.`,
        image: BRAND_OG_IMAGE,
        canonical: `${SITE_URL}/meet/${encodeURIComponent(token)}`,
        robots: "noindex, follow",
        type: "website",
        locale: "ar_SA",
        siteName: "صحيفة سبق الإلكترونية",
      };
    },
  },
  // World days: /world-day/:id
  {
    pattern: /^\/world-day\/([^/?#]+)/,
    handle: async (m) => {
      const id = safeDecode(m[1]);
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
      const id = safeDecode(m[1]);
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
    handle: async (m) => buildKeywordMeta(safeDecode(m[1]), false),
  },
  {
    pattern: /^\/en\/keyword\/([^/?#]+)/,
    handle: async (m) => buildKeywordMeta(safeDecode(m[1]), true),
  },
  // Reporter/author profile: /reporter/:idOrSlug + /en/reporter/:idOrSlug
  {
    pattern: /^\/reporter\/([^/?#]+)/,
    handle: async (m) => buildReporterMeta(safeDecode(m[1]), false),
  },
  {
    pattern: /^\/en\/reporter\/([^/?#]+)/,
    handle: async (m) => buildReporterMeta(safeDecode(m[1]), true),
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
  // عقل سبق — صفحة التعريف بمنظومة الذكاء الاصطناعي
  {
    pattern: /^\/sabq-ai\/?$/,
    handle: async () => ({
      title: "عقل سبق — الذكاء الاصطناعي في خدمة الصحافة | سبق",
      description: "أول صحيفة سعودية وعربية تدمج الذكاء الاصطناعي في كامل دورة العمل التحريري — من رصد الخبر إلى نشره بثلاث لغات، بقرار بشري في كل مادة ووفق ميثاق معلن.",
      image: BRAND_OG_IMAGE,
      canonical: `${SITE_URL}/sabq-ai`,
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
  // البوابة الرياضية — الصفحة الرئيسية: /sports (ويُقبل المسار القديم /sports2).
  // بدونها كانت مشاركة الرابط في واتساب/تويتر تُظهر الميتا العامة للموقع
  // («سبق الذكية» + الأيقونة) بدل هوية رياضية بصورة OG مخصّصة.
  {
    pattern: /^\/sports2?\/?$/,
    handle: async () => {
      const description =
        "بوابة سبق الرياضية: نتائج مباشرة وجدول المباريات بتوقيت الرياض، ترتيب دوري روشن وكبرى الدوريات العالمية، مركز الانتقالات، وتوقعات الجماهير — تغطية لحظة بلحظة.";
      const image = `${SITE_URL}/branding/sports-og-image.png`;
      const intro = `<section style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><h1>رياضة سبق — تغطية الملاعب لحظة بلحظة</h1><p>${escapeHtml(description)}</p></section>`;
      return {
        title: "رياضة سبق — مباريات مباشرة وانتقالات وترتيب الدوريات | سبق",
        description,
        image,
        imageWidth: 1200,
        imageHeight: 630,
        canonical: `${SITE_URL}/sports`,
        robots: "index,follow",
        type: "website",
        locale: "ar_SA",
        twitterSite: "@sabq",
        semanticHtml: intro,
        jsonLd: {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: "رياضة سبق",
              description,
              url: `${SITE_URL}/sports`,
              inLanguage: "ar",
              isPartOf: {
                "@type": "WebSite",
                name: "صحيفة سبق الإلكترونية",
                url: SITE_URL,
              },
              primaryImageOfPage: {
                "@type": "ImageObject",
                url: image,
                width: 1200,
                height: 630,
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "الرياضة",
                  item: `${SITE_URL}/sports`,
                },
              ],
            },
          ],
        },
      };
    },
  },
  // جدول المباريات الموحّد متعدد البطولات: /sports/matches
  {
    pattern: /^\/sports\/matches\/?$/,
    handle: async () => ({
      title: "جدول المباريات — نتائج مباشرة بتوقيت الرياض | سبق",
      description:
        "مباريات اليوم وغدًا لحظة بلحظة: النتائج المباشرة ومواعيد المباريات بتوقيت الرياض عبر دوري روشن وكبرى البطولات العربية والعالمية على بوابة سبق الرياضية.",
      image: `${SITE_URL}/branding/sports-og-image.png`,
      imageWidth: 1200,
      imageHeight: 630,
      canonical: `${SITE_URL}/sports/matches`,
      robots: "index,follow",
      type: "website",
      locale: "ar_SA",
      twitterSite: "@sabq",
    }),
  },
  // مركز الانتقالات: /sports/transfers
  {
    pattern: /^\/sports\/transfers\/?$/,
    handle: async () => ({
      title: "مركز الانتقالات — صفقات وإشاعات الميركاتو | سبق",
      description:
        "سوق الانتقالات لحظة بلحظة: الصفقات المؤكدة والإشاعات الموثّقة في دوري روشن والدوريات الأوروبية، مع نبض السوق وأبرز الصفقات على بوابة سبق الرياضية.",
      image: `${SITE_URL}/branding/sports-og-image.png`,
      imageWidth: 1200,
      imageHeight: 630,
      canonical: `${SITE_URL}/sports/transfers`,
      robots: "index,follow",
      type: "website",
      locale: "ar_SA",
      twitterSite: "@sabq",
    }),
  },
  // البوابة الرياضية — صفحة النادي: /sports/team/:id (ويُقبل المسار القديم /sports2/team)
  // ميتا غنية باسم النادي وترتيبه وملعبه، وصورة OG = صورة الملعب (بديل لوقو
  // سبق) مع تدرّج احتياطي إلى شعار النادي ثم علامة سبق.
  {
    pattern: /^\/sports2?\/team\/(\d+)/,
    handle: async (m) => {
      const id = Number(m[1]);
      if (!Number.isFinite(id) || id <= 0) return null;
      const t = await getTeamSeoMeta(id).catch(() => null);
      if (!t) return null;
      const canonical = `${SITE_URL}/sports/team/${id}`;
      const parts: string[] = [];
      if (t.rank && t.points != null && t.competitionName) {
        parts.push(`يحتل ${t.name} المركز ${t.rank} برصيد ${t.points} نقطة في ${t.competitionName}.`);
      } else if (t.competitionName) {
        parts.push(`${t.name} يشارك في ${t.competitionName}.`);
      }
      if (t.founded) parts.push(`تأسّس عام ${t.founded}.`);
      if (t.venueName) parts.push(`ملعبه ${t.venueName}${t.venueCity ? ` بـ${t.venueCity}` : ""}.`);
      parts.push(`تابع نتائج ${t.name} ومبارياته القادمة وترتيبه وتشكيلته وهدّافيه على سبق.`);
      // بطاقة OG مولّدة 1200×630 (معتمة، تظهر في واتساب/تويتر) بدل صور
      // المزوّد 150×150 الشفّافة التي يرفضها واتساب.
      const image = `${SITE_URL}/api/sports/og/team/${id}`;
      return {
        title: `${t.name} — المباريات والترتيب والتشكيلة | سبق`,
        description: trunc(parts.join(" "), 220),
        image,
        imageWidth: 1200,
        imageHeight: 630,
        canonical,
        // القسم تجريبي → مخفيّ عن قوقل، لكن معاينة المشاركة (واتساب/تويتر)
        // تبقى غنية بصورة الملعب والعنوان والوصف.
        robots: "noindex, follow",
        type: "website",
        locale: "ar_SA",
        twitterSite: "@sabq",
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "SportsTeam",
          name: t.name,
          sport: "Association football",
          url: canonical,
          ...(t.logo ? { logo: abs(t.logo) } : {}),
          ...(t.founded ? { foundingDate: String(t.founded) } : {}),
          ...(t.venueName
            ? {
                location: {
                  "@type": "StadiumOrArena",
                  name: t.venueName,
                  ...(t.venueCity
                    ? { address: { "@type": "PostalAddress", addressLocality: t.venueCity } }
                    : {}),
                },
              }
            : {}),
          ...(t.competitionName
            ? { memberOf: { "@type": "SportsOrganization", name: t.competitionName } }
            : {}),
        },
      };
    },
  },
  // البوابة الرياضية — صفحة المباراة: /sports/match/:id
  // معاينة مشاركة غنيّة (واتساب/تويتر): "الفريق ضد الفريق" + النتيجة/الموعد +
  // الجولة + الملعب. القسم تجريبي ⇒ noindex, follow.
  {
    pattern: /^\/sports\/match\/(\d+)/,
    handle: async (m) => {
      const id = Number(m[1]);
      if (!Number.isFinite(id) || id <= 0) return null;
      const fx = await getMatchSeoMeta(id).catch(() => null);
      if (!fx) return null;
      const canonical = `${SITE_URL}/sports/match/${id}`;
      const score =
        fx.status.finished || fx.status.live
          ? `${fx.home.name} ${fx.goals.home ?? 0} - ${fx.goals.away ?? 0} ${fx.away.name}`
          : `${fx.home.name} ضد ${fx.away.name}`;
      const parts: string[] = [];
      if (fx.status.finished) parts.push(`انتهت المباراة: ${score}.`);
      else if (fx.status.live) parts.push(`مباشر الآن: ${score}.`);
      else parts.push(`${score}.`);
      if (fx.competitionName) parts.push(fx.round ? `${fx.competitionName} · ${fx.round}.` : `${fx.competitionName}.`);
      if (fx.venueName) parts.push(`ملعب ${fx.venueName}.`);
      parts.push("تابع المجريات والتشكيلات والإحصاءات والتقييمات لحظة بلحظة على سبق.");
      const image = fx.home.logo || fx.away.logo || undefined;
      return {
        title: `${fx.home.name} ضد ${fx.away.name}${fx.competitionName ? ` — ${fx.competitionName}` : ""} | سبق`,
        description: trunc(parts.join(" "), 220),
        ...(image ? { image: abs(image) } : {}),
        canonical,
        robots: "noindex, follow",
        type: "website",
        locale: "ar_SA",
        twitterSite: "@sabq",
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          name: `${fx.home.name} ضد ${fx.away.name}`,
          url: canonical,
          ...(fx.kickoffIso ? { startDate: fx.kickoffIso } : {}),
          ...(fx.venueName ? { location: { "@type": "StadiumOrArena", name: fx.venueName } } : {}),
          competitor: [
            { "@type": "SportsTeam", name: fx.home.name, ...(fx.home.logo ? { logo: abs(fx.home.logo) } : {}) },
            { "@type": "SportsTeam", name: fx.away.name, ...(fx.away.logo ? { logo: abs(fx.away.logo) } : {}) },
          ],
          ...(fx.competitionName ? { superEvent: { "@type": "SportsOrganization", name: fx.competitionName } } : {}),
        },
      };
    },
  },
  // World Cup 2026 predictions competition landing — لا بد أن يسبق معالج الهب
  // (نمط الهب مثبّت بـ $ فلا يلتقطها، لكن نُبقيها أولًا للوضوح).
  {
    pattern: /^\/world-cup\/predictions\/?$/,
    handle: async () => {
      const description =
        "توقّع النتيجة الدقيقة بالأهداف لمباريات كأس العالم 2026 قبل صافرة البداية، واربح من جائزة 500 نقطة ولاء لكل مباراة على صحيفة سبق.";
      return {
        title: "توقّعات المونديال — توقّع النتيجة واربح نقاط الولاء | سبق",
        description,
        image: `${SITE_URL}/branding/world-cup-og-image.png`,
        imageWidth: 1200,
        imageHeight: 630,
        canonical: `${SITE_URL}/world-cup/predictions`,
        robots: "index,follow",
        type: "website",
        locale: "ar_SA",
        twitterSite: "@sabq",
        jsonLd: {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              name: "توقّعات كأس العالم 2026",
              description,
              url: `${SITE_URL}/world-cup/predictions`,
              inLanguage: "ar",
              isPartOf: {
                "@type": "WebSite",
                name: "صحيفة سبق الإلكترونية",
                url: SITE_URL,
              },
              primaryImageOfPage: {
                "@type": "ImageObject",
                url: `${SITE_URL}/branding/world-cup-og-image.png`,
                width: 1200,
                height: 630,
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "كأس العالم 2026", item: `${SITE_URL}/world-cup` },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: "توقّعات المونديال",
                  item: `${SITE_URL}/world-cup/predictions`,
                },
              ],
            },
          ],
        },
      };
    },
  },
  // صفحات كأس آسيا الغنية — ميتا ديناميكية من المصدر نفسه الذي يرسم الواجهة.
  {
    pattern: /^\/asian-cup\/match\/(\d+)\/?$/,
    handle: async (m) => {
      const id = Number(m[1]);
      const detail = await getAcMatchDetail(id).catch(() => null);
      if (!detail) return { title: "المباراة غير متاحة | سبق", description: "تعذّر العثور على المباراة المطلوبة.", image: `${SITE_URL}/branding/asian-cup-og-image.png`, canonical: `${SITE_URL}/asian-cup/match/${id}`, robots: "noindex,follow", type: "website", locale: "ar_SA" };
      const fx = detail.fixture;
      const canonical = `${SITE_URL}/asian-cup/match/${id}`;
      const description = `${fx.home.name} ضد ${fx.away.name} في ${fx.round} من كأس آسيا 2027 — النتيجة والأحداث والإحصاءات والتشكيلات.`;
      return {
        title: `${fx.home.name} ضد ${fx.away.name} — مركز المباراة | سبق`, description,
        image: `${SITE_URL}/branding/asian-cup-og-image.png`, canonical, robots: "index,follow", type: "website", locale: "ar_SA",
        jsonLd: { "@context": "https://schema.org", "@type": "SportsEvent", name: `${fx.home.name} ضد ${fx.away.name}`, url: canonical, startDate: fx.date, location: { "@type": "StadiumOrArena", name: fx.venue.name, address: fx.venue.city }, competitor: [{ "@type": "SportsTeam", name: fx.home.name, logo: abs(fx.home.logo) }, { "@type": "SportsTeam", name: fx.away.name, logo: abs(fx.away.logo) }] },
      };
    },
  },
  {
    pattern: /^\/asian-cup\/team\/(\d+)\/?$/,
    handle: async (m) => {
      const id = Number(m[1]); const data = await getAcTeamProfile(id).catch(() => null);
      if (!data) return null;
      const canonical = `${SITE_URL}/asian-cup/team/${id}`;
      const description = `ملف منتخب ${data.team.name} في كأس آسيا 2027: القائمة والمدرب والمباريات والترتيب وطريق التأهل.`;
      return { title: `${data.team.name} — كأس آسيا 2027 | سبق`, description, image: abs(data.team.logo), canonical, robots: "index,follow", type: "website", locale: "ar_SA", jsonLd: { "@context": "https://schema.org", "@type": "SportsTeam", name: data.team.name, url: canonical, logo: abs(data.team.logo), coach: data.coach ? { "@type": "Person", name: data.coach } : undefined } };
    },
  },
  {
    pattern: /^\/asian-cup\/player\/(\d+)\/?$/,
    handle: async (m) => {
      const id = Number(m[1]); const data = await getAcPlayerCard(id).catch(() => null);
      if (!data) return null;
      const canonical = `${SITE_URL}/asian-cup/player/${id}`;
      const description = `ملف ${data.name}: الإحصاءات والمسيرة والألقاب والانتقالات في تغطية كأس آسيا 2027.`;
      return { title: `${data.name} — كأس آسيا | سبق`, description, image: data.photo ? abs(data.photo) : `${SITE_URL}/branding/asian-cup-og-image.png`, canonical, robots: "index,follow", type: "profile", locale: "ar_SA", jsonLd: { "@context": "https://schema.org", "@type": "Person", name: data.name, image: data.photo ? abs(data.photo) : undefined, url: canonical, nationality: data.nationality ?? undefined } };
    },
  },
  ...[
    ["scorers", "هدافو كأس آسيا 2027", "ترتيب هدافي كأس آسيا 2027 وصانعي الأهداف على صحيفة سبق."],
    ["bracket", "شجرة كأس آسيا 2027", "شجرة الأدوار الإقصائية من دور الـ16 حتى نهائي كأس آسيا 2027."],
    ["venues", "ملاعب كأس آسيا 2027", "ملاعب ومدن استضافة كأس آسيا 2027 في المملكة العربية السعودية."],
  ].map(([slug, title, description]) => ({
    pattern: new RegExp(`^/asian-cup/${slug}/?$`),
    handle: async () => ({ title: `${title} | سبق`, description, image: `${SITE_URL}/branding/asian-cup-og-image.png`, canonical: `${SITE_URL}/asian-cup/${slug}`, robots: "index,follow", type: "website", locale: "ar_SA" }),
  })),
  // Asian Cup 2027 (Saudi Arabia) hub landing
  {
    pattern: /^\/asian-cup\/?$/,
    handle: async () => {
      const description =
        "كأس آسيا 2027 في السعودية — جدول المباريات بتوقيت الرياض، المجموعات، المنتخبات المتأهّلة، وملاعب الاستضافة على صحيفة سبق.";
      const image = `${SITE_URL}/branding/asian-cup-og-image.png`;
      const intro = `<section style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><h1>كأس آسيا 2027 — التغطية الكاملة من السعودية</h1><p>${escapeHtml(description)}</p></section>`;
      return {
        title: "كأس آسيا 2027 — التغطية الكاملة من السعودية | سبق",
        description,
        image,
        imageWidth: 1200,
        imageHeight: 630,
        canonical: `${SITE_URL}/asian-cup`,
        robots: "index,follow",
        type: "website",
        locale: "ar_SA",
        twitterSite: "@sabq",
        semanticHtml: intro,
        jsonLd: {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: "كأس آسيا 2027 — التغطية الكاملة",
              description,
              url: `${SITE_URL}/asian-cup`,
              inLanguage: "ar",
              isPartOf: {
                "@type": "WebSite",
                name: "صحيفة سبق الإلكترونية",
                url: SITE_URL,
              },
              primaryImageOfPage: {
                "@type": "ImageObject",
                url: image,
                width: 1200,
                height: 630,
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "كأس آسيا 2027",
                  item: `${SITE_URL}/asian-cup`,
                },
              ],
            },
          ],
        },
      };
    },
  },
  // Gulf Cup 27 "Khaleeji 27" (Saudi Arabia 2026) hub landing
  {
    pattern: /^\/gulf-cup\/?$/,
    handle: async () => {
      const description =
        "خليجي 27 — كأس الخليج العربي في جدة (23 سبتمبر – 6 أكتوبر 2026): جدول المباريات بتوقيت الرياض، المجموعتان، المنتخبات الثمانية، وملاعب الاستضافة على صحيفة سبق.";
      const image = `${SITE_URL}/branding/gulf-cup-og-image.png`;
      const intro = `<section style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><h1>خليجي 27 — كأس الخليج العربي في السعودية</h1><p>${escapeHtml(description)}</p></section>`;
      return {
        title: "خليجي 27 — كأس الخليج العربي في السعودية | سبق",
        description,
        image,
        imageWidth: 1200,
        imageHeight: 630,
        canonical: `${SITE_URL}/gulf-cup`,
        robots: "index,follow",
        type: "website",
        locale: "ar_SA",
        twitterSite: "@sabq",
        semanticHtml: intro,
        jsonLd: {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: "خليجي 27 — كأس الخليج العربي في السعودية",
              description,
              url: `${SITE_URL}/gulf-cup`,
              inLanguage: "ar",
              isPartOf: {
                "@type": "WebSite",
                name: "صحيفة سبق الإلكترونية",
                url: SITE_URL,
              },
              primaryImageOfPage: {
                "@type": "ImageObject",
                url: image,
                width: 1200,
                height: 630,
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "خليجي 27",
                  item: `${SITE_URL}/gulf-cup`,
                },
              ],
            },
          ],
        },
      };
    },
  },
  // World Cup 2026 hub landing
  {
    pattern: /^\/world-cup\/?$/,
    handle: async () => {
      const description =
        "نتائج مباشرة، جدول المباريات بتوقيت الرياض، ترتيب المجموعات، الهدافون، ومشوار الأخضر في كأس العالم 2026 على صحيفة سبق.";

      // أحدث أخبار المونديال (مواد محرك wc26 + مواد غرفة الأخبار) — نفس معايير
      // getWorldCupNews في worldCupNewsGenerator.ts، مع englishSlug للرابط
      // القانوني مباشرة بدل المرور بتحويلة slug-redirect.
      let newsLinks: { href: string; title: string }[] = [];
      try {
        const rows = await db
          .select({
            slug: articles.slug,
            englishSlug: articles.englishSlug,
            title: articles.title,
          })
          .from(articles)
          .where(
            and(
              eq(articles.status, "published"),
              or(
                like(articles.slug, "wc26-%"),
                and(
                  or(
                    ilike(articles.title, "%مونديال%"),
                    ilike(articles.title, "%كأس العالم%"),
                  ),
                  notIlike(articles.title, "%للأندية%"),
                ),
              ),
            ),
          )
          .orderBy(desc(articles.publishedAt))
          .limit(20);
        newsLinks = rows.map((r) => ({
          href: `/article/${r.englishSlug || r.slug}`,
          title: r.title || "",
        }));
      } catch {
        // الهب يبقى قابلًا للفهرسة بوسومه حتى لو تعذر جلب قائمة الأخبار
      }

      const intro = `<section style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><h1>كأس العالم 2026 — تغطية حية من سبق</h1><p>${escapeHtml(description)}</p></section>`;
      const semanticHtml =
        [intro, buildLinkListHtml("أحدث أخبار كأس العالم 2026", newsLinks)]
          .filter(Boolean)
          .join("") || undefined;

      return {
        title: "مونديال 2026 — تغطية حية لكأس العالم | سبق",
        description,
        image: `${SITE_URL}/branding/world-cup-og-image.png`,
        imageWidth: 1200,
        imageHeight: 630,
        canonical: `${SITE_URL}/world-cup`,
        robots: "index,follow",
        type: "website",
        locale: "ar_SA",
        twitterSite: "@sabq",
        semanticHtml,
        jsonLd: {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: "كأس العالم 2026 — تغطية حية",
              description,
              url: `${SITE_URL}/world-cup`,
              inLanguage: "ar",
              isPartOf: {
                "@type": "WebSite",
                name: "صحيفة سبق الإلكترونية",
                url: SITE_URL,
              },
              primaryImageOfPage: {
                "@type": "ImageObject",
                url: `${SITE_URL}/branding/world-cup-og-image.png`,
                width: 1200,
                height: 630,
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "كأس العالم 2026",
                  item: `${SITE_URL}/world-cup`,
                },
              ],
            },
          ],
        },
      };
    },
  },
  // King's Cup — predictions (أعلى من الهب حتى تُطابق أولًا)
  {
    pattern: /^\/kings-cup\/predictions\/?$/,
    handle: async () => {
      const description =
        "توقّع نتائج مباريات كأس خادم الحرمين الشريفين والبطل والهدّاف، اجمع النقاط ونافس على لوحة المتصدّرين في صحيفة سبق.";
      const image = `${SITE_URL}/branding/kings-cup-og-image.png`;
      const intro = `<section style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><h1>توقّعات كأس خادم الحرمين الشريفين</h1><p>${escapeHtml(description)}</p></section>`;
      return {
        title: "توقّعات كأس خادم الحرمين الشريفين | سبق",
        description,
        image,
        imageWidth: 1200,
        imageHeight: 630,
        canonical: `${SITE_URL}/kings-cup/predictions`,
        robots: "index,follow",
        type: "website",
        locale: "ar_SA",
        twitterSite: "@sabq",
        semanticHtml: intro,
        jsonLd: {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: "توقّعات كأس خادم الحرمين الشريفين",
              description,
              url: `${SITE_URL}/kings-cup/predictions`,
              inLanguage: "ar",
              isPartOf: {
                "@type": "WebSite",
                name: "صحيفة سبق الإلكترونية",
                url: SITE_URL,
              },
              primaryImageOfPage: {
                "@type": "ImageObject",
                url: image,
                width: 1200,
                height: 630,
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "كأس خادم الحرمين الشريفين", item: `${SITE_URL}/kings-cup` },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: "التوقّعات",
                  item: `${SITE_URL}/kings-cup/predictions`,
                },
              ],
            },
          ],
        },
      };
    },
  },
  // King's Cup — hub landing
  {
    pattern: /^\/kings-cup\/?$/,
    handle: async () => {
      const description =
        "كأس خادم الحرمين الشريفين — البطولة الإقصائية للأندية السعودية: نتائج مباشرة، جدول المباريات بتوقيت الرياض، الأدوار الإقصائية، الهدافون، والأندية المشاركة على صحيفة سبق.";
      const image = `${SITE_URL}/branding/kings-cup-og-image.png`;
      const intro = `<section style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><h1>كأس خادم الحرمين الشريفين — تغطية حية من سبق</h1><p>${escapeHtml(description)}</p></section>`;
      return {
        title: "كأس خادم الحرمين الشريفين — تغطية حية | سبق",
        description,
        image,
        imageWidth: 1200,
        imageHeight: 630,
        canonical: `${SITE_URL}/kings-cup`,
        robots: "index,follow",
        type: "website",
        locale: "ar_SA",
        twitterSite: "@sabq",
        semanticHtml: intro,
        jsonLd: {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: "كأس خادم الحرمين الشريفين — تغطية حية",
              description,
              url: `${SITE_URL}/kings-cup`,
              inLanguage: "ar",
              isPartOf: {
                "@type": "WebSite",
                name: "صحيفة سبق الإلكترونية",
                url: SITE_URL,
              },
              primaryImageOfPage: {
                "@type": "ImageObject",
                url: image,
                width: 1200,
                height: 630,
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "كأس خادم الحرمين الشريفين",
                  item: `${SITE_URL}/kings-cup`,
                },
              ],
            },
          ],
        },
      };
    },
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
    const slug = safeDecode(String(req.params.slug || ""));
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

    // Unpublished articles have no public representation. This endpoint feeds
    // the SSR renderer, and the edge already serves 410 for these slugs, so
    // returning the row here only created an anonymous read path into drafts,
    // scheduled/embargoed pieces and archived articles.
    if (row.status !== "published") {
      return res.status(404).json({ error: "not_found" });
    }

    const seoData = (row.seo as any) || {};

    return res.json({
      lang,
      slug: row.slug,
      englishSlug: row.englishSlug,
      title: row.title,
      excerpt: row.excerpt || row.aiSummary || "",
      contentHtml:
        lang === "ar"
          ? withWorldCupHubLink(stripUnsafeHtml(row.content || ""), row.title)
          : stripUnsafeHtml(row.content || ""),
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
    const slug = safeDecode(String(req.params.slug || ""));
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
        // «إنعاش»: صدارة الموجز بوقت الإنعاش دون تغيير تاريخ النشر الظاهر
        .orderBy(desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`))
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

    // Localized landing pages (English/Urdu) with no dynamic handler — emit the
    // correct-language title/description instead of the Arabic default. Keys are
    // exact paths, so they never shadow the slug-based dynamic handlers below.
    const staticMeta = staticPageMeta(path);
    if (staticMeta) return res.json(staticMeta);

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
