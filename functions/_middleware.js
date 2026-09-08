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
// A crawler must never wait for an unbounded Next.js subrequest. If SSR is
// unavailable we fall back to the existing SEO path (when enabled), but an
// otherwise generic SPA shell is always no-store for that crawler request.
const SSR_PROXY_TIMEOUT_MS = 5000;

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
// repeat hits, with a bounded 60-second lifetime and no stale serving.
//
// BROWSER vs EDGE split (white-page-after-deploy fix, 2026-06-15):
//   - Cache-Control governs the VISITOR's browser. We set it to no-store so the
//     browser NEVER keeps a copy of the shell. This closes the ~120s window in
//     which a visitor's browser would replay a stale index.html that points at a
//     rotated /assets/index-<hash>.js (= the classic post-deploy white page).
//   - CDN-Cache-Control governs Cloudflare's OWN edge tier independently of the
//     browser, so the edge still serves the SEO-injected shell for 60s (TTFB
//     win + crawl-budget savings preserved). The edge keyspace is namespaced by
//     deploy commit (CF_PAGES_COMMIT_SHA, see htmlCacheKey), so a new deploy =
//     fresh keyspace — the edge can never serve the previous build's dead chunks.
//   - No stale-while-revalidate: an expired shell must be regenerated.
//
// SAFETY: this is ONLY applied to indexable content on the canonical host
// (sabq.org). noindex screens (dashboard/admin/auth/account), non-canonical
// hosts (*.pages.dev, sabq.news), and any route whose resolved robots meta is
// `noindex` always fall back to HTML_NO_STORE_HEADERS. As a belt-and-suspenders
// second layer, the inline safety net in client/index.html (and the in-bundle
// deployRecovery.ts) hard-reloads once with a `_dr` cache-buster on a chunk-load
// error, so any residual staleness self-heals.
const HTML_EDGE_CACHE_HEADERS = {
  // Browser: do not store the shell (cuts the post-deploy stale-HTML window).
  "Cache-Control":
    "private, no-cache, must-revalidate, max-age=0",
  // Edge: keep caching the SEO-injected shell for the TTFB/crawl-budget win.
  "CDN-Cache-Control":
    "public, max-age=60",
};

const STATIC_EXTENSIONS = [
  ".js", ".css", ".map", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".webp", ".avif", ".mp4", ".webm",
  ".json", ".xml", ".txt", ".pdf",
];

// Mirrors server/utils/noindexPaths.ts — every private/authenticated SPA route
// (auth, account, dashboards, admin, onboarding, payment, search). Two uses:
//   1. never inject content SEO meta into these screens, and
//   2. serve `X-Robots-Tag: noindex, follow` on them (see finalizeHtml).
// They are NO LONGER blocked in robots.txt — that blocking caused the GSC
// "Indexed, though blocked by robots.txt" warning because Google couldn't crawl
// them to discover the noindex. Now Google crawls, sees the header, and drops
// them. KEEP IN SYNC with server/utils/noindexPaths.ts.
const NOINDEX_PREFIXES = [
  // dashboards / admin / internal tooling
  "/dashboard", "/en/dashboard", "/ur/dashboard",
  "/admin", "/ifox",
  // auth flows
  "/login", "/register", "/logout",
  "/forgot-password", "/reset-password", "/set-password",
  "/2fa-verify", "/verify-email",
  // account / personalization
  "/profile", "/en/profile", "/ur/profile",
  "/bookmarks", "/reading-history",
  "/my-follows", "/my-keywords", "/my-votes",
  "/notification-settings", "/en/notification-settings", "/recommendation-settings",
  "/select-interests", "/edit-interests", "/preferences-center", "/complete-profile",
  // search (thin / duplicate result pages)
  "/search", "/en/search", "/ur/search",
  // onboarding / payment
  "/onboarding", "/payment", "/payment-callback", "/advertiser-payment-callback",
  // misc legacy private prefixes
  "/settings", "/notifications",
  "/advertiser/", "/publisher/", "/staff/",
  // روابط دعوات المجالس وواجهاتها شخصية: قابلة للفتح والمشاركة، لا للفهرسة.
  "/gulf-cup/majlis",
];

// Boundary-aware prefix match (mirrors isNoindexPath in
// server/utils/noindexPaths.ts): `/profile` matches `/profile` and
// `/profile/123` but NOT `/profiles`. Trailing-slash prefixes are normalized.
function isNoindexPrefix(p) {
  for (let prefix of NOINDEX_PREFIXES) {
    if (prefix.endsWith("/")) prefix = prefix.slice(0, -1);
    if (p === prefix || p.startsWith(prefix + "/")) return true;
  }
  return false;
}

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
  if (p.startsWith("/.well-known/")) return true;
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
  /(googlebot|google-inspectiontool|storebot-google|google-site-verification|bingbot|bingpreview|applebot|oai-searchbot|claude-searchbot|perplexitybot|yandex(bot)?|duckduckbot|baiduspider|sogou|naverbot|petalbot|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|slack-imgproxy|telegrambot|whatsapp|discordbot|pinterest(bot)?|redditbot|embedly|vkshare|skypeuripreview|nuzzel|qwantify|googleweblight)/i;
