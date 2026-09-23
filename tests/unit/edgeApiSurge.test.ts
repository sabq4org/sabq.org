import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Pages JS is untyped
import { newPublicApiCacheKey, newPublicApiPolicy, onRequest } from "../../functions/_middleware.js";

const apiResponse = (body: unknown = { ok: true }, cacheControl = "public, max-age=30") =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      "x-sabq-public-cache": "1",
    },
  });

const requestContext = (url: string, headers?: HeadersInit, method = "GET") => ({
  request: new Request(`https://sabq.org${url}`, { method, headers }),
  env: { API_ORIGIN: "https://api.example" },
  next: vi.fn(async () => new Response("shell")),
  waitUntil: vi.fn(),
});

describe("Pages auxiliary public API surge guard", () => {
  const cache = {
    match: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    cache.match.mockResolvedValue(undefined);
    cache.put.mockImplementation(() => new Promise<void>(() => {}));
    cache.delete.mockResolvedValue(true);
    vi.stubGlobal("caches", { default: cache });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("coalesces a cold anonymous burst while cache.put is still pending", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiResponse({ comments: [] }, "public, max-age=30"));
    vi.stubGlobal("fetch", fetchMock);

    const responses = await Promise.all(
      Array.from({ length: 100 }, () => onRequest(requestContext("/api/articles/hot/comments"))),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(responses).toHaveLength(100);
    expect(await responses[0].json()).toEqual({ comments: [] });
    expect(cache.put).toHaveBeenCalledTimes(1);

    // The leader remains leased briefly while the cache write is pending, so
    // a second wave arriving in the same isolate does not create another miss.
    await onRequest(requestContext("/api/articles/hot/comments"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not coalesce requests carrying any user credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiResponse());
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      onRequest(requestContext("/api/themes/active", { cookie: "session=abc" })),
      onRequest(requestContext("/api/themes/active", { authorization: "Bearer abc" })),
      onRequest(requestContext("/api/themes/active", { "x-session-id": "abc" })),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it.each([
    ["private", "public, private, max-age=30"],
    ["no-store", "public, no-store, max-age=30"],
    ["s-maxage-zero", "public, max-age=30, s-maxage=0"],
    ["missing-marker", "public, max-age=30"],
    ["missing-positive-ttl", "public, max-age=0"],
  ])("does not share or cache an unsafe origin response (%s)", async (_name, cacheControl) => {
    const response = apiResponse({ unsafe: true }, cacheControl);
    if (_name === "missing-marker") response.headers.delete("x-sabq-public-cache");
    const fetchMock = vi.fn().mockResolvedValue(response.clone());
    vi.stubGlobal("fetch", fetchMock);

    const responses = await Promise.all([
      onRequest(requestContext("/api/system/dms-top-ads")),
      onRequest(requestContext("/api/system/dms-top-ads")),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cache.put).not.toHaveBeenCalled();
    expect(responses.every((res) => res.status === 200)).toBe(true);
  });

  it("turns invalid JSON and upstream errors into bounded 502 responses and cleans up flights", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{broken", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=30",
          "x-sabq-public-cache": "1",
        },
      }))
      .mockRejectedValueOnce(new Error("origin down"))
      .mockResolvedValueOnce(apiResponse({ recovered: true }));
    vi.stubGlobal("fetch", fetchMock);

    const invalid = await onRequest(requestContext("/api/themes/active"));
    const failed = await onRequest(requestContext("/api/themes/active"));
    const recovered = await onRequest(requestContext("/api/themes/active"));

    expect(invalid.status).toBe(502);
    expect(failed.status).toBe(502);
    expect(recovered.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not buffer or share a body larger than the bounded response limit", async () => {
    const oversized = JSON.stringify({ payload: "x".repeat(1024 * 1024 + 1) });
    const fetchMock = vi.fn().mockResolvedValue(new Response(oversized, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=30",
        "x-sabq-public-cache": "1",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(requestContext("/api/themes/active?case=oversized"));

    expect(response.status).toBe(200);
    expect(cache.put).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds a hanging origin body and cancels the original stream", async () => {
    vi.useFakeTimers();
    try {
      const body = new ReadableStream<Uint8Array>({ start() {} });
      const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=30",
          "x-sabq-public-cache": "1",
        },
      }));
      vi.stubGlobal("fetch", fetchMock);

      const pending = onRequest(requestContext("/api/themes/active?case=hanging-body"));
      await vi.advanceTimersByTimeAsync(10_200);
      const response = await pending;

      expect(response.status).toBe(502);
      expect(cache.put).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects unkeyed Vary dimensions and reflected CORS origins", async () => {
    const varied = apiResponse({ varied: true });
    varied.headers.set("vary", "Accept-Language");
    const reflected = apiResponse({ reflected: true });
    reflected.headers.set("access-control-allow-origin", "https://reader.example");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(varied.clone())
      .mockResolvedValueOnce(varied.clone())
      .mockResolvedValueOnce(reflected.clone())
      .mockResolvedValueOnce(reflected.clone());
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      onRequest(requestContext("/api/themes/active?vary=1")),
      onRequest(requestContext("/api/themes/active?vary=1")),
    ]);
    await Promise.all([
      onRequest(requestContext("/api/themes/active?cors=1")),
      onRequest(requestContext("/api/themes/active?cors=1")),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("allows the Kings language dimension when it is part of the normalized key", async () => {
    const varied = apiResponse({ lang: "en" });
    varied.headers.set("vary", "Accept-Language");
    const fetchMock = vi.fn().mockResolvedValue(varied.clone());
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      onRequest(requestContext("/api/kings-cup/overview", { "accept-language": "en-US" })),
      onRequest(requestContext("/api/kings-cup/overview", { "accept-language": "en-US" })),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("keys and validates the CORS Origin dimension exactly", async () => {
    const fetchMock = vi.fn((_target: string, init: RequestInit) => {
      const origin = new Headers(init.headers).get("origin") || "";
      const response = apiResponse({ origin: origin || "none" });
      response.headers.set("vary", "Origin");
      if (origin) response.headers.set("access-control-allow-origin", origin);
      return Promise.resolve(response);
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      onRequest(requestContext("/api/themes/active?cors-dimension=absent")),
      onRequest(requestContext("/api/themes/active?cors-dimension=absent")),
    ]);
    await Promise.all([
      onRequest(requestContext("/api/themes/active?cors-dimension=foo", { origin: "https://foo.example" })),
      onRequest(requestContext("/api/themes/active?cors-dimension=foo", { origin: "https://foo.example" })),
    ]);
    await Promise.all([
      onRequest(requestContext("/api/themes/active?cors-dimension=bar", { origin: "https://bar.example" })),
      onRequest(requestContext("/api/themes/active?cors-dimension=bar", { origin: "https://bar.example" })),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cache.put).toHaveBeenCalledTimes(3);
    const absent = newPublicApiCacheKey(new Request("https://sabq.org/api/themes/active"));
    const foo = newPublicApiCacheKey(new Request("https://sabq.org/api/themes/active", {
      headers: { origin: "https://foo.example" },
    }));
    const bar = newPublicApiCacheKey(new Request("https://sabq.org/api/themes/active", {
      headers: { origin: "https://bar.example" },
    }));
    expect(new Set([absent.url, foo.url, bar.url]).size).toBe(3);
  });

  it("keeps every query parameter and separates Kings language variants", () => {
    const themes = newPublicApiCacheKey(new Request(
      "https://sabq.org/api/themes/active?scope=homepage&v=2",
    ));
    expect(new URL(themes.url).searchParams.get("scope")).toBe("homepage");
    expect(new URL(themes.url).searchParams.get("v")).toBe("2");
    expect(new URL(themes.url).searchParams.get("__sabq_public_v")).toBe("1");
    expect(new URL(themes.url).searchParams.get("__sabq_origin")).toBe("absent");
    expect(newPublicApiPolicy(new Request("https://sabq.org/api/articles/a/comments"))?.ttl).toBe(15);
    expect(newPublicApiPolicy(new Request("https://sabq.org/api/system/dms-top-ads"))?.ttl).toBe(15);
    expect(newPublicApiPolicy(new Request("https://sabq.org/api/themes/active"))?.ttl).toBe(30);
    expect(newPublicApiPolicy(new Request("https://sabq.org/api/kings-cup/overview"))?.ttl).toBe(5);

    const en = newPublicApiCacheKey(new Request("https://sabq.org/api/kings-cup/overview", {
      headers: { "accept-language": "en-US,en;q=0.8" },
    }));
    const ar = newPublicApiCacheKey(new Request("https://sabq.org/api/kings-cup/overview", {
      headers: { "accept-language": "ar-SA,ar;q=0.8" },
    }));
    expect(en.url).not.toBe(ar.url);
    expect(newPublicApiPolicy(new Request("https://sabq.org/api/kings-cup/overview?resilient=1"))).toBeNull();
    expect(newPublicApiPolicy(new Request("https://sabq.org/api/kings-cup/overview", { method: "HEAD" }))).toBeNull();
  });
});
