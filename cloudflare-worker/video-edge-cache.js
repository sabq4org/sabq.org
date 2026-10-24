/**
 * Edge cache for X videos played through /api/video/stream/:tweetId.
 *
 * The origin (server/routes/videoResolver.ts) relays the tweet's MP4 from X,
 * and players fetch it in Range pieces (206). Nothing kept a copy, so every
 * piece of every play crossed Render's egress, which Render bills per GB: one
 * spreading tweet video was 35–50% of each hour's egress (2026-10-23/24).
 *
 * A tweet's video never changes, so each edge location fetches the whole file
 * from the origin once, keeps it, and answers every Range from that copy
 * (cache.match honours the request's Range header and answers 206). No viewer
 * waits for that fetch: while it runs, requests are relayed as before.
 *
 * Shared by the api.sabq.org Worker (api-origin-worker.js) and the sabq.org
 * Pages middleware (functions/_middleware.js).
 * - GET only; HEAD and anything else pass through untouched.
 * - The fill request carries no cookie or authorization: the handler reads
 *   neither, so the copy is the same for every viewer.
 * - Only a complete 200 video/* body with an exact Content-Length, no
 *   Set-Cookie, no Content-Encoding, and at most VIDEO_EDGE_MAX_BYTES is kept.
 * - Any failure returns null, and the caller relays the request as before.
 */

const VIDEO_STREAM_PATH = /^\/api\/video\/stream\/(\d{5,25})$/;
export const VIDEO_EDGE_TTL_S = 86_400;
// Observed tweet videos are 5–20 MB; a long clip stays well below this.
export const VIDEO_EDGE_MAX_BYTES = 64 * 1024 * 1024;
export const VIDEO_EDGE_RETRY_AFTER_MS = 10 * 60 * 1000;
const PASSED_HEADERS = ["content-type", "content-length", "last-modified", "etag"];

export function videoStreamTweetId(request) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  const match = VIDEO_STREAM_PATH.exec(url.pathname);
  return match ? match[1] : null;
}

export function videoEdgeCacheKey(request, tweetId) {
  const url = new URL(request.url);
  const key = new URL(`${url.origin}/api/video/stream/${tweetId}`);
  key.searchParams.set("__sabq_video_v", "1");
  // The origin's CORS middleware reflects Origin; keep it in the key, as the
  // public burst and audio caches do.
  const requestOrigin = request.headers.get("origin") || "";
  key.searchParams.set("__sabq_origin", requestOrigin ? `present:${requestOrigin}` : "absent");
  return new Request(key.toString(), { method: "GET" });
}

function fillRequest(request, tweetId) {
  const url = new URL(request.url);
  const headers = new Headers({ accept: "*/*" });
  for (const name of ["cf-connecting-ip", "origin", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(`${url.origin}/api/video/stream/${tweetId}`, { method: "GET", headers });
}

function storableCopy(response) {
  if (response.status !== 200) return null;
  if (response.headers.has("set-cookie") || response.headers.has("content-encoding")) return null;
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("video/")) return null;
  const length = Number(response.headers.get("content-length"));
  if (!Number.isInteger(length) || length <= 0 || length > VIDEO_EDGE_MAX_BYTES) return null;
  const headers = new Headers();
  for (const name of PASSED_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  const allowOrigin = response.headers.get("access-control-allow-origin");
  if (allowOrigin) headers.set("access-control-allow-origin", allowOrigin);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", `public, max-age=${VIDEO_EDGE_TTL_S}`);
  return new Response(response.body, { status: 200, headers });
}

export function createVideoEdgeCache() {
  // One fill per video per isolate at a time.
  const fills = new Map();
  // A fill that kept nothing (origin error, oversize, or a put the zone's
  // cache rules turned into a no-op) is not retried for a while: each retry
  // would pull the whole file from Render again.
  const failedUntil = new Map();

  async function fill(cache, key, request, tweetId, fetchOrigin) {
    const response = await fetchOrigin(fillRequest(request, tweetId));
    const copy = storableCopy(response);
    if (!copy) {
      // Not awaited: a cancel may settle only once every reader lets go.
      response.body?.cancel().catch(() => {});
      return false;
    }
    await cache.put(key, copy);
    // put resolves even when nothing was stored; check that the copy is there.
    const stored = await cache.match(key);
    stored?.body?.cancel().catch(() => {});
    return !!stored;
  }

  return async function serveVideo(request, { cache, waitUntil, fetchOrigin }) {
    const tweetId = videoStreamTweetId(request);
    if (!tweetId) return null;
    const key = videoEdgeCacheKey(request, tweetId);
    try {
      const headers = new Headers();
      const range = request.headers.get("range");
      if (range) headers.set("range", range);
      const hit = await cache.match(new Request(key.url, { method: "GET", headers }));
      if (hit) {
        const out = new Headers(hit.headers);
        out.set("x-edge-cache", "HIT");
        return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: out });
      }
      if (!fills.has(key.url) && !((failedUntil.get(key.url) ?? 0) > Date.now())) {
        const pending = fill(cache, key, request, tweetId, fetchOrigin)
          .catch((err) => {
            console.error("[video-edge-cache] fill failed:", err);
            return false;
          })
          .then((stored) => {
            if (stored) {
              failedUntil.delete(key.url);
              return;
            }
            if (failedUntil.size >= 512) failedUntil.clear();
            failedUntil.set(key.url, Date.now() + VIDEO_EDGE_RETRY_AFTER_MS);
          })
          .finally(() => fills.delete(key.url));
        fills.set(key.url, pending);
        waitUntil(pending);
      }
    } catch (err) {
      console.error("[video-edge-cache] lookup failed:", err);
    }
    return null;
  };
}