function isCrawler(ua) {
  return !!ua && CRAWLER_RE.test(ua);
}

function isInjectablePath(p) {
  if (isNoindexPrefix(p)) return false;
  if (isStaticAsset(p)) return false;
  return true;
}

// <html lang/dir> for the localized sections. Both HTML sources declare
// lang="ar" dir="rtl" — the SPA shell (client/index.html) statically, and the
// web-next root layout for ALL its routes (the per-locale override is still
// "Phase 2" there) — so English pages reached crawlers declaring Arabic/RTL.
// The client already flips document.documentElement at runtime
// (LanguageContext.tsx), so stamping the served attributes here matches the
// hydrated state exactly; Arabic paths return null and are never touched.
// Exported for unit tests (extra exports are ignored by the Pages runtime).
export function localeAttrsForPath(p) {
  if (p === "/en" || p.startsWith("/en/")) return { lang: "en", dir: "ltr" };
  if (p === "/ur" || p.startsWith("/ur/")) return { lang: "ur", dir: "rtl" };
  return null;
}
class HtmlLangSetter {
  constructor(attrs) { this.attrs = attrs; }
  element(el) {
    el.setAttribute("lang", this.attrs.lang);
    el.setAttribute("dir", this.attrs.dir);
  }
}

// Minimal 410 Gone HTML for archived/unpublished articles. Serving 410 (not a
// 200 + noindex shell) tells Google the URL is permanently gone so it drops it
// and stops re-crawling — clearing the "Excluded by noindex tag" report and
// reclaiming crawl budget. Consistent with the human experience: the public
// article API already returns 404 for archived articles, so this is not
// cloaking. noindex header is belt-and-suspenders.
export function isHstsHost(hostname) {
  return hostname === "sabq.org" || hostname === "www.sabq.org";
}

export function htmlSecurityHeadersForHost(hostname) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
  if (isHstsHost(hostname)) headers["Strict-Transport-Security"] = "max-age=86400";
  return headers;
}

function goneHtmlResponse() {
  const body =
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="robots" content="noindex, follow">' +
    '<title>المحتوى لم يَعُد متاحًا — سبق</title></head><body>' +
    "<h1>هذا المحتوى لم يَعُد متاحًا</h1>" +
    "<p>المقال المطلوب تمت أرشفته أو إزالته.</p></body></html>";
  return new Response(body, {
    status: 410,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, follow",
      // Short cache so a republished (un-archived) article recovers quickly,
      // bounded anyway by the slug-redirect/gone TTL upstream.
      "Cache-Control": "public, max-age=60, s-maxage=120",
      "CDN-Cache-Control": "public, max-age=120",
    },
  });
}

function isHtml(res) {
  return (res.headers.get("content-type") || "").toLowerCase().includes("text/html");
}

