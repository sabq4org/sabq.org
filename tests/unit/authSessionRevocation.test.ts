import express from "express";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generation: vi.fn(), revokeUser: vi.fn(), mobileDelete: vi.fn(), query: vi.fn(),
  serialize: undefined as undefined | ((req: any, user: any, done: (err: unknown, id?: string) => void) => Promise<void>),
  sessionOptions: undefined as any,
}));
vi.mock("../../server/sessionRevocations", () => ({ PgSessionRevocations: class {
  generationForUser = mocks.generation;
  revokeUser = mocks.revokeUser;
  isRevoked = async () => false;
  revokeSid = async () => {};
} }));
vi.mock("../../server/db", () => ({
  db: { delete: () => ({ where: mocks.mobileDelete }) },
  getSessionFallbackPool: () => ({ query: mocks.query }),
}));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/redis", () => ({ getRedisSessionAdapter: () => null }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { delete: vi.fn() }, CACHE_TTL: {} }));
vi.mock("passport", () => ({ default: {
  use: vi.fn(), initialize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  session: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  serializeUser: (fn: typeof mocks.serialize) => { mocks.serialize = fn; },
  deserializeUser: vi.fn(), authenticate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
} }));
vi.mock("express-session", async importOriginal => {
  const original = await importOriginal<typeof import("express-session")>();
  return { ...original, default: Object.assign((options: unknown) => {
    mocks.sessionOptions = options;
    return (_req: unknown, _res: unknown, next: () => void) => next();
  }, { Store: original.default.Store, MemoryStore: original.default.MemoryStore }) };
});
vi.mock("connect-pg-simple", async () => {
  const session = await import("express-session");
  return { default: () => session.default.MemoryStore };
});
import { getSession, setupAuth, invalidateAllUserSessions } from "../../server/auth";
import { SessionFailoverStore } from "../../server/sessionFailoverStore";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "synthetic-session-test-key");
  vi.stubEnv("GOOGLE_CLIENT_ID", ""); vi.stubEnv("APPLE_CLIENT_ID", "");
  mocks.generation.mockReset().mockResolvedValue("generation-after-reset");
  mocks.revokeUser.mockReset().mockResolvedValue(undefined);
  mocks.mobileDelete.mockReset().mockResolvedValue(undefined);
  mocks.query.mockReset().mockResolvedValue({ rows: [] });
});
afterEach(() => vi.unstubAllEnvs());
describe("authentication wiring for durable revocation", () => {
  it("wraps PG-only startup and retains seven-day cookie lifetime", () => {
    getSession();
    expect(mocks.sessionOptions.store).toBeInstanceOf(SessionFailoverStore);
    expect(mocks.sessionOptions.cookie.maxAge).toBe(7 * 86400_000);
  });
  it("captures generation in the actual Passport serializer, and fails login if it cannot be read", async () => {
    await setupAuth(express());
    const req = { session: {} };
    const done = vi.fn();
    await mocks.serialize!(req, { id: "member" }, done);
    expect(req.session).toEqual({ webAuthGeneration: "generation-after-reset" });
    expect(done).toHaveBeenCalledWith(null, "member");
    mocks.generation.mockRejectedValue(new Error("ledger unavailable"));
    done.mockClear();
    await mocks.serialize!({ session: {} }, { id: "member" }, done);
    expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
  });
  it("persists user revocation with the self-service SID exception", async () => {
    await invalidateAllUserSessions("member", { exceptWebSid: "current" });
    expect(mocks.revokeUser).toHaveBeenCalledWith("member", "current");
    expect(mocks.mobileDelete).toHaveBeenCalledOnce();
  });
  it("still attempts mobile cleanup but never reports success if durable web revocation fails", async () => {
    mocks.revokeUser.mockRejectedValue(new Error("ledger unavailable"));
    await expect(invalidateAllUserSessions("member")).rejects.toThrow("ledger unavailable");
    expect(mocks.mobileDelete).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalled();
  });
});
