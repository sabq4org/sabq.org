/**
 * Shared anonymous public-read cache and cold-miss singleflight.
 *
 * Consumers provide the cache binding, waitUntil callback, and the origin
 * fetcher. Keeping origin transport outside this module preserves each
 * caller's signing, fallback, and routing contract.
 */

const NEW_PUBLIC_API_CACHE_ROUTES = [
  { match: (path) => /^\/api\/articles\/[^/]+\/comments$/.test(path), ttl: 15 },
  { match: (path) => path === "/api/system/dms-top-ads", ttl: 15 },
  { match: (path) => path === "/api/themes/active", ttl: 30 },
  { match: (path) => path === "/api/kings-cup/overview", ttl: 5 },
];
// Bound retained bodies as well as key count: at most 32 x 1 MiB before
// response/stream overhead, rather than retaining 256 MiB in an isolate.
const NEW_PUBLIC_API_MAX_INFLIGHT = 32;
const NEW_PUBLIC_API_MAX_BODY_BYTES = 1024 * 1024;
const NEW_PUBLIC_API_BODY_TIMEOUT_MS = 10_000;
const NEW_PUBLIC_API_CACHE_LEASE_MS = 1_000;

function hasNewPublicApiCredentials(request) {
  if (request.headers.has("cookie")) return true;
  if (request.headers.has("authorization")) return true;
  if (request.headers.has("x-session-id")) return true;
  const cacheControl = (request.headers.get("cache-control") || "").toLowerCase();
  if (cacheControl.includes("no-cache") || cacheControl.includes("no-store")) return true;
  const url = new URL(request.url);
  return url.searchParams.has("_nc") || url.searchParams.has("_t");
}

export function newPublicApiCacheKey(request) {
  const url = new URL(request.url);
  // Namespace the contract so entries written by older middleware cannot be
  // mistaken for entries that carry the public marker and validation rules.
  url.searchParams.set("__sabq_public_v", "1");
  // server/index.ts emits Vary: Origin from its CORS middleware. Keep the exact
  // request-origin dimension, including absent vs present, in the key.
  const requestOrigin = request.headers.get("origin") || "";
  url.searchParams.set("__sabq_origin", requestOrigin ? `present:${requestOrigin}` : "absent");
  // Preserve every caller query parameter. Kings Cup also varies by the
  // effective language selected from ?lang or Accept-Language.
  if (url.pathname === "/api/kings-cup/overview") {
    const queryLang = (url.searchParams.get("lang") || "").toLowerCase();
    const acceptLanguage = (request.headers.get("accept-language") || "").toLowerCase();
    const lang = queryLang === "en" || queryLang === "ar"
      ? queryLang
      : acceptLanguage.startsWith("en") ? "en" : "ar";
    url.searchParams.set("__sabq_sports_lang", lang);
  }
  return new Request(url.toString(), { method: "GET" });
}

export function newPublicApiPolicy(request) {
  if (request.method !== "GET" || hasNewPublicApiCredentials(request)) return null;
  const url = new URL(request.url);
  if (url.pathname === "/api/kings-cup/overview" && url.searchParams.get("resilient") === "1") {
    return null;
  }
  const route = NEW_PUBLIC_API_CACHE_ROUTES.find(({ match }) => match(url.pathname));
  if (!route) return null;
  return { ttl: route.ttl, key: newPublicApiCacheKey(request) };
}

function positiveCacheDirective(cacheControl, name) {
  const match = cacheControl.match(new RegExp(`(?:^|,)\\s*${name}\\s*=\\s*(\\d+)`, "i"));
  return { present: !!match, value: match ? Number(match[1]) : 0 };
}

