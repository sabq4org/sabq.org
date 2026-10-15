import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableColumns, getTableName } from "drizzle-orm";
import { predictionCompetitions, predictionContests, predictionEntries } from "@shared/schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
import { upsertEntry } from "../../server/services/predictions/predictionCoreService";
const url = process.env.SESSION_REVOCATION_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");
describe.skipIf(!url)("prediction deadline after database wait", () => {
  let pool: Pool;
  beforeAll(async () => {
    vi.stubEnv("PREDICTION_CORE_ENABLED", "true");
    pool = new Pool({ connectionString: url, options: "-c search_path=prediction_audit -c timezone=UTC" });
    await pool.query("CREATE SCHEMA prediction_audit");
    for (const table of [predictionCompetitions, predictionContests, predictionEntries]) {
      const columns = Object.values(getTableColumns(table)).map(c => `"${c.name}" ${c.getSQLType()}` +
        (c.name === "id" ? " PRIMARY KEY DEFAULT gen_random_uuid()::text" : c.name.endsWith("_at") ? " DEFAULT now()" : ""));
      await pool.query(`CREATE TABLE ${getTableName(table)} (${columns.join(",")})`);
    }
    await pool.query("CREATE UNIQUE INDEX ON prediction_entries (contest_id,user_id)");
    await pool.query("INSERT INTO prediction_competitions(id,status) VALUES ('competition','active')");
    await pool.query(`INSERT INTO prediction_contests(id,competition_id,contest_type,status,scoring_profile_id,opens_at,locks_at)
      VALUES ('contest','competition','match_score','open','profile',now()-interval '1 hour',now()+interval '1 hour')`);
    state.db = drizzle(pool);
  });
  afterAll(async () => { vi.unstubAllEnvs(); if (pool) { await pool.query("DROP SCHEMA prediction_audit CASCADE"); await pool.end(); } });
  const submit = () => upsertEntry({ contestId: "contest", userId: "user", platform: "web", payload: { predHome: 2, predAway: 1 } });
  it("inserts and updates one entry, then refuses a request delayed past close", async () => {
    const a = await submit(); const b = await submit(); expect(a.id).toBe(b.id);
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("UPDATE prediction_contests SET locks_at=clock_timestamp()+interval '100 milliseconds' WHERE id='contest'");
      const result = submit().catch(e => e);
      await new Promise(r => setTimeout(r, 150));
      await blocker.query("COMMIT");
      expect(await result).toMatchObject({ code: "PREDICTION_LOCKED", httpStatus: 409 });
      expect((await pool.query("SELECT * FROM prediction_entries")).rows).toHaveLength(1);
    } finally { blocker.release(); }
  });
});
