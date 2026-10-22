/**
 * Edge cache self-test for the api.sabq.org Worker:
 * GET /__sabq/edge-cache-probe
 *
 * It answered why the Worker never got a Cache API HIT (2026-10-22): put
 * resolved in a few ms without error, yet even an immediate match was empty,
 * because the sabq.org zone's cache rule bypass-cache-for-html (cache:false for
 * any path without a static extension) also applies to Cache API keys. With
 * api.sabq.org excluded from that rule by host, every probe found what the
 * previous one stored. A healthy probe shows `previous` and `afterPut` filled
 * in both stores; empty ones mean a zone cache rule matches api.sabq.org again.
 *
 * It stores a fixed synthetic body under its own keys, reads the real
 * /api/themes/active entry without changing it, and never calls the origin.
 */
import { newPublicApiCacheKey } from "./public-api-burst-cache.js";

export const EDGE_CACHE_PROBE_PATH = "/__sabq/edge-cache-probe";
const PROBE_TTL_S = 300;
const NAMED_CACHE = "sabq-edge-probe";

export function isEdgeCacheProbe(request) {
  return request.method === "GET" && new URL(request.url).pathname === EDGE_CACHE_PROBE_PATH;
}

async function timed(fn) {
  const startedAt = Date.now();
  try {
    return { ok: true, value: await fn(), ms: Date.now() - startedAt };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), ms: Date.now() - startedAt };
  }
}

async function describeEntry(response, readBody) {
  if (!response) return null;
  let storedAt = null;
  if (readBody) {
    try {
      storedAt = JSON.parse(await response.text()).storedAt ?? null;
    } catch (_) { /* not a probe body */ }
  }
  return { status: response.status, age: response.headers.get("age"), storedAt };
}

/** One cache, one key: the entry an earlier probe left, then put and read back. */
async function probeCache(cache, key, storedAt) {
  const before = await timed(() => cache.match(key));
  const body = JSON.stringify({ storedAt });
  const put = await timed(() => cache.put(key, new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${PROBE_TTL_S}, s-maxage=${PROBE_TTL_S}`,
    },
  })));
  const after = await timed(() => cache.match(key));
  return {
    previous: before.ok ? await describeEntry(before.value, true) : { error: before.error },
    put: put.ok ? { ms: put.ms } : { error: put.error, ms: put.ms },
    afterPut: after.ok ? await describeEntry(after.value, true) : { error: after.error, ms: after.ms },
  };
}

export async function runEdgeCacheProbe(request, cacheStorage) {
  const url = new URL(request.url);
  const storedAt = new Date().toISOString();
  const ownKey = new Request(`${url.origin}${EDGE_CACHE_PROBE_PATH}?__sabq_probe=1`, { method: "GET" });
  const results = {};

  results.defaultOnRequestHost = await probeCache(cacheStorage.default, ownKey, storedAt);
  const named = await timed(() => cacheStorage.open(NAMED_CACHE));
  results.named = named.ok
    ? await probeCache(named.value, ownKey, storedAt)
    : { error: named.error };

  // The entry the burst cache should have stored for an anonymous request
  // without Origin; read only, never written here.
  const themesKey = newPublicApiCacheKey(new Request(`${url.origin}/api/themes/active`));
  const themes = await timed(() => cacheStorage.default.match(themesKey));
  results.burstThemesEntry = themes.ok ? await describeEntry(themes.value, false) : { error: themes.error };

  // cf.colo is where the request entered; with placement on, the Worker and
  // its local Cache API run where cf-placement says (e.g. "remote-IAD").
  const where = { colo: request.cf?.colo ?? null, placement: request.headers.get("cf-placement") };
  return new Response(JSON.stringify({ ...where, storedAt, results }, null, 2), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
