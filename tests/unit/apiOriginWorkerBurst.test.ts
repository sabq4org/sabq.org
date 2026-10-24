import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiOriginWorker from "../../cloudflare-worker/api-origin-worker.js";

const apiResponse = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30",
      "x-sabq-public-cache": "1",
    },
  });

const request = (path: string, init?: RequestInit) =>
  new Request(`https://api.sabq.org${path}`, {
    ...init,
    headers: {
      "cf-connecting-ip": "203.0.113.10",
      ...(init?.headers || {}),
    },
  });

describe("api-origin-worker public API burst guard", () => {
  const cache = {
    match: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  const env = {
    EDGE_PROXY_SHARED_SECRET: "test-secret",
    API_ORIGIN: "https://railway.example",
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

  it("coalesces 1000 anonymous cold requests to one signed origin fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiResponse({ ads: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = { waitUntil: vi.fn() };

    const responses = await Promise.all(
      Array.from({ length: 1000 }, () =>
        apiOriginWorker.fetch(request("/api/system/dms-top-ads?burst=1000"), env, ctx),
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const signed = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(signed.get("x-sabq-client-ip")).toBe("203.0.113.10");
    expect(signed.get("x-sabq-proxy-timestamp")).toBeTruthy();
    expect(signed.get("x-sabq-proxy-signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(cache.put).toHaveBeenCalledTimes(1);
    const stored = new URL((cache.put.mock.calls[0][0] as Request).url);
    expect(stored.hostname).toBe("api.sabq.org");
    expect(stored.searchParams.has("__sabq_edge_host")).toBe(false);
    expect((cache.match.mock.calls[0][0] as Request).url).toBe(stored.toString());
  });

  it("shares sanitized 502 failures within the burst and recovers on the next request", async () => {
    const cancel = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), {
      status: 503,
      headers: { "set-cookie": "synthetic-private-cookie=1" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = { waitUntil: vi.fn() };

    const failed = await Promise.all(
      Array.from({ length: 1000 }, () =>
        apiOriginWorker.fetch(request("/api/themes/active?burst=failure"), env, ctx),
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(failed.every((response) => response.status === 502)).toBe(true);
    expect(failed.every((response) => !response.headers.has("set-cookie"))).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cache.put).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(apiResponse({ recovered: true }));
    const recovered = await apiOriginWorker.fetch(request("/api/themes/active?burst=failure"), env, ctx);
    expect(recovered.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds a cached-path header stall and clears the flight for recovery", async () => {
    const fetchMock = vi.fn((_target: string, init: RequestInit) => {
      expect(init.signal).toBeTruthy();
      return Promise.reject(new DOMException("header stall", "AbortError"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = { waitUntil: vi.fn() };

    const failed = await apiOriginWorker.fetch(request("/api/themes/active?burst=stall"), env, ctx);

    expect(failed.status).toBe(502);
    // One first attempt plus one stall retry (STALL_RETRIES = 1).
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValueOnce(apiResponse({ recovered: true }));
    const recovered = await apiOriginWorker.fetch(request("/api/themes/active?burst=stall"), env, ctx);
    expect(recovered.status).toBe(200);
  });

  it("does not coalesce auth, writes, or SSE responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse({ auth: 1 }))
      .mockResolvedValueOnce(apiResponse({ auth: 2 }))
      .mockResolvedValueOnce(new Response("written", { status: 201 }))
      .mockResolvedValueOnce(new Response("written", { status: 201 }))
      .mockResolvedValueOnce(new Response("data: one\n\n", {
        headers: { "content-type": "text/event-stream" },
      }))
      .mockResolvedValueOnce(new Response("data: two\n\n", {
        headers: { "content-type": "text/event-stream" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = { waitUntil: vi.fn() };

    await Promise.all([
      apiOriginWorker.fetch(request("/api/themes/active?auth=1", { headers: { cookie: "_ga=GA1.1; connect.sid=s%3Aabc" } }), env, ctx),
      apiOriginWorker.fetch(request("/api/themes/active?auth=1", { headers: { authorization: "Bearer 1" } }), env, ctx),
    ]);
    await Promise.all([
      apiOriginWorker.fetch(request("/api/system/dms-top-ads?write=1", { method: "POST", body: "{}" }), env, ctx),
      apiOriginWorker.fetch(request("/api/system/dms-top-ads?write=1", { method: "POST", body: "{}" }), env, ctx),
    ]);
    await Promise.all([
      apiOriginWorker.fetch(request("/api/system/dms-top-ads?stream=1"), env, ctx),
      apiOriginWorker.fetch(request("/api/system/dms-top-ads?stream=1"), env, ctx),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls[2][1].method).toBe("POST");
    expect(fetchMock.mock.calls[2][1].body).toBeTruthy();
    expect(fetchMock.mock.calls[4][1].method).toBe("GET");
  });

  it("caches a read that carries only analytics or consent cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiResponse({ theme: "light" }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = { waitUntil: vi.fn() };

    await Promise.all(
      ["_ga=GA1.1.1; _gid=GA1.1.2", "cookie_consent=yes", "accessibility_session=abc"].map((cookie) =>
        apiOriginWorker.fetch(request("/api/themes/active?cookies=analytics", { headers: { cookie } }), env, ctx),
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
    const forwarded = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(forwarded.has("cookie")).toBe(true);
  });

  it("isolates reflected CORS origins while accepting the worker's Vary header", async () => {
    const fetchMock = vi.fn((_target: string, init: RequestInit) => {
      const origin = new Headers(init.headers).get("origin") || "";
      const response = apiResponse({ origin: origin || "absent" });
      response.headers.set("vary", "Origin");
      if (origin) response.headers.set("access-control-allow-origin", origin);
      return Promise.resolve(response);
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = { waitUntil: vi.fn() };

    await Promise.all([
      apiOriginWorker.fetch(request("/api/themes/active?cors=foo", { headers: { origin: "https://foo.example" } }), env, ctx),
      apiOriginWorker.fetch(request("/api/themes/active?cors=foo", { headers: { origin: "https://foo.example" } }), env, ctx),
    ]);
    await Promise.all([
      apiOriginWorker.fetch(request("/api/themes/active?cors=bar", { headers: { origin: "https://bar.example" } }), env, ctx),
      apiOriginWorker.fetch(request("/api/themes/active?cors=bar", { headers: { origin: "https://bar.example" } }), env, ctx),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cache.put).toHaveBeenCalledTimes(2);
  });

  it("keeps live-score reads apart by answer language and honours the origin's live TTL", async () => {
    const fetchMock = vi.fn((target: string, init: RequestInit) => {
      const lang = (new Headers(init.headers).get("accept-language") || "").startsWith("en") ? "en" : "ar";
      const response = apiResponse({ lang });
      response.headers.set("cache-control", "public, max-age=0, s-maxage=5, stale-while-revalidate=15");
      // Only /api/sports/* answers per language (server/routes/sports.ts).
      response.headers.set("vary", String(target).includes("/api/sports/") ? "Origin, Accept-Language" : "Origin");
      return Promise.resolve(response);
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = { waitUntil: vi.fn() };

    const ar = await apiOriginWorker.fetch(request("/api/sports/today"), env, ctx);
    const en = await apiOriginWorker.fetch(request("/api/sports/today", { headers: { "accept-language": "en-US" } }), env, ctx);
    const hero = await apiOriginWorker.fetch(request("/api/rsl/hero"), env, ctx);

    expect(await ar.json()).toEqual({ lang: "ar" });
    expect(await en.json()).toEqual({ lang: "en" });
    expect(hero.status).toBe(200);
    expect(cache.put).toHaveBeenCalledTimes(3);
    const keys = cache.put.mock.calls.map(([key]) => new URL((key as Request).url));
    expect(keys[0].searchParams.get("__sabq_sports_lang")).toBe("ar");
    expect(keys[1].searchParams.get("__sabq_sports_lang")).toBe("en");
    for (const [, stored] of cache.put.mock.calls) {
      expect((stored as Response).headers.get("cache-control")).toContain("s-maxage=5");
    }
  });

  it("does not store a live-score read the origin marks no-store", async () => {
    const fetchMock = vi.fn(() => {
      const response = apiResponse({ today: [] });
      response.headers.set("cache-control", "no-store");
      return Promise.resolve(response);
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = { waitUntil: vi.fn() };

    const res = await apiOriginWorker.fetch(request("/api/sports/today?resilient=1"), env, ctx);
    expect(res.status).toBe(200);
    expect(cache.put).not.toHaveBeenCalled();
  });
});
