// /api/en/live/* على PostgreSQL محلي بجداول مؤقتة للجلسة (تختفي عند قطع الاتصال).
// EN_BOT_DRAFTS_TEST_URL يجب أن يكون localhost.
import express from "express";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/memoryCache", () => ({
  withSWR: (_key: string, _fresh: number, _stale: number, fetcher: () => Promise<unknown>) => fetcher(),
}));
import router from "../../server/routes/enLiveNews";

const url = process.env.EN_BOT_DRAFTS_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("Local database only");
}

type Item = { id: string; isBreaking: boolean };
const ids = (items: Item[]) => items.map((i) => i.id);

describe.skipIf(!url)("English live news against PostgreSQL", () => {
  let client: Client;
  let server: Server;
  let origin = "";

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query(`
      CREATE TEMP TABLE en_articles (
        id varchar, title text, subtitle text, slug text, english_slug text, image_url text,
        image_focal_point jsonb, published_at timestamp, updated_at timestamp,
        news_type text, category_id varchar, views integer, excerpt text, content text,
        status text, hide_from_homepage boolean NOT NULL DEFAULT false
      );
      CREATE TEMP TABLE en_categories (id varchar, name text, color text, status text);
      CREATE TEMP TABLE en_comments (article_id varchar, status text);
      INSERT INTO en_categories VALUES ('cat-saudi', 'Saudi', '#0a0', 'active'), ('cat-world', 'World', NULL, 'active');
      INSERT INTO en_articles (id, title, slug, english_slug, published_at, news_type, category_id, status, hide_from_homepage, content) VALUES
        ('b1', 'Breaking one', 'b1', 'breaking-one', '2026-11-16 12:00', 'breaking', 'cat-saudi', 'published', false, '<p>b1</p>'),
        ('draft-b', 'Draft breaking', 'draft-b', NULL, '2026-11-16 11:30', 'breaking', 'cat-saudi', 'draft', false, 'x'),
        ('hidden', 'Hidden', 'hidden', NULL, '2026-11-16 11:15', 'breaking', 'cat-world', 'published', true, 'x'),
        ('r1', 'Regular one', 'r1', NULL, '2026-11-16 11:00', 'regular', 'cat-world', 'published', false, 'x'),
        ('r2', 'Regular two', 'r2', 'regular-two', '2026-11-16 10:00', 'regular', 'cat-saudi', 'published', false, 'x'),
        ('b2', 'Breaking two', 'b2', NULL, '2026-11-16 09:00', 'breaking', 'cat-world', 'published', false, 'x'),
        ('r3', 'Regular three', 'r3', NULL, '2026-11-16 08:00', 'regular', NULL, 'published', false, 'x'),
        ('sched', 'Scheduled', 'sched', NULL, NULL, 'breaking', 'cat-saudi', 'scheduled', false, 'x'),
        ('undated', 'Undated', 'undated', NULL, NULL, 'regular', NULL, 'published', false, 'x');
      INSERT INTO en_comments VALUES ('b1', 'approved'), ('b1', 'approved'), ('b1', 'pending'), ('r2', 'approved');
    `);
    state.db = drizzle(client);
    const app = express();
    app.use(router);
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (client) await client.end();
  });

  const get = async (path: string) => {
    const res = await fetch(`${origin}${path}`);
    return { status: res.status, body: await res.json(), headers: res.headers };
  };

  it("lists only published, dated, visible EN rows newest first", async () => {
    const { status, body, headers } = await get("/api/en/live/updates?limit=20");
    expect(status).toBe(200);
    expect(headers.get("cache-control")).toContain("max-age=30");
    expect(ids(body.items)).toEqual(["b1", "r1", "r2", "b2", "r3"]);
    expect(body.nextCursor).toBeNull();
    expect(body.items[0]).toMatchObject({
      englishSlug: "breaking-one",
      categoryName: "Saudi",
      categoryColor: "#0a0",
      isBreaking: true,
      commentsCount: 2,
    });
    expect(body.items[2].commentsCount).toBe(1);
    expect(body.items[4].categoryName).toBe("Uncategorized");
  });

  it("breaking filter and /breaking return breaking rows only", async () => {
    const filtered = await get("/api/en/live/updates?filter=breaking");
    expect(ids(filtered.body.items)).toEqual(["b1", "b2"]);
    const strip = await get("/api/en/live/breaking");
    expect(strip.status).toBe(200);
    expect(ids(strip.body.items)).toEqual(["b1", "b2"]);
    expect(strip.body.items.every((i: Item) => i.isBreaking)).toBe(true);
  });

  it("paginates with the cursor without gaps or repeats", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const { status, body } = await get(`/api/en/live/updates?limit=2${qs}`);
      expect(status).toBe(200);
      seen.push(...ids(body.items));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual(["b1", "r1", "r2", "b2", "r3"]);
  });

  it("filters by category id", async () => {
    const saudi = await get("/api/en/live/updates?category=cat-saudi");
    expect(ids(saudi.body.items)).toEqual(["b1", "r2"]);
    const world = await get("/api/en/live/updates?category=cat-world&filter=breaking");
    expect(ids(world.body.items)).toEqual(["b2"]);
  });

  it("rejects malformed cursor, category and limit", async () => {
    expect((await get("/api/en/live/updates?cursor=not-a-date")).status).toBe(400);
    expect((await get("/api/en/live/updates?category=a%20b")).status).toBe(400);
    expect((await get("/api/en/live/updates?limit=-1")).status).toBe(400);
  });
});
