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

  it("shares the real competitions Vary only within a language, query and origin", async () => {
    const cache = memoryCache();
    const handle = createPublicApiBurstCache();
    const fetchOrigin = vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      const query = url.searchParams.getAll("lang").join(",").trim().toLowerCase();
      const header = request.headers.get("accept-language")?.toLowerCase();
      const lang = query === "en" || query === "ar" ? query : header?.startsWith("en") ? "en" : "ar";
      const headers = {
        vary: "Origin, Accept-Language, Accept-Encoding",
        "cache-control": "public, max-age=3600, s-maxage=86400",
        "x-sabq-public-cache": "1",
      };
      if (request.headers.has("if-match")) return new Response(null, { status: 412, headers });
      if (request.headers.has("if-none-match") || request.headers.has("if-modified-since")) {
        return new Response(null, { status: 304, headers });
      }
      return Response.json({ lang }, { headers });
    });
    const read = (query: string, language: string, headers: Record<string, string> = {}) => handle(
      new Request("https://sabq.org/api/sports/competitions" + query, {
        headers: { "accept-language": language, ...headers },
      }), { cache, fetchOrigin, waitUntil },
    );
    const burst = await Promise.all(Array.from({ length: 12 }, () => read("", "en-US")));
    expect(await Promise.all(burst.map(r => r!.json()))).toEqual(Array(12).fill({ lang: "en" }));
    expect(fetchOrigin).toHaveBeenCalledTimes(1);
    const warm = await read("", "EN-gb");
    expect(warm?.headers.get("x-edge-cache")).toBe("HIT");
    expect(warm?.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=300");
    expect(await (await read("", "ar-SA"))!.json()).toEqual({ lang: "ar" });
    expect((await read("", "ur"))?.headers.get("x-edge-cache")).toBe("HIT");
    expect(fetchOrigin).toHaveBeenCalledTimes(2);
    const validators: Record<string, string>[] = [
      { "if-none-match": '"list"' }, { "if-modified-since": new Date(0).toUTCString() },
    ];
    for (const headers of validators) {
      const response = await read("", "en-GB", headers);
      expect(response?.status).toBe(304);
      expect(response?.body).toBeNull();
    }
    expect((await read("", "en-GB", { "if-match": '"unmatched"' }))?.status).toBe(412);
    expect(cache.put).toHaveBeenCalledTimes(2);
    expect(await (await read("?lang=Ar", "en-US"))!.json()).toEqual({ lang: "ar" });
    expect(await (await read("?lang=En", "ar-SA"))!.json()).toEqual({ lang: "en" });
    expect(await (await read("?lang=en&lang=ar", "en-US"))!.json()).toEqual({ lang: "en" });
    expect(await (await read("?lang=en&lang=ar", "ar-SA"))!.json()).toEqual({ lang: "ar" });
    expect((await read("?status=upcoming", "en-US"))?.headers.get("x-edge-cache")).toBeNull();
    expect((await read("", "en-US", { origin: "https://reader.example" }))?.headers.get("x-edge-cache")).toBeNull();
    expect(await read("", "en-US", { cookie: "connect.sid=fixture" })).toBeNull();
    expect(await read("", "en-US", { authorization: "Bearer fixture" })).toBeNull();
    expect(await read("", "en-US", { "x-session-id": "fixture" })).toBeNull();
  });

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

  it.each(["/api/sports/competitions", "/api/kings-cup/overview"])(
    "recovers one generation for every waiting reader after the owner stalls on %s",
    async (path) => {
      vi.useFakeTimers();
      const cache = memoryCache();
      const handle = createPublicApiBurstCache();
      let finishOriginal!: (response: Response) => void;
      const stalled = new Promise<Response>(resolve => { finishOriginal = resolve; });
      const fetchOrigin = vi.fn(async () => originAnswer())
        .mockImplementationOnce(() => stalled);
      const read = () => handle(new Request("https://sabq.org" + path), { cache, fetchOrigin, waitUntil });

      const original = read();
      const followers = Array.from({ length: 100 }, read);
      await vi.advanceTimersByTimeAsync(100);
      expect(fetchOrigin).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10_100);
      const results = await Promise.all(followers);
      expect(fetchOrigin).toHaveBeenCalledTimes(2);
      expect(await Promise.all(results.map(response => response!.json())))
        .toEqual(Array.from({ length: 100 }, () => ({ items: [] })));

      const old = originAnswer();
      old.headers.set("x-test-generation", "old");
      finishOriginal(old);
      await original;
      expect(cache.put).toHaveBeenCalledTimes(1);
      const warm = await read();
      expect(warm?.headers.get("x-edge-cache")).toBe("HIT");
      expect(warm?.headers.has("x-test-generation")).toBe(false);
    },
  );

  it("retains waiting readers when a different key arrives at capacity", async () => {
    vi.useFakeTimers();
    const cache = memoryCache();
    const handle = createPublicApiBurstCache();
    let finish!: (response: Response) => void;
    const stalled = new Promise<Response>(resolve => { finish = resolve; });
    let recovering = false;
    const fetchOrigin = vi.fn(async () => recovering ? originAnswer() : (await stalled).clone());
    const read = (key: number) => handle(
      new Request("https://sabq.org/api/sports/competitions?key=" + key),
      { cache, fetchOrigin, waitUntil },
    );

    const originals = Array.from({ length: 32 }, (_, key) => read(key));
    const followers = Array.from({ length: 100 }, () => read(0));
    await vi.advanceTimersByTimeAsync(50);
    expect(fetchOrigin).toHaveBeenCalledTimes(32);
    recovering = true;
    vi.setSystemTime(Date.now() + 11_000);
    await read(32);
    await vi.advanceTimersByTimeAsync(200);
    await Promise.all(followers);
    expect(fetchOrigin).toHaveBeenCalledTimes(34);
    finish(originAnswer());
    await Promise.all(originals);
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
