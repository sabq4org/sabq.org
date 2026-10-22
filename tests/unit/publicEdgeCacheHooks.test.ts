import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { markPublicEdgeCache, publicEdgeCacheTtl } from "../../server/routes/publicEdgeCacheHooks";
// @ts-expect-error Worker JS is untyped
import { newPublicApiPolicy } from "../../cloudflare-worker/public-api-burst-cache.js";

function req(path: string, opts: { method?: string; headers?: Record<string, string>; query?: Record<string, string> } = {}) {
  return { method: opts.method ?? "GET", path, headers: opts.headers ?? {}, query: opts.query ?? {} } as unknown as Request;
}

describe("public edge cache marker", () => {
  it("marks anonymous reads of the listed routes", () => {
    expect(publicEdgeCacheTtl(req("/api/v1/homepage"))).toBe(15);
    expect(publicEdgeCacheTtl(req("/api/opinion", { query: { page: "1" } }))).toBe(60);
    expect(publicEdgeCacheTtl(req("/api/opinion/related/category/abc"))).toBe(60);
    expect(publicEdgeCacheTtl(req("/api/v1/articles"))).toBe(0);
  });

  it("never marks identified, fresh or non-GET requests", () => {
    expect(publicEdgeCacheTtl(req("/api/v1/homepage", { headers: { authorization: "Bearer x" } }))).toBe(0);
    expect(publicEdgeCacheTtl(req("/api/v1/homepage", { headers: { "x-session-id": "s" } }))).toBe(0);
    expect(publicEdgeCacheTtl(req("/api/opinion", { headers: { cookie: "connect.sid=s%3Aabc" } }))).toBe(0);
    expect(publicEdgeCacheTtl(req("/api/v1/homepage", { headers: { "cache-control": "no-cache" } }))).toBe(0);
    expect(publicEdgeCacheTtl(req("/api/v1/homepage", { query: { refresh: "1" } }))).toBe(0);
    expect(publicEdgeCacheTtl(req("/api/opinion", { method: "POST" }))).toBe(0);
  });

  it("sets the shared-cache contract the Worker requires", () => {
    const set = vi.fn();
    const next = vi.fn();
    markPublicEdgeCache(req("/api/stories"), { set } as unknown as Response, next);
    expect(set).toHaveBeenCalledWith("Cache-Control", "public, max-age=0, s-maxage=60");
    expect(set).toHaveBeenCalledWith("X-Sabq-Public-Cache", "1");
    expect(next).toHaveBeenCalledOnce();
  });

  it("is mirrored by the Worker burst-cache route list", () => {
    for (const path of ["/api/v1/homepage", "/api/v1/news/paginated", "/api/v1/trending", "/api/opinion",
      "/api/opinion/related/category/abc", "/api/stories", "/api/muqtarab/topics/featured", "/api/economy/snapshot"]) {
      expect(newPublicApiPolicy(new Request(`https://api.sabq.org${path}`)), path).not.toBeNull();
    }
    expect(newPublicApiPolicy(new Request("https://api.sabq.org/api/v1/homepage", { headers: { authorization: "Bearer x" } }))).toBeNull();
  });
});
