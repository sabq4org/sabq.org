import session from "express-session";
import connectPg from "connect-pg-simple";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PgSessionRevocations } from "../../server/sessionRevocations";
import { SessionFailoverStore } from "../../server/sessionFailoverStore";

// Opt-in, disposable LOCAL database only. Never reads the application's DB env.
const url = process.env.SESSION_REVOCATION_TEST_URL;
if (url && !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("Session integration tests require a disposable localhost database");
}

class RedisCopy extends session.Store {
  values = new Map<string, session.SessionData>();
  down = false;
  delayedWrite: (() => void) | null = null;
  delayWrites = false;
  get(sid: string, cb: (error: unknown, value?: session.SessionData | null) => void) {
    cb(this.down ? new Error("Command timed out") : null, structuredClone(this.values.get(sid) ?? null));
  }
  set(sid: string, sess: session.SessionData, cb?: (error?: unknown) => void) {
    const write = () => {
      if (this.down) return cb?.(new Error("Command timed out"));
      this.values.set(sid, structuredClone(sess)); cb?.();
    };
    if (this.delayWrites) this.delayedWrite = write; else write();
  }
  destroy(sid: string, cb?: (error?: unknown) => void) {
    if (this.down) return cb?.(new Error("Command timed out"));
    this.values.delete(sid); cb?.();
  }
  touch(sid: string, sess: session.SessionData, cb?: (error?: unknown) => void) {
    this.set(sid, sess, cb);
  }
}
const data = (generation?: string): session.SessionData => ({
  cookie: { expires: new Date(Date.now() + 7 * 86400_000), originalMaxAge: 7 * 86400_000 },
  passport: { user: "member" }, ...(generation === undefined ? {} : { webAuthGeneration: generation }),
} as unknown as session.SessionData);
const read = (s: SessionFailoverStore, sid = "old") => new Promise<session.SessionData | null | undefined>((resolve, reject) => s.get(sid, (e, v) => e ? reject(e) : resolve(v)));
const write = (s: SessionFailoverStore, sid: string, value: session.SessionData) => new Promise<void>((resolve, reject) => s.set(sid, value, e => e ? reject(e) : resolve()));
const destroy = (s: SessionFailoverStore, sid = "old") => new Promise<void>((resolve, reject) => s.destroy(sid, e => e ? reject(e) : resolve()));
const touch = (s: SessionFailoverStore, sid: string, value: session.SessionData) => new Promise<void>(resolve => s.touch(sid, value, () => resolve()));

