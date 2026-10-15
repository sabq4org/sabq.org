import { createHmac } from "node:crypto";

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
const SERVICE_PROXY_IP = "127.0.0.1";
const STAGING_FORBIDDEN_API_HOSTS = new Set([
  "api.sabq.org",
  "sabqorg-production.up.railway.app",
]);

function assertStagingApiOrigin(value: string): void {
  if (process.env.STAGING_NO_INDEX !== "true") return;
  let hostname = "";
  try {
    hostname = new URL(value).hostname;
  } catch {
    throw new Error("API_ORIGIN must be an absolute URL in staging");
  }
  if (STAGING_FORBIDDEN_API_HOSTS.has(hostname)) {
    throw new Error("production API origin is forbidden in staging");
  }
}

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
  if (/^https?:\/\//i.test(path)) {
    assertStagingApiOrigin(path);
    return path;
  }
  if (!SERVER_API_ORIGIN && process.env.STAGING_NO_INDEX === "true") {
    throw new Error("API_ORIGIN is required in staging");
  }
  const base = SERVER_API_ORIGIN || "https://api.sabq.org";
  assertStagingApiOrigin(base);
  return base + (path.startsWith("/") ? path : `/${path}`);
}

/** Server-only API fetch. The fixed service identity is never derived from a request. */
export function serverApiFetch(path: string, init: RequestInit & { next?: { revalidate?: number } } = {}): Promise<Response> {
  if (typeof window !== "undefined") {
    return Promise.reject(new Error("serverApiFetch can only run on the server"));
  }
  const url = serverApiUrl(path);
  const headers = new Headers(init.headers);
  headers.delete("X-Sabq-Client-IP");
  headers.delete("X-Sabq-Proxy-Timestamp");
  headers.delete("X-Sabq-Proxy-Signature");
  const secret = process.env.EDGE_PROXY_SHARED_SECRET;
  if (process.env.EDGE_PROXY_GATE_REQUIRED === "on" && !secret) {
    return Promise.reject(new Error("EDGE_PROXY_SHARED_SECRET is required for SSR API access"));
  }
  if (secret) {
    const timestamp = String(Date.now());
    const target = new URL(url);
    const payload = `${timestamp}\n${init.method || "GET"}\n${target.pathname}${target.search}\n${SERVICE_PROXY_IP}`;
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    headers.set("X-Sabq-Client-IP", SERVICE_PROXY_IP);
    headers.set("X-Sabq-Proxy-Timestamp", timestamp);
    headers.set("X-Sabq-Proxy-Signature", signature);
  }
  if (process.env.STAGING_NO_INDEX === "true") {
    const token = (process.env.STAGING_ACCESS_TOKEN || "").trim();
    if (!token) return Promise.reject(new Error("STAGING_ACCESS_TOKEN is required in staging"));
    headers.set("Authorization", `Basic ${Buffer.from(`sabq:${token}`).toString("base64")}`);
  }
  return fetch(url, { ...init, headers });
}
