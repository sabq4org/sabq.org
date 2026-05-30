/**
 * Sabq frontend edge worker (sits in front of Vercel).
 *
 * Responsibilities (replaces server/middleware/slugRedirect.ts and
 * server/seoInjector.ts now that those mutations no longer happen on the
 * Express path because Vercel serves the static SPA shell directly):
 *
 *   1. SLUG REDIRECT: For Arabic article/category slugs and legacy /news/
 *      paths, hit the backend /api/edge/slug-redirect endpoint and 301 to
 *      the canonical English slug if one is found. Crawlers and humans
 *      both follow these — same as the old Express middleware.
 *
 *   2. SEO META + BODY INJECTION: For HTML responses on indexable routes,
 *      fetch the static shell from Vercel AND fetch /api/edge/seo-meta from
 *      the backend in parallel, then inject <title>, meta description,
 *      og/twitter tags, and the canonical link into <head>. For articles,
 *      also inject semanticHtml (full body + outbound links) into #root so
 *      HTML-only crawlers (Screaming Frog, etc.) see the paid/sponsored links
 *      without waiting for React hydration.
 *
 *   3. STATIC PASS-THROUGH: Asset and API requests bypass injection.
 *
 * Bind these env vars in wrangler.toml:
 *   API_ORIGIN     — e.g. "https://api.sabq.org"
 *   FRONTEND_ORIGIN — e.g. "https://sabq.org" (the Vercel deployment)
 *
 * Cache: meta lookups are cached at the worker for 60s. The worker itself
 * does NOT cache HTML — let Vercel + Cloudflare's normal cache handle that
 * (this worker only mutates).
 */

const STATIC_EXTENSIONS = [
  ".js", ".css", ".map", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".webp", ".avif", ".mp4", ".webm",
  ".json", ".xml", ".txt", ".pdf"
];

// Short TTL so a freshly published/edited article's <title> + OG meta + slug
// canonicalization show up at the edge within ~10s. Longer TTLs (was 60s) made
// editors see stale crawler/share tags after saving even though the article
// body itself was already updated via the backend Cloudflare purge.
const SEO_META_TTL = 10;
const SLUG_REDIRECT_TTL = 10;

// Never let Cloudflare edge-cache HTML from the worker or from the origin
// subrequest. Stale HTML is the root cause of post-deploy white pages: the
// shell still references /assets/index-<oldhash>.js which 404s after Vite
// rotates chunk names on the next Vercel deploy.
const ORIGIN_FETCH = { cf: { cacheTtl: 0, cacheEverything: false } };

const HTML_NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
  "CDN-Cache-Control": "no-store, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

function isHtmlResponse(response) {
  return (response.headers.get("content-type") || "")
    .toLowerCase()
    .includes("text/html");
}

function withHtmlNoStore(response) {
  if (!isHtmlResponse(response)) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(HTML_NO_STORE_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function fetchOrigin(request) {
  return fetch(request, ORIGIN_FETCH);
}

// Backend-owned, non-HTML resources that must NEVER be served as the SPA HTML
// shell. When these go through Vercel and the backend hiccups, Vercel's
// SPA fallback returns index.html (HTML 200) — which Google records as
// "Sitemap is HTML" and drops the whole bucket. Routing them straight to the
// API origin turns a transient failure into a 5xx (which Google silently
// retries) and never an HTML 200.
const API_DIRECT_RE = /^\/(sitemap[a-z0-9-]*\.xml|robots\.txt)$/i;

function isApiDirect(pathname) {
  return API_DIRECT_RE.test(pathname);
}

function isStaticAsset(pathname) {
  for (const ext of STATIC_EXTENSIONS) {
    if (pathname.endsWith(ext)) return true;
  }
  if (pathname.startsWith("/assets/")) return true;
  return false;
}

// Paths the worker MUST NOT inject SEO meta into. Mirrors (a subset of)
// server/utils/noindexPaths.ts — dashboard, admin, auth, account screens.
// Listing both Arabic and en/ur prefixes because the SPA uses /en/dashboard
// and /ur/dashboard for localized admin surfaces.
const NOINDEX_PREFIXES = [
  "/api/",
  "/dashboard", "/en/dashboard", "/ur/dashboard",
  "/admin",
  "/login", "/register",
  "/profile", "/en/profile",
  "/settings",
  "/forgot-password", "/reset-password", "/set-password",
  "/2fa-verify", "/verify-email",
  "/notifications", "/bookmarks", "/my-keywords", "/my-follows",
  "/preferences-center", "/select-interests", "/edit-interests",
  "/complete-profile",
  "/payment-callback", "/advertiser-payment-callback",
  "/advertiser/", "/publisher/", "/staff/",
];

function isInjectablePath(pathname) {
  for (const prefix of NOINDEX_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix)) {
      return false;
    }
  }
  if (isStaticAsset(pathname)) return false;
  return true;
}

