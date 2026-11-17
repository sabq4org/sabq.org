import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sitemap index", () => {
  it("keeps all child URLs in order without fabricated lastmod or a database query", async () => {
    const source = readFileSync("server/routes.ts", "utf8");
    const start = source.indexOf('  app.get("/sitemap.xml"');
    const end = source.indexOf('  app.get("/sitemap-static.xml"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const route = source.slice(start, end).replace("indexXml as string", "indexXml");
    let handler: (req: unknown, res: any) => Promise<void> = async () => { throw new Error("route not registered"); };
    let cacheKey = "";
    const db = { execute: () => { throw new Error("index queried database"); } };
    const app = { get: (_path: string, fn: typeof handler) => { handler = fn; } };
    const cache = async (key: string, _ttl: number, build: () => Promise<string>) => { cacheKey = key; return build(); };
    new Function("app", "getOrBuildSitemapXml", "SITEMAP_AR_BUCKETS", "SITEMAP_EN_BUCKETS", "SITEMAP_UR_BUCKETS", "db", route)(app, cache, 500, 10, 10, db);
    let xml = "";
    const res = { header: () => {}, setHeader: () => {}, send: (body: string) => { xml = body; }, status: () => { throw new Error("route failed"); } };
    await handler({}, res);
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    const expected = ["sitemap-static.xml", "sitemap-mawaeed.xml", "sitemap-categories.xml", "sitemap-news.xml", ...Array.from({ length: 500 }, (_, i) => `sitemap-articles-${i + 1}.xml`), ...Array.from({ length: 10 }, (_, i) => `sitemap-en-articles-${i + 1}.xml`), ...Array.from({ length: 10 }, (_, i) => `sitemap-ur-articles-${i + 1}.xml`)].map(path => `https://sabq.org/${path}`);
    expect(locations).toEqual(expected);
    expect(xml).not.toContain("<lastmod>");
    expect(cacheKey).toBe("index_archive_v4");
    expect(readFileSync("server/services/botDraftPublishEffects.ts", "utf8")).toContain('"index_archive_v4"');
  });
});
