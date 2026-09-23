import { describe, expect, it } from "vitest";
import { NOINDEX_EXACT, NOINDEX_PREFIXES } from "../../server/utils/noindexPaths";
// @ts-expect-error Pages JS is untyped
import { apiCacheKey, isNoindexPrefix } from "../../functions/_middleware.js";
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
