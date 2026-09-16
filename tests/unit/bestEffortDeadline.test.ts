import { afterEach, describe, expect, it, vi } from "vitest";
import { bestEffortWithin } from "../../server/utils/bestEffortDeadline";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("bestEffortWithin", () => {
  it("returns an operation that finishes before the deadline", async () => {
    await expect(bestEffortWithin(Promise.resolve("fresh"), {
      fallback: "fallback",
      timeoutMs: 1_000,
    })).resolves.toBe("fresh");
  });

  it("returns the fallback at the deadline without cancelling the operation", async () => {
    vi.useFakeTimers();
    let resolveOperation!: (value: string) => void;
    const operation = new Promise<string>((resolve) => {
      resolveOperation = resolve;
    });
    const onTimeout = vi.fn();

    const result = bestEffortWithin(operation, {
      fallback: "fallback",
      timeoutMs: 1_000,
      onTimeout,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBe("fallback");
    expect(onTimeout).toHaveBeenCalledTimes(1);

    resolveOperation("late-cache-fill");
    await Promise.resolve();
  });

  it("observes failures and returns the fallback", async () => {
    const error = new Error("provider unavailable");
    const onError = vi.fn();

    await expect(bestEffortWithin(Promise.reject(error), {
      fallback: "fallback",
      timeoutMs: 1_000,
      onError,
    })).resolves.toBe("fallback");
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("rejects invalid deadlines", async () => {
    await expect(bestEffortWithin(Promise.resolve("value"), {
      fallback: "fallback",
      timeoutMs: 0,
    })).rejects.toThrow("timeoutMs must be a positive finite number");
  });
});
