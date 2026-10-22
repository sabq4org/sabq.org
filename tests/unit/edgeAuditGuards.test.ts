import { describe, expect, it } from "vitest";
import { NOINDEX_EXACT, NOINDEX_PREFIXES } from "../../server/utils/noindexPaths";
// @ts-expect-error Pages JS is untyped
import {
  apiCacheKey, apiGoneCopyKeys, apiLastGoodAllowed, apiProxyTimeoutMs, getApiCacheTtl, isApiGoneAnswer, isNoindexPrefix,
  remainingApiCacheTtl,
} from "../../functions/_middleware.js";
import { articleMetadata } from "../../web-next/lib/articleMetadata";
describe("edge audit boundaries", () => {
  it("keeps all backend private paths outside shared HTML caching", () => {
    for (const p of [...NOINDEX_EXACT, ...NOINDEX_PREFIXES]) expect(isNoindexPrefix(p), p).toBe(true);
    for (const p of NOINDEX_PREFIXES) expect(isNoindexPrefix(p + "/token"), p).toBe(true);
    expect(isNoindexPrefix("/surveys-news")).toBe(false);
  });
  it("separates all category representations while dropping tracking parameters", () => {
    const keys = ["", "?withStats=true", "?includeIfox=true", "?withStats=true&includeIfox=true"]
      .map(q => apiCacheKey("https://sabq.org/api/categories" + q).url);
    expect(new Set(keys).size).toBe(4);
    expect(apiCacheKey(keys[1] + "&utm_source=test").url).toBe(keys[1]);
  });
  it("edge-caches the public category-by-slug lookup for anonymous GETs only", () => {
    const req = (headers: Record<string, string> = {}, method = "GET") =>
      new Request("https://sabq.org/api/categories/slug/sports", { method, headers });
    expect(getApiCacheTtl("/api/categories/slug/sports", req())).toBe(60);
    expect(getApiCacheTtl("/api/categories/slug/%D8%B1%D9%8A%D8%A7%D8%B6%D8%A9", req())).toBe(60);
    expect(getApiCacheTtl("/api/categories/slug/sports", req({ cookie: "connect.sid=s%3Aabc" }))).toBe(0);
    expect(getApiCacheTtl("/api/categories/slug/sports", req({ authorization: "Bearer x" }))).toBe(0);
    expect(getApiCacheTtl("/api/categories/slug/sports", req({}, "POST"))).toBe(0);
    expect(getApiCacheTtl("/api/categories/slug/sports/extra", req())).toBe(0);
  });
  it("edge-caches the public reads added for Render bandwidth with full-query keys", () => {
    const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
    const ttl = (path: string, query = "", headers: Record<string, string> = {}) =>
      getApiCacheTtl(path, req("https://sabq.org" + path + query, headers));
    expect(ttl("/api/stories")).toBe(60);
    expect(ttl("/api/opinion", "?page=1&limit=30")).toBe(60);
    expect(ttl("/api/reporters/shyfh-sbq")).toBe(60);
    expect(ttl("/api/audio-bulletin/current")).toBe(30);
    expect(ttl("/api/shortlinks/article/abc")).toBe(300);
    expect(ttl("/api/articles/some-slug/summary-audio")).toBe(600);
    expect(ttl("/api/sports/today", "?resilient=1&lang=ar")).toBe(0);
    expect(getApiCacheTtl("/api/stories", new Request("https://sabq.org/api/stories", { method: "HEAD" }))).toBe(0);
    expect(ttl("/api/stories", "", { cookie: "connect.sid=s%3Aabc" })).toBe(0);
    expect(ttl("/api/stories/some-slug")).toBe(0);
    const key = (q: string) => apiCacheKey("https://sabq.org/api/opinion" + q).url;
    expect(key("?sort=new&authorId=1")).not.toBe(key("?sort=new&authorId=2"));
    expect(key("?limit=30&page=1")).toBe(key("?page=1&limit=30"));
    expect(apiCacheKey("https://sabq.org/api/mawaeed?region=riyadh").url)
      .not.toBe(apiCacheKey("https://sabq.org/api/mawaeed?region=makkah").url);
    expect(apiCacheKey("https://sabq.org/api/stories", "https://a.example").url)
      .not.toBe(apiCacheKey("https://sabq.org/api/stories").url);
  });
  it("keys every parameter the origin reads, so one visitor cannot choose another reader's answer", () => {
    const key = (path: string, origin?: string) => apiCacheKey("https://sabq.org" + path, origin).url;
    expect(key("/api/categories/smart?type=core&status=zz")).not.toBe(key("/api/categories/smart?type=core&status=active"));
    expect(key("/api/articles/a/media-assets?locale=en")).not.toBe(key("/api/articles/a/media-assets?locale=ar"));
    expect(key("/api/articles/recent?limit=5&excludeId=1")).not.toBe(key("/api/articles/recent?limit=5&excludeId=2"));
    expect(key("/api/categories/smart?status=active&type=core")).toBe(key("/api/categories/smart?type=core&status=active"));
    // The edge's own key markers cannot come from a client.
    expect(key("/api/homepage?__sabq_last_good=1")).toBe(key("/api/homepage"));
    expect(key("/api/stories?__sabq_origin=present:https://a.example")).toBe(key("/api/stories"));
    // Without an Origin the key stays the URL Cloudflare purges; with one it differs.
    expect(key("/api/articles/abc")).toBe("https://sabq.org/api/articles/abc");
    expect(key("/api/articles/abc", "https://a.example")).not.toBe(key("/api/articles/abc"));
  });
  it("treats only the origin's JSON 404/410 as gone, and drops an article's page reads with it", () => {
    const json = { "content-type": "application/json; charset=utf-8" };
    expect(isApiGoneAnswer(new Response("{}", { status: 404, headers: json }))).toBe(true);
    expect(isApiGoneAnswer(new Response("{}", { status: 410, headers: json }))).toBe(true);
    expect(isApiGoneAnswer(new Response("<h1>Not Found</h1>", { status: 404, headers: { "content-type": "text/html" } }))).toBe(false);
    expect(isApiGoneAnswer(new Response("{}", { status: 503, headers: json }))).toBe(false);
    const urls = (u: string) => apiGoneCopyKeys(u).map((k: Request) => k.url);
    expect(urls("https://sabq.org/api/articles/a")).toHaveLength(14);
    expect(urls("https://sabq.org/api/articles/a")).toContain("https://sabq.org/api/articles/a/ai-bullets?__sabq_last_good=1");
    expect(urls("https://sabq.org/api/categories/slug/x"))
      .toEqual(["https://sabq.org/api/categories/slug/x", "https://sabq.org/api/categories/slug/x?__sabq_last_good=1"]);
  });
  it("lets a cold «استمع» clip finish synthesizing while other cached reads stay bounded", () => {
    expect(apiProxyTimeoutMs("/api/articles/some-slug/summary-audio", true)).toBe(0);
    expect(apiProxyTimeoutMs("/api/stories", true)).toBe(10_000);
    expect(apiProxyTimeoutMs("/api/homepage", true)).toBe(10_000);
    expect(apiProxyTimeoutMs("/api/stories", false)).toBe(0);
  });
  it("never replays an unpublished article's clip from the 24 h last-good copy", () => {
    expect(apiLastGoodAllowed("/api/articles/some-slug/summary-audio")).toBe(false);
    expect(apiLastGoodAllowed("/api/stories")).toBe(true);
    expect(apiLastGoodAllowed("/api/homepage")).toBe(true);
  });
  it("keeps an answer already aged at the api.sabq.org edge only for the rest of its window", () => {
    expect(remainingApiCacheTtl(600, null)).toBe(600);
    expect(remainingApiCacheTtl(600, "0")).toBe(600);
    expect(remainingApiCacheTtl(600, "599")).toBe(1);
    expect(remainingApiCacheTtl(600, "240")).toBe(360);
    expect(remainingApiCacheTtl(600, "9000")).toBe(1);
    expect(remainingApiCacheTtl(60, "junk")).toBe(60);
  });
  it("preserves Google News exclusion in Next metadata", () => {
    expect(articleMetadata({ title: "test", googlebotNews: "noindex" } as any).other)
      .toEqual({ "googlebot-news": "noindex" });
  });
});

