/**
 * Sabq — Cloudflare Pages middleware (the edge "brain").
 *
 * Consolidates, into a single Pages Function, the two things that used to live
 * outside the static SPA when the frontend was on Vercel:
 *   1. Vercel's `vercel.json` rewrites  → PROXY of backend paths to the API.
 *   2. `cloudflare-worker/frontend-edge-worker.js` → SEO meta + slug redirects.
 *
 * Responsibilities:
 *   1. PROXY  — `/api/*`, `/uploads/*`, `/branding/*`, `/s/:code`, `/health`,
 *               `/ready`, `robots.txt`, `sitemap*.xml`, `ads.txt`, `app-ads.txt`
 *               are forwarded to API_ORIGIN for ALL HTTP methods (so POST login,
 *               comments, etc. work — not just GET).
 *   2. SLUG REDIRECT — Arabic article/category slugs + legacy `/news/` paths
 *               301 to the canonical English slug (DB-backed, via the backend).
 *   3. SEO INJECTION — for indexable HTML routes, inject <title>, description,
 *               og/twitter tags, canonical, and (for articles) semanticHtml into
 *               the SPA shell so crawlers see real content pre-hydration.
 *   4. HTML is always no-store — a stale shell referencing a rotated
 *               /assets/index-<hash>.js is the classic post-deploy white page.
 *
 * Env (Pages → Settings → Environment variables, Production + Preview):
 *   API_ORIGIN — defaults to "https://api.sabq.org".
 *   EDGE_SEO   — "on" to do slug-redirect + SEO injection here; anything else
 *                (default OFF) makes this middleware proxy-only and leaves SEO
 *                to the standalone `sabq-frontend-edge` worker. Staged handover:
 *                deploy proxy-only first (worker still injects), then once stable
 *                flip EDGE_SEO=on AND remove the worker's sabq.org routes — never
 *                both injecting at once.
 *   EDGE_HTML_CACHE — "on" (default) stores injected HTML in the Workers Cache
 *                API (P1 TTFB fix). Set "off" only for debugging. Requires
 *                EDGE_SEO=on. See docs/technical-seo-runbook-ar.md.
 *   NEXT_ORIGIN — origin of the Next.js SSR deployment (web-next on Railway),
 *                e.g. "https://next.sabq.org". Required when SSR_ROUTES=on.
 *   SSR_ROUTES — "on" enables DYNAMIC RENDERING on the SSR content surfaces
 *                (/, /article/:slug, /category/:slug, /en|ur/article/:slug):
 *                  • Human visitors ALWAYS get the original SPA (unchanged
 *                    design + the EDGE_SEO injected shell, exactly as before
 *                    SSR existed). Their experience is literally untouched.
 *                  • Search/social crawlers (Googlebot, bingbot, Applebot,
 *                    facebookexternalhit, …) are proxied to NEXT_ORIGIN, which
 *                    renders the full meta+body server-side (skipping EDGE_SEO
 *                    injection so there's no double injection).
 *                The edge cache key is namespaced by audience (crawler vs
 *                human) so the two renderings of the same URL never poison each
 *                other. /_next/* (Next's hashed CSS/JS) is proxied to
 *                NEXT_ORIGIN so crawler-rendered pages load styled. Default OFF
 *                → 100% unchanged SPA behavior; instantly reversible.
 *

 * NOTE: keep `VITE_API_URL` UNSET on the Pages build so the client uses relative
 * `/api/*` paths and THIS middleware proxies them (same as Vercel did). Setting
 * it would switch the client to DIRECT mode and break the ~243 raw fetch('/api')
 * callsites that bypass apiUrl().
 */

const DEFAULT_API_ORIGIN = "https://api.sabq.org";

// Short TTLs so a freshly published/edited article's meta + slug canonical
// surface at the edge within ~10s (mirrors the standalone worker).
const SEO_META_TTL = 10;
const SLUG_REDIRECT_TTL = 10;

const HTML_NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
  "CDN-Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

