/**
 * Cache API keys for the api.sabq.org Worker.
 *
 * api.sabq.org is also a Render custom hostname, so its traffic crosses two
 * Cloudflare zones. Cache API entries keyed on api.sabq.org were never found
 * again (2026-10-22: no HIT there, while the same burst module hits on
 * sabq.org in the same colo), so the Worker keys its entries under sabq.org,
 * with the original host kept in the key so they never meet the Pages entries.
 * That alone did not bring HITs back (deployed 2026-10-22 08:47Z); the cause
 * is still open, see edge-cache-probe.js.
 */

export const EDGE_CACHE_HOST = "sabq.org";

export function edgeCacheKey(key) {
  const url = new URL(key.url);
  url.searchParams.set("__sabq_edge_host", url.hostname);
  url.hostname = EDGE_CACHE_HOST;
  return new Request(url.toString(), { method: "GET" });
}

/** Wraps a Cache (read at call time) so every key goes through edgeCacheKey. */
export function zoneKeyedCache(getCache) {
  return {
    match: (key) => getCache().match(edgeCacheKey(key)),
    put: (key, response) => getCache().put(edgeCacheKey(key), response),
    delete: (key) => getCache().delete(edgeCacheKey(key)),
  };
}