// @ts-expect-error Pages JS is untyped
import { fetchSsrResponse } from "../../functions/_middleware.js";
import { afterEach, vi } from "vitest";
afterEach(() => vi.unstubAllGlobals());
describe("SSR fallback contract", () => {
  it("rejects 503 so the caller can fall through, preserving real 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(new Response("missing", { status: 404 })));
    const req = new Request("https://sabq.org/article/test");
    await expect(fetchSsrResponse(req, "https://next.example")).rejects.toThrow("503");
    expect((await fetchSsrResponse(req, "https://next.example")).status).toBe(404);
  });
  it("passes a live deadline to the underlying fetch", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    })));
    await expect(fetchSsrResponse(new Request("https://sabq.org/"), "https://next.example", 10)).rejects.toThrow();
  });
});

// @ts-expect-error Pages JS is untyped
import { onRequest } from "../../functions/_middleware.js";
describe("Pages «استمع» edge copy", () => {
  const put = vi.fn(async () => {});
  const audio = (headers: Record<string, string>) =>
    new Response(new Uint8Array(32), {
      status: 200,
      headers: {
        "content-type": "audio/wav", "content-length": "32", "x-sabq-article-published": "1", ...headers,
      },
    });
  const context = (path = "/api/articles/a/summary-audio?tts=tafqit-v2") => ({
    request: new Request(`https://sabq.org${path}`),
    env: { API_ORIGIN: "https://api.example" },
    next: vi.fn(async () => new Response("shell")),
    waitUntil: vi.fn(),
  });
  const stored = () => put.mock.calls.map(([key, res]) => ({
    key: (key as Request).url,
    cacheControl: (res as Response).headers.get("cache-control"),
    cdn: (res as Response).headers.get("cdn-cache-control"),
    age: (res as Response).headers.get("age"),
  }));
  afterEach(() => put.mockClear());

  it("keeps a Worker HIT only for what is left of its window, with no last-good copy", async () => {
    vi.stubGlobal("caches", { default: { match: vi.fn(async () => undefined), put, delete: vi.fn() } });
    vi.stubGlobal("fetch", vi.fn(async () => audio({
      age: "590",
      "x-edge-cache": "HIT",
      "cache-control": "public, max-age=0, s-maxage=600",
      "cdn-cache-control": "public, max-age=600",
    })));
    const res = await onRequest(context());
    expect(res.status).toBe(200);
    expect(stored()).toEqual([expect.objectContaining({
      cacheControl: "public, max-age=10, s-maxage=10", cdn: null, age: null,
    })]);
    expect(stored()[0].key).not.toContain("__sabq_last_good");
  });

  it("stores a clip the origin marks CDN no-store, since the edge owns this policy", async () => {
    vi.stubGlobal("caches", { default: { match: vi.fn(async () => undefined), put, delete: vi.fn() } });
    vi.stubGlobal("fetch", vi.fn(async () => audio({
      "cache-control": "private, no-store",
      "cdn-cache-control": "no-store",
    })));
    await onRequest(context());
    expect(stored()).toEqual([expect.objectContaining({
      cacheControl: "public, max-age=600, s-maxage=600", cdn: null,
    })]);
  });

  it("keeps nothing the origin's guard did not confirm as published", async () => {
    vi.stubGlobal("caches", { default: { match: vi.fn(async () => undefined), put, delete: vi.fn() } });
    vi.stubGlobal("fetch", vi.fn(async () => audio({
      "x-sabq-article-published": "", "cache-control": "private, no-store",
    })));
    const res = await onRequest(context());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(put).not.toHaveBeenCalled();
  });

  it("gives a cold clip's last origin attempt no deadline, unlike other cached reads", async () => {
    vi.stubGlobal("caches", { default: { match: vi.fn(async () => undefined), put, delete: vi.fn() } });
    const stall = () => Promise.reject(Object.assign(new Error("stall"), { name: "TimeoutError" }));
    const lastAttemptSignal = async (path: string, body: () => Response) => {
      const fetchMock = vi.fn().mockImplementationOnce(stall).mockImplementationOnce(stall)
        .mockImplementation(async () => body());
      vi.stubGlobal("fetch", fetchMock);
      await onRequest(context(path));
      expect(fetchMock).toHaveBeenCalledTimes(3);
      return fetchMock.mock.calls[2][1].signal;
    };
    expect(await lastAttemptSignal("/api/articles/a/summary-audio", () => audio({}))).toBeUndefined();
    expect(await lastAttemptSignal("/api/reporters/some-writer", () => new Response("{}", {
      status: 200, headers: { "content-type": "application/json" },
    }))).toBeInstanceOf(AbortSignal);
  });
});

