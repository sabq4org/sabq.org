import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SITEMAP_EDGE_MAX_TTL_S,
  createSitemapEdgeCache,
  isSitemapPath,
  sitemapEdgeCacheKey,
} from "../../cloudflare-worker/sitemap-edge-cache.js";
import { fetchSitemapViaEdge, onRequest, sitemapEdgeService } from "../../functions/_middleware.js";

function memoryCache() {
  const store = new Map<string, { body: ArrayBuffer; headers: Headers; status: number }>();
  return {
    store,
    put: vi.fn(async (key: Request, res: Response) => {
      store.set(key.url, { body: await res.arrayBuffer(), headers: new Headers(res.headers), status: res.status });
    }),
    match: vi.fn(async (key: Request) => {
      const entry = store.get(key.url);
      return entry ? new Response(entry.body.slice(0), { status: entry.status, headers: entry.headers }) : undefined;
    }),
  };
}

const xml = (cacheControl = "public, max-age=1800, s-maxage=3600", extra: Record<string, string> = {}) =>
  new Response("<urlset/>", {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": cacheControl, ...extra },
  });

const get = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  new Request(`https://api.sabq.org${path}`, { method, headers });

async function run(serve: ReturnType<typeof createSitemapEdgeCache>, request: Request, cache: ReturnType<typeof memoryCache>, fetchOrigin: ReturnType<typeof vi.fn>) {
  const pending: Promise<unknown>[] = [];
  const res = await serve(request, { cache, waitUntil: (p: Promise<unknown>) => pending.push(p), fetchOrigin });
  await Promise.all(pending);
  return res;
}

