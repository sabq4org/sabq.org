import { describe, expect, it } from "vitest";
import { planGcChampionSettlement } from "../../server/services/gcChampionSettlementLogic";

describe("GC champion settlement retry plan", () => {
  it("keeps the pool share stable after one winner was already settled", () => {
    const plan = planGcChampionSettlement([
      { id: "a", userId: "a", teamId: 7, settledAt: new Date() },
      { id: "b", userId: "b", teamId: 7, settledAt: null },
      { id: "c", userId: "c", teamId: 8, settledAt: null },
    ], 7, 5_000);

    expect(plan.share).toBe(2_500);
    expect(plan.winners.map((row) => row.userId)).toEqual(["a", "b"]);
    expect(plan.pendingWinners.map((row) => row.userId)).toEqual(["b"]);
    expect(plan.pendingLosers.map((row) => row.userId)).toEqual(["c"]);
  });

  it("still settles every pending loser when nobody picked the champion", () => {
    const plan = planGcChampionSettlement([
      { id: "a", userId: "a", teamId: 8, settledAt: null },
      { id: "b", userId: "b", teamId: null, settledAt: null },
    ], 7, 5_000);

    expect(plan.share).toBe(0);
    expect(plan.winners).toEqual([]);
    expect(plan.pendingLosers.map((row) => row.userId)).toEqual(["a", "b"]);
  });
});