describe("Pages last-good copy of an article the origin calls gone", () => {
  const store = new Map<string, { body: string; status: number; headers: [string, string][] }>();
  const cache = {
    match: vi.fn(async (key: Request) => {
      const hit = store.get(key.url);
      return hit && new Response(hit.body, { status: hit.status, headers: hit.headers });
    }),
    put: vi.fn(async (key: Request, res: Response) => {
      store.set(key.url, { body: await res.text(), status: res.status, headers: [...res.headers] });
    }),
    delete: vi.fn(async (key: Request) => store.delete(key.url)),
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8" },
  });
  const read = async (path: string, answer: Response) => {
    vi.stubGlobal("caches", { default: cache });
    vi.stubGlobal("fetch", vi.fn(async () => answer));
    const pending: Promise<unknown>[] = [];
    const res = await onRequest({
      request: new Request(`https://sabq.org${path}`),
      env: { API_ORIGIN: "https://api.example" },
      next: vi.fn(async () => new Response("shell")),
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    });
    await Promise.all(pending);
    return res;
  };
  // The 60 s fresh copies have run out; only the 24 h last-good ones are left.
  const expireFresh = () => {
    for (const url of [...store.keys()]) if (!url.includes("__sabq_last_good")) store.delete(url);
  };
  afterEach(() => store.clear());

  it("serves a live article from its last-good copy when the origin fails", async () => {
    await read("/api/articles/a", json(200, { title: "LIVE" }));
    expireFresh();
    const res = await read("/api/articles/a", json(503, { message: "down" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-sabq-stale")).toBe("1");
    expect(await res.text()).toContain("LIVE");
  });

  it("forgets an article and its page reads once the origin answers 404", async () => {
    await read("/api/articles/a", json(200, { title: "RETRACTED" }));
    await read("/api/articles/a/ai-bullets", json(200, { bullets: ["RETRACTED"] }));
    expireFresh();
    expect((await read("/api/articles/a", json(404, { message: "Article not found" }))).status).toBe(404);
    expect([...store.keys()]).toEqual([]);
    for (const path of ["/api/articles/a", "/api/articles/a/ai-bullets"]) {
      const res = await read(path, json(503, { message: "down" }));
      expect(res.status, path).toBe(503);
      expect(res.headers.get("x-sabq-stale"), path).toBeNull();
    }
  });

  it("keeps the outage copy through a platform 404 page", async () => {
    await read("/api/articles/a", json(200, { title: "LIVE" }));
    expireFresh();
    await read("/api/articles/a", new Response("<h1>Not Found</h1>", { status: 404, headers: { "content-type": "text/html" } }));
    const res = await read("/api/articles/a", json(503, { message: "down" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("LIVE");
  });
});