function publicOriginTtl(response, routeTtl, path, requestOrigin = "") {
  if (response.headers.get("X-Sabq-Public-Cache") !== "1") return 0;
  const cacheControl = (response.headers.get("cache-control") || "").toLowerCase();
  const directives = cacheControl.split(",").map((directive) => directive.trim().split("=", 1)[0]);
  if (!directives.includes("public")) return 0;
  if (directives.some((directive) => ["private", "no-store", "no-cache"].includes(directive))) return 0;
  const vary = (response.headers.get("vary") || "").split(",").map((name) => name.trim().toLowerCase());
  const allowedVary = new Set(["accept-encoding", "origin"]);
  if (path === "/api/kings-cup/overview") allowedVary.add("accept-language");
  if (vary.some((name) => name && (name === "*" || !allowedVary.has(name)))) return 0;
  const allowOrigin = response.headers.get("access-control-allow-origin");
  if (allowOrigin && allowOrigin !== "*" && allowOrigin !== requestOrigin) return 0;
  const maxAge = positiveCacheDirective(cacheControl, "max-age");
  const sMaxAge = positiveCacheDirective(cacheControl, "s-maxage");
  // An explicit s-maxage=0 overrides a positive max-age at shared caches.
  const originTtl = sMaxAge.present ? sMaxAge.value : maxAge.value;
  return originTtl > 0 ? Math.min(routeTtl, originTtl) : 0;
}

function newPublicApiResultResponse(result) {
  if (result.shareable) {
    return new Response(result.body.slice(0), {
      status: result.status,
      statusText: result.statusText,
      headers: new Headers(result.headers),
    });
  }
  return result.response;
}

function syntheticBadGatewayResult() {
  const body = new TextEncoder().encode(JSON.stringify({ message: "Bad gateway" })).buffer;
  return {
    shareable: true,
    body,
    status: 502,
    statusText: "Bad Gateway",
    headers: new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    }),
  };
}

async function readNewPublicApiBody(response) {
  if (!response.body) return { ok: true, body: new ArrayBuffer(0) };
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  const deadline = Date.now() + NEW_PUBLIC_API_BODY_TIMEOUT_MS;
  const cancel = async () => {
    try {
      await Promise.race([
        reader.cancel(),
        new Promise((resolve) => setTimeout(resolve, 100)),
      ]);
    } catch (_) { /* body is already closed */ }
  };
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await cancel();
        return { ok: false, reason: "timeout" };
      }
      let timer;
      let read;
      try {
        read = await Promise.race([
          reader.read(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("body-timeout")), remaining);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (read.done) break;
      const chunk = read.value instanceof Uint8Array ? read.value : new Uint8Array(read.value);
      total += chunk.byteLength;
      if (total > NEW_PUBLIC_API_MAX_BODY_BYTES) {
        await cancel();
        return { ok: false, reason: "too-large" };
      }
      chunks.push(chunk);
    }
  } catch (_) {
    await cancel();
    return { ok: false, reason: "read-error" };
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body: body.buffer };
}

async function cancelNewPublicApiBody(response) {
  if (!response.body) return;
  try {
    await Promise.race([
      response.body.cancel(),
      new Promise((resolve) => setTimeout(resolve, 100)),
    ]);
  } catch (_) { /* body is already closed */ }
}

