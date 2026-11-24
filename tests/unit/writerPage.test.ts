import { describe, expect, it } from "vitest";
import { nextWritingDayKey, riyadhWeekday, topNames, usualWeekday } from "../../shared/writerPage";

// 2026-11-24 ثلاثاء
const tue = (week: number, hourUtc = 6) => new Date(Date.UTC(2026, 10, 24 - week * 7, hourUtc));

describe("writerPage", () => {
  it("riyadhWeekday uses Riyadh time", () => {
    expect(riyadhWeekday(new Date(Date.UTC(2026, 10, 24, 6)))).toBe(2);
    // 22:00 UTC الاثنين = 01:00 الثلاثاء في الرياض
    expect(riyadhWeekday(new Date(Date.UTC(2026, 10, 23, 22)))).toBe(2);
  });

  it("usualWeekday needs 3 articles and a clear majority", () => {
    expect(usualWeekday([tue(0), tue(1)])).toBeNull();
    expect(usualWeekday([tue(0), tue(1), tue(2)])).toBe(2);
    const wed = new Date(Date.UTC(2026, 10, 18, 6));
    const thu = new Date(Date.UTC(2026, 10, 12, 6));
    expect(usualWeekday([tue(0), tue(1), wed, thu])).toBe(2);
    expect(usualWeekday([tue(0), wed, thu])).toBeNull();
  });

  it("nextWritingDayKey skips today when already published today", () => {
    const now = new Date(Date.UTC(2026, 10, 24, 9));
    expect(nextWritingDayKey(2, now, tue(1))).toBe("2026-11-24");
    expect(nextWritingDayKey(2, now, tue(0))).toBe("2026-12-01");
    expect(nextWritingDayKey(4, now, null)).toBe("2026-11-26");
  });

  it("topNames orders by frequency", () => {
    expect(topNames(["مجتمع", "حياتنا", "مجتمع", null, "اقتصاد"], 2)).toEqual(["مجتمع", "حياتنا"]);
  });
});
