import { describe, expect, it } from "vitest";
import { dutyClock, dutyDateKey, dutyMinuteOfDay, minutesFromRiyadh, shiftRule, shiftWeekPieces } from "../../client/src/lib/dutyLocalTime";

const CAIRO = "Africa/Cairo";
const WINTER = Date.parse("2026-11-23T12:00:00Z");
const SUMMER = Date.parse("2026-07-15T12:00:00Z");

describe("غرفة المناوبة بتوقيت الجهاز", () => {
  it("القاهرة متأخرة ساعة عن الرياض شتاءً ومثلها صيفًا", () => {
    expect(minutesFromRiyadh(CAIRO, WINTER)).toBe(-60);
    expect(minutesFromRiyadh(CAIRO, SUMMER)).toBe(0);
    expect(minutesFromRiyadh("Asia/Riyadh", WINTER)).toBe(0);
  });

  it("يعرض اللحظة بساعة الجهاز", () => {
    const ms = Date.parse("2026-11-22T17:00:00Z"); // 20:00 الرياض
    expect(dutyClock(ms, "Asia/Riyadh")).toBe("20:00");
    expect(dutyClock(ms, CAIRO)).toBe("19:00");
    expect(dutyMinuteOfDay(ms, CAIRO)).toBe(19 * 60);
    expect(dutyDateKey(Date.parse("2026-11-22T21:30:00Z"), "Asia/Riyadh")).toBe("2026-11-23");
    expect(dutyDateKey(Date.parse("2026-11-22T21:30:00Z"), CAIRO)).toBe("2026-11-22");
  });

  it("يزيح قاعدة الوردية ويحرك أيامها عند عبور منتصف الليل، ويعود كما كانت", () => {
    const fahad = { days: [4, 5, 6], startMinute: 20 * 60, endMinute: 2 * 60 };
    expect(shiftRule(fahad, -60)).toEqual({ days: [4, 5, 6], startMinute: 19 * 60, endMinute: 60 });
    const night = { days: [0, 3], startMinute: 30, endMinute: 8 * 60 };
    const cairo = shiftRule(night, -60);
    expect(cairo).toEqual({ days: [2, 6], startMinute: 23 * 60 + 30, endMinute: 7 * 60 });
    expect(shiftRule(cairo, 60)).toEqual(night);
    expect(shiftRule({ days: [1], startMinute: 16 * 60, endMinute: 1440 }, -60).endMinute).toBe(23 * 60);
    expect(shiftRule({ days: [1], startMinute: 16 * 60, endMinute: 60 }, -60).endMinute).toBe(1440);
  });

  it("يعيد توزيع قطع الأسبوع على أيام الجهاز", () => {
    const pieces = [
      { dutyDate: "2026-11-22", startMinute: 0, endMinute: 30, tag: "a" },
      { dutyDate: "2026-11-23", startMinute: 1380, endMinute: 1440, tag: "b" },
      { dutyDate: "2026-11-24", startMinute: 0, endMinute: 120, tag: "c" },
    ];
    expect(shiftWeekPieces(pieces, "2026-11-22", -60)).toEqual([
      { dutyDate: "2026-11-23", startMinute: 1320, endMinute: 1380, tag: "b" },
      { dutyDate: "2026-11-23", startMinute: 1380, endMinute: 1440, tag: "c" },
      { dutyDate: "2026-11-24", startMinute: 0, endMinute: 60, tag: "c" },
    ]);
    expect(shiftWeekPieces(pieces, "2026-11-22", 0)).toEqual(pieces);
  });

  it("يملأ أطراف الأسبوع من اليوم المجاور ويسقط ما يبقى في الرياض خارجه", () => {
    const pieces = [
      { dutyDate: "2026-11-29", startMinute: 0, endMinute: 120 }, // الأحد التالي بالرياض
      { dutyDate: "2026-11-21", startMinute: 1380, endMinute: 1440 }, // السبت السابق
    ];
    expect(shiftWeekPieces(pieces, "2026-11-22", -60)).toEqual([
      { dutyDate: "2026-11-28", startMinute: 1380, endMinute: 1440 },
    ]);
    expect(shiftWeekPieces(pieces, "2026-11-22", 0)).toEqual([]);
  });

  it("في أسبوع تغيير التوقيت الصيفي يحسب الفرق عند كل قطعة", () => {
    // القاهرة: الخميس 2026-04-23 بفرق ‎-60، والسبت 2026-04-25 بفرق 0
    const pieces = [
      { dutyDate: "2026-04-23", startMinute: 600, endMinute: 660 },
      { dutyDate: "2026-04-25", startMinute: 600, endMinute: 660 },
    ];
    expect(shiftWeekPieces(pieces, "2026-04-19", (ms) => minutesFromRiyadh(CAIRO, ms))).toEqual([
      { dutyDate: "2026-04-23", startMinute: 540, endMinute: 600 },
      { dutyDate: "2026-04-25", startMinute: 600, endMinute: 660 },
    ]);
  });
});
