import express from "express";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

const { execute, getOrBuildSitemapXml } = vi.hoisted(() => ({
  execute: vi.fn(() => { throw new Error("unexpected database query"); }),
  getOrBuildSitemapXml: vi.fn(async (_key: string, _ttl: number, build: () => Promise<string>) => build()),
}));
vi.mock("../../server/db", () => ({ db: { execute } }));
vi.mock("../../server/services/sitemapCacheService", () => ({ getOrBuildSitemapXml }));
import { createSitemapIndexHandler, SITEMAP_INDEX_CACHE_KEY } from "../../server/routes/sitemapIndex";

let server: Server | undefined;
afterEach(() => { server?.close(); vi.clearAllMocks(); });

describe("sitemap index handler", () => {
  it("returns every child in order without lastmod or a database query", async () => {
    const app = express();
    app.get("/sitemap.xml", createSitemapIndexHandler({ ar: 500, en: 10, ur: 10 }));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing server address");
    const response = await fetch(`http://127.0.0.1:${address.port}/sitemap.xml`);
    const xml = await response.text();
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    const expected = ["sitemap-static.xml", "sitemap-mawaeed.xml", "sitemap-categories.xml", "sitemap-news.xml", ...Array.from({ length: 500 }, (_, i) => `sitemap-articles-${i + 1}.xml`), ...Array.from({ length: 10 }, (_, i) => `sitemap-en-articles-${i + 1}.xml`), ...Array.from({ length: 10 }, (_, i) => `sitemap-ur-articles-${i + 1}.xml`)].map(path => `https://sabq.org/${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=1800, s-maxage=1800");
    expect(locations).toEqual(expected);
    expect(xml).not.toContain("<lastmod>");
    expect(getOrBuildSitemapXml).toHaveBeenCalledWith(SITEMAP_INDEX_CACHE_KEY, 1800000, expect.any(Function));
    expect(SITEMAP_INDEX_CACHE_KEY).toBe("index_archive_v4");
    expect(execute).not.toHaveBeenCalled();
    expect(readFileSync("server/services/botDraftPublishEffects.ts", "utf8")).toContain(`"${SITEMAP_INDEX_CACHE_KEY}"`);
  });
});
