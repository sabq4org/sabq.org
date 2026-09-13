import express from "express";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/rbac", () => ({ getEffectiveUserPermissions: async () => ["articles.edit_any"] }));
vi.mock("../../server/services/articleAccessService", () => ({ authorizeArticleWrite: async () => ({ ok: true }) }));
import router from "../../server/routes/articleEditLocks";
const url = process.env.SESSION_REVOCATION_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");
describe.skipIf(!url)("article lock HTTP concurrency with PostgreSQL", () => {
  let pool: Pool, server: Server, base: string;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url, options: "-c search_path=lock_audit", max: 10 });
    await pool.query("CREATE SCHEMA lock_audit");
    await pool.query(`CREATE TABLE article_edit_locks (article_id varchar PRIMARY KEY, user_id varchar NOT NULL,
      user_name text NOT NULL, acquired_at timestamp NOT NULL, expires_at timestamp NOT NULL, last_heartbeat timestamp NOT NULL)`);
    state.db = drizzle(pool);
    const app = express();
    app.use((req: any, _res, next) => { req.user = { id: req.headers["x-user"], firstName: "Test" }; req.isAuthenticated = () => true; next(); });
    app.use(router);
    server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    base = `http://127.0.0.1:${(server.address() as any).port}/api/admin/articles/a/lock`;
  });
  beforeEach(async () => { await pool.query("DELETE FROM article_edit_locks"); });
  afterAll(async () => { if (server) await new Promise<void>(r => server.close(() => r())); if (pool) { await pool.query("DROP SCHEMA lock_audit CASCADE"); await pool.end(); } });
  const request = (user: string, method = "POST", suffix = "") => fetch(base + suffix, { method, headers: { "x-user": user } });
  it("allows exactly one of ten simultaneous editors", async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => request(`u${i}`)));
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    expect(responses.filter(r => r.status === 409)).toHaveLength(9);
  });
  it("does not let a previous owner refresh or delete the successor's lock", async () => {
    await request("old");
    await pool.query("UPDATE article_edit_locks SET expires_at = (now() at time zone 'UTC') - interval '1 second'");
    expect((await request("new")).status).toBe(200);
    expect((await request("old", "POST", "/heartbeat")).status).toBe(409);
    await request("old", "DELETE");
    expect((await pool.query("SELECT user_id FROM article_edit_locks")).rows[0].user_id).toBe("new");
  });
  it("does not revive an expired heartbeat", async () => {
    await request("old");
    await pool.query("UPDATE article_edit_locks SET expires_at = (now() at time zone 'UTC') - interval '1 second'");
    expect((await request("old", "POST", "/heartbeat")).status).toBe(409);
  });
});