describe("shared sitemap edge copy", () => {
  afterEach(() => vi.useRealTimers());

  it("matches the sitemap paths only", () => {
    expect(isSitemapPath("/sitemap.xml")).toBe(true);
    expect(isSitemapPath("/sitemap-articles-139.xml")).toBe(true);
    expect(isSitemapPath("/sitemaps/x.xml")).toBe(false);
    expect(isSitemapPath("/api/sitemap.xml")).toBe(false);
  });

  it("fetches once without cookies, then hands on only the time left", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T06:00:00Z"));
    const serve = createSitemapEdgeCache();
    const cache = memoryCache();
    const fetchOrigin = vi.fn(async () => xml());

    const miss = await run(serve, get("/sitemap-articles-139.xml", { cookie: "_ga=1; connect.sid=x" }), cache, fetchOrigin);
    expect(miss?.headers.get("x-edge-cache")).toBe("MISS");
    expect(miss?.headers.get("cache-control")).toBe(`public, max-age=${SITEMAP_EDGE_MAX_TTL_S}, s-maxage=${SITEMAP_EDGE_MAX_TTL_S}`);
    expect(await miss!.text()).toBe("<urlset/>");
    expect((fetchOrigin.mock.calls[0][0] as Request).headers.has("cookie")).toBe(false);

    vi.setSystemTime(new Date("2026-10-24T06:40:00Z"));
    const hit = await run(serve, get("/sitemap-articles-139.xml"), cache, fetchOrigin);
    expect(hit?.headers.get("x-edge-cache")).toBe("HIT");
    expect(hit?.headers.get("cache-control")).toBe("public, max-age=1200, s-maxage=1200");
    expect(hit?.headers.has("x-sabq-edge-stored-at")).toBe(false);
    expect(fetchOrigin).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-24T07:00:01Z"));
    await run(serve, get("/sitemap-articles-139.xml"), cache, fetchOrigin);
    expect(fetchOrigin).toHaveBeenCalledTimes(2);
  });

  it("keeps sitemap-news on the origin's shorter s-maxage", async () => {
    const serve = createSitemapEdgeCache();
    const cache = memoryCache();
    const fetchOrigin = vi.fn(async () => xml("public, max-age=180, s-maxage=180"));
    const res = await run(serve, get("/sitemap-news.xml"), cache, fetchOrigin);
    expect(res?.headers.get("cache-control")).toBe("public, max-age=180, s-maxage=180");
  });

  it("drops a crawler's conditional headers so the fill can be kept", async () => {
    const serve = createSitemapEdgeCache();
    const cache = memoryCache();
    const fetchOrigin = vi.fn(async () => xml());
    await run(serve, get("/sitemap-articles-164.xml", { "if-none-match": 'W/"abc"', "if-modified-since": "Fri, 23 Oct 2026 00:00:00 GMT" }), cache, fetchOrigin);
    const sent = fetchOrigin.mock.calls[0][0] as Request;
    expect(sent.headers.has("if-none-match")).toBe(false);
    expect(sent.headers.has("if-modified-since")).toBe(false);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("shares one origin fetch between concurrent misses", async () => {
    const serve = createSitemapEdgeCache();
    const cache = memoryCache();
    let release: () => void = () => {};
    const fetchOrigin = vi.fn(() => new Promise<Response>((resolve) => { release = () => resolve(xml()); }));
    const opts = { cache, waitUntil: () => {}, fetchOrigin };
    const all = Promise.all([1, 2, 3].map(() => serve(get("/sitemap.xml"), opts)));
    await Promise.resolve();
    release();
    const responses = await all;
    expect(fetchOrigin).toHaveBeenCalledTimes(1);
    expect(await Promise.all(responses.map((r) => r!.text()))).toEqual(["<urlset/>", "<urlset/>", "<urlset/>"]);
  });

  it("stores nothing that is not a public XML 200 without Set-Cookie", async () => {
    for (const bad of [
      () => xml("private, max-age=60"),
      () => xml("public, max-age=60"),
      () => xml("public, s-maxage=0"),
      () => xml(undefined, { "set-cookie": "a=b" }),
      () => new Response("{}", { status: 200, headers: { "content-type": "application/json", "cache-control": "public, s-maxage=60" } }),
      () => new Response("down", { status: 503, headers: { "content-type": "text/xml" } }),
    ]) {
      const serve = createSitemapEdgeCache();
      const cache = memoryCache();
      const fetchOrigin = vi.fn(async () => bad());
      const res = await run(serve, get("/sitemap.xml"), cache, fetchOrigin);
      expect(res).not.toBeNull();
      expect(cache.put).not.toHaveBeenCalled();
    }
  });

  it("leaves HEAD and other paths to the caller", async () => {
    const serve = createSitemapEdgeCache();
    const cache = memoryCache();
    const fetchOrigin = vi.fn(async () => xml());
    expect(await run(serve, get("/sitemap.xml", {}, "HEAD"), cache, fetchOrigin)).toBeNull();
    expect(await run(serve, get("/api/categories"), cache, fetchOrigin)).toBeNull();
    expect(fetchOrigin).not.toHaveBeenCalled();
  });

  it("keys on path and query of the request host", () => {
    expect(sitemapEdgeCacheKey(get("/sitemap-articles-2.xml?x=1")).url).toBe("https://api.sabq.org/sitemap-articles-2.xml?x=1");
  });
});

describe("Pages sends sitemaps through the shared Worker copy", () => {
  const binding = { fetch: vi.fn(async () => xml()) };

  it("uses the API_EDGE service binding for sitemaps only", () => {
    expect(sitemapEdgeService("/sitemap-articles-139.xml", { API_EDGE: binding })).toBe(binding);
    expect(sitemapEdgeService("/api/categories", { API_EDGE: binding })).toBeNull();
  });

  it("goes to the API origin without the binding or when switched off", () => {
    // A same-zone fetch to api.sabq.org never runs the route Worker, so there
    // is no URL fallback to it.
    expect(sitemapEdgeService("/sitemap.xml", {})).toBeNull();
    expect(sitemapEdgeService("/sitemap.xml", { API_EDGE: binding, SITEMAP_EDGE: "off" })).toBeNull();
  });

  it("asks the Worker for the api.sabq.org URL without cookies", async () => {
    const service = { fetch: vi.fn(async (_req: Request) => xml()) };
    const res = await fetchSitemapViaEdge(
      new Request("https://sabq.org/sitemap-articles-7.xml?p=2", { headers: { cookie: "connect.sid=x", "cf-connecting-ip": "203.0.113.5" } }),
      service,
    );
    expect(res?.status).toBe(200);
    const sent = service.fetch.mock.calls[0][0];
    expect(sent.url).toBe("https://api.sabq.org/sitemap-articles-7.xml?p=2");
    expect(sent.headers.has("cookie")).toBe(false);
    expect(sent.headers.get("cf-connecting-ip")).toBe("203.0.113.5");
  });

  it("hands a Worker failure back to the caller for the API origin", async () => {
    const down = { fetch: vi.fn(async () => new Response("bad gateway", { status: 502 })) };
    const thrown = { fetch: vi.fn(async () => { throw new Error("binding down"); }) };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await fetchSitemapViaEdge(new Request("https://sabq.org/sitemap.xml"), down)).toBeNull();
    expect(await fetchSitemapViaEdge(new Request("https://sabq.org/sitemap.xml"), thrown)).toBeNull();
    errors.mockRestore();
    warns.mockRestore();
  });
});

