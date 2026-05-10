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
 *   2. SEO META INJECTION: For HTML responses on indexable routes, fetch
 *      the static shell from Vercel AND fetch /api/edge/seo-meta from the
 *      backend in parallel, then inject <title>, meta description,
 *      og/twitter tags, and the canonical link into <head>. Crawlers see
 *      the right meta even though the shell itself is static.
 *
 *   3. STATIC PASS-THROUGH: Asset and API requests bypass injection.
 *
 * Bind these env vars in wrangler.toml:
 *   API_ORIGIN     — e.g. "https://api.sabq.news"
 *   FRONTEND_ORIGIN — e.g. "https://sabq.news" (the Vercel deployment)
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

const SEO_META_TTL = 60;
const SLUG_REDIRECT_TTL = 60;

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

function buildMetaBlock(meta) {
  if (!meta) return "";
  const title = escapeHtml(meta.title || "سبق الذكية");
  const desc = escapeHtml(meta.description || "");
  const image = escapeHtml(meta.image || "");
  const canonical = escapeHtml(meta.canonical || "");
  const robots = escapeHtml(meta.robots || "index,follow");
  const ogType = escapeHtml(meta.type || "website");

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}">`,
    `<meta name="robots" content="${robots}">`,
    canonical ? `<link rel="canonical" href="${canonical}">` : "",
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:type" content="${ogType}">`,
    canonical ? `<meta property="og:url" content="${canonical}">` : "",
    image ? `<meta property="og:image" content="${image}">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${desc}">`,
    image ? `<meta name="twitter:image" content="${image}">` : "",
    `<!-- sabq-edge-meta-injected -->`,
  ].filter(Boolean).join("\n");
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

async function handleHtml(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1) Slug redirect — DB-backed lookup on the backend.
  const redirectTo = await checkSlugRedirect(env.API_ORIGIN, pathname);
  if (redirectTo && redirectTo !== pathname) {
    return Response.redirect(`${url.origin}${redirectTo}${url.search}`, 301);
  }

  // 2) Fetch HTML from Vercel + meta from backend in parallel.
  const [originRes, meta] = await Promise.all([
    fetch(request),
    fetchSeoMeta(env.API_ORIGIN, pathname),
  ]);

  const ct = (originRes.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("text/html") || !meta) {
    return originRes;
  }

  const metaBlock = buildMetaBlock(meta);
  const rewriter = new HTMLRewriter().on("head", new HeadInjector(metaBlock));
  return rewriter.transform(originRes);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return fetch(request);
    }

    if (!isInjectablePath(url.pathname)) {
      return fetch(request);
    }

    try {
      return await handleHtml(request, env);
    } catch (err) {
      console.error("[edge-worker] error:", err);
      return fetch(request);
    }
  },
};