async function fetchNewPublicApiResult(request, policy, fetchOrigin, runtime) {
  const res = await fetchOrigin(request, policy);
  if (res.status >= 500) {
    await cancelNewPublicApiBody(res);
    return syntheticBadGatewayResult();
  }
  if (res.status !== 200 || res.headers.has("set-cookie")) {
    return { shareable: false, response: res };
  }

  const path = new URL(request.url).pathname;
  const requestOrigin = request.headers.get("origin") || "";
  const ttl = publicOriginTtl(res, policy.ttl, path, requestOrigin);
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (!ttl || !contentType.includes("application/json")) {
    return { shareable: false, response: res };
  }

  const bodyResult = await readNewPublicApiBody(res.clone());
  if (!bodyResult.ok) {
    if (bodyResult.reason === "too-large") return { shareable: false, response: res };
    await cancelNewPublicApiBody(res);
    return syntheticBadGatewayResult();
  }
  const body = bodyResult.body;
  try {
    JSON.parse(new TextDecoder("utf-8", { fatal: false }).decode(body));
  } catch (_) {
    await cancelNewPublicApiBody(res);
    return syntheticBadGatewayResult();
  }

  const headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set("Cache-Control", `public, max-age=0, s-maxage=${ttl}`);
  headers.set("CDN-Cache-Control", `public, max-age=${ttl}`);
  const result = {
    shareable: true,
    body,
    status: res.status,
    statusText: res.statusText,
    headers,
  };
  let cachePut;
  try {
    cachePut = Promise.resolve(runtime.cache.put(
      policy.key,
      new Response(body.slice(0), { status: 200, headers }),
    )).catch((err) => console.error("[public-api-burst] cache put error:", err));
  } catch (err) {
    console.error("[public-api-burst] cache put error:", err);
    cachePut = Promise.resolve();
  }
  const cacheLease = Promise.race([
    cachePut,
    new Promise((resolve) => setTimeout(resolve, NEW_PUBLIC_API_CACHE_LEASE_MS)),
  ]);
  runtime.waitUntil(cacheLease);
  result.cacheLease = cacheLease;
  return result;
}

async function safeFetchNewPublicApiResult(request, policy, fetchOrigin, runtime) {
  try {
    return await fetchNewPublicApiResult(request, policy, fetchOrigin, runtime);
  } catch (err) {
    console.error("[public-api-burst] origin fetch error:", err);
    return syntheticBadGatewayResult();
  }
}

export function createPublicApiBurstCache() {
  const inflight = new Map();

  return async function handlePublicApiBurst(request, { cache, fetchOrigin, waitUntil }) {
    const policy = newPublicApiPolicy(request);
    if (!policy) return null;
    const runtime = { cache, waitUntil: (promise) => waitUntil(promise) };

    let hit;
    try {
      hit = await cache.match(policy.key);
    } catch (err) {
      console.error("[public-api-burst] cache match error:", err);
    }
    if (hit) {
      const contentType = (hit.headers.get("content-type") || "").toLowerCase();
      const hitContractValid =
        hit.status === 200 &&
        !hit.headers.has("set-cookie") &&
        publicOriginTtl(
          hit,
          policy.ttl,
          new URL(policy.key.url).pathname,
          request.headers.get("origin") || "",
        ) > 0 &&
        contentType.includes("application/json");
      if (hitContractValid) {
        const bodyResult = await readNewPublicApiBody(hit.clone());
        if (bodyResult.ok) {
          try {
            JSON.parse(new TextDecoder("utf-8", { fatal: false }).decode(bodyResult.body));
            const headers = new Headers(hit.headers);
            headers.set("x-edge-cache", "HIT");
            return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
          } catch (_) { /* discard malformed entry below */ }
        }
      }
      runtime.waitUntil(cache.delete(policy.key).catch(() => {}));
    }

    let promise = inflight.get(policy.key.url);
    let leader = false;
    if (!promise && inflight.size < NEW_PUBLIC_API_MAX_INFLIGHT) {
      leader = true;
      promise = safeFetchNewPublicApiResult(request, policy, fetchOrigin, runtime);
      inflight.set(policy.key.url, promise);
      promise.then(
        async (result) => {
          if (result.cacheLease) await result.cacheLease;
          if (inflight.get(policy.key.url) === promise) inflight.delete(policy.key.url);
        },
        () => { if (inflight.get(policy.key.url) === promise) inflight.delete(policy.key.url); },
      );
    }

    if (promise) {
      const result = await promise;
      if (result.shareable) return newPublicApiResultResponse(result);
      if (leader) return result.response;
    }

    const result = await safeFetchNewPublicApiResult(request, policy, fetchOrigin, runtime);
    return newPublicApiResultResponse(result);
  };
}