// Edge-cacheable HTML for indexable CONTENT routes (articles, categories,
// homepage). This is the P1 archiving fix: instead of forcing Googlebot to
// re-render the SPA shell from origin on every crawl (~1.5s TTFB, huge
// crawl-budget drain), the injected shell is served from Cloudflare's edge in
// <150ms for repeat hits, refreshed in the background.
//   - max-age=120     : short browser cache so users still get fresh content.
//   - s-maxage=300     : edge serves the cached, SEO-injected shell for 5 min.
//   - stale-while-revalidate=60 : edge can serve a slightly-stale copy while it
//     refreshes in the background → no cold-start tax for the next crawler.
// CDN-Cache-Control governs Cloudflare's own tier independently of the browser.
//
// SAFETY: this is ONLY applied to indexable content on the canonical host
// (sabq.org). noindex screens (dashboard/admin/auth/account), non-canonical
// hosts (*.pages.dev, sabq.news), and any route whose resolved robots meta is
// `noindex` always fall back to HTML_NO_STORE_HEADERS. A cached shell could
// reference a rotated /assets/index-<hash>.js after a deploy; the client-side
// deploy-recovery guard (client/src/lib/deployRecovery.ts) hard-reloads once on
// a chunk-load error, so the short staleness window self-heals.
const HTML_EDGE_CACHE_HEADERS = {
  "Cache-Control":
    "public, max-age=120, s-maxage=300, stale-while-revalidate=60",
  "CDN-Cache-Control":
    "public, max-age=300, stale-while-revalidate=60",
};

const STATIC_EXTENSIONS = [
  ".js", ".css", ".map", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".webp", ".avif", ".mp4", ".webm",
  ".json", ".xml", ".txt", ".pdf",
];