describe.skipIf(!url)("durable session revocation — real PostgreSQL and connect-pg-simple", () => {
  let pool: Pool;
  let ledger: PgSessionRevocations;
  let pgStore: session.Store & { close(): void };
  let redis: RedisCopy;
  let store: SessionFailoverStore;
  let created = false;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 4 });
    // The URL MUST point to a fresh database dedicated to this test.
    await pool.query("CREATE TABLE sessions (sid varchar PRIMARY KEY, sess jsonb NOT NULL, expire timestamp NOT NULL)");
    created = true;
    const PgStore = connectPg(session);
    pgStore = new PgStore({ pool, tableName: "sessions", createTableIfMissing: false, pruneSessionInterval: false, ttl: 604800 });
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE sessions");
    ledger = new PgSessionRevocations(() => pool);
    redis = new RedisCopy(); redis.values.set("old", data());
    store = new SessionFailoverStore(redis, pgStore, ledger, 30_000, 1);
  });
  afterAll(async () => {
    pgStore?.close();
    if (created) await pool.query("DROP TABLE sessions");
    await pool?.end();
  });

  it("durably destroys during Redis outage and refuses the old SID after recovery and restart", async () => {
    redis.down = true;
    await destroy(store);
    expect(redis.values.has("old")).toBe(true); // Real residual copy, not a fake deletion.
    redis.down = false;
    const restarted = new SessionFailoverStore(redis, pgStore, new PgSessionRevocations(() => pool));
    expect(await read(restarted)).toBeNull();
    await write(restarted, "fresh", data());
    expect(await read(restarted, "fresh")).toBeTruthy();
  });
  it("honors durable markers in PG-only mode and does not overwrite them with session saves", async () => {
    const pgOnly = new SessionFailoverStore(null, pgStore, ledger);
    await write(pgOnly, "old", data());
    await destroy(pgOnly);
    await expect(write(pgOnly, "old", data())).rejects.toThrow("revoked");
    // Emulate a stale storage operation from a previous process.
    await new Promise<void>((resolve, reject) => pgStore.set("old", data(), e => e ? reject(e) : resolve()));
    expect(await read(new SessionFailoverStore(null, pgStore, new PgSessionRevocations(() => pool)))).toBeNull();
  });
  it("cannot authenticate an in-flight write that lands after destroy", async () => {
    redis.delayWrites = true;
    const pending = write(store, "old", data());
    // Wait for the pre-write revocation check to finish.
    for (let i = 0; !redis.delayedWrite && i < 100; i++) await new Promise(r => setTimeout(r, 2));
    expect(redis.delayedWrite).toBeTypeOf("function");
    await destroy(store);
    redis.delayedWrite!(); await pending;
    expect(redis.values.has("old")).toBe(true);
    expect(await read(store)).toBeNull();
  });
  it("does not renew a revoked session via touch", async () => {
    await destroy(store);
    await touch(store, "old", data());
    expect(redis.values.has("old")).toBe(false);
  });
  it("revokes unknown Redis SIDs by user generation across independent store instances", async () => {
    redis.values.set("unindexed", data()); redis.down = true;
    await ledger.revokeUser("member", "keep");
    redis.down = false; redis.values.set("keep", data());
    const second = new SessionFailoverStore(redis, pgStore, new PgSessionRevocations(() => pool));
    expect(await read(second, "unindexed")).toBeNull();
    expect(await read(second, "keep")).toBeTruthy();
    await expect(write(second, "unindexed", data())).rejects.toThrow("revoked");
    await write(second, "new-login", data(await ledger.generationForUser("member")));
    expect(await read(second, "new-login")).toBeTruthy();
    await ledger.revokeUser("member");
    expect(await read(second, "keep")).toBeNull();
    expect(await read(second, "new-login")).toBeNull();
  });
  it("legacy sessions remain valid until explicit user revocation", async () => {
    expect(await read(store)).toBeTruthy();
    await ledger.revokeUser("someone-else");
    expect(await read(store)).toBeTruthy();
  });
  it("bulk deletion and pruning cannot delete the independent user generation", async () => {
    await ledger.revokeSid("old"); await ledger.revokeUser("member");
    await pool.query("DELETE FROM sessions WHERE sess #>> '{passport,user}' = $1", ["member"]);
    await pool.query("DELETE FROM sessions WHERE expire < CURRENT_TIMESTAMP");
    expect(await ledger.isRevoked("old", data())).toBe(true);
    const { rows } = await pool.query("SELECT expire::text AS expiry FROM sessions ORDER BY sid");
    expect(rows.some(r => r.expiry === "infinity")).toBe(true);
  });
  it("marker lookup failure fails closed with the degraded signal; destroy must report failure", async () => {
    const failedPool = { query: async () => { throw new Error("connection timeout"); } } as unknown as Pool;
    const failing = new SessionFailoverStore(redis, pgStore, new PgSessionRevocations(() => failedPool));
    expect(await read(failing)).toBeNull();
    expect(failing.consumeDegradedRead("old")).toBe(true);
    await expect(destroy(failing)).rejects.toThrow("connection timeout");
    await expect(write(failing, "other", data())).rejects.toThrow("connection timeout");
    await touch(failing, "other", data());
    expect(redis.values.has("other")).toBe(false);
  });
  it("SID tombstones last longer than the maximum cookie lifetime", async () => {
    await ledger.revokeSid("old");
    const { rows } = await pool.query("SELECT extract(epoch FROM expire - CURRENT_TIMESTAMP)::float AS ttl FROM sessions");
    expect(rows[0].ttl).toBeGreaterThan(7 * 86400);
  });
});
