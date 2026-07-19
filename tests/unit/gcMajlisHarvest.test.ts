import { describe, expect, it } from "vitest";
import { selectHarvestAwards } from "../../server/services/gcMajlisLogic";

const person = (userId: string) => ({ userId, name: userId, avatar: null });

describe("GC majlis harvest awards", () => {
  it("selects deterministic metrics and keeps primary-score ties", () => {
    const awards = selectHarvestAwards({
      champions: [
        { ...person("a"), totalPoints: 500, exactCount: 2, correctCount: 4, playedCount: 6 },
        { ...person("b"), totalPoints: 500, exactCount: 2, correctCount: 4, playedCount: 7 },
        { ...person("c"), totalPoints: 500, exactCount: 1, correctCount: 5, playedCount: 7 },
      ],
      accurate: [
        { ...person("a"), accuracy: 80, correctCount: 4, playedCount: 5 },
        { ...person("b"), accuracy: 80, correctCount: 8, playedCount: 10 },
      ],
      bold: [
        { ...person("a"), pickProb: 9, fixtureId: 1 },
        { ...person("b"), pickProb: 9, fixtureId: 2 },
        { ...person("c"), pickProb: 15, fixtureId: 3 },
      ],
      stubborn: [
        { ...person("a"), teamId: 1, teamName: "أ", picksCount: 4 },
        { ...person("b"), teamId: 2, teamName: "ب", picksCount: 4 },
        { ...person("c"), teamId: 3, teamName: "ج", picksCount: 3 },
      ],
    });

    expect(awards.champions.map((row) => row.userId)).toEqual(["a", "b"]);
    expect(awards.mostAccurate.map((row) => row.userId)).toEqual(["b"]);
    expect(awards.boldest.map((row) => row.userId)).toEqual(["a", "b"]);
    expect(awards.stubborn.map((row) => row.userId)).toEqual(["a", "b"]);
  });

  it("returns empty awards without eligible evidence", () => {
    expect(selectHarvestAwards({ champions: [], accurate: [], bold: [], stubborn: [] })).toEqual({
      champions: [],
      mostAccurate: [],
      boldest: [],
      stubborn: [],
    });
  });
});
