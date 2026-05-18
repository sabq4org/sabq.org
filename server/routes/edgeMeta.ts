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
  enArticles,
  urArticles,
  enCategories,
  urCategories,
  deepAnalyses,
  worldDays,
  gulfEvents,
} from "@shared/schema";
import { eq, or } from "drizzle-orm";

const router = Router();
const ARABIC_RE = /[؀-ۿ]/;
const containsArabic = (s: string) => ARABIC_RE.test(s);

// Production is sabq.org. Staging (sabq.news) must set PUBLIC_SITE_URL explicitly.
const SITE_URL = process.env.PUBLIC_SITE_URL || "https://sabq.org";
const BRAND_OG_IMAGE = `${SITE_URL}/branding/sabq-og-image.png`;
const DEFAULT_OG_IMAGE = `${SITE_URL}/icon.png`;

function abs(url: string | null | undefined): string {
  if (!url) return DEFAULT_OG_IMAGE;
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

router.get("/api/edge/slug-redirect", async (req, res) => {
  res.set("Cache-Control", "public, max-age=60, s-maxage=60");
  try {
    const path = String(req.query.path || "");
    if (!path.startsWith("/")) return res.json({ redirect: null });

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
          return res.json({ redirect: `/article/${row.englishSlug}` });
        }
        if (routeType === "news") {
          return res.json({ redirect: `/article/${rawSlug}` });
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
          return res.json({ redirect: `/category/${row.englishSlug}` });
        }
      }
    }

    return res.json({ redirect: null });
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

const ROUTE_HANDLERS: RouteHandler[] = [
  // Arabic article: /article/:slug
  {
    pattern: /^\/article\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const where = or(eq(articles.englishSlug, slug), eq(articles.slug, slug));
      const [row] = await db
        .select({
          title: articles.title,
          excerpt: articles.excerpt,
          aiSummary: articles.aiSummary,
          content: articles.content,
          imageUrl: articles.imageUrl,
          englishSlug: articles.englishSlug,
          publishedAt: articles.publishedAt,
        })
        .from(articles)
        .where(where!)
        .limit(1);
      if (!row) return null;
      // Description prefers the AI-generated summary so the crawler unfurl
      // matches what the user picked editorially — same change made in
      // `seoInjector.ts` on 2026-05-15 per user request.
      const excerpt = row.aiSummary || row.excerpt || row.title || "";
      return {
        title: `${row.title} | سبق`,
        description: trunc(excerpt, 220),
        image: abs(row.imageUrl),
        canonical: `${SITE_URL}/article/${row.englishSlug || slug}`,
        robots: "index,follow",
        type: "article",
        locale: "ar_SA",
        semanticHtml: buildSemanticHtml({
          title: row.title || "",
          excerpt,
          content: row.content || "",
          publishedAt: row.publishedAt,
        }),
      };
    },
  },
  // Opinion article: /opinion/:slug
  // Lives in the same `articles` table with articleType='opinion' — same
  // schema as the article handler, just canonicalises to /opinion/<slug>.
  // Was missing entirely, so opinion shares unfurled with the generic SPA
  // shell meta ("سبق الذكية" + icon.png) instead of the article's image +
  // title + summary.
  {
    pattern: /^\/opinion\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const where = or(eq(articles.englishSlug, slug), eq(articles.slug, slug));
      const [row] = await db
        .select({
          title: articles.title,
          excerpt: articles.excerpt,
          aiSummary: articles.aiSummary,
          content: articles.content,
          imageUrl: articles.imageUrl,
          englishSlug: articles.englishSlug,
          publishedAt: articles.publishedAt,
        })
        .from(articles)
        .where(where!)
        .limit(1);
      if (!row) return null;
      const excerpt = row.aiSummary || row.excerpt || row.title || "";
      return {
        title: `${row.title} | سبق`,
        description: trunc(excerpt, 220),
        image: abs(row.imageUrl),
        canonical: `${SITE_URL}/opinion/${row.englishSlug || slug}`,
        robots: "index,follow",
        type: "article",
        locale: "ar_SA",
        semanticHtml: buildSemanticHtml({
          title: row.title || "",
          excerpt,
          content: row.content || "",
          publishedAt: row.publishedAt,
        }),
      };
    },
  },
  // English article: /en/article/:slug
  {
    pattern: /^\/en\/article\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const where = or(eq(enArticles.englishSlug, slug), eq(enArticles.slug, slug));
      const [row] = await db
        .select({
          title: enArticles.title,
          excerpt: enArticles.excerpt,
          content: enArticles.content,
          imageUrl: enArticles.imageUrl,
          englishSlug: enArticles.englishSlug,
          publishedAt: enArticles.publishedAt,
        })
        .from(enArticles)
        .where(where!)
        .limit(1);
      if (!row) return null;
      const excerpt = row.excerpt || row.title || "";
      return {
        title: `${row.title} | Sabq`,
        description: trunc(excerpt, 220),
        image: abs(row.imageUrl),
        canonical: `${SITE_URL}/en/article/${row.englishSlug || slug}`,
        robots: "index,follow",
        type: "article",
        locale: "en_US",
        semanticHtml: buildSemanticHtml({
          title: row.title || "",
          excerpt,
          content: row.content || "",
          publishedAt: row.publishedAt,
        }),
      };
    },
  },
  // Urdu article: /ur/article/:slug
  {
    pattern: /^\/ur\/article\/([^/?#]+)/,
    handle: async (m) => {
      const slug = decodeURIComponent(m[1]);
      const where = or(eq(urArticles.englishSlug, slug), eq(urArticles.slug, slug));
      const [row] = await db
        .select({
          title: urArticles.title,
          excerpt: urArticles.excerpt,
          content: urArticles.content,
          imageUrl: urArticles.imageUrl,
          englishSlug: urArticles.englishSlug,
          publishedAt: urArticles.publishedAt,
        })
        .from(urArticles)
        .where(where!)
        .limit(1);
      if (!row) return null;
      const excerpt = row.excerpt || row.title || "";
      return {
        title: `${row.title} | سبق`,
        description: trunc(excerpt, 220),
        image: abs(row.imageUrl),
        canonical: `${SITE_URL}/ur/article/${row.englishSlug || slug}`,
        robots: "index,follow",
        type: "article",
        locale: "ur_PK",
        semanticHtml: buildSemanticHtml({
          title: row.title || "",
          excerpt,
          content: row.content || "",
          publishedAt: row.publishedAt,
        }),
      };
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
      return {
        title: `${displayName} | سبق`,
        description: trunc(row.description || `أحدث الأخبار في ${displayName}`, 220),
        image: row.heroImageUrl ? abs(row.heroImageUrl) : BRAND_OG_IMAGE,
        canonical: `${SITE_URL}/category/${row.englishSlug || slug}`,
        robots: "index,follow",
        type: "website",
        locale: "ar_SA",
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
