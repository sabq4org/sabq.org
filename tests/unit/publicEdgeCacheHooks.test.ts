import { describe, expect, it, vi } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/rbac", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  logActivity: async () => {},
}));

import { markPublicEdgeCache, publicEdgeCacheTtl } from "../../server/routes/publicEdgeCacheHooks";
import { DEFAULT_STORIES_LIMIT, MAX_STORIES_LIMIT, type StoryListRootArticle } from "../../server/services/storyListService";
import * as storyListService from "../../server/services/storyListService";
import { registerStoryRoutes } from "../../server/routes/stories";
// @ts-expect-error Worker JS is untyped
import { NEW_PUBLIC_API_MAX_BODY_BYTES, newPublicApiPolicy } from "../../cloudflare-worker/public-api-burst-cache.js";

function req(path: string, opts: { method?: string; headers?: Record<string, string>; query?: Record<string, string> } = {}) {
  return { method: opts.method ?? "GET", path, headers: opts.headers ?? {}, query: opts.query ?? {} } as unknown as Request;
}

describe("public edge cache marker", () => {
  it("marks anonymous reads of the listed routes", () => {
    expect(publicEdgeCacheTtl(req("/api/v1/homepage"))).toBe(15);
    expect(publicEdgeCacheTtl(req("/api/v1/news/paginated"))).toBe(15);
    expect(publicEdgeCacheTtl(req("/api/v1/live"))).toBe(15);
    expect(publicEdgeCacheTtl(req("/api/v1/articles"))).toBe(15);
    expect(publicEdgeCacheTtl(req("/api/v1/sections"))).toBe(300);
    expect(publicEdgeCacheTtl(req("/api/v1/trending"))).toBe(60);
    expect(publicEdgeCacheTtl(req("/api/homepage"))).toBe(60);
    expect(publicEdgeCacheTtl(req("/api/categories"))).toBe(60);
    expect(publicEdgeCacheTtl(req("/api/sports/competitions"))).toBe(300);
    expect(publicEdgeCacheTtl(req("/api/opinion", { query: { page: "1" } }))).toBe(60);
    expect(publicEdgeCacheTtl(req("/api/opinion/related/category/abc"))).toBe(60);
    expect(publicEdgeCacheTtl(req("/api/v1/members/profile"))).toBe(0);
  });

  it("never marks identified, fresh or non-GET requests", () => {
    expect(publicEdgeCacheTtl(req("/api/v1/homepage", { headers: { authorization: "Bearer x" } }))).toBe(0);
    expect(publicEdgeCacheTtl(req("/api/v1/live", { headers: { authorization: "Bearer x" } }))).toBe(0);
    expect(publicEdgeCacheTtl(req("/api/v1/articles", { headers: { authorization: "Bearer x" } }))).toBe(0);
    expect(publicEdgeCacheTtl(req("/api/v1/sections", { headers: { "x-session-id": "s" } }))).toBe(0);
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

  it("is mirrored by the Worker burst-cache route list and 4 MiB body ceiling", () => {
    expect(NEW_PUBLIC_API_MAX_BODY_BYTES).toBe(4 * 1024 * 1024);
    for (const path of [
      "/api/v1/homepage",
      "/api/v1/news/paginated",
      "/api/v1/live",
      "/api/v1/articles",
      "/api/v1/sections",
      "/api/v1/trending",
      "/api/homepage",
      "/api/categories",
      "/api/sports/competitions",
      "/api/opinion",
      "/api/opinion/related/category/abc",
      "/api/stories",
      "/api/muqtarab/topics/featured",
      "/api/economy/snapshot",
    ]) {
      expect(newPublicApiPolicy(new Request(`https://api.sabq.org${path}`)), path).not.toBeNull();
    }
    expect(newPublicApiPolicy(new Request("https://api.sabq.org/api/v1/homepage", { headers: { authorization: "Bearer x" } }))).toBeNull();
  });

  it("paginates GET /api/stories (default 30, max 100, offset/page) and returns slim rootArticle array", async () => {
    expect(DEFAULT_STORIES_LIMIT).toBe(30);
    expect(MAX_STORIES_LIMIT).toBe(100);

    const slimRoot: StoryListRootArticle = {
      id: "art-1",
      slug: "story-root",
      title: "عنوان القصة",
      imageUrl: "https://media.sabq.org/news/test.webp",
    };
    const spy = vi.spyOn(storyListService, "getActiveStoriesForList").mockImplementation(async (opts) => [
      {
        id: `story-${opts?.limit}-${opts?.offset}`,
        slug: "s-1",
        title: "قصة",
        rootArticleId: "art-1",
        entities: null,
        tags: [],
        status: "active",
        createdAt: new Date("2026-10-23T00:00:00Z"),
        rootArticle: slimRoot,
        articlesCount: 3,
        followersCount: 0,
      },
    ]);

    const app = express();
    registerStoryRoutes(app);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("server failed to bind");
    const base = `http://127.0.0.1:${addr.port}`;

    try {
      const defaultRes = await fetch(`${base}/api/stories`);
      expect(defaultRes.status).toBe(200);
      const defaultBody = await defaultRes.json();
      expect(Array.isArray(defaultBody)).toBe(true);
      expect(spy).toHaveBeenLastCalledWith({ limit: 30, offset: 0 });
      expect(Object.keys(defaultBody[0].rootArticle).sort()).toEqual(["id", "imageUrl", "slug", "title"]);

      const cappedRes = await fetch(`${base}/api/stories?limit=500&page=2`);
      expect(cappedRes.status).toBe(200);
      expect(spy).toHaveBeenLastCalledWith({ limit: 100, offset: 100 });

      const offsetRes = await fetch(`${base}/api/stories?limit=25&offset=50`);
      expect(offsetRes.status).toBe(200);
      expect(spy).toHaveBeenLastCalledWith({ limit: 25, offset: 50 });

      const negRes = await fetch(`${base}/api/stories?limit=-1`);
      expect(negRes.status).toBe(400);
    } finally {
      spy.mockRestore();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
