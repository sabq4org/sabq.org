import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiOriginWorker from "../../cloudflare-worker/api-origin-worker.js";
import { EDGE_CACHE_PROBE_PATH, isEdgeCacheProbe } from "../../cloudflare-worker/edge-cache-probe.js";

// A Cache API stand-in that keeps entries between calls, like one colo does.
function memoryCache() {
  const entries = new Map<string, Response>();
  return {
    entries,
    match: vi.fn(async (key: Request) => entries.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, response: Response) => {
      entries.set(key.url, response.clone());
    }),
    delete: vi.fn(async (key: Request) => entries.delete(key.url)),
  };
}

const env = { EDGE_PROXY_SHARED_SECRET: "test-secret", API_ORIGIN: "https://origin.example" };
const ctx = { waitUntil: vi.fn() };
const probe = () => apiOriginWorker.fetch(
  new Request(`https://api.sabq.org${EDGE_CACHE_PROBE_PATH}`, { headers: { "cf-connecting-ip": "203.0.113.10" } }),
  env,
  ctx,
);

describe("api.sabq.org edge cache probe", () => {
  let defaultCache: ReturnType<typeof memoryCache>;
  let namedCache: ReturnType<typeof memoryCache>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    defaultCache = memoryCache();
    namedCache = memoryCache();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("caches", { default: defaultCache, open: vi.fn(async () => namedCache) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("answers at the edge without calling the origin and is never shared", async () => {
    const res = await probe();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports where placement ran the Worker, not only the ingress colo", async () => {
    const res = await apiOriginWorker.fetch(
      new Request(`https://api.sabq.org${EDGE_CACHE_PROBE_PATH}`, { headers: { "cf-placement": "remote-IAD" } }),
      env,
      ctx,
    );
    const body = await res.json();
    expect(body.placement).toBe("remote-IAD");
    expect(body).toHaveProperty("colo");
  });

  it("reports the put, the read-back, and what an earlier probe left", async () => {
    const first = await (await probe()).json();
    expect(first.results.defaultOnRequestHost.previous).toBeNull();
    expect(first.results.defaultOnRequestHost.afterPut.storedAt).toBe(first.storedAt);
    expect(first.results.named.afterPut.storedAt).toBe(first.storedAt);
    expect(first.results.burstThemesEntry).toBeNull();

    const second = await (await probe()).json();
    expect(second.results.defaultOnRequestHost.previous.storedAt).toBe(first.storedAt);
    expect(second.results.named.previous.storedAt).toBe(first.storedAt);
  });

  it("keys its entries on the request host, which the zone's bypass rules exclude", async () => {
    await probe();
    const hosts = [...defaultCache.entries.keys()].map((key) => new URL(key).hostname);
    expect(hosts).toEqual(["api.sabq.org"]);
  });

  it("reports a failing put instead of throwing", async () => {
    defaultCache.put.mockRejectedValue(new Error("put refused"));
    const body = await (await probe()).json();
    expect(body.results.defaultOnRequestHost.put.error).toBe("put refused");
    expect(body.results.defaultOnRequestHost.afterPut).toBeNull();
    expect(body.results.named.afterPut.storedAt).toBe(body.storedAt);
  });

  it("reads the real burst entry for /api/themes/active without writing it", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ theme: "x" }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=30",
        "x-sabq-public-cache": "1",
      },
    }));
    await apiOriginWorker.fetch(
      new Request("https://api.sabq.org/api/themes/active", { headers: { "cf-connecting-ip": "203.0.113.10" } }),
      env,
      ctx,
    );
    await Promise.all(ctx.waitUntil.mock.calls.map(([promise]) => promise));
    const puts = defaultCache.put.mock.calls.length;
    const body = await (await probe()).json();
    expect(body.results.burstThemesEntry).toEqual({ status: 200, age: null, storedAt: null });
    // The probe writes its own key to the default cache, never the themes entry.
    expect(defaultCache.put.mock.calls.length - puts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("matches only GET on the probe path", () => {
    expect(isEdgeCacheProbe(new Request(`https://api.sabq.org${EDGE_CACHE_PROBE_PATH}`))).toBe(true);
    expect(isEdgeCacheProbe(new Request(`https://api.sabq.org${EDGE_CACHE_PROBE_PATH}`, { method: "POST" }))).toBe(false);
    expect(isEdgeCacheProbe(new Request(`https://api.sabq.org${EDGE_CACHE_PROBE_PATH}/x`))).toBe(false);
  });
});
