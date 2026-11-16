// عدّاد قراءات الخبر الإنجليزي والحذف النهائي على PostgreSQL محلي.
// EN_BOT_DRAFTS_TEST_URL يجب أن يكون localhost.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { enArticles } from "@shared/schema";

const state = vi.hoisted(() => ({ db: null as any, ip: "1.1.1.1" }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/utils/trustedProxyIp", () => ({ getRealIp: () => state.ip }));

import viewsRouter from "../../server/routes/enArticleViews";
import { permanentlyDeleteArchivedEnArticles } from "../../server/services/enArticleDeletionService";

const url = process.env.EN_BOT_DRAFTS_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");

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

describe.skipIf(!url)("English article views and permanent delete", () => {
  let pool: Pool;
  let base = "";
  const server = createServer();
  const views = async (id: string) => (await pool.query(`SELECT views FROM en_articles WHERE id = $1`, [id])).rows[0]?.views;
  const post = (id: string) => fetch(`${base}/api/en/articles/${id}/view`, { method: "POST" }).then((r) => r.json());

  beforeAll(async () => {
    const schema = `en_views_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = new Pool({ connectionString: url, max: 1 });
    try { await admin.query(`CREATE SCHEMA ${schema}`); } finally { await admin.end(); }
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 2 });
    await pool.query(ddlFor(enArticles));
    state.db = drizzle(pool);
    for (const [id, status] of [["pub", "published"], ["draft", "draft"], ["arch-1", "archived"], ["arch-2", "archived"], ["live", "published"]]) {
      await pool.query(`INSERT INTO en_articles (id, title, slug, content, status, author_id, views) VALUES ($1::text, $1::text, $1::text, 'x', $2, 'u1', 0)`, [id, status]);
    }
    const app = express();
    app.use(viewsRouter);
    server.on("request", app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server.close(); await pool?.end(); });

  it("counts one view per visitor, with the 5-10 boost", async () => {
    expect(await post("pub")).toEqual({ success: true, counted: true });
    const first = await views("pub");
    expect(first).toBeGreaterThanOrEqual(5);
    expect(first).toBeLessThanOrEqual(10);
    expect(await post("pub")).toEqual({ success: true, counted: false });
    expect(await views("pub")).toBe(first);
    state.ip = "2.2.2.2";
    expect((await post("pub")).counted).toBe(true);
    expect(await views("pub")).toBeGreaterThan(first);
  });

  it("does not count drafts", async () => {
    state.ip = "3.3.3.3";
    expect((await post("draft")).counted).toBe(false);
    expect(await views("draft")).toBe(0);
  });

  it("refuses the whole batch when one article is not archived", async () => {
    expect(await permanentlyDeleteArchivedEnArticles(["arch-1", "live"])).toEqual({ ok: false, nonArchivedCount: 1 });
    expect((await pool.query(`SELECT count(*)::int AS n FROM en_articles WHERE id IN ('arch-1','live')`)).rows[0].n).toBe(2);
  });

  it("deletes archived articles only", async () => {
    const result = await permanentlyDeleteArchivedEnArticles(["arch-1", "arch-2"]);
    expect(result.ok && result.deleted.map((r) => r.id).sort()).toEqual(["arch-1", "arch-2"]);
    expect((await pool.query(`SELECT id FROM en_articles ORDER BY id`)).rows.map((r) => r.id)).toEqual(["draft", "live", "pub"]);
  });
});
