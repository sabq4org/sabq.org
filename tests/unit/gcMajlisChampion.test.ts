import { describe, expect, it } from "vitest";
import { dayChampionStatus, selectDayChampions } from "../../server/services/gcMajlisLogic";

describe("GC majlis day champion", () => {
  it("does not announce a winner before every match settles", () => {
    expect(dayChampionStatus(2, 0, false)).toBe("pending");
    expect(dayChampionStatus(2, 1, false)).toBe("in_progress");
    expect(dayChampionStatus(2, 2, false)).toBe("final");
  });

  it("uses points, exact, then correct and preserves genuine ties", () => {
    const winners = selectDayChampions([
      { userId: "a", name: "أ", avatar: null, points: 100, exact: 1, correct: 1, played: 2 },
      { userId: "b", name: "ب", avatar: null, points: 100, exact: 0, correct: 2, played: 2 },
      { userId: "c", name: "ج", avatar: null, points: 100, exact: 1, correct: 1, played: 2 },
      { userId: "d", name: "د", avatar: null, points: 999, exact: 9, correct: 9, played: 0 },
    ]);
    expect(winners.map((row) => row.userId)).toEqual(["a", "c"]);
  });
});

