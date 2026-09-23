import { describe, expect, it } from "vitest";
import {
  computeSeasonDateStatus,
  isCupFinalRound,
  refineCompetitionStatus,
} from "../../server/services/competitionStatus";

describe("computeSeasonDateStatus", () => {
  it("يستنتج الحالة من نافذة التواريخ", () => {
    expect(computeSeasonDateStatus("2026-08-20", "2027-05-01", "2026-08-22")).toBe("ongoing");
    expect(computeSeasonDateStatus("2026-09-01", "2027-05-01", "2026-08-22")).toBe("upcoming");
    expect(computeSeasonDateStatus("2026-08-01", "2026-08-21", "2026-08-22")).toBe("finished");
    expect(computeSeasonDateStatus(null, "2027-05-01", "2026-08-22")).toBe("unknown");
  });
});

describe("isCupFinalRound", () => {
  it("يقبل النهائي فقط", () => {
    expect(isCupFinalRound("Final")).toBe(true);
    expect(isCupFinalRound("النهائي")).toBe(true);
    expect(isCupFinalRound("Round of 32")).toBe(false);
    expect(isCupFinalRound("Quarter-finals")).toBe(false);
    expect(isCupFinalRound("3rd Place Final")).toBe(false);
    expect(isCupFinalRound("تحديد المركز الثالث")).toBe(false);
  });
});

describe("refineCompetitionStatus — كأس الملك بعد دور الـ32", () => {
  it("لا يُنهي الكأس إذا قصّر المزود تاريخ النهاية ولم يُلعب النهائي", () => {
    expect(
      refineCompetitionStatus({
        dateStatus: "finished",
        type: "cup",
        hasUpcomingWithinDays: false,
        recentRounds: [
          { round: "Round of 32", finished: true },
          { round: "Round of 32", finished: true },
        ],
      }),
    ).toBe("ongoing");
  });

  it("يبقي الكأس جاريًا إن وُجدت مباراة قادمة خلال 21 يومًا", () => {
    expect(
      refineCompetitionStatus({
        dateStatus: "finished",
        type: "cup",
        hasUpcomingWithinDays: true,
        recentRounds: [],
      }),
    ).toBe("ongoing");
  });

  it("ينهي الكأس بعد صافرة النهائي", () => {
    expect(
      refineCompetitionStatus({
        dateStatus: "finished",
        type: "cup",
        hasUpcomingWithinDays: false,
        recentRounds: [
          { round: "3rd Place Final", finished: true },
          { round: "Final", finished: true },
        ],
      }),
    ).toBe("finished");
  });

  it("لا يغيّر دوريًا بلا قادمة بعد تاريخ النهاية", () => {
    expect(
      refineCompetitionStatus({
        dateStatus: "finished",
        type: "league",
        hasUpcomingWithinDays: false,
      }),
    ).toBe("finished");
  });

  it("لا يلمس حالة غير منتهية", () => {
    expect(
      refineCompetitionStatus({
        dateStatus: "ongoing",
        type: "cup",
        hasUpcomingWithinDays: false,
        recentRounds: [{ round: "Round of 32", finished: true }],
      }),
    ).toBe("ongoing");
  });
});
