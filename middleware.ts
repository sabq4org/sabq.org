// Edge Middleware: SPA fallback handler with embedded HTML.
//
// Why this exists (Round 2):
// Vercel's rewrite-caching layer ignores every no-store header on STATIC FILE
// rewrites — verified empirically: a brand-new random URL returned
// `x-vercel-cache: HIT age=946` even though it had never been requested
// before. The cache key is the rewrite destination, not the source URL.
//
// Round 1 of this fix used `rewrite('/index.html')` from @vercel/edge. That
// did improve TTL from ~17min to ~90s, but Vercel still served /index.html
// from its static cache because `rewrite()` still goes through the cached
// rewrite path. The chunk-rotation race window stayed open for ~90s after
// every deploy — long enough that users still saw white pages.
//
// Round 2 (this version) embeds the freshly-built /index.html into the
// middleware bundle itself via scripts/embed-spa-html.js, then returns it
// as a direct Response. NO `rewrite()`, NO static file lookup. Vercel's
// rewrite cache cannot interpose. Per Vercel docs, middleware Response
// responses DO honor Vercel-CDN-Cache-Control: no-store — so each request
// invokes the middleware fresh, with the current build's chunk references
// baked in.

import { next } from "@vercel/edge";
import { SPA_INDEX_HTML, SPA_EMBED_BUILD_ID } from "./spa-index-html.generated";

export const config = {
  // Match every path EXCEPT the ones we know belong to non-SPA routes.
  // The middleware itself does a second-pass check (isPassThrough) for
  // anything the matcher might mistakenly include.
  matcher: [
    "/((?!api/|_vercel/|assets/|.*\\.(?:js|css|map|json|xml|txt|ico|png|jpg|jpeg|gif|svg|webp|avif|woff|woff2|ttf|eot|pdf|webmanifest)$).*)",
  ],
};

// Exact paths and prefixes that have their own rewrites in vercel.json or are
// real static files in dist/public. We let those flow through untouched.
const PROXIED_EXACT = new Set<string>([
  "/health",
  "/ready",
  "/ads.txt",
  "/app-ads.txt",
  "/robots.txt",
  "/sitemap.xml",
  "/build-info.json",
]);

const PROXIED_PREFIXES = [
  "/s/",
  "/uploads/",
  "/branding/",
  "/sitemap-",
];

function isPassThrough(pathname: string): boolean {
  if (PROXIED_EXACT.has(pathname)) return true;
  for (const prefix of PROXIED_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  if (isPassThrough(url.pathname)) {
    return next();
  }
  // Direct Response — never goes through Vercel's static-file cache, which
  // is the layer that empirically ignores no-store headers.
  return new Response(SPA_INDEX_HTML, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control":
        "private, no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
      "cdn-cache-control": "no-store, max-age=0, must-revalidate",
      "vercel-cdn-cache-control": "no-store, max-age=0, must-revalidate",
      "surrogate-control": "no-store, max-age=0",
      "pragma": "no-cache",
      "expires": "0",
      // Surfacing the embed buildId in a header makes it trivial to confirm
      // from a curl test which deployment served the response, independent
      // of the SPA's own /build-info.json.
      "x-sabq-embed-build": SPA_EMBED_BUILD_ID,
    },
  });
}
