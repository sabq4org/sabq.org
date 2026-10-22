import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicApiBurstCache, newPublicApiCacheKey } from "../../cloudflare-worker/public-api-burst-cache.js";

// Pages runs the same burst module and, on its own miss, fetches api.sabq.org,
// whose Worker may answer from its cache. The two layers together must not keep
// a copy longer than the route TTL (15 s for /api/v1/homepage).
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

const originAnswer = () => new Response(JSON.stringify({ items: [] }), {
  status: 200,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=0, s-maxage=15",
    "x-sabq-public-cache": "1",
  },
});

const homepage = (host: string) => new Request(`https://${host}/api/v1/homepage`);
const waitUntil = () => {};

describe("burst cache layers (Pages over the api.sabq.org Worker)", () => {
  afterEach(() => vi.useRealTimers());

  it("hands on only the TTL a Worker hit has left, and Pages keeps no more than that", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    const workerCache = memoryCache();
    const worker = createPublicApiBurstCache();
    const origin = vi.fn(async () => originAnswer());

    await worker(homepage("api.sabq.org"), { cache: workerCache, fetchOrigin: origin, waitUntil });
    await Promise.resolve();
    expect(workerCache.put).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-22T10:00:14Z"));
    const hit = await worker(homepage("api.sabq.org"), { cache: workerCache, fetchOrigin: origin, waitUntil });
    expect(hit?.headers.get("x-edge-cache")).toBe("HIT");
    expect(hit?.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=1");
    expect(hit?.headers.get("cdn-cache-control")).toBe("public, max-age=1");
    expect(hit?.headers.has("age")).toBe(false);

    const pagesCache = memoryCache();
    const pages = createPublicApiBurstCache();
    await pages(homepage("sabq.org"), { cache: pagesCache, fetchOrigin: async () => hit!, waitUntil });
    const stored = pagesCache.put.mock.calls[0][1] as Response;
    expect(stored.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=1");
    expect(origin).toHaveBeenCalledTimes(1);
  });

  it("counts the Cache API's Age header and refetches once the window is spent", async () => {
    const cache = memoryCache();
    const aged = originAnswer();
    aged.headers.set("age", "15");
    cache.entries.set(newPublicApiCacheKey(homepage("api.sabq.org")).url, aged);
    const origin = vi.fn(async () => originAnswer());
    const worker = createPublicApiBurstCache();

    const response = await worker(homepage("api.sabq.org"), { cache, fetchOrigin: origin, waitUntil });
    expect(response?.headers.get("x-edge-cache")).not.toBe("HIT");
    expect(origin).toHaveBeenCalledTimes(1);
    expect(cache.delete).toHaveBeenCalledTimes(1);
  });
});
