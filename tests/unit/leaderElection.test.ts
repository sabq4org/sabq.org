import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  redis: { setLock: vi.fn(), renewLock: vi.fn(), releaseLock: vi.fn() },
  connected: true,
  configured: true,
  connect: vi.fn(),
}));
vi.mock("../../server/db", () => ({ pool: { connect: mocks.connect } }));
vi.mock("../../server/redis", () => ({
  getRedisClient: () => (mocks.connected ? mocks.redis : null),
  isRedisConfigured: () => mocks.configured,
}));
afterEach(() => {
  vi.useRealTimers(); vi.clearAllMocks(); vi.resetModules();
  mocks.connected = true; mocks.configured = true;
});
describe("leader lease fencing", () => {
  it("expires locally even before the next Redis heartbeat", async () => {
    vi.useFakeTimers(); mocks.redis.setLock.mockResolvedValue("OK");
    const leader = await import("../../server/leaderElection");
    await leader.tryBecomeLeader(); expect(leader.isLeader()).toBe(true);
    vi.advanceTimersByTime(150001); expect(leader.isLeader()).toBe(false);
  });
  it("demotes on failed atomic renewal", async () => {
    vi.useFakeTimers(); mocks.redis.setLock.mockResolvedValue("OK"); mocks.redis.renewLock.mockResolvedValue(0);
    const leader = await import("../../server/leaderElection");
    await leader.tryBecomeLeader(); leader.startLeaderElectionLoop(30000);
    await vi.advanceTimersByTimeAsync(30000);
    expect(leader.isLeader()).toBe(false); expect(mocks.redis.renewLock).toHaveBeenCalledOnce();
  });
  it("releases with the owner value in a single Redis operation", async () => {
    mocks.redis.setLock.mockResolvedValue("OK"); mocks.redis.releaseLock.mockResolvedValue(1);
    const leader = await import("../../server/leaderElection");
    await leader.tryBecomeLeader(); await leader.releaseLeadership();
    expect(mocks.redis.releaseLock).toHaveBeenCalledWith("sabq:leader:lease", leader.getPodId());
    expect(leader.isLeader()).toBe(false);
  });
});

// تدقيق 2026-11-10: انقطاع Redis كان يُنزل الانتخاب إلى القفل الاستشاري، فتصير
// هذه النسخة قائدة بالقفل والأخرى قائدة بالـlease وتعمل المهام مرتين.
describe("Redis configured but disconnected", () => {
  it("does not fall back to the advisory lock", async () => {
    mocks.connected = false;
    const leader = await import("../../server/leaderElection");
    expect(await leader.tryBecomeLeader()).toBe(false);
    expect(leader.isLeader()).toBe(false);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("a lease leader that loses Redis demotes and stays demoted until Redis is back", async () => {
    vi.useFakeTimers(); mocks.redis.setLock.mockResolvedValue("OK");
    const leader = await import("../../server/leaderElection");
    await leader.tryBecomeLeader(); leader.startLeaderElectionLoop(30000);
    mocks.connected = false;
    await vi.advanceTimersByTimeAsync(90000);
    expect(leader.isLeader()).toBe(false);
    expect(mocks.connect).not.toHaveBeenCalled();
    mocks.connected = true;
    await vi.advanceTimersByTimeAsync(30000);
    expect(leader.isLeader()).toBe(true);
    await leader.releaseLeadership();
  });

  it("still uses the advisory lock when REDIS_URL is not set at all (local dev)", async () => {
    mocks.connected = false; mocks.configured = false;
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ locked: true }] }), on: vi.fn(), release: vi.fn() };
    mocks.connect.mockResolvedValue(client);
    const leader = await import("../../server/leaderElection");
    expect(await leader.tryBecomeLeader()).toBe(true);
    expect(mocks.connect).toHaveBeenCalledOnce();
  });
});
