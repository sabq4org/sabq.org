import type session from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgSessionRevocations, clearRevocationCache } from "../../server/sessionRevocations";

const sess = (user = "member", generation = "g1") =>
  ({ cookie: {}, passport: { user }, webAuthGeneration: generation }) as unknown as session.SessionData;

function fakePool() {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] as any[] }));
  return { query, pool: () => ({ query }) as any };
}

beforeEach(() => clearRevocationCache());

describe("PgSessionRevocations read cache", () => {
  it("collapses the per-request get+touch checks into one query", async () => {
    const { query, pool } = fakePool();
    const ledger = new PgSessionRevocations(pool);
    await Promise.all([
      ledger.isRevoked("s1", sess(), { allowCached: true }),
      ledger.isRevoked("s1", sess(), { allowCached: true }),
    ]);
    await ledger.isRevoked("s1", sess(), { allowCached: true });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("writes (no allowCached) always hit the database", async () => {
    const { query, pool } = fakePool();
    const ledger = new PgSessionRevocations(pool);
    await ledger.isRevoked("s1", sess(), { allowCached: true });
    await ledger.isRevoked("s1", sess());
    await ledger.isRevoked("s1", sess());
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("revokeSid takes effect immediately, even for another instance in the process", async () => {
    const { query, pool } = fakePool();
    const reader = new PgSessionRevocations(pool);
    expect(await reader.isRevoked("s1", sess(), { allowCached: true })).toBe(false);
    await new PgSessionRevocations(pool).revokeSid("s1");
    query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith("SELECT") ? [{ sid: "tombstone", sess: {} }] : [],
    }));
    // The tombstone row makes the next lookup "revoked"; a stale cached false must not be served.
    const selects = () => query.mock.calls.filter(c => String(c[0]).startsWith("SELECT")).length;
    const before = selects();
    await reader.isRevoked("s1", sess(), { allowCached: true });
    expect(selects()).toBe(before + 1);
  });

  it("revokeUser drops cached results for that user only", async () => {
    const { query, pool } = fakePool();
    const ledger = new PgSessionRevocations(pool);
    await ledger.isRevoked("a", sess("u1"), { allowCached: true });
    await ledger.isRevoked("b", sess("u2"), { allowCached: true });
    await ledger.revokeUser("u1");
    const before = query.mock.calls.length;
    await ledger.isRevoked("a", sess("u1"), { allowCached: true });
    await ledger.isRevoked("b", sess("u2"), { allowCached: true });
    expect(query.mock.calls.length).toBe(before + 1);
  });

  it("a lookup in flight during a revocation is not cached", async () => {
    let release!: () => void;
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT")) await new Promise<void>(r => { release = r; });
      return { rows: [] };
    });
    const ledger = new PgSessionRevocations(() => ({ query }) as any);
    const pending = ledger.isRevoked("s1", sess(), { allowCached: true });
    await new Promise(r => setTimeout(r, 0));
    await ledger.revokeSid("s1");
    release();
    await pending;
    const p2 = ledger.isRevoked("s1", sess(), { allowCached: true });
    await new Promise(r => setTimeout(r, 0));
    release();
    await p2;
    expect(query.mock.calls.filter(c => String(c[0]).startsWith("SELECT"))).toHaveLength(2);
  });

  it("failures are not cached", async () => {
    const query = vi.fn()
      .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
      .mockResolvedValue({ rows: [] });
    const ledger = new PgSessionRevocations(() => ({ query }) as any);
    await expect(ledger.isRevoked("s1", sess(), { allowCached: true })).rejects.toThrow("timeout");
    expect(await ledger.isRevoked("s1", sess(), { allowCached: true })).toBe(false);
  });
});
