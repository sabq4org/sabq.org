import { describe, expect, it } from "vitest";
import {
  compareGcSettlementOrder,
  gcFixtureSettlementDisposition,
  isGcClosedMatchStatus,
  isGcCountedPredictionStatus,
  planGcVoidSettlement,
} from "../../server/services/gcPredictionSettlementLogic";

describe("Gulf Cup void settlement", () => {
  it.each(["CANC", "ABD", "WO", "AWD"])("voids %s even when a score exists", (statusCode) => {
    expect(gcFixtureSettlementDisposition({ statusCode, goalsHome: 3, goalsAway: 0 })).toBe("void");
  });

  it("keeps postponed and incomplete normal results pending", () => {
    expect(gcFixtureSettlementDisposition({ statusCode: "PST", goalsHome: null, goalsAway: null })).toBe("wait");
    expect(gcFixtureSettlementDisposition({ statusCode: "FT", goalsHome: 1, goalsAway: null })).toBe("wait");
    expect(gcFixtureSettlementDisposition({ statusCode: "FT", goalsHome: 1, goalsAway: 0 })).toBe("score");
  });

  it("closes a void snapshot without injecting the fixture base pool", () => {
    expect(planGcVoidSettlement(725, 18)).toEqual({
      status: "void",
      poolCarryIn: 725,
      carryOut: 725,
      paidExact: 0,
      paidMargin: 0,
      paidOutcome: 0,
      exactWinners: 0,
      marginWinners: 0,
      outcomeWinners: 0,
      predictionsCount: 18,
    });
  });

  it("excludes void predictions from played/accuracy while treating the match as closed", () => {
    expect(isGcCountedPredictionStatus("correct")).toBe(true);
    expect(isGcCountedPredictionStatus("incorrect")).toBe(true);
    expect(isGcCountedPredictionStatus("void")).toBe(false);
    expect(isGcClosedMatchStatus("void")).toBe(true);
  });
});

describe("Gulf Cup settlement chain order", () => {
  it("orders simultaneous fixtures by the immutable internal id", () => {
    const rows = [
      { timestamp: 100, fixtureId: 27_000_010 },
      { timestamp: 100, fixtureId: 27_000_009 },
    ].sort(compareGcSettlementOrder);
    expect(rows.map((row) => row.fixtureId)).toEqual([27_000_009, 27_000_010]);
  });

  it("moves a postponed fixture after a match that now kicks off first", () => {
    const rows = [
      { timestamp: 300, fixtureId: 27_000_009 },
      { timestamp: 200, fixtureId: 27_000_010 },
    ].sort(compareGcSettlementOrder);
    expect(rows.map((row) => row.fixtureId)).toEqual([27_000_010, 27_000_009]);
  });
});
