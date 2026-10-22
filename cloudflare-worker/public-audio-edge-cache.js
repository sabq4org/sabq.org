/**
 * Edge cache for «استمع» summary audio on api.sabq.org.
 *
 * The iOS app downloads /api/articles/:slug/summary-audio from api.sabq.org on
 * every play, and the origin answers `private, no-store`, so each play cost
 * 0.6–1.3 MB of Render egress, which Render bills per GB (measured
 * 2026-10-22). The clip is the same for every anonymous listener, so this
 * Worker keeps it for SUMMARY_AUDIO_EDGE_TTL_S, like functions/_middleware.js
 * does for sabq.org (FULL_QUERY_API_CACHE_ROUTES).
 *
 * The policy lives at the edge; the origin is not asked to mark the response:
 * - only anonymous GETs (no Authorization, x-session-id or session cookie)
 *   that do not ask for fresh data (no-cache, `_nc`, `_t`);
 * - only a complete 200 audio/* body with an exact Content-Length, no
 *   Set-Cookie, no Content-Encoding, and at most SUMMARY_AUDIO_MAX_BYTES.
 * Anything else passes through untouched. A hit is the whole clip (200), as
 * the origin answers today; Range is not served from here.
 */

const SUMMARY_AUDIO_PATH = /^\/api\/articles\/[^/]+\/summary-audio$/;
// A voice or provider switch, or an unpublished article, reaches the edge
// within this window. Keep it equal to the Pages entry: Pages keeps a copy it
// got from here only for what is left of it (remainingApiCacheTtl, from Age).
export const SUMMARY_AUDIO_EDGE_TTL_S = 600;
// Observed clips are 0.6–1.3 MB; a long HUMAIN/Gemini WAV stays well below.
export const SUMMARY_AUDIO_MAX_BYTES = 6 * 1024 * 1024;

function carriesIdentity(request) {
  if (request.headers.has("authorization")) return true;
  if (request.headers.has("x-session-id")) return true;
  // Same test as needsSession() in server/auth.ts: without this cookie the
  // origin never loads a session, so the answer is the anonymous one.
  return (request.headers.get("cookie") || "").includes("connect.sid");
}

function wantsFresh(request) {
  const cacheControl = (request.headers.get("cache-control") || "").toLowerCase();
  if (cacheControl.includes("no-cache") || cacheControl.includes("no-store")) return true;
  const url = new URL(request.url);
  return url.searchParams.has("_nc") || url.searchParams.has("_t");
}

export function summaryAudioCacheKey(request) {
  const url = new URL(request.url);
  const key = new URL(url.origin + url.pathname);
  const params = [...url.searchParams.entries()].sort(([a, av], [b, bv]) =>
    a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1,
  );
  for (const [name, value] of params) key.searchParams.append(name, value);
  key.searchParams.set("__sabq_audio_v", "1");
  // The origin's CORS middleware reflects Origin; keep it in the key, as the
  // public burst cache does.
  const requestOrigin = request.headers.get("origin") || "";
  key.searchParams.set("__sabq_origin", requestOrigin ? `present:${requestOrigin}` : "absent");
  return new Request(key.toString(), { method: "GET" });
}

export function summaryAudioPolicy(request) {
  if (request.method !== "GET") return null;
  if (!SUMMARY_AUDIO_PATH.test(new URL(request.url).pathname)) return null;
  if (carriesIdentity(request) || wantsFresh(request)) return null;
  return { ttl: SUMMARY_AUDIO_EDGE_TTL_S, key: summaryAudioCacheKey(request) };
}

/** A whole, shareable, anonymous audio answer (origin response or cache hit). */
export function isShareableSummaryAudio(response, requestOrigin = "") {
  if (response.status !== 200 || response.headers.has("set-cookie")) return false;
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("audio/")) return false;
  const encoding = (response.headers.get("content-encoding") || "identity").trim().toLowerCase();
  if (encoding !== "identity") return false;
  const vary = (response.headers.get("vary") || "").split(",").map((name) => name.trim().toLowerCase());
  if (vary.some((name) => name && name !== "accept-encoding" && name !== "origin")) return false;
  const allowOrigin = response.headers.get("access-control-allow-origin");
  return !allowOrigin || allowOrigin === "*" || allowOrigin === requestOrigin;
}

/** Byte length of an origin response this cache may keep, or null. */
export function storableSummaryAudioLength(response, requestOrigin = "") {
  if (!isShareableSummaryAudio(response, requestOrigin)) return null;
  const rawLength = response.headers.get("content-length");
  const length = rawLength === null ? NaN : Number(rawLength);
  if (!Number.isInteger(length) || length <= 0 || length > SUMMARY_AUDIO_MAX_BYTES) return null;
  return length;
}

function badGateway() {
  return new Response(JSON.stringify({ message: "Bad gateway" }), {
    status: 502,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function createSummaryAudioEdgeCache() {
  return async function handleSummaryAudio(request, { cache, fetchOrigin, waitUntil }) {
    const policy = summaryAudioPolicy(request);
    if (!policy) return null;
    const requestOrigin = request.headers.get("origin") || "";

    let hit;
    try {
      hit = await cache.match(policy.key);
    } catch (err) {
      console.error("[summary-audio-edge] cache match error:", err);
    }
    if (hit) {
      if (isShareableSummaryAudio(hit, requestOrigin)) {
        const headers = new Headers(hit.headers);
        headers.set("x-edge-cache", "HIT");
        return new Response(hit.body, { status: 200, statusText: hit.statusText, headers });
      }
      waitUntil(Promise.resolve().then(() => cache.delete(policy.key)).catch(() => {}));
    }

    const res = await fetchOrigin(request);
    const length = storableSummaryAudioLength(res, requestOrigin);
    if (length === null) return res;

    let body;
    try {
      body = await res.arrayBuffer();
    } catch (err) {
      console.error("[summary-audio-edge] origin body read error:", err);
      return badGateway();
    }
    // A short body is a cut transfer: never store it or hand it to a player.
    if (body.byteLength !== length) {
      console.error("[summary-audio-edge] truncated origin body:", body.byteLength, "of", length);
      return badGateway();
    }

    const headers = new Headers(res.headers);
    headers.set("Cache-Control", `public, max-age=0, s-maxage=${policy.ttl}`);
    headers.set("CDN-Cache-Control", `public, max-age=${policy.ttl}`);
    headers.delete("Vercel-CDN-Cache-Control");
    const stored = new Response(body.slice(0), { status: 200, statusText: res.statusText, headers });
    waitUntil(
      Promise.resolve()
        .then(() => cache.put(policy.key, stored))
        .catch((err) => console.error("[summary-audio-edge] cache put error:", err)),
    );

    const out = new Headers(headers);
    out.set("x-edge-cache", "MISS");
    return new Response(body, { status: 200, statusText: res.statusText, headers: out });
  };
}
