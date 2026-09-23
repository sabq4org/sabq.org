import { describe, expect, it } from "vitest";
import { createPushBroadcastPacer, runPacedBroadcast } from "../../server/services/pushBroadcastPacer";

describe("push broadcast pacing", () => {
  it("dispatches 38,000 items without an intentional default timer delay", async () => {
    const items = Array.from({ length: 38_000 }, (_, i) => i);
    let active = 0;
    let peak = 0;
    let started = 0;
    let releaseGate!: () => void;
    let firstWindowResolve!: () => void;
    const firstWindow = new Promise<void>((resolve) => { firstWindowResolve = resolve; });
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    const pacer = createPushBroadcastPacer<number, number>({
      maxConcurrent: 100,
      sleep: async () => { throw new Error("default pacing must not sleep"); },
    });
    const send = async (item: number) => {
      started += 1;
      active += 1;
      peak = Math.max(peak, active);
      if (started === 100) firstWindowResolve();
      await gate;
      active -= 1;
      return item * 2;
    };

    const resultsPromise = pacer.run(items, send);
    await firstWindow;
    expect(started).toBe(100);
    expect(peak).toBe(100);
    releaseGate();
    const results = await resultsPromise;

    expect(results).toHaveLength(38_000);
    expect(results.every((result) => result.value !== undefined)).toBe(true);
    expect(started).toBe(38_000);
    expect(peak).toBeLessThanOrEqual(100);
  });

  it("keeps transport failures visible for every input", async () => {
    const results = await runPacedBroadcast(
      ["ok", "fails", "ok-again"],
      async (value) => {
        if (value === "fails") throw new Error("synthetic transport failure");
        return value.toUpperCase();
      },
      { maxConcurrent: 1 },
    );

    expect(results).toHaveLength(3);
    expect(results[0].value).toBe("OK");
    expect(results[1].error).toBeInstanceOf(Error);
    expect(results[2].value).toBe("OK-AGAIN");
  });
});
