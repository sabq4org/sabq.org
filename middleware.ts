// Edge Middleware: SPA fallback handler.
//
// Why this exists:
// Vercel's static-file rewrite cache served `/index.html` for every SPA URL
// (verified empirically: a brand-new random URL returned `x-vercel-cache: HIT
// age=946`). All `Cache-Control`, `CDN-Cache-Control`, `Vercel-CDN-Cache-Control`,
// and `Surrogate-Control: no-store` headers we set in vercel.json were ignored
// for static rewrites. Each new deploy rotated chunk hashes but Vercel kept
// serving the previous build's HTML for ~15 minutes, producing the daily
// "white page after deploy" outage. Manual Cloudflare "Purge Everything" only
// appeared to fix it because the natural cache age plus refetch traffic
// happened to coincide.
//
// Vercel-CDN-Cache-Control: no-store IS honored on middleware/function
// responses (only static file responses are exempt). Moving the SPA fallback
// into a middleware bypasses the broken cache layer entirely.

import { next, rewrite } from "@vercel/edge";

export const config = {
  // Match every path EXCEPT the ones we know belong to non-SPA routes:
  //   - api/*, _vercel/*, assets/* — proxied / built assets handled outside SPA
  //   - any path ending in a static file extension (so /favicon.ico,
  //     /icon-192.png, /apple-touch-icon.png etc. serve directly)
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
  const response = rewrite(new URL("/index.html", url.origin));
  // These headers ARE honored by Vercel's edge cache on middleware responses,
  // unlike on the static-file rewrite path. Layered cache-control variants so
  // every CDN in the chain (Vercel CDN, generic CDN, browser) refuses to store.
  response.headers.set(
    "cache-control",
    "private, no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
  );
  response.headers.set(
    "cdn-cache-control",
    "no-store, max-age=0, must-revalidate",
  );
  response.headers.set(
    "vercel-cdn-cache-control",
    "no-store, max-age=0, must-revalidate",
  );
  response.headers.set("surrogate-control", "no-store, max-age=0");
  response.headers.set("pragma", "no-cache");
  response.headers.set("expires", "0");
  return response;
}
