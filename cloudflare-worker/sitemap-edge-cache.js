/**
 * One shared edge copy of the sitemaps (/sitemap.xml, /sitemap-*.xml).
 *
 * The sabq.org Pages middleware already keeps each sitemap for up to an hour,
 * but that copy lives in one Cloudflare location. Crawlers fetch the same
 * sitemap from many locations within a minute, so every location missed once
 * and pulled the file from Render: article sitemaps (~47 KB each) were ~31% of
 * Render's billed egress in a sample on 2026-10-24.
 *
 * Pages therefore fetches sitemaps from the api.sabq.org Worker through a
 * service binding (a plain same-zone fetch would skip the Worker). The Worker
 * runs in one placed location (aws:us-east-1), and this module keeps the copy
 * there: one origin fetch per sitemap per TTL for the whole edge.
 *
 * Shared by the api.sabq.org Worker (api-origin-worker.js) and the sabq.org
 * Pages middleware (functions/_middleware.js, which imports isSitemapPath).
 * - GET only; cookies and conditional headers are dropped (sitemaps are the
 *   same for every reader, and a 304 cannot be kept).
 * - Stores only a 200 XML answer that the origin calls public with a positive
 *   s-maxage, without Set-Cookie, at most SITEMAP_EDGE_MAX_BYTES. The copy is
 *   kept for min(s-maxage, SITEMAP_EDGE_MAX_TTL_S), so sitemap-news stays on
 *   its 180 s.
 * - A hit hands on only the time left (s-maxage = remaining seconds), so the
 *   Pages copy stacked on top never outlives the origin's freshness.
 * - Concurrent misses for one sitemap share one origin fetch per isolate.
 * - Any failure returns null; the caller then relays to the origin as before.
 */

export const SITEMAP_EDGE_MAX_TTL_S = 3600;
export const SITEMAP_EDGE_MAX_BYTES = 10 * 1024 * 1024;
const STORED_AT = "X-Sabq-Edge-Stored-At";
const TTL_HEADER = "X-Sabq-Edge-Ttl";

export function isSitemapPath(p) {
  return p === "/sitemap.xml" || /^\/sitemap-[^/]+\.xml$/.test(p);
}

export function sitemapEdgeCacheKey(request) {
  const url = new URL(request.url);
  return new Request(`${url.origin}${url.pathname}${url.search}`, { method: "GET" });
}

function originTtl(response) {
  if (response.status !== 200 || response.headers.has("set-cookie")) return 0;
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("xml")) return 0;
  const cc = (response.headers.get("cache-control") || "").toLowerCase();
  const directives = cc.split(",").map((d) => d.trim().split("=", 1)[0]);
  if (!directives.includes("public")) return 0;
  if (directives.some((d) => d === "private" || d === "no-store" || d === "no-cache")) return 0;
  const sMaxAge = Number((/(?:^|,)\s*s-maxage\s*=\s*(\d+)/.exec(cc) || [])[1] || 0);
  return Number.isFinite(sMaxAge) && sMaxAge > 0 ? Math.min(sMaxAge, SITEMAP_EDGE_MAX_TTL_S) : 0;
}

function withRemaining(body, status, sourceHeaders, remaining, state) {
  const headers = new Headers(sourceHeaders);
  headers.delete(STORED_AT);
  headers.delete(TTL_HEADER);
  headers.set("cache-control", `public, max-age=${remaining}, s-maxage=${remaining}`);
  headers.set("x-edge-cache", state);
  return new Response(body, { status, headers });
}

export function createSitemapEdgeCache() {
  const inflight = new Map();

  async function fill(cache, key, request, fetchOrigin, waitUntil) {
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    headers.delete("range");
    // A crawler's revalidation would bring back a 304, which cannot be kept.
    headers.delete("if-none-match");
    headers.delete("if-modified-since");
    const response = await fetchOrigin(new Request(request.url, { method: "GET", headers }));
    const ttl = originTtl(response);
    const length = Number(response.headers.get("content-length") || 0);
    if (!ttl || length > SITEMAP_EDGE_MAX_BYTES) return { passthrough: response };
    const body = await response.arrayBuffer();
    if (body.byteLength > SITEMAP_EDGE_MAX_BYTES) {
      return { body, status: response.status, headers: response.headers, ttl: 0 };
    }
    const stored = new Headers(response.headers);
    stored.set("cache-control", `public, max-age=${ttl}, s-maxage=${ttl}`);
    stored.set(STORED_AT, String(Date.now()));
    stored.set(TTL_HEADER, String(ttl));
    waitUntil(cache.put(key, new Response(body.slice(0), { status: 200, headers: stored })).catch((err) => {
      console.error("[sitemap-edge-cache] put failed:", err);
    }));
    return { body, status: response.status, headers: response.headers, ttl };
  }

  return async function serveSitemap(request, { cache, waitUntil, fetchOrigin }) {
    if (request.method !== "GET") return null;
    if (!isSitemapPath(new URL(request.url).pathname)) return null;
    const key = sitemapEdgeCacheKey(request);
    try {
      const hit = await cache.match(key);
      if (hit) {
        const storedAt = Number(hit.headers.get(STORED_AT) || 0);
        const ttl = Number(hit.headers.get(TTL_HEADER) || 0);
        const remaining = Math.floor(ttl - (Date.now() - storedAt) / 1000);
        if (storedAt && ttl && remaining > 0) {
          return withRemaining(hit.body, hit.status, hit.headers, remaining, "HIT");
        }
        hit.body?.cancel().catch(() => {});
      }
      let pending = inflight.get(key.url);
      const leader = !pending;
      if (leader) {
        pending = fill(cache, key, request, fetchOrigin, waitUntil).finally(() => inflight.delete(key.url));
        inflight.set(key.url, pending);
      }
      const result = await pending;
      if (result.passthrough) {
        // Not storable: only the request that fetched it can hand it on.
        return leader ? result.passthrough : null;
      }
      if (!result.ttl) {
        return new Response(result.body.slice(0), { status: result.status, headers: result.headers });
      }
      return withRemaining(result.body.slice(0), result.status, result.headers, result.ttl, "MISS");
    } catch (err) {
      console.error("[sitemap-edge-cache] failed:", err);
      return null;
    }
  };
}
