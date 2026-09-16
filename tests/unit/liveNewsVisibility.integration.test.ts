import express from "express";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
// Exercise the route and actual SQL; cache expiration is outside this suite.
vi.mock("../../server/memoryCache", () => ({
  withSWR: (_key: string, _fresh: number, _stale: number, fetcher: () => Promise<unknown>) => fetcher(),
}));
import router from "../../server/routes/liveNews";

const url = process.env.LIVE_NEWS_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("Live news integration tests require local PostgreSQL");
}

describe.skipIf(!url)("live news homepage visibility", () => {
  let client: Client;
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    // Session-local tables shadow public tables and disappear on disconnect.
    await client.query(`
      CREATE TEMP TABLE articles (
        id varchar, title text, subtitle text, slug text, image_url text,
        image_focal_point jsonb, published_at timestamp, updated_at timestamp,
        news_type text, category_id varchar, views integer, content text,
        status text, hide_from_homepage boolean NOT NULL DEFAULT false
      );
      CREATE TEMP TABLE categories (id varchar, name_ar text, color text);
      CREATE TEMP TABLE comments (article_id varchar, status text);
    `);
    state.db = drizzle(client);
    const app = express();
    app.use(router);
    server = await new Promise<Server>(resolve => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(async () => {
    await client.query(`TRUNCATE pg_temp.articles, pg_temp.comments;
      INSERT INTO pg_temp.articles (id, title, slug, published_at, news_type, status, hide_from_homepage) VALUES
      ('hidden-breaking', 'مخفي عاجل', 'hidden-breaking', '2026-09-08 12:00', 'breaking', 'published', true),
      ('draft', 'مسودة', 'draft', '2026-09-08 11:00', 'breaking', 'draft', false),
      ('visible-breaking', 'ظاهر عاجل', 'visible-breaking', '2026-09-08 10:00', 'breaking', 'published', false),
      ('hidden-regular', 'مخفي عادي', 'hidden-regular', '2026-09-08 09:00', 'regular', 'published', true),
      ('visible-regular', 'ظاهر عادي', 'visible-regular', '2026-09-08 08:00', 'regular', 'published', false),
      ('older-breaking', 'عاجل أقدم', 'older-breaking', '2026-09-08 07:00', 'breaking', 'published', false),
      ('undated', 'بلا تاريخ', 'undated', NULL, 'breaking', 'published', false);
      INSERT INTO pg_temp.comments VALUES ('visible-breaking', 'approved'), ('visible-breaking', 'pending');
    `);
  });
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (client) await client.end();
  });
  const get = async (path: string) => {
    const response = await fetch(origin + path);
    expect(response.status).toBe(200);
    return response.json();
  };

  it("fills pages with visible articles and paginates without hidden items", async () => {
    const first = await get("/api/live/updates?limit=2");
    expect(first.items.map((item: { id: string }) => item.id)).toEqual(["visible-breaking", "visible-regular"]);
    expect(first.items[0].commentsCount).toBe(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await get(`/api/live/updates?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`);
    expect(second.items.map((item: { id: string }) => item.id)).toEqual(["older-breaking"]);
    expect(second.nextCursor).toBeNull();
  });
  it.each(["/api/live/updates?filter=breaking", "/api/live/breaking"])("excludes hidden breaking news from %s", async path => {
    const response = await get(path);
    expect(response.items.map((item: { id: string }) => item.id)).toEqual(["visible-breaking", "older-breaking"]);
  });
  it("does not offer another page when all articles are hidden", async () => {
    await client.query("UPDATE pg_temp.articles SET hide_from_homepage = true");
    expect(await get("/api/live/updates?limit=2")).toEqual({ items: [], nextCursor: null });
  });
  it("includes an article again when the editor clears the hide flag", async () => {
    await client.query("UPDATE pg_temp.articles SET hide_from_homepage = false WHERE id = 'hidden-breaking'");
    const response = await get("/api/live/updates?limit=2");
    expect(response.items[0].id).toBe("hidden-breaking");
  });
});