describe("api-origin-worker serves sitemaps from the shared copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fetches a sitemap from the origin once and answers the next request from cache", async () => {
    const { default: apiOriginWorker } = await import("../../cloudflare-worker/api-origin-worker.js");
    const cache = memoryCache();
    vi.stubGlobal("caches", { default: cache });
    const fetchMock = vi.fn(async () => xml());
    vi.stubGlobal("fetch", fetchMock);
    const env = { EDGE_PROXY_SHARED_SECRET: "test-secret", API_ORIGIN: "https://origin.example" };
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
    const req = () => new Request("https://api.sabq.org/sitemap-articles-7.xml", { headers: { "cf-connecting-ip": "203.0.113.9" } });

    const first = await apiOriginWorker.fetch(req(), env, ctx);
    await Promise.all(pending);
    const second = await apiOriginWorker.fetch(req(), env, ctx);

    expect(first.headers.get("x-edge-cache")).toBe("MISS");
    expect(second.headers.get("x-edge-cache")).toBe("HIT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://origin.example/sitemap-articles-7.xml");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("x-sabq-proxy-signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Pages middleware sitemap route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const context = (env: Record<string, unknown>) => ({
    request: new Request("https://sabq.org/sitemap-articles-9.xml", { headers: { "user-agent": "Googlebot" } }),
    env: { API_ORIGIN: "https://render.example", EDGE_PROXY_SHARED_SECRET: "s", ...env },
    next: vi.fn(async () => new Response("shell")),
    waitUntil: vi.fn(),
  });

  it("asks the bound Worker and not the API origin", async () => {
    vi.stubGlobal("caches", { default: { match: vi.fn(async () => undefined), put: vi.fn(async () => {}), delete: vi.fn() } });
    const fetchMock = vi.fn(async () => xml());
    vi.stubGlobal("fetch", fetchMock);
    const edge = { fetch: vi.fn(async () => xml("public, max-age=1200, s-maxage=1200")) };
    const res = await onRequest(context({ API_EDGE: edge }));
    expect(res.status).toBe(200);
    expect(edge.fetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the API origin when the Worker fails", async () => {
    vi.stubGlobal("caches", { default: { match: vi.fn(async () => undefined), put: vi.fn(async () => {}), delete: vi.fn() } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => xml());
    vi.stubGlobal("fetch", fetchMock);
    const edge = { fetch: vi.fn(async () => new Response("down", { status: 503 })) };
    const res = await onRequest(context({ API_EDGE: edge }));
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://render.example/sitemap-articles-9.xml");
  });
});
