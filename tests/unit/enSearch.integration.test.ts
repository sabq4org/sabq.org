// GET /api/en/search على PostgreSQL محلي (EN_SEARCH_TEST_URL أو EN_BOT_DRAFTS_TEST_URL،
// localhost فقط). المخطط المؤقت يبقى بعد التشغيل مثل بقية *.integration.test.ts.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { enArticles, enCategories } from "@shared/schema";
import type { EnSearchResponse } from "@shared/enSearch";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/memoryCache", () => ({
  CACHE_TTL: { SHORT: 1 },
  withCache: (_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher(),
}));

import enSearchRouter from "../../server/routes/enSearch";

const url = process.env.EN_SEARCH_TEST_URL || process.env.EN_BOT_DRAFTS_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("Local database only");
}

const dialect = new PgDialect();
function ddlFor(table: PgTable): string {
  const config = getTableConfig(table);
  const columns = config.columns.map((col) => {
    let def = "";
    if (col.hasDefault && col.default !== undefined) {
      const value = col.default as any;
      if (value && typeof value === "object" && "queryChunks" in value) def = ` DEFAULT ${dialect.sqlToQuery(value).sql}`;
      else if (typeof value === "string") def = ` DEFAULT '${value.replace(/'/g, "''")}'`;
      else if (typeof value === "number" || typeof value === "boolean") def = ` DEFAULT ${value}`;
      else if (col.getSQLType() === "jsonb") def = ` DEFAULT '${JSON.stringify(value)}'::jsonb`;
    }
    return `"${col.name}" ${col.getSQLType()}${col.primary ? " PRIMARY KEY" : ""}${def}`;
  });
  return `CREATE TABLE "${config.name}" (${columns.join(", ")})`;
}

describe.skipIf(!url)("GET /api/en/search against PostgreSQL", () => {
  let pool: Pool;
  let base = "";
  const server = createServer();

  beforeAll(async () => {
    const schema = `en_search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = new Pool({ connectionString: url, max: 1 });
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
    } finally {
      await admin.end();
    }
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
    for (const table of [enCategories, enArticles]) await pool.query(ddlFor(table));
    state.db = drizzle(pool);

    await pool.query(`INSERT INTO en_categories (id, name, slug) VALUES ('cat-saudi', 'Saudi', 'saudi')`);
    const insert = (id: string, title: string, excerpt: string | null, status: string, minutesAgo: number, cat: string | null = "cat-saudi") =>
      pool.query(
        `INSERT INTO en_articles (id, title, slug, english_slug, content, excerpt, status, author_id, category_id, published_at)
         VALUES ($1, $2, $8, $3, '<p>body</p>', $4, $5, 'u1', $6, now() - ($7 || ' minutes')::interval)`,
        [id, title, `${id}-en`, excerpt, status, cat, String(minutesAgo), id],
      );
    await insert("a-title", "Riyadh Season opens new zone", "Visitors arrive", "published", 30);
    await insert("a-excerpt", "Tourism figures rise", "Riyadh Season drew record crowds", "published", 10, null);
    await insert("a-draft", "Riyadh Season draft", null, "draft", 5);
    await insert("a-pct", "Discount of 50% announced", null, "published", 40);
    for (let i = 0; i < 25; i++) await insert(`bulk-${i}`, `Market update ${i}`, null, "published", 100 + i);

    const app = express();
    app.use(enSearchRouter);
    server.on("request", app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (pool) await pool.end();
  });

  async function search(qs: string) {
    const res = await fetch(`${base}/api/en/search?${qs}`);
    return { res, body: (await res.json()) as EnSearchResponse };
  }

  it("matches title and excerpt, published only, title matches first, with category", async () => {
    const { res, body } = await search("q=riyadh%20SEASON");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
    expect(body.total).toBe(2);
    expect(body.articles.map((a) => a.id)).toEqual(["a-title", "a-excerpt"]);
    expect(body.articles[0]).toMatchObject({ englishSlug: "a-title-en", category: { name: "Saudi", slug: "saudi" } });
    expect(body.articles[1].category).toBeNull();
  });

  it("treats LIKE wildcards literally", async () => {
    expect((await search("q=50%25")).body.articles.map((a) => a.id)).toEqual(["a-pct"]);
    expect((await search("q=%25%25")).body.total).toBe(0);
  });

  it("paginates 20 per page and returns empty for too-short queries", async () => {
    const p1 = await search("q=market");
    expect(p1.body.total).toBe(25);
    expect(p1.body.articles).toHaveLength(20);
    const p2 = await search("q=market&page=2");
    expect(p2.body.page).toBe(2);
    expect(p2.body.articles).toHaveLength(5);
    const short = await search("q=m");
    expect(short.res.status).toBe(200);
    expect(short.body).toMatchObject({ articles: [], total: 0 });
  });
});
