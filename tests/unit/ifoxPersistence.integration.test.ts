import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
import { claimCalendarTask, completeCalendarTask } from "../../server/services/ifox/taskPersistence";
const url = process.env.SESSION_REVOCATION_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");
describe.skipIf(!url)("iFox article and task atomicity", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url, options: "-c search_path=ifox_audit -c timezone=UTC" });
    await pool.query("CREATE SCHEMA ifox_audit");
    await pool.query(`CREATE TABLE ifox_editorial_calendar (id varchar PRIMARY KEY, status varchar,
      updated_at timestamp, updated_by varchar, actual_published_at timestamp, article_id varchar CHECK(article_id <> 'reject-link'))`);
    await pool.query("CREATE TABLE articles (id varchar PRIMARY KEY)");
    state.db = drizzle(pool);
  });
  beforeEach(async () => { await pool.query("TRUNCATE articles, ifox_editorial_calendar"); await pool.query("INSERT INTO ifox_editorial_calendar(id,status) VALUES ('task','planned')"); });
  afterAll(async () => { if (pool) { await pool.query("DROP SCHEMA ifox_audit CASCADE"); await pool.end(); } });
  it("claims once across concurrent workers", async () => {
    expect((await Promise.all([claimCalendarTask("task", "a"), claimCalendarTask("task", "b")])).filter(Boolean)).toHaveLength(1);
  });
  it("rolls back the article when writing its task link fails", async () => {
    const claim = (await claimCalendarTask("task", "a"))!;
    await expect(completeCalendarTask("task", claim.updatedAt, "a", false, async tx => {
      await tx.execute(sql`INSERT INTO articles VALUES ('reject-link')`);
      return { id: "reject-link" };
    })).rejects.toThrow();
    expect((await pool.query("SELECT * FROM articles")).rows).toHaveLength(0);
    expect((await pool.query("SELECT status FROM ifox_editorial_calendar")).rows[0].status).toBe("in_progress");
  });
});
