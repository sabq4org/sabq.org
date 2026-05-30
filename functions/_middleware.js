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

function withHtmlNoStore(res) {
  if (!isHtml(res)) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(HTML_NO_STORE_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function proxyToApi(request, apiOrigin) {
  const url = new URL(request.url);
  const target = apiOrigin + url.pathname + url.search;
  const init = {
    method: request.method,
    headers: request.headers,
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

  // Adds no-store (always) + X-Robots-Tag: noindex (non-canonical hosts only)
  // to an HTML response. Use for every HTML return below.
  const finalizeHtml = (res) => {
    const out = withHtmlNoStore(res);
    if (!noindexHost || !isHtml(out)) return out;
    const headers = new Headers(out.headers);
    headers.set("X-Robots-Tag", "noindex, follow");
    return new Response(out.body, { status: out.status, statusText: out.statusText, headers });
  };

  // 1) Proxy backend paths (every method).
  if (isProxyPath(path)) {
    try {
      return await proxyToApi(request, apiOrigin);
    } catch (err) {
      console.error("[pages-fn] proxy error:", err);
      return new Response("Bad gateway", { status: 502 });
    }
  }

  // 2) Non-GET/HEAD, static assets / noindex screens, or SEO handled elsewhere
  //    (EDGE_SEO off — the standalone worker injects) → serve the shell as-is.
  if (request.method !== "GET" && request.method !== "HEAD") return next();
  if (!seoEnabled || !isInjectablePath(path)) return finalizeHtml(await next());

  // 3) Indexable HTML route → slug redirect + SEO meta/body injection.
  try {
    const slug = await cachedJson(
      `${apiOrigin}/api/edge/slug-redirect?path=${encodeURIComponent(path)}`,
      SLUG_REDIRECT_TTL,
    );
    const redirectTo = slug && slug.redirect ? slug.redirect : null;
    if (redirectTo && redirectTo !== path) {
      return Response.redirect(`${url.origin}${redirectTo}${url.search}`, 301);
    }

    // SPA shell (index.html, via the `/* /index.html 200` rule in _redirects)
    // and SEO meta in parallel.
    const [shell, meta] = await Promise.all([
      next(),
      cachedJson(`${apiOrigin}/api/edge/seo-meta?path=${encodeURIComponent(path)}`, SEO_META_TTL),
    ]);

    if (!isHtml(shell) || !meta) return finalizeHtml(shell);

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
      .on("head", new HeadInjector(buildMetaBlock(meta)));
    if (meta.semanticHtml) {
      rewriter = rewriter.on("div#root", new RootInjector(meta.semanticHtml));
    }
    return finalizeHtml(rewriter.transform(shell));
  } catch (err) {
    console.error("[pages-fn] html error:", err);
    return finalizeHtml(await next());
  }
}
