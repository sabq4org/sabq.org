/**
 * Production api.sabq.org origin proxy.
 *
 * The production route is declared in wrangler.api.toml. Keep the shared
 * secret configured before binding the route. The origin is the Render
 * service hostname (since 2026-10-21; Railway before that); never point this
 * Worker at api.sabq.org itself.
 */
import { createPublicApiBurstCache } from "./public-api-burst-cache.js";
import { createSummaryAudioEdgeCache } from "./public-audio-edge-cache.js";
import { zoneKeyedCache } from "./edge-cache-zone-key.js";
import { isEdgeCacheProbe, runEdgeCacheProbe } from "./edge-cache-probe.js";

const DEFAULT_API_ORIGIN = "https://sabq-api-virginia.onrender.com";
const publicApiBurstCache = createPublicApiBurstCache();
const summaryAudioEdgeCache = createSummaryAudioEdgeCache();
// Entries are keyed under sabq.org; see edge-cache-zone-key.js.
const edgeCache = zoneKeyedCache(() => caches.default);
async function signedHeaders(request, secret) {
  const url = new URL(request.url);
  const realIp = request.headers.get("cf-connecting-ip");
  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.delete("X-Sabq-Client-IP");
  headers.delete("X-Sabq-Proxy-Timestamp");
  headers.delete("X-Sabq-Proxy-Signature");
  if (!realIp) return headers;

  const timestamp = String(Date.now());
  const payload = `${timestamp}\n${request.method}\n${url.pathname}${url.search}\n${realIp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const signature = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  headers.set("X-Sabq-Client-IP", realIp);
  headers.set("X-Sabq-Proxy-Timestamp", timestamp);
  headers.set("X-Sabq-Proxy-Signature", signature);
  return headers;
}

// Stall-retry (incident 2026-09-07/08): Cloudflare's fetch toward the Railway
// edge intermittently hangs 8–40s before Railway even registers the request,
// while a fresh fetch answers in milliseconds. For GET/HEAD only, abort an
// attempt that produced no headers within STALL_RETRY_MS and re-issue it; the
// last attempt is unbounded (previous behaviour). Writes are never retried.
// On Render (2026-10-21) a slow answer usually means real load, so retrying
// fast multiplied traffic during a breaking-news surge: one late retry only.
const STALL_RETRY_MS = 8000;
const STALL_RETRIES = 1;

function isStallAbort(err) {
  const name = err?.name || "";
  return name === "TimeoutError" || name === "AbortError";
}

async function fetchWithStallRetry(target, init, deadlineMs = 0) {
  const idempotent = init.method === "GET" || init.method === "HEAD";
  if (!idempotent) return { response: await fetch(target, init), attempts: 1 };
  const startedAt = Date.now();
  let lastErr;
  for (let attempt = 0; attempt <= STALL_RETRIES; attempt++) {
    const isLast = attempt === STALL_RETRIES;
    const remaining = deadlineMs > 0 ? deadlineMs - (Date.now() - startedAt) : Infinity;
    if (remaining <= 0) throw new Error("origin deadline exceeded");
    const budget = isLast ? remaining : Math.min(STALL_RETRY_MS, remaining);
    const attemptInit = (isLast && deadlineMs <= 0)
      ? init
      : { ...init, signal: AbortSignal.timeout(budget) };
    try {
      return { response: await fetch(target, attemptInit), attempts: attempt + 1 };
    } catch (err) {
      lastErr = err;
      // Only a stall (our own per-attempt timeout) is retried; a real upstream
      // error propagates immediately, as before.
      if (isLast || !isStallAbort(err)) throw err;
      console.warn(`[api-origin-worker] origin stall, retrying (${attempt + 1}/${STALL_RETRIES}):`, target);
    }
  }
  throw lastErr;
}

async function fetchSignedOrigin(request, origin, secret, deadlineMs = 0) {
  const url = new URL(request.url);
  const headers = await signedHeaders(request, secret);
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  const { response, attempts } = await fetchWithStallRetry(
    `${origin}${url.pathname}${url.search}`,
    init,
    deadlineMs,
  );
  if (attempts === 1) return response;
  // Surface retries to callers/monitors without buffering the body.
  const out = new Response(response.body, response);
  out.headers.set("X-Sabq-Origin-Attempts", String(attempts));
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const secret = env.EDGE_PROXY_SHARED_SECRET;
    // A bound route without its shared secret would silently collapse all
    // visitors into one origin bucket. Refuse to proxy until configured.
    if (!secret) {
      console.error("[api-origin-worker] EDGE_PROXY_SHARED_SECRET is missing");
      return new Response(JSON.stringify({ error: "api origin proxy is not configured" }), {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }

    const url = new URL(request.url);
    const origin = (env.API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, "");
    if (new URL(origin).hostname === url.hostname) {
      console.error("[api-origin-worker] API_ORIGIN points at the routed host; refusing loop");
      return new Response(JSON.stringify({ error: "api origin proxy loop prevented" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    // Cache self-test; answered here, never forwarded (edge-cache-probe.js).
    if (isEdgeCacheProbe(request)) return runEdgeCacheProbe(request, caches);
    const newPublicApiResponse = await publicApiBurstCache(request, {
      cache: edgeCache,
      waitUntil: (promise) => ctx.waitUntil(promise),
      fetchOrigin: (sourceRequest) => fetchSignedOrigin(sourceRequest, origin, secret, 10_000),
    });
    if (newPublicApiResponse) return newPublicApiResponse;
    // A cold clip is synthesized on request (HUMAIN alone may take 25 s), so
    // its origin fetch keeps the unbounded final attempt of the default path.
    const summaryAudioResponse = await summaryAudioEdgeCache(request, {
      cache: edgeCache,
      waitUntil: (promise) => ctx.waitUntil(promise),
      fetchOrigin: (sourceRequest) => fetchSignedOrigin(sourceRequest, origin, secret),
    });
    if (summaryAudioResponse) return summaryAudioResponse;

    return fetchSignedOrigin(request, origin, secret);
  },
};