async function cachedJsonFetch(url, ttl) {
  const cache = caches.default;
  const cacheKey = new Request(url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      return await cached.json();
    } catch (_) { /* fall through */ }
  }
  const res = await fetch(url, { headers: { "User-Agent": "sabq-edge-worker/1.0" } });
  if (!res.ok) return null;
  const text = await res.text();
  const payload = new Response(text, {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
  });
  await cache.put(cacheKey, payload.clone());
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

async function checkSlugRedirect(apiOrigin, pathname) {
  const url = `${apiOrigin}/api/edge/slug-redirect?path=${encodeURIComponent(pathname)}`;
  const data = await cachedJsonFetch(url, SLUG_REDIRECT_TTL);
  return data && data.redirect ? data.redirect : null;
}

async function fetchSeoMeta(apiOrigin, pathname) {
  const url = `${apiOrigin}/api/edge/seo-meta?path=${encodeURIComponent(pathname)}`;
  return await cachedJsonFetch(url, SEO_META_TTL);
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Serialize the NewsArticle (or other) JSON-LD safely. JSON inside a <script>
// must not contain a literal "</script>" or a HTML special that lets the block
// break out — escape <, >, & to their \uXXXX forms (valid JSON, inert HTML).
function buildJsonLd(jsonLd) {
  if (!jsonLd || typeof jsonLd !== "object") return "";
  let json;
  try {
    json = JSON.stringify(jsonLd);
  } catch (_) {
    return "";
  }
  json = json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return `<script type="application/ld+json">${json}</script>`;
}

function buildMetaBlock(meta) {
  if (!meta) return "";
  const title = escapeHtml(meta.title || "سبق الذكية");
  const desc = escapeHtml(meta.description || "");
  const image = escapeHtml(meta.image || "");
  const canonical = escapeHtml(meta.canonical || "");
  const robots = escapeHtml(meta.robots || "index,follow");
  const ogType = escapeHtml(meta.type || "website");
  const locale = escapeHtml(meta.locale || "");
  const siteName = escapeHtml(meta.siteName || "");
  const twitterSite = escapeHtml(meta.twitterSite || "");

  const parts = [
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}">`,
    `<meta name="robots" content="${robots}">`,
    canonical ? `<link rel="canonical" href="${canonical}">` : "",
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:type" content="${ogType}">`,
    canonical ? `<meta property="og:url" content="${canonical}">` : "",
    image ? `<meta property="og:image" content="${image}">` : "",
    image && meta.imageWidth ? `<meta property="og:image:width" content="${escapeHtml(meta.imageWidth)}">` : "",
    image && meta.imageHeight ? `<meta property="og:image:height" content="${escapeHtml(meta.imageHeight)}">` : "",
    locale ? `<meta property="og:locale" content="${locale}">` : "",
    siteName ? `<meta property="og:site_name" content="${siteName}">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    twitterSite ? `<meta name="twitter:site" content="${twitterSite}">` : "",
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${desc}">`,
    image ? `<meta name="twitter:image" content="${image}">` : "",
  ];

  // Age-based News indexing (articles > 30d drop out of Google News index).
  if (meta.googlebotNews) parts.push(`<meta name="googlebot-news" content="${escapeHtml(meta.googlebotNews)}">`);

  // Article freshness + provenance — the strongest Google News on-page signals
  // (datePublished/dateModified, byline, section). Were entirely absent before.
  if (meta.publishedTime) parts.push(`<meta property="article:published_time" content="${escapeHtml(meta.publishedTime)}">`);
  if (meta.modifiedTime) parts.push(`<meta property="article:modified_time" content="${escapeHtml(meta.modifiedTime)}">`);
  if (meta.section) parts.push(`<meta property="article:section" content="${escapeHtml(meta.section)}">`);
  if (meta.author) parts.push(`<meta property="article:author" content="${escapeHtml(meta.author)}">`);
  if (Array.isArray(meta.tags)) {
    for (const t of meta.tags) {
      if (t) parts.push(`<meta property="article:tag" content="${escapeHtml(t)}">`);
    }
  }

  // hreflang chain — connects the ar/en/ur variants for multilingual indexing.
  if (Array.isArray(meta.hreflang)) {
    for (const h of meta.hreflang) {
      if (h && h.lang && h.href) {
        parts.push(`<link rel="alternate" hreflang="${escapeHtml(h.lang)}" href="${escapeHtml(h.href)}">`);
      }
    }
  }

  const jsonLd = buildJsonLd(meta.jsonLd);
  if (jsonLd) parts.push(jsonLd);

  parts.push(`<!-- sabq-edge-meta-injected -->`);
  return parts.filter(Boolean).join("\n");
}

