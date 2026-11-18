// المجدول من لوحة /en/dashboard يُنشر عند حلول وقته؛ صفوف البوت تبقى لمسارها.
// EN_BOT_DRAFTS_TEST_URL يجب أن يكون localhost.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { enArticles } from "@shared/schema";

const state = vi.hoisted(() => ({ db: null as any, effects: [] as Array<[string, string]> }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../server/services/enBotDraftPublishEffects", () => ({
  queueEnBotDraftSurfaceEffects: (row: { id: string }, kind: string) => state.effects.push([row.id, kind]),
}));
vi.mock("../../server/services/breakingNewsService", () => ({
  isBreakingNewsType: (t: unknown) => t === "breaking",
  clearOtherEnBreakingArticles: vi.fn().mockResolvedValue([]),
}));

import { publishDueScheduledEnDashboardArticles } from "../../server/services/enScheduledPublishService";

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

describe.skipIf(!url)("scheduled English dashboard articles", () => {
  let pool: Pool;
  beforeAll(async () => {
    const schema = `en_sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = new Pool({ connectionString: url, max: 1 });
    try { await admin.query(`CREATE SCHEMA ${schema}`); } finally { await admin.end(); }
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema} -c timezone=UTC`, max: 2 });
    await pool.query(ddlFor(enArticles));
    state.db = drizzle(pool);
    const insert = (id: string, status: string, at: string, meta: string | null) =>
      pool.query(
        `INSERT INTO en_articles (id, title, slug, content, status, author_id, scheduled_at, seo_metadata)
         VALUES ($1::text, $1::text, $1::text, '<p>x</p>', $2, 'u1', now() + $3::interval, $4::jsonb)`,
        [id, status, at, meta],
      );
    await insert("dash-due", "scheduled", "-1 minute", null);
    await insert("dash-translated-due", "scheduled", "-1 minute", '{"sourceArticleId":"ar-1"}');
    await insert("dash-future", "scheduled", "1 hour", null);
    await insert("bot-due", "scheduled", "-1 minute", '{"source":"bot"}');
    await insert("draft-past", "draft", "-1 minute", null);
  });
  afterAll(async () => { await pool?.end(); });

  it("publishes due dashboard rows only, and refreshes their reader surfaces", async () => {
    const count = await publishDueScheduledEnDashboardArticles(new Date());
    expect(count).toBe(2);
    const { rows } = await pool.query(`SELECT id, status, published_at IS NOT NULL AS has_pub FROM en_articles ORDER BY id`);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["dash-due"]).toMatchObject({ status: "published", has_pub: true });
    expect(byId["dash-translated-due"]).toMatchObject({ status: "published", has_pub: true });
    expect(byId["dash-future"].status).toBe("scheduled");
    expect(byId["bot-due"].status).toBe("scheduled");
    expect(byId["draft-past"].status).toBe("draft");
    expect(state.effects.map(([id, kind]) => `${id}:${kind}`).sort()).toEqual(["dash-due:publish", "dash-translated-due:publish"]);
  });

  it("is idempotent on the next tick", async () => {
    expect(await publishDueScheduledEnDashboardArticles(new Date())).toBe(0);
  });
});
