/**
 * Production api.sabq.org origin proxy.
 *
 * The production route is declared in wrangler.api.toml. Keep the shared
 * secret configured before binding the route. The origin is the Railway
 * generated hostname; never point this Worker at api.sabq.org itself.
 */
const DEFAULT_API_ORIGIN = "https://sabqorg-production.up.railway.app";
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
const STALL_RETRY_MS = 3000;
const STALL_RETRIES = 2;

async function fetchWithStallRetry(target, init) {
  const idempotent = init.method === "GET" || init.method === "HEAD";
  if (!idempotent) return { response: await fetch(target, init), attempts: 1 };
  let lastErr;
  for (let attempt = 0; attempt <= STALL_RETRIES; attempt++) {
    const isLast = attempt === STALL_RETRIES;
    const attemptInit = isLast ? init : { ...init, signal: AbortSignal.timeout(STALL_RETRY_MS) };
    try {
      return { response: await fetch(target, attemptInit), attempts: attempt + 1 };
    } catch (err) {
      lastErr = err;
      if (isLast) break;
      console.warn(`[api-origin-worker] origin stall/failure, retrying (${attempt + 1}/${STALL_RETRIES}):`, target, String(err?.name || err));
    }
  }
  throw lastErr;
}

export default {
  async fetch(request, env) {
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
    const headers = await signedHeaders(request, secret);
    const init = { method: request.method, headers, redirect: "manual" };
    if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
    const { response, attempts } = await fetchWithStallRetry(`${origin}${url.pathname}${url.search}`, init);
    if (attempts === 1) return response;
    // Surface retries to callers/monitors without buffering the body.
    const out = new Response(response.body, response);
    out.headers.set("X-Sabq-Origin-Attempts", String(attempts));
    return out;
  },
};
