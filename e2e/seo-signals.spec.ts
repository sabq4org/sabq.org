import { test, expect, APIRequestContext } from "@playwright/test";

/**
 * SEO-signal parity: Arabic vs English news surfaces, as Googlebot sees them.
 *
 * Regression guard for the 2026-07-30 "English news never indexed" incident:
 * every crawler-facing EN hub (/en, /en/category/*) exposed ZERO links, so
 * English articles were sitemap-only orphans, while the crawler-served EN HTML
 * declared lang="ar" dir="rtl".
 *
 * READ-ONLY (GET requests with a Googlebot UA) — safe against production:
 *   PW_BASE_URL=https://sabq.org npx playwright test e2e/seo-signals.spec.ts
 *
 * Production-gated: these signals are produced by the Cloudflare Pages
 * middleware + /api/edge/seo-meta + web-next — layers that do not run under
 * the local single-process dev server (which uses seoInjector.ts instead).
 */

const BASE = process.env.PW_BASE_URL || "";
const IS_PROD_TOPOLOGY = /sabq\.org/.test(BASE);

const GOOGLEBOT_UA =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/125.0.0.0 Safari/537.36";

test.use({ userAgent: GOOGLEBOT_UA });

test.skip(
  !IS_PROD_TOPOLOGY,
  "production-only: signals come from the Pages edge middleware, not the local dev server",
);

async function fetchHtml(request: APIRequestContext, path: string) {
  const res = await request.get(path, { headers: { "User-Agent": GOOGLEBOT_UA } });
  expect(res.status(), `${path} must return 200`).toBe(200);
  return res.text();
}

/** Shared per-language article assertions — the parity core. */
function expectArticleSignals(html: string, articleUrl: string, lang: "ar" | "en") {
  // Self-referencing canonical (never pointing at the other language).
  expect(html).toContain(`<link rel="canonical" href="${articleUrl}"`);
  // Indexable robots meta, and no noindex anywhere in the robots tag.
  const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1] || "";
  expect(robots).toContain("index");
  expect(robots).not.toContain("noindex");
  // Declared document language matches the content language.
  const htmlTag = html.match(/<html[^>]*>/)?.[0] || "";
  expect(htmlTag).toContain(`lang="${lang}"`);
  expect(htmlTag).toContain(lang === "ar" ? 'dir="rtl"' : 'dir="ltr"');
  // Self hreflang present. The "i" flag is for the attribute casing only —
  // Next/React emit it as hrefLang, the edge injector as hreflang.
  const escapedUrl = articleUrl.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  expect(html).toMatch(new RegExp(`hreflang="${lang}" href="${escapedUrl}"`, "i"));
  // Real content: a NewsArticle JSON-LD with the matching inLanguage.
  expect(html).toContain('"@type":"NewsArticle"');
  expect(html).toContain(`"inLanguage":"${lang}"`);
}

test.describe("seo-signals: AR/EN parity for Googlebot", () => {
  test("EN homepage exposes crawlable links to English articles", async ({ request }) => {
    const html = await fetchHtml(request, "/en");
    // Discovery hub: at least one direct article link and one section link.
    expect(html).toContain('href="/en/article/');
    expect(html).toContain('href="/en/category/');
    // Correct declared language for the English edition.
    const htmlTag = html.match(/<html[^>]*>/)?.[0] || "";
    expect(htmlTag).toContain('lang="en"');
    expect(htmlTag).toContain('dir="ltr"');
    // Not accidentally noindexed.
    expect(html.match(/<meta name="robots" content="([^"]*)"/)?.[1] || "").not.toContain(
      "noindex",
    );
  });

  test("AR homepage still exposes crawlable links to Arabic articles", async ({ request }) => {
    const html = await fetchHtml(request, "/");
    expect(html).toContain('href="/article/');
    const htmlTag = html.match(/<html[^>]*>/)?.[0] || "";
    expect(htmlTag).toContain('lang="ar"');
    expect(htmlTag).toContain('dir="rtl"');
  });

  test("an English article carries the same indexing signals as an Arabic one", async ({
    request,
  }) => {
    // Sample one URL per language from the live news sitemap; fall back to the
    // /en discovery links for English if the last-48h window has no EN items.
    const sitemap = await fetchHtml(request, "/sitemap-news.xml");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const arUrl = locs.find((u) => /\/article\//.test(u) && !/\/(en|ur)\//.test(u));
    let enUrl = locs.find((u) => /\/en\/article\//.test(u));
    if (!enUrl) {
      const enHome = await fetchHtml(request, "/en");
      const slug = enHome.match(/href="(\/en\/article\/[^"]+)"/)?.[1];
      enUrl = slug ? new URL(slug, BASE).toString() : undefined;
    }
    expect(arUrl, "news sitemap must contain an Arabic article").toBeTruthy();
    expect(enUrl, "an English article must be discoverable (sitemap or /en links)").toBeTruthy();

    const [arHtml, enHtml] = await Promise.all([
      fetchHtml(request, new URL(arUrl!).pathname),
      fetchHtml(request, new URL(enUrl!).pathname),
    ]);
    expectArticleSignals(arHtml, arUrl!, "ar");
    expectArticleSignals(enHtml, enUrl!, "en");
  });
});
