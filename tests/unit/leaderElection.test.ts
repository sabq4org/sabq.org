import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ redis: { setLock: vi.fn(), renewLock: vi.fn(), releaseLock: vi.fn() } }));
vi.mock("../../server/db", () => ({ pool: {} }));
vi.mock("../../server/redis", () => ({ getRedisClient: () => mocks.redis }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.resetModules(); });
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
