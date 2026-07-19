import { describe, expect, it } from "vitest";
import { matchVisibility, visibleMemberPrediction } from "../../server/services/gcMajlisLogic";

const pending = {
  predHome: 2,
  predAway: 1,
  status: "pending",
  tier: "none",
  pointsAwarded: 0,
};

describe("GC majlis prediction privacy", () => {
  it("never returns the score while the match is sealed", () => {
    expect(visibleMemberPrediction({
      visibility: "sealed",
      prediction: pending,
      currentHome: null,
      currentAway: null,
    })).toBeNull();
  });

  it("reveals exactly at kickoff and evaluates a live score provisionally", () => {
    expect(matchVisibility({
      nowMs: 1_000,
      kickoffMs: 1_000,
      live: false,
      finished: false,
      settled: false,
    })).toBe("revealed");
    expect(visibleMemberPrediction({
      visibility: "revealed",
      prediction: pending,
      currentHome: 2,
      currentAway: 1,
    })).toEqual({ home: 2, away: 1, evaluation: "exact", provisional: true, points: 0 });
  });

  it("keeps a rescheduled future match sealed despite a stale settlement snapshot", () => {
    expect(matchVisibility({
      nowMs: 1_000,
      kickoffMs: 2_000,
      live: false,
      finished: false,
      settled: true,
    })).toBe("sealed");
  });

  it("uses durable settlement fields after settlement", () => {
    expect(visibleMemberPrediction({
      visibility: "settled",
      prediction: { ...pending, status: "correct", tier: "margin", pointsAwarded: 75 },
      currentHome: 3,
      currentAway: 2,
    })).toEqual({ home: 2, away: 1, evaluation: "margin", provisional: false, points: 75 });
  });

  it("exposes a void pick without counting it as a miss", () => {
    expect(visibleMemberPrediction({
      visibility: "settled",
      prediction: { ...pending, status: "void" },
      currentHome: null,
      currentAway: null,
    })).toEqual({ home: 2, away: 1, evaluation: "void", provisional: false, points: 0 });
  });
});