class TagRemover {
  element(element) {
    element.remove();
  }
}

class HeadInjector {
  constructor(metaBlock) {
    this.metaBlock = metaBlock;
    this.injected = false;
  }
  element(element) {
    if (this.injected) return;
    element.append(this.metaBlock, { html: true });
    this.injected = true;
  }
}

// Mirrors server/seoInjector.ts semanticHtml — prepended inside #root.
class RootInjector {
  constructor(semanticHtml) {
    this.semanticHtml = semanticHtml || "";
    this.injected = false;
  }
  element(element) {
    if (this.injected || !this.semanticHtml) return;
    element.prepend(this.semanticHtml, { html: true });
    this.injected = true;
  }
}

async function handleHtml(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1) Slug redirect — DB-backed lookup on the backend.
  const redirectTo = await checkSlugRedirect(env.API_ORIGIN, pathname);
  if (redirectTo && redirectTo !== pathname) {
    return Response.redirect(`${url.origin}${redirectTo}${url.search}`, 301);
  }

  // 2) Fetch HTML from Vercel + meta from backend in parallel.
  // Bypass Cloudflare's edge cache for the upstream HTML so we never inject
  // meta into a stale SPA shell whose <script src="/assets/index-<hash>.js">
  // points to a chunk that was rotated out by a newer Vercel deploy. Without
  // this, every deploy forced a manual "Purge Everything" in Cloudflare to
  // stop users hitting a white page until the worker's cached upstream
  // response naturally aged out. The origin (Vercel) already sends
  // Cache-Control: no-store for HTML — we just need to honor it on the
  // worker→origin hop.
  const [originRes, meta] = await Promise.all([
    fetchOrigin(request),
    fetchSeoMeta(env.API_ORIGIN, pathname),
  ]);

  const ct = (originRes.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("text/html") || !meta) {
    return withHtmlNoStore(originRes);
  }

  const metaBlock = buildMetaBlock(meta);
  // Strip the static SPA shell's stale meta tags first, otherwise crawlers
  // that pick the *first* duplicate (Twitter, some Slack/Telegram variants)
  // would see the generic homepage tags instead of the injected article
  // ones. Facebook/WhatsApp/LinkedIn use the *last* occurrence so this also
  // de-duplicates the response for them.
  const remover = new TagRemover();
  let rewriter = new HTMLRewriter()
    .on("head > title", remover)
    .on('head > meta[name="description"]', remover)
    .on('head > meta[name="robots"]', remover)
    .on('head > link[rel="canonical"]', remover)
    .on('head > meta[property^="og:"]', remover)
    .on('head > meta[name^="twitter:"]', remover)
    .on('head > meta[property^="twitter:"]', remover)
    .on('head > meta[property^="article:"]', remover)
    .on('head > meta[name="googlebot-news"]', remover)
    .on('head > link[rel="alternate"][hreflang]', remover)
    .on("head", new HeadInjector(metaBlock));
  if (meta.semanticHtml) {
    rewriter = rewriter.on("div#root", new RootInjector(meta.semanticHtml));
  }
  return withHtmlNoStore(rewriter.transform(originRes));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return fetch(request);
    }

    // Sitemaps + robots.txt: straight to the API origin (bypass Vercel's SPA
    // fallback so a backend hiccup is a 5xx Google retries, never an HTML 200).
    // Edge-cache them — but keep the NEWS sitemap SHORT (120s) so freshly
    // published articles still surface within minutes (Google News relies on
    // it); the big, stable article buckets are fine cached for an hour.
    // cacheEverything is safe here: this branch only serves XML/text, never the
    // HTML shell (whose staleness causes post-deploy white pages).
    if (isApiDirect(url.pathname)) {
      const cacheTtl = url.pathname === "/sitemap-news.xml" ? 120 : 3600;
      return fetch(`${env.API_ORIGIN}${url.pathname}${url.search}`, {
        cf: { cacheTtl, cacheEverything: true },
      });
    }

    if (!isInjectablePath(url.pathname)) {
      return withHtmlNoStore(await fetchOrigin(request));
    }

    try {
      return await handleHtml(request, env);
    } catch (err) {
      console.error("[edge-worker] error:", err);
      return withHtmlNoStore(await fetchOrigin(request));
    }
  },
};