// Mirrors a subset of server/utils/noindexPaths.ts — never inject SEO meta into
// dashboard/admin/auth/account screens (both Arabic and en/ur localized prefixes).
const NOINDEX_PREFIXES = [
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

// Paths proxied verbatim to the backend. Mirrors vercel.json `rewrites`.
function isProxyPath(p) {
  return (
    p.startsWith("/api/") ||
    p === "/health" ||
    p === "/ready" ||
    p === "/ads.txt" ||
    p === "/app-ads.txt" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    /^\/sitemap-[^/]+\.xml$/.test(p) ||
    /^\/s\/[^/]+$/.test(p) ||
    p.startsWith("/uploads/") ||
    p.startsWith("/branding/")
  );
}

function isStaticAsset(p) {
  if (p.startsWith("/assets/")) return true;
  for (const ext of STATIC_EXTENSIONS) if (p.endsWith(ext)) return true;
  return false;
}

// Content surfaces rendered server-side by the Next.js app (web-next). Only the
// routes that web-next actually implements — Arabic/en/ur articles, Arabic
// category, and the homepage. en/ur category + secondary routes stay on the SPA
// until migrated (Phase 4). Trailing slashes are already 301'd away above, and
// query strings live in url.search (not in `p`).
function isSsrPath(p) {
  if (p === "/") return true;
  return (
    /^\/article\/[^/]+$/.test(p) ||
    /^\/category\/[^/]+$/.test(p) ||
    /^\/en\/article\/[^/]+$/.test(p) ||
    /^\/ur\/article\/[^/]+$/.test(p)
  );
}

// Search-engine + social-preview crawlers. Dynamic rendering serves these the
// SSR (full server-rendered) HTML, while human visitors keep the original SPA.
// The SSR body is the same article content a human sees after hydration, so
// this is equivalent-content dynamic rendering (not cloaking). Kept focused on
// indexing/preview bots; ordinary headless Chrome / Lighthouse is intentionally
// excluded so PageSpeed reflects the real (SPA) user experience.
const CRAWLER_RE =
  /(googlebot|google-inspectiontool|storebot-google|google-site-verification|bingbot|bingpreview|applebot|yandex(bot)?|duckduckbot|baiduspider|sogou|naverbot|petalbot|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|slack-imgproxy|telegrambot|whatsapp|discordbot|pinterest(bot)?|redditbot|embedly|vkshare|skypeuripreview|nuzzel|qwantify|googleweblight)/i;
function isCrawler(ua) {
  return !!ua && CRAWLER_RE.test(ua);
}

function isInjectablePath(p) {
  for (const prefix of NOINDEX_PREFIXES) {
    if (p === prefix || p.startsWith(prefix + "/") || p.startsWith(prefix)) return false;
  }
  if (isStaticAsset(p)) return false;
  return true;
}

function isHtml(res) {
  return (res.headers.get("content-type") || "").toLowerCase().includes("text/html");
}

function applyHtmlHeaders(res, headerSet) {
  if (!isHtml(res)) return res;
  const headers = new Headers(res.headers);
  // Clear stale freshness hints so a cacheable response never inherits a
  // leftover Pragma:no-cache / Expires:0 from an earlier set (and vice versa).
  headers.delete("Pragma");
  headers.delete("Expires");
  for (const [k, v] of Object.entries(headerSet)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Cloudflare does NOT auto-cache text/html from a Pages Function based on
// Cache-Control alone (Function responses are "dynamic"). To actually serve the
// injected shell from the edge — the part that turns the report's 1.5s TTFB
// into <150ms — we cache it ourselves via the Workers Cache API.
//
// The key is namespaced by the deployment commit (CF_PAGES_COMMIT_SHA). A new
// deploy = a brand-new keyspace, so a freshly-built shell can NEVER serve the
// previous build's rotated /assets/index-<hash>.js — eliminating the
// stale-shell-after-deploy class entirely (the reason HTML was no-store before).
function htmlCacheKey(requestUrl, commit, variant) {
  const u = new URL(requestUrl);
  // Drop the client deploy-recovery buster so recovery reloads don't fragment
  // (or poison) the cache, and don't carry it into the cache key.
  u.searchParams.delete("_dr");
  u.searchParams.set("__b", commit || "dev");
  // Audience namespace for dynamic rendering: on SSR paths the crawler gets a
  // different rendering (full SSR) than humans (SPA shell), so they must NOT
  // share a cache entry. Empty for all other paths to avoid fragmentation.
  if (variant) u.searchParams.set("__v", variant);
  return new Request(u.toString(), { method: "GET" });
}

async function proxyToApi(request, apiOrigin) {
  const url = new URL(request.url);
  const target = apiOrigin + url.pathname + url.search;
  // Pages Functions re-issue the request with `fetch()` to API_ORIGIN. Cloudflare
  // rewrites `cf-connecting-ip` on that subrequest to this function's single
  // egress IP, so every visitor collapses into ONE backend rate-limit bucket
  // (symptom: HTTP 429 on login/comments for the whole site). Capture the real
  // client IP from the inbound request (still correct here) and forward it in a
  // trusted header the backend reads first in rateLimitKey() (server/index.ts).
  const headers = new Headers(request.headers);
  const realIp = request.headers.get("cf-connecting-ip");
  if (realIp) headers.set("X-Sabq-Client-IP", realIp);
  const init = {
    method: request.method,
    headers,
    // Pass redirects (e.g. /s/:code short links return 301) straight to the
    // browser instead of following them server-side.
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  return fetch(target, init);
}

// Edge-cached JSON GET (slug-redirect / seo-meta), keyed on the full URL.
async function cachedJson(url, ttl) {
  const cache = caches.default;
  const key = new Request(url, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) {
    try { return await hit.json(); } catch (_) { /* fall through */ }
  }
  const res = await fetch(url, { headers: { "User-Agent": "sabq-pages-fn/1.0" } });
  if (!res.ok) return null;
  const text = await res.text();
  await cache.put(
    key,
    new Response(text, {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
    }),
  );
  try { return JSON.parse(text); } catch (_) { return null; }
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// JSON inside an HTML <script> must not be able to terminate the script block.
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

  if (meta.googlebotNews) {
    parts.push(`<meta name="googlebot-news" content="${escapeHtml(meta.googlebotNews)}">`);
  }

  if (meta.publishedTime) {
    parts.push(`<meta property="article:published_time" content="${escapeHtml(meta.publishedTime)}">`);
  }
  if (meta.modifiedTime) {
    parts.push(`<meta property="article:modified_time" content="${escapeHtml(meta.modifiedTime)}">`);
  }
  if (meta.section) {
    parts.push(`<meta property="article:section" content="${escapeHtml(meta.section)}">`);
  }
  if (meta.author) {
    parts.push(`<meta property="article:author" content="${escapeHtml(meta.author)}">`);
  }
  if (Array.isArray(meta.tags)) {
    for (const tag of meta.tags) {
      if (tag) parts.push(`<meta property="article:tag" content="${escapeHtml(tag)}">`);
    }
  }

  if (Array.isArray(meta.hreflang)) {
    for (const alternate of meta.hreflang) {
      if (alternate && alternate.lang && alternate.href) {
        parts.push(
          `<link rel="alternate" hreflang="${escapeHtml(alternate.lang)}" href="${escapeHtml(alternate.href)}">`,
        );
      }
    }
  }

  const jsonLd = buildJsonLd(meta.jsonLd);
  if (jsonLd) parts.push(jsonLd);

  parts.push(`<!-- sabq-edge-meta-injected -->`);
  return parts.filter(Boolean).join("\n");
}

class TagRemover {
  element(el) { el.remove(); }
}
class HeadInjector {
  constructor(block) { this.block = block; this.done = false; }
  element(el) {
    if (this.done) return;
    el.append(this.block, { html: true });
    this.done = true;
  }
}
class RootInjector {
  constructor(html) { this.html = html || ""; this.done = false; }
  element(el) {
    if (this.done || !this.html) return;
    el.prepend(this.html, { html: true });
    this.done = true;
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const apiOrigin = env.API_ORIGIN || DEFAULT_API_ORIGIN;
  const seoEnabled = String(env.EDGE_SEO || "").toLowerCase() === "on";
  const nextOrigin = (env.NEXT_ORIGIN || "").replace(/\/+$/, "");
  const ssrEnabled =
    String(env.SSR_ROUTES || "").toLowerCase() === "on" && !!nextOrigin;

  // Only sabq.org is the canonical, indexable frontend. Any OTHER host that
  // serves this same SPA — the sabq.news test domain, `*.pages.dev` preview
  // builds, or a `www.` variant — must NOT be indexed, or it competes with
  // sabq.org for identical content and dilutes/splits Google's signals.
  const noindexHost = url.hostname !== "sabq.org";

  // On a non-canonical host, override robots.txt with a blanket disallow so
  // crawlers skip the duplicate entirely (the proxied backend robots.txt says
  // "Allow: /"). Page responses below also carry X-Robots-Tag: noindex.
  if (noindexHost && path === "/robots.txt") {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // In-function edge cache (Workers Cache API). Default ON; set
  // EDGE_HTML_CACHE=off to disable (e.g. once a zone-level "Cache Everything"
  // Cache Rule is doing the job). Only active when SEO is injected HERE
  // (EDGE_SEO=on) so we never cache a half-rendered shell that the standalone
  // worker would otherwise enrich.
  const edgeHtmlCacheEnabled =
    String(env.EDGE_HTML_CACHE || "on").toLowerCase() !== "off" && seoEnabled;
  const commit = env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BUILD_ID || "";

  // Dynamic rendering: only search/social crawlers get the SSR rendering on SSR
  // paths; humans always get the original SPA. The cache is namespaced by
  // audience on SSR paths so the two renderings never collide.
  const userAgent = request.headers.get("user-agent") || "";
  const ssrPath = ssrEnabled && isSsrPath(path);
  const wantsSsr = ssrPath && isCrawler(userAgent);
  const cacheVariant = ssrPath ? (wantsSsr ? "b" : "h") : "";
  const cacheKey =
    request.method === "GET"
      ? htmlCacheKey(request.url, commit, cacheVariant)
      : null;

  // Finalizes an HTML response. `cacheable` opts the response into the edge
  // cache (HTML_EDGE_CACHE_HEADERS) — only ever true for indexable content on
  // the canonical host; everything else stays no-store. Non-canonical hosts
  // additionally get X-Robots-Tag: noindex and are FORCED to no-store so a
  // duplicate host can never poison the edge with a cacheable copy.
  const finalizeHtml = (res, { cacheable = false } = {}) => {
    const useCache = cacheable && !noindexHost;
    const out = applyHtmlHeaders(
      res,
      useCache ? HTML_EDGE_CACHE_HEADERS : HTML_NO_STORE_HEADERS,
    );
    if (!noindexHost || !isHtml(out)) return out;
    const headers = new Headers(out.headers);
    headers.set("X-Robots-Tag", "noindex, follow");
    return new Response(out.body, { status: out.status, statusText: out.statusText, headers });
  };

  // Wraps finalizeHtml + the Cache API write. On a cacheable 200 HTML response
  // it tags `x-edge-cache: MISS` and stores a clone for subsequent hits.
  const deliverHtml = (res, { cacheable = false } = {}) => {
    const out = finalizeHtml(res, { cacheable });
    if (
      !edgeHtmlCacheEnabled ||
      !cacheable ||
      noindexHost ||
      !cacheKey ||
      !isHtml(out) ||
      out.status !== 200
    ) {
      return out;
    }
    const headers = new Headers(out.headers);
    headers.set("x-edge-cache", "MISS");
    const tagged = new Response(out.body, {
      status: out.status,
      statusText: out.statusText,
      headers,
    });
    // Store a clone; the original stream is returned to the client. TTL is
    // derived by the Cache API from the response's s-maxage (300s).
    context.waitUntil(caches.default.put(cacheKey, tagged.clone()).catch(() => {}));
    return tagged;
  };

  // Normalize trailing slashes on content routes: /article/x/ -> /article/x
  // (301). Both forms return 200 today (the slash version self-canonicalizes,
  // so it's the benign "alternate w/ canonical" GSC bucket — this just saves
  // Google the extra crawl). Excludes proxy paths (/api, /uploads, sitemaps,
  // /s/…) and static assets so it never touches media or API endpoints.
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    path !== "/" &&
    path.endsWith("/") &&
    !isProxyPath(path) &&
    !isStaticAsset(path)
  ) {
    return Response.redirect(`${url.origin}${path.replace(/\/+$/, "")}${url.search}`, 301);
  }

  // 1) Proxy backend paths (every method).
  if (isProxyPath(path)) {
    try {
      return await proxyToApi(request, apiOrigin);
    } catch (err) {
      console.error("[pages-fn] proxy error:", err);
      return new Response("Bad gateway", { status: 502 });
    }
  }

  // 1b) Next.js build assets (/_next/*) → proxy to the SSR deployment. The SSR
  // pages reference hashed /_next/static/<...>.css and .js. Those paths look
  // like static assets, so without this they fall through to next() and Pages
  // serves the SPA index.html (text/html) in their place — leaving every SSR
  // page UNSTYLED and un-hydrated. Next sets immutable long-cache headers on
  // these, which we pass through verbatim. Only when SSR is enabled.
  if (ssrEnabled && path.startsWith("/_next/")) {
    try {
      return await proxyToApi(request, nextOrigin);
    } catch (err) {
      console.error("[pages-fn] next asset proxy failed:", err);
      return next();
    }
  }

  // 2) Non-GET/HEAD, static assets / noindex screens, or SEO handled elsewhere
  //    (EDGE_SEO off — the standalone worker injects) → serve the shell as-is.
  if (request.method !== "GET" && request.method !== "HEAD") return next();

  // Indexable content on the canonical host is edge-cacheable (P1 fix). This
  // decision is based on the PATH (not on seoEnabled), so the cache speed-up
  // applies whether SEO is injected here or by the standalone worker.
  const injectable = isInjectablePath(path);
  const htmlCacheable = injectable && !noindexHost;

  // Edge HIT — serve the already-injected shell straight from the edge cache,
  // skipping the origin shell+meta fetch entirely (the TTFB win). Safe because
  // only fully-injected, redirect-free 200s are ever stored, keyed by deploy.
  if (edgeHtmlCacheEnabled && htmlCacheable && cacheKey) {
    const hit = await caches.default.match(cacheKey);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set("x-edge-cache", "HIT");
      return new Response(hit.body, {
        status: hit.status,
        statusText: hit.statusText,
        headers,
      });
    }
  }

  // SSR content routes (CRAWLERS ONLY → dynamic rendering) → proxy to the
  // Next.js deployment (web-next). Next renders the full article/category/home
  // HTML (meta + body) server-side, so we return its output directly and SKIP
  // the EDGE_SEO shell injection below (never double-inject). Human visitors
  // never reach here — they fall through to the SPA shell path below and keep
  // the original design. Slug-redirect still runs first so Arabic/legacy slugs
  // keep 301'ing to the English canonical before reaching Next. A failure falls
  // through to the existing SPA-shell path, so SSR is fail-safe.
  if (wantsSsr && htmlCacheable) {
    try {
      const slug = await cachedJson(
        `${apiOrigin}/api/edge/slug-redirect?path=${encodeURIComponent(path)}`,
        SLUG_REDIRECT_TTL,
      );
      const redirectTo = slug && slug.redirect ? slug.redirect : null;
      if (redirectTo && redirectTo !== path) {
        return Response.redirect(`${url.origin}${redirectTo}${url.search}`, 301);
      }
      const ssrRes = await proxyToApi(request, nextOrigin);
      // Only edge-cache a successful HTML render; Next 404/5xx pass through
      // no-store so a transient error is never cached as a 200.
      const ok = ssrRes.status === 200 && isHtml(ssrRes);
      return deliverHtml(ssrRes, { cacheable: ok });
    } catch (err) {
      console.error("[pages-fn] ssr proxy failed, falling back to SPA shell:", err);
      // fall through to the SPA shell / SEO injection path below
    }
  }

  if (!seoEnabled || !injectable) {
    return deliverHtml(await next(), { cacheable: htmlCacheable });
  }

  // 3) Indexable HTML route → slug redirect + SEO meta/body injection.
  try {
    // Fetch slug-redirect, the SPA shell, and SEO meta CONCURRENTLY (TTFB fix).
    // Previously slug-redirect was awaited serially before the shell+meta,
    // adding one edge→origin round-trip to every content-page crawl. The
    // redirect is rare (Arabic/legacy slugs), so on the hot path we just
    // discard the unused shell/meta; when a redirect IS present we 301 before
    // touching them.
    const [slug, shell, meta] = await Promise.all([
      cachedJson(
        `${apiOrigin}/api/edge/slug-redirect?path=${encodeURIComponent(path)}`,
        SLUG_REDIRECT_TTL,
      ),
      next(),
      cachedJson(`${apiOrigin}/api/edge/seo-meta?path=${encodeURIComponent(path)}`, SEO_META_TTL),
    ]);
    const redirectTo = slug && slug.redirect ? slug.redirect : null;
    if (redirectTo && redirectTo !== path) {
      return Response.redirect(`${url.origin}${redirectTo}${url.search}`, 301);
    }

    // No meta (DB hiccup) → don't long-cache an un-injected generic shell on a
    // content URL; serve it no-store so the next crawl re-tries injection.
    if (!isHtml(shell) || !meta) return finalizeHtml(shell, { cacheable: false });

    // A resolved `noindex` (e.g. missing row, unpublished, aged-out) must never
    // be edge-cached as a 200 indexable page.
    const metaNoindex =
      typeof meta.robots === "string" && meta.robots.toLowerCase().includes("noindex");
    const injectedCacheable = htmlCacheable && !metaNoindex;

    // Strip the shell's generic tags first so crawlers that read the FIRST
    // duplicate (Twitter, some Slack/Telegram) don't see homepage tags.
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
      .on("head", new HeadInjector(buildMetaBlock(meta)));
    if (meta.semanticHtml) {
      rewriter = rewriter.on("div#root", new RootInjector(meta.semanticHtml));
    }
    return deliverHtml(rewriter.transform(shell), { cacheable: injectedCacheable });
  } catch (err) {
    console.error("[pages-fn] html error:", err);
    return finalizeHtml(await next(), { cacheable: false });
  }
}
