import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Pages middleware has no TypeScript declaration.
import { isEdgeNotFoundMeta, onRequest } from "../../functions/_middleware.js";

// Minimal HTMLRewriter stand-in: the Pages runtime provides the real one; the
// status/header decision under test does not depend on the rewrite itself.
class PassThroughRewriter {
  on() { return this; }
  transform(res: Response) { return res; }
}

const put = vi.fn();
const fetcher = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  put.mockResolvedValue(undefined);
  vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put } });
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("HTMLRewriter", PassThroughRewriter);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function request(path: string, meta: Record<string, unknown>, shell?: Response) {
  fetcher.mockImplementation((target: string) => Promise.resolve(Response.json(
    String(target).includes("/slug-redirect") ? {} : meta,
  )));
  const next = vi.fn(async () => shell ?? new Response("<html><head></head><body><div id=\"root\"></div></body></html>", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  }));
  return onRequest({
    request: new Request(`https://sabq.org${path}`, { headers: { "User-Agent": "Mozilla/5.0" } }),
    env: { EDGE_SEO: "on", CF_PAGES_COMMIT_SHA: "abc" },
    next,
    waitUntil: vi.fn(),
  });
}

describe("edge soft-404 guard", () => {
  it("recognises only an explicit 404 meta", () => {
    expect(isEdgeNotFoundMeta({ status: 404 })).toBe(true);
    expect(isEdgeNotFoundMeta({ robots: "noindex, follow" })).toBe(false);
    expect(isEdgeNotFoundMeta(null)).toBe(false);
  });

  it("serves an unknown route as a real, uncached, noindex 404", async () => {
    const res = await request("/this-page-does-not-exist-xyz123", {
      title: "الصفحة غير موجودة | سبق", robots: "noindex, follow", status: 404,
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(res.headers.get("CDN-Cache-Control") || "").not.toMatch(/public/);
    // Only the metadata JSON may be cached, never the 404 HTML itself.
    const cachedKeys = put.mock.calls.map(([key]) => String(key instanceof Request ? key.url : key));
    expect(cachedKeys.filter((k) => k.includes("this-page-does-not-exist") && !k.includes("/api/edge/"))).toEqual([]);
  });

  it("keeps known routes at 200 and edge-cacheable", async () => {
    const res = await request("/about", { title: "من نحن — سبق", robots: "index,follow" });
    expect(res.status).toBe(200);
    expect(res.headers.get("CDN-Cache-Control")).toBe("public, max-age=60");
  });

  it("never turns a real static file into a 404", async () => {
    const manifest = new Response("{}", { headers: { "Content-Type": "application/manifest+json" } });
    const res = await request("/manifest.webmanifest", { status: 404 }, manifest);
    expect(res.status).toBe(200);
  });
});
