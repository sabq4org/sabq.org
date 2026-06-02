/**
 * API base resolution for the Next SSR app. Mirrors the logic in
 * client/src/lib/queryClient.ts so both frontends address the backend the same
 * way.
 *
 *   - SSR (server side): always call the API origin directly. On Railway the
 *     Next service and the API service are separate origins, so a relative
 *     "/api/*" path would resolve to the Next server itself (which has no API).
 *     We therefore require API_ORIGIN (server env) to be set in production.
 *   - Client side (hydrated components): NEXT_PUBLIC_API_URL, if set, points the
 *     browser at the API origin directly; otherwise relative paths are used and
 *     Cloudflare/_middleware proxies "/api/*" to api.sabq.org.
 */

const SERVER_API_ORIGIN = (process.env.API_ORIGIN || "").replace(/\/+$/, "");
const CLIENT_API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

const isApiPath = (path: string) =>
  path.startsWith("/api/") ||
  path === "/api" ||
  path.startsWith("/health") ||
  path.startsWith("/ready");

/** Absolute (or relative) URL usable from the browser after hydration. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (CLIENT_API_BASE && isApiPath(path)) return CLIENT_API_BASE + path;
  return path;
}

/** Absolute URL usable during server-side rendering / fetch. */
export function serverApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = SERVER_API_ORIGIN || "https://api.sabq.org";
  return base + (path.startsWith("/") ? path : `/${path}`);
}
