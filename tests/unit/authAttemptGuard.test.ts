import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  redis: null as null | {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("../../server/redis", () => ({
  getRedisSessionAdapter: () => state.redis,
}));

import {
  clearFailures,
  isLockedOut,
  recordFailure,
} from "../../server/services/authAttemptGuard";

function redisAdapter() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  };
}

describe("authAttemptGuard Redis degradation", () => {
  beforeEach(() => {
    state.redis = redisAdapter();
    vi.restoreAllMocks();
  });

  it("falls back to the mirrored local counter when Redis commands time out", async () => {
    const key = "timeout-case";
    state.redis!.get.mockRejectedValue(new Error("Command timed out"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (let i = 1; i <= 10; i++) {
      await expect(recordFailure(key)).resolves.toBe(i);
    }
    await expect(isLockedOut(key, 10)).resolves.toBe(true);

    expect(warn).toHaveBeenCalledWith(
      "[AuthAttemptGuard] Redis command timed out — using per-process lockout fallback",
    );
  });

  it("does not reject login checks when Upstash rate-limits the database", async () => {
    state.redis!.get.mockRejectedValue(
      new Error("ERR Your database has been temporarily rate-limited"),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(isLockedOut("rate-limit-case", 10)).resolves.toBe(false);
  });

  it("combines the shared Redis count with the local mirror", async () => {
    state.redis!.get.mockResolvedValueOnce("9").mockResolvedValue("10");
    await expect(recordFailure("shared-case")).resolves.toBe(10);
    await expect(isLockedOut("shared-case", 10)).resolves.toBe(true);
    expect(state.redis!.set).toHaveBeenCalledWith("authfail:shared-case", "10", {
      expiration: { type: "EX", value: 15 * 60 },
    });
  });

  it("clears the local lockout even when Redis cleanup fails", async () => {
    const key = "clear-case";
    state.redis!.get.mockRejectedValue(new Error("Command timed out"));
    state.redis!.del.mockRejectedValue(new Error("Command timed out"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    for (let i = 0; i < 10; i++) await recordFailure(key);
    await expect(isLockedOut(key, 10)).resolves.toBe(true);
    await expect(clearFailures(key)).resolves.toBeUndefined();
    await expect(isLockedOut(key, 10)).resolves.toBe(false);
  });

  it("uses Redis again after a transient failure", async () => {
    const key = "recovery-case";
    state.redis!.get.mockRejectedValueOnce(new Error("Command timed out"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(isLockedOut(key, 10)).resolves.toBe(false);
    state.redis!.get.mockResolvedValue("10");
    await expect(isLockedOut(key, 10)).resolves.toBe(true);
  });

  it("drops a stale local lock after another pod clears Redis", async () => {
    const key = "external-clear-case";
    state.redis!.get.mockResolvedValue("9");
    for (let i = 0; i < 10; i++) await recordFailure(key);

    state.redis!.get.mockResolvedValue("0");
    await expect(isLockedOut(key, 10)).resolves.toBe(false);

    state.redis!.get.mockRejectedValue(new Error("Command timed out"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(isLockedOut(key, 10)).resolves.toBe(false);
  });
});