export function applyHtmlHeaders(res, headerSet) {
  if (!isHtml(res)) return res;
  const headers = new Headers(res.headers);
  // Clear stale freshness hints so a cacheable response never inherits a
  // leftover Pragma:no-cache / Expires:0 from an earlier set (and vice versa).
  headers.delete("Pragma");
  headers.delete("Expires");
  for (const [k, v] of Object.entries(headerSet)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function applyHtmlSecurityHeaders(res, hostname) {
  if (!isHtml(res)) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(htmlSecurityHeadersForHost(hostname))) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function shouldApplyHtmlSecurityHeaders(pathname, res) {
  return !isProxyPath(pathname) && isHtml(res);
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
  // Tracking parameters must not fragment the HTML cache. Pagination is a
  // meaningful query only for the category/author discovery surfaces; keep a
  // strictly positive integer there and discard every other query parameter.
  const isPagedSurface = /^\/(?:category|author)\/[^/]+$/.test(u.pathname);
  const pageRaw = isPagedSurface ? u.searchParams.get("page") || "" : "";
  const page = /^\d+$/.test(pageRaw) ? Number(pageRaw) : 0;
  u.search = "";
  if (isPagedSurface && pageRaw && (!/^[1-9]\d*$/.test(pageRaw) || page > 10000)) u.searchParams.set("page", "invalid");
  if (isPagedSurface && Number.isInteger(page) && page > 1 && page <= 10000) {
    u.searchParams.set("page", String(page));
  }
  u.searchParams.set("__b", commit || "dev");
  // Audience namespace for dynamic rendering: on SSR paths the crawler gets a
  // different rendering (full SSR) than humans (SPA shell), so they must NOT
  // share a cache entry. Empty for all other paths to avoid fragmentation.
  if (variant) u.searchParams.set("__v", variant);
  return new Request(u.toString(), { method: "GET" });
}

// The API SEO handlers accept the canonical pathname and, for paginated
// discovery surfaces, one normalized page query. This keeps UTM/debug values
// out of both metadata lookups and their cache keys.
export function seoRequestPath(urlOrRequest) {
  const u = new URL(typeof urlOrRequest === "string" ? urlOrRequest : urlOrRequest.url);
  if (!/^\/(?:category|author)\/[^/]+$/.test(u.pathname)) return u.pathname;
  const rawPage = u.searchParams.get("page");
  if (rawPage === null) return u.pathname;
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 0;
  // Preserve malformed/out-of-range values so the API can return its explicit
  // 400 rather than silently turning a bad URL into page one.
  return page > 0 && page <= 10000
    ? `${u.pathname}?page=${page}`
    : `${u.pathname}?page=${encodeURIComponent(rawPage)}`;
}

function hasUsableSsrHtml(path, text) {
  if (!text || /<div\s+id=["']root["']\s*>\s*<\/div>/i.test(text)) return false;
  // Next embeds route templates in script tags. Do not count those hidden
  // strings as visible article/category headings.
  const visible = text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  if (/^\/article\/|^\/en\/article\/|^\/ur\/article\//.test(path)) {
    return /<h1(?:\s|>)/i.test(visible) && /application\/ld\+json/i.test(text);
  }
  if (/^\/category\//.test(path)) {
    return /<h1(?:\s|>)/i.test(visible) && /ItemList|CollectionPage/i.test(text);
  }
  return /<main(?:\s|>)/i.test(visible) || /application\/ld\+json/i.test(text);
}

async function validatedSsrResponse(res, path) {
  if ((res.status === 404 || res.status === 410) && isHtml(res)) {
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "private, no-store, no-cache, max-age=0");
    headers.set("CDN-Cache-Control", "no-store");
    return new Response(await res.arrayBuffer(), { status: res.status, statusText: res.statusText, headers });
  }
  if (res.status !== 200 || !isHtml(res)) return null;
  const body = await res.arrayBuffer();
  const text = new TextDecoder().decode(body);
  if (!hasUsableSsrHtml(path, text)) return null;
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

function crawlerSsrFailureResponse() {
  return new Response("SSR temporarily unavailable", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store, no-cache, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Retry-After": "60",
    },
  });
}

export async function signProxyRequest(request, targetUrl, proxySecret) {
  const url = new URL(targetUrl);
  const realIp = request.headers.get("cf-connecting-ip");
  const headers = new Headers(request.headers);
  // Client supplied forwarding headers are never forwarded as authority.
  headers.delete("X-Sabq-Client-IP");
  headers.delete("X-Sabq-Proxy-Timestamp");
  headers.delete("X-Sabq-Proxy-Signature");
  if (!realIp || !proxySecret) return headers;
  const timestamp = String(Date.now());
  const payload = `${timestamp}\n${request.method}\n${url.pathname}${url.search}\n${realIp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(proxySecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const signature = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  headers.set("X-Sabq-Client-IP", realIp);
  headers.set("X-Sabq-Proxy-Timestamp", timestamp);
  headers.set("X-Sabq-Proxy-Signature", signature);
  return headers;
}

// Stall-retry for idempotent origin fetches (incident 2026-09-07/08): Cloudflare's
// subrequest toward the Railway edge (observed MRS→cdg1) intermittently hangs
// 8–40s BEFORE Railway even registers the request, while a fresh fetch answers
// in 1–50ms. For GET/HEAD only: abort an attempt that has not produced headers
// within STALL_RETRY_MS and re-issue it; the final attempt keeps the caller's
// full deadline (or stays unbounded when none was given, as before). Writes are
// never retried — their body is a one-shot stream and replaying is unsafe.
const STALL_RETRY_MS = 3000;
const STALL_RETRIES = 2;

function isStallAbort(err) {
  const name = err?.name || "";
  return name === "TimeoutError" || name === "AbortError";
}

export async function fetchWithStallRetry(target, init, opts = {}) {
  const stallMs = opts.stallMs ?? STALL_RETRY_MS;
  const retries = opts.retries ?? STALL_RETRIES;
  const deadlineMs = opts.deadlineMs ?? 0;
  const idempotent = init.method === "GET" || init.method === "HEAD";
  if (!idempotent || retries <= 0) {
    if (deadlineMs > 0) init.signal = AbortSignal.timeout(deadlineMs);
    return fetch(target, init);
  }
  const startedAt = Date.now();
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const left = deadlineMs > 0 ? deadlineMs - (Date.now() - startedAt) : Infinity;
    if (left <= 0) break;
    const isLast = attempt === retries;
    const budget = isLast ? left : Math.min(stallMs, left);
    const attemptInit = { ...init };
    if (Number.isFinite(budget)) attemptInit.signal = AbortSignal.timeout(budget);
    try {
      return await fetch(target, attemptInit);
    } catch (err) {
      lastErr = err;
      // Only a stall (our own per-attempt timeout) is retried; a real upstream
      // error propagates immediately, exactly as before this helper existed.
      if (isLast || !isStallAbort(err)) throw err;
      console.warn(`[pages-fn] origin stall, retrying (${attempt + 1}/${retries}):`, target);
    }
  }
  throw lastErr;
}

export async function proxyToApi(request, apiOrigin, timeoutMs = 0, proxySecret) {
  const url = new URL(request.url);
  const target = apiOrigin + url.pathname + url.search;
  // Pages Functions re-issue the request with `fetch()` to API_ORIGIN. Cloudflare
  // rewrites `cf-connecting-ip` on that subrequest to this function's single
  // egress IP, so every visitor collapses into ONE backend rate-limit bucket
  // (symptom: HTTP 429 on login/comments for the whole site). Capture the real
  // client IP from the inbound request (still correct here) and forward it in a
  // trusted header the backend reads first in rateLimitKey() (server/index.ts).
  const headers = await signProxyRequest(request, target, proxySecret);
  const init = {
    method: request.method,
    headers,
    // Pass redirects (e.g. /s/:code short links return 301) straight to the
    // browser instead of following them server-side.
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  // Bounded wait for cacheable anonymous GETs only (callers opt in): a HUNG
  // origin (the 2026-07-25 dawn incident mode — not a fast 502) would otherwise
  // pin the reader for the platform's full subrequest limit before the
  // last-good fallback could kick in. Writes are never aborted this way.
  // GET/HEAD additionally get a per-attempt stall abort + retry (see
  // fetchWithStallRetry); the deadline below still bounds the whole sequence.
  return fetchWithStallRetry(target, init, { deadlineMs: timeoutMs });
}

// Edge-cached JSON GET (slug-redirect / seo-meta), keyed on the full URL.
export async function cachedJson(url, ttl, context, sourceRequest, proxySecret) {
  const cache = caches.default;
  const key = new Request(url, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) {
    try { return await hit.json(); } catch (_) { /* fall through */ }
  }
  // Includes body consumption: receiving headers alone does not end the budget.
  // Metadata is always fetched as GET. Build a minimal request so a HEAD HTML
  // request cannot produce a signature for a different method and browser
  // credentials never reach the cacheable metadata origin.
  const sourceHeaders = new Headers();
  const clientIp = sourceRequest?.headers.get("cf-connecting-ip");
  if (clientIp) sourceHeaders.set("cf-connecting-ip", clientIp);
  const metadataRequest = new Request(url, { method: "GET", headers: sourceHeaders });
  const requestHeaders = await signProxyRequest(metadataRequest, url, proxySecret);
  requestHeaders.set("User-Agent", "sabq-pages-fn/1.0");
  const res = await fetch(url, {
    headers: requestHeaders,
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) return null;
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch (_) { return null; }
  const write = cache.put(
    key,
    new Response(text, {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
    }),
  ).catch((err) => console.warn("[pages-fn] metadata cache write failed:", err));
  // Cache persistence must not delay an otherwise ready HTML response.
  context.waitUntil(write);
  return payload;
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

  // Homepage LCP: preload the hero-carousel lead image from the initial HTML.
  // Without this the SPA only discovers it after React boots + homepage-lite
  // returns (~1.9s late per PSI). The origin builds href/srcset with the exact
  // values HeroCarousel renders (quality 72, w480/960/1600 variants), so the
  // browser reuses this fetch instead of downloading twice. useHeroPreload.ts
  // checks data-hero-preload-edge to skip re-adding an identical link.
  if (meta.heroPreload && meta.heroPreload.href) {
    const srcsetAttrs = meta.heroPreload.imagesrcset
      ? ` imagesrcset="${escapeHtml(meta.heroPreload.imagesrcset)}" imagesizes="${escapeHtml(meta.heroPreload.imagesizes || "")}"`
      : "";
    parts.push(
      `<link rel="preload" as="image" href="${escapeHtml(meta.heroPreload.href)}"${srcsetAttrs} fetchpriority="high" data-hero-preload-edge="1">`,
    );
  }

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

function getApiCacheTtl(path, request) {
  if (request.method !== "GET" && request.method !== "HEAD") return 0;

  // Bypass cache if there's a session cookie or auth header
  const cookie = request.headers.get("cookie") || "";
  if (cookie.includes("connect.sid")) return 0;
  if (request.headers.has("authorization")) return 0;

  // Bypass cache if client explicitly asks for fresh data
  const cc = (request.headers.get("cache-control") || "").toLowerCase();
  if (cc.includes("no-cache") || cc.includes("no-store")) return 0;

  const url = new URL(request.url);
  if (url.searchParams.has("_nc") || url.searchParams.has("_t")) return 0;

  // Match cacheable GET patterns and determine TTL (in seconds)
  if (path === "/api/homepage-lite") return 30;
  if (path === "/api/homepage") return 30;
  if (path === "/api/lite-feed") return 30;
  if (path === "/api/ai-insights") return 30;
  if (path === "/api/breaking-ticker/active") return 30;

  if (path === "/api/categories") return 60;
  if (path === "/api/categories/all") return 60;
  if (path === "/api/categories/smart") return 60;
  
  if (path === "/api/articles/search-simple") return 0;

  if (/^\/api\/categories\/[^/]+\/articles$/.test(path)) return 60;

  if (/^\/api\/articles\/[^/]+$/.test(path)) return 60;
  if (/^\/api\/articles\/[^/]+\/sidebar$/.test(path)) return 60;
  if (/^\/api\/articles\/[^/]+\/related$/.test(path)) return 60;
  if (/^\/api\/articles\/[^/]+\/ai-recommendations$/.test(path)) return 60;
  if (/^\/api\/articles\/[^/]+\/ai-insights$/.test(path)) return 60;
  if (/^\/api\/articles\/[^/]+\/ai-bullets$/.test(path)) return 60;
  if (/^\/api\/articles\/[^/]+\/media-assets$/.test(path)) return 60;

  return 0;
}

function apiCacheKey(requestUrl) {
  const u = new URL(requestUrl);
  // Keep only essential query parameters that alter the backend response
  const cleanParams = new URLSearchParams();
  const keepParams = ["limit", "offset", "page", "q", "category", "type"];
  for (const p of keepParams) {
    if (u.searchParams.has(p)) {
      cleanParams.set(p, u.searchParams.get(p));
    }
  }
  u.search = cleanParams.toString();
  return new Request(u.toString(), { method: "GET" });
}

// ── stale-if-error: «آخر نسخة سليمة» ────────────────────────────────────────
// Dawn 2026-07-25 outage: the origin hung for ~4 hours and every anonymous
// reader saw errors, even though the edge had served the exact same JSON
// seconds earlier — the 30–60s TTL meant the copy was already evicted when it
// was needed most. Alongside the fresh entry we now store a second, long-lived
// "last-good" copy under a marker key, and serve it ONLY when the origin fails
// (network error / timeout / 5xx). Sessioned requests never reach this path —
// getApiCacheTtl() returns 0 for them — so nothing personalized is ever stored
// or replayed. Worst case for readers: minutes-old content instead of a 502.
const API_LAST_GOOD_TTL_S = 86400;
const API_PROXY_TIMEOUT_MS = 10_000;

function apiLastGoodKey(cacheKeyReq) {
  const u = new URL(cacheKeyReq.url);
  u.searchParams.set("__sabq_last_good", "1");
  return new Request(u.toString(), { method: "GET" });
}

async function serveApiLastGood(cacheKeyReq, reason) {
  try {
    const hit = await caches.default.match(apiLastGoodKey(cacheKeyReq));
    if (!hit) return null;
    // Never replay a truncated/invalid JSON last-good (the pre-buffer bug
    // could have stored one). Prefer a 502 over a broken homepage body.
    const contentType = (hit.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const text = await hit.clone().text();
      try {
        JSON.parse(text);
      } catch (_) {
        console.error("[pages-fn] discarding invalid last-good JSON:", reason);
        return null;
      }
    }
    const headers = new Headers(hit.headers);
    headers.set("x-edge-cache", "STALE");
    headers.set("X-Sabq-Stale", "1");
    headers.set("X-Sabq-Stale-Reason", reason);
    // Short client cache: keeps a dead origin from being hammered without
    // pinning staleness after recovery.
    headers.set("Cache-Control", "public, max-age=30");
    return new Response(hit.body, { status: 200, statusText: "OK", headers });
  } catch (_) {
    return null;
  }
}

// NOTE: a "/assets/* → 404" guard used to live here to intercept deleted chunks
// before the SPA fallback served them as HTML. It was removed because
// _routes.json excludes /assets/* from this middleware (so the guard never ran
// for the very paths it protected), and removing the exclude triggered a
// Cloudflare "Failed to publish assets" deployment error. Post-deploy recovery
// now relies on the proactive buildVersion poll (client/src/lib/buildVersion.ts)
// + the reactive retryImport/deployRecovery layer, which already classifies the
// MIME/CORS refusal of an HTML response to a .js request as a chunk failure.

async function handleRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // ── Missing hashed-asset guard (post-deploy white-page fix) ──────────────
  // /assets/* holds Vite's content-hashed bundle. When a chunk is MISSING — an
  // open tab requesting a rotated-out /assets/<oldhash>.js after a deploy, or a
  // chunk requested mid-deploy — Pages' static layer has no file, so it falls
  // through the SPA `_redirects` catch-all (`/* /index.html 200`) and serves the
  // HTML shell as `200 text/html`. Two things then go wrong:
  //   1. the browser tries to execute HTML as a JS module → MIME error, and
  //   2. because `_headers` stamps `/assets/*` with `immutable, max-age=1y`, the
  //      browser CACHES that HTML under the chunk URL for a YEAR — so every later
  //      load replays the poisoned response and NEITHER the deployRecovery reload
  //      NOR the buildVersion poll can heal it. Only a manual Ctrl+Shift+R does
  //      (the recurring "تعذر تحميل الصفحة … امسح الذاكرة" report after deploys).
  // Fix: intercept /assets/* here (this needs `/assets/*` removed from the
  // _routes.json `exclude`). If the resolved response is HTML, the file is gone —
  // return a real, NON-CACHEABLE 404. A Function-generated Response is NOT subject
  // to the `_headers` immutable rule (that only stamps static-asset responses), so
  // the 404 is never cached and the chunk URL self-heals once it exists again.
  // Real assets (js/css/img/font/…) are never text/html, so they pass through
  // untouched WITH their immutable caching intact.
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    path.startsWith("/assets/")
  ) {
    const assetRes = await next();
    if (isHtml(assetRes)) {
      return new Response("/* sabq: asset not found (rotated by a deploy) */\n", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, must-revalidate",
          "X-Sabq-Asset-Miss": "1",
        },
      });
    }
    return assetRes;
  }

  const apiOrigin = env.API_ORIGIN || DEFAULT_API_ORIGIN;
  const edgeProxyGateRequired = String(env.EDGE_PROXY_GATE_REQUIRED || "").toLowerCase() === "on";
  if (edgeProxyGateRequired && !env.EDGE_PROXY_SHARED_SECRET && (isProxyPath(path) || isInjectablePath(path))) {
    console.error("[pages-fn] EDGE_PROXY_GATE_REQUIRED is on but EDGE_PROXY_SHARED_SECRET is missing");
    return new Response("API proxy is not configured", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const seoEnabled = String(env.EDGE_SEO || "").toLowerCase() === "on";
  const nextOrigin = (env.NEXT_ORIGIN || "").replace(/\/+$/, "");
  const ssrEnabled =
    String(env.SSR_ROUTES || "").toLowerCase() === "on" && !!nextOrigin;

  // Only sabq.org is the canonical, indexable frontend. Any OTHER host that
  // serves this same SPA — the sabq.news test domain, `*.pages.dev` preview
  // builds, or a `www.` variant — must NOT be indexed, or it competes with
  // sabq.org for identical content and dilutes/splits Google's signals.
  const noindexHost = url.hostname !== "sabq.org";

  // Private/authenticated SPA routes (auth, account, dashboard, admin, search…).
  // No longer robots.txt-blocked, so we serve X-Robots-Tag: noindex here instead
  // — the documented fix for the "Indexed, though blocked by robots.txt" warning
  // (Google must be able to crawl the page to see the noindex and drop it).
  const pathIsNoindex = isNoindexPrefix(path);

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

  // A recovery reload (deployRecovery.ts + the index.html inline safety-net both
  // append `?_dr=<ts>`) MUST reach the origin for the CURRENT shell — never a
  // stale edge HIT. htmlCacheKey() intentionally strips `_dr`, so WITHOUT this
  // bypass a recovery reload kept resolving to the SAME stale cache entry: the
  // proactive build-id check (or vite:preloadError) fired, reloaded with `_dr`,
  // got the identical stale shell back, and the user looped on a white page
  // until the 300s TTL expired — the "white page after every deploy" report.
  const isRecoveryReload = url.searchParams.has("_dr");
  const commit = env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BUILD_ID || "";

  // In-function edge cache (Workers Cache API). Default ON; set
  // EDGE_HTML_CACHE=off to disable (e.g. once a zone-level "Cache Everything"
  // Cache Rule is doing the job). Only active when SEO is injected HERE
  // (EDGE_SEO=on) so we never cache a half-rendered shell that the standalone
  // worker would otherwise enrich.
  const edgeHtmlCacheEnabled =
    String(env.EDGE_HTML_CACHE || "on").toLowerCase() !== "off" &&
    seoEnabled &&
    // Never cache a shell we can't namespace per-deploy. Without a commit/build
    // id the cache key collapses to the constant "dev" (see htmlCacheKey), so a
    // new deploy reuses the SAME key and the edge keeps serving the PREVIOUS
    // build's shell — which references chunk hashes the deploy just deleted →
    // 404 → white page for up to 300s after EVERY deploy. If CF_PAGES_COMMIT_SHA
    // (auto-set on git-connected Pages) is missing, skip the edge cache entirely
    // rather than risk a cross-deploy stale serve.
    !!commit &&
    // A recovery reload must self-heal immediately: bypass both the HIT lookup
    // and the store so it always pulls the fresh origin shell.
    !isRecoveryReload;

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
    // A noindex page (private route) must never be edge-cached as indexable.
    const useCache = cacheable && !noindexHost && !pathIsNoindex;
    const out = applyHtmlHeaders(res, useCache ? HTML_EDGE_CACHE_HEADERS : HTML_NO_STORE_HEADERS);
    // Stamp X-Robots-Tag: noindex on duplicate hosts AND on the canonical host's
    // private routes (login/register/profile/dashboard/search/…). This is the
    // signal that lets Googlebot drop the now-crawlable (un-robots-blocked)
    // auth/account URLs from the index.
    if ((!noindexHost && !pathIsNoindex) || !isHtml(out)) return out;
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
    // derived by the Cache API from the stored clone's max-age (60s).
    const storedHeaders = new Headers(tagged.headers);
    storedHeaders.set("Cache-Control", "public, max-age=60");
    const stored = new Response(tagged.clone().body, { status: tagged.status, headers: storedHeaders });
    context.waitUntil(caches.default.put(cacheKey, stored).catch(() => {}));
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
    const apiCacheTtl = getApiCacheTtl(path, request);
    const useApiCache = apiCacheTtl > 0;
    const apiCacheKeyReq = useApiCache ? apiCacheKey(request.url) : null;

    if (useApiCache && apiCacheKeyReq) {
      try {
        const hit = await caches.default.match(apiCacheKeyReq);
        if (hit) {
          const contentType = (hit.headers.get("content-type") || "").toLowerCase();
          if (contentType.includes("application/json")) {
            const text = await hit.clone().text();
            try {
              JSON.parse(text);
            } catch (_) {
              // Discard poisoned/truncated cache entries (pre-buffer bug).
              console.error("[pages-fn] discarding invalid cached JSON for", path);
              context.waitUntil(caches.default.delete(apiCacheKeyReq).catch(() => {}));
              // Fall through to origin fetch.
              throw new Error("invalid-cached-json");
            }
          }
          const headers = new Headers(hit.headers);
          Object.entries(HTML_EDGE_CACHE_HEADERS).forEach(([name, value]) => headers.set(name, value));
          headers.set("x-edge-cache", "HIT");
          return new Response(hit.body, {
            status: hit.status,
            statusText: hit.statusText,
            headers,
          });
        }
      } catch (err) {
        if (String(err?.message) !== "invalid-cached-json") {
          console.error("[pages-fn] api cache match error:", err);
        }
      }
    }

    try {
      const res = await proxyToApi(
        request,
        apiOrigin,
        useApiCache ? API_PROXY_TIMEOUT_MS : 0,
        env.EDGE_PROXY_SHARED_SECRET,
      );

      // Cacheable anonymous GETs: buffer the FULL body before cloning/caching.
      // Cloning a still-streaming origin body twice (fresh + last-good) while
      // also returning it to the browser tees the stream 3 ways — under load
      // Cloudflare truncates mid-UTF-8 (~4–5KB). Symptom for anonymous
      // visitors: homepage "Unterminated string in JSON…"; logged-in users
      // (connect.sid → cache bypass, single stream) were fine. Incident
      // 2026-07-26.
      if (useApiCache && apiCacheKeyReq && res.status === 200) {
        if (!res.headers.has("set-cookie")) {
          let bodyBuf;
          try {
            bodyBuf = await res.arrayBuffer();
          } catch (readErr) {
            console.error("[pages-fn] api body read error:", readErr);
            const stale = await serveApiLastGood(apiCacheKeyReq, "body-read-failed");
            if (stale) return stale;
            return new Response("Bad gateway", { status: 502 });
          }

          const contentType = (res.headers.get("content-type") || "").toLowerCase();
          if (contentType.includes("application/json")) {
            try {
              JSON.parse(new TextDecoder("utf-8", { fatal: false }).decode(bodyBuf));
            } catch (parseErr) {
              console.error(
                "[pages-fn] refusing to cache truncated/invalid JSON for",
                path,
                parseErr,
              );
              const stale = await serveApiLastGood(apiCacheKeyReq, "invalid-json");
              if (stale) return stale;
              // Do not serve a known-broken body to the browser.
              return new Response(
                JSON.stringify({ message: "Upstream response incomplete" }),
                {
                  status: 502,
                  headers: { "Content-Type": "application/json; charset=utf-8" },
                },
              );
            }
          }

          const outHeaders = new Headers(res.headers);
          // Body is decoded/uncompressed after arrayBuffer(); drop transport
          // encodings so Content-Length matches what we actually send.
          outHeaders.delete("content-encoding");
          outHeaders.delete("content-length");
          outHeaders.set(
            "Cache-Control",
            `public, max-age=${apiCacheTtl}, s-maxage=${apiCacheTtl}`,
          );

          const responseToCache = new Response(bodyBuf.slice(0), {
            status: res.status,
            statusText: res.statusText,
            headers: outHeaders,
          });

          context.waitUntil(
            caches.default.put(apiCacheKeyReq, responseToCache).catch((err) => {
              console.error("[pages-fn] api cache put error:", err);
            }),
          );

          // «آخر نسخة سليمة» — تُقدَّم فقط عند فشل الأصل (انظر serveApiLastGood).
          const lastGoodHeaders = new Headers(outHeaders);
          lastGoodHeaders.set("Cache-Control", `public, s-maxage=${API_LAST_GOOD_TTL_S}`);
          const lastGoodCopy = new Response(bodyBuf.slice(0), {
            status: 200,
            headers: lastGoodHeaders,
          });
          context.waitUntil(
            caches.default.put(apiLastGoodKey(apiCacheKeyReq), lastGoodCopy).catch(() => {}),
          );

          return new Response(bodyBuf, {
            status: res.status,
            statusText: res.statusText,
            headers: outHeaders,
          });
        }
      }

      // Origin answered but is sick (5xx) → prefer the last-good copy.
      if (useApiCache && apiCacheKeyReq && res.status >= 500) {
        const stale = await serveApiLastGood(apiCacheKeyReq, `upstream-${res.status}`);
        if (stale) return stale;
      }

      return res;
    } catch (err) {
      console.error("[pages-fn] proxy error:", err);
      // Origin unreachable or timed out → last-good copy beats a 502.
      if (useApiCache && apiCacheKeyReq) {
        const stale = await serveApiLastGood(apiCacheKeyReq, "unreachable");
        if (stale) return stale;
      }
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
      if (wantsSsr) {
        // Older entries (or an entry written before SSR was enabled) must not
        // turn a crawler request into a cached, empty SPA shell.
        const valid = await validatedSsrResponse(hit.clone(), path);
        if (!valid) {
          context.waitUntil(caches.default.delete(cacheKey).catch(() => {}));
        } else {
          const headers = new Headers(valid.headers);
          Object.entries(HTML_EDGE_CACHE_HEADERS).forEach(([name, value]) => headers.set(name, value));
          headers.set("x-edge-cache", "HIT");
          return new Response(valid.body, { status: valid.status, statusText: valid.statusText, headers });
        }
      } else {
      const headers = new Headers(hit.headers);
      Object.entries(HTML_EDGE_CACHE_HEADERS).forEach(([name, value]) => headers.set(name, value));
          headers.set("x-edge-cache", "HIT");
      return new Response(hit.body, {
        status: hit.status,
        statusText: hit.statusText,
        headers,
      });
      }
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
      const seoPath = seoRequestPath(url);
      const slug = await cachedJson(
        `${apiOrigin}/api/edge/slug-redirect?path=${encodeURIComponent(seoPath)}`,
        SLUG_REDIRECT_TTL,
        context,
        request,
        env.EDGE_PROXY_SHARED_SECRET,
      );
      const redirectTo = slug && slug.redirect ? slug.redirect : null;
      if (redirectTo && redirectTo !== path) {
        return Response.redirect(`${url.origin}${redirectTo}${url.search}`, 301);
      }
      // Archived/unpublished article → 410 Gone (not a 200 + noindex SSR page
      // Google re-crawls forever). The row exists but isn't published.
      if (slug && slug.gone) return goneHtmlResponse();
      const ssrRes = await proxyToApi(request, nextOrigin, SSR_PROXY_TIMEOUT_MS, env.EDGE_PROXY_SHARED_SECRET);
      // Buffer and validate the complete render before caching it. A 200 SPA
      // fallback is not a usable SSR response and must never be cached for a
      // crawler.
      const validated = await validatedSsrResponse(ssrRes, path);
      if (!validated) throw new Error("invalid-or-empty-ssr-html");
      if (validated.status !== 200) return deliverHtml(validated, { cacheable: false });
      // web-next renders every route with the root layout's lang="ar" dir="rtl";
      // correct the declared language for the /en|/ur surfaces (crawler-only path).
      const ssrLocale = localeAttrsForPath(path);
      const localized = ssrLocale
        ? new HTMLRewriter().on("html", new HtmlLangSetter(ssrLocale)).transform(validated)
        : validated;
      return deliverHtml(localized, { cacheable: true });
    } catch (err) {
      console.error("[pages-fn] ssr proxy failed, falling back to SPA shell:", err);
      // fall through to the SPA shell / SEO injection path below
    }
  }

  if (!seoEnabled || !injectable) {
    // With SSR enabled, this is a failure fallback for a crawler. Returning a
    // generic 200 shell is acceptable as a user-facing emergency response but
    // must never be stored as the crawler's SSR representation.
    if (wantsSsr) return crawlerSsrFailureResponse();
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
    const seoPath = seoRequestPath(url);
    const [slug, shell, meta] = await Promise.all([
      cachedJson(
        `${apiOrigin}/api/edge/slug-redirect?path=${encodeURIComponent(seoPath)}`,
        SLUG_REDIRECT_TTL,
        context,
        request,
        env.EDGE_PROXY_SHARED_SECRET,
      ),
      next(),
      cachedJson(
        `${apiOrigin}/api/edge/seo-meta?path=${encodeURIComponent(seoPath)}`,
        SEO_META_TTL,
        context,
        request,
        env.EDGE_PROXY_SHARED_SECRET,
      ),
    ]);
    const redirectTo = slug && slug.redirect ? slug.redirect : null;
    if (redirectTo && redirectTo !== path) {
      return Response.redirect(`${url.origin}${redirectTo}${url.search}`, 301);
    }
    // Archived/unpublished article → 410 Gone for CRAWLERS only (mirrors the
    // SSR-crawler path). Humans keep the SPA shell, whose client-side render
    // shows the styled not-found (the public article API already 404s archived),
    // so this stays consistent — not cloaking.
    if (slug && slug.gone && isCrawler(userAgent)) return goneHtmlResponse();

    // No meta (DB hiccup) → don't long-cache an un-injected generic shell on a
    // content URL; serve it no-store so the next crawl re-tries injection.
    if (!isHtml(shell) || !meta) {
      if (wantsSsr) return crawlerSsrFailureResponse();
      return finalizeHtml(shell, { cacheable: false });
    }

    // A resolved `noindex` (e.g. missing row, unpublished, aged-out) must never
    // be edge-cached as a 200 indexable page.
    const metaNoindex =
      typeof meta.robots === "string" && meta.robots.toLowerCase().includes("noindex");
    if (wantsSsr && !metaNoindex && (!meta.semanticHtml || (/^\/(?:en\/|ur\/)?article\//.test(path) && !meta.jsonLd?.articleBody))) {
      return crawlerSsrFailureResponse();
    }
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
    // The static SPA shell declares lang="ar" dir="rtl"; fix it for /en|/ur so
    // the served attributes match the meta locale and the hydrated state.
    const shellLocale = localeAttrsForPath(path);
    if (shellLocale) {
      rewriter = rewriter.on("html", new HtmlLangSetter(shellLocale));
    }
    return deliverHtml(rewriter.transform(shell), { cacheable: injectedCacheable });
  } catch (err) {
    console.error("[pages-fn] html error:", err);
    if (wantsSsr) return crawlerSsrFailureResponse();
    return finalizeHtml(await next(), { cacheable: false });
  }
}

// Security-only outer layer. The inner handler owns routing, caching, redirects,
// and response headers; this wrapper never rewrites those decisions. API and
// other proxy responses are deliberately excluded so their existing contract
// remains byte/header compatible.
export async function onRequest(context) {
  const response = await handleRequest(context);
  const url = new URL(context.request.url);
  return shouldApplyHtmlSecurityHeaders(url.pathname, response)
    ? applyHtmlSecurityHeaders(response, url.hostname)
    : response;
}
