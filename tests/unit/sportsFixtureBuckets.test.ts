import { describe, it, expect } from "vitest";
import { bucketFixtures, isPostponedFixture } from "../../server/services/sports/fixtureBuckets";

// 2026-11-06 08:00 بتوقيت الرياض
const NOW = Math.floor(Date.parse("2026-11-06T08:00:00+03:00") / 1000);
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const fx = (id: number, iso: string, code: string, live = false, finished = false) => ({
  id,
  timestamp: at(iso),
  status: { code, live, finished },
});

describe("bucketFixtures — المباريات المؤجلة", () => {
  // حالة 6 نوفمبر 2026: الجولة 13 مؤجلة كاملة ويبقي المزوّد تواريخها القديمة.
  const fixtures = [
    fx(1, "2026-11-06T17:30:00+03:00", "PST"),
    fx(2, "2026-11-06T20:30:00+03:00", "PST"),
    fx(3, "2026-11-07T16:20:00+03:00", "PST"),
    fx(4, "2026-11-20T20:00:00+03:00", "NS"),
    fx(5, "2026-10-31T21:00:00+03:00", "FT", false, true),
  ];
  const b = bucketFixtures(fixtures, NOW);

  it("لا تظهر في «اليوم» ولا «القادمة» بساعة انطلاق", () => {
    expect(b.today.map((f) => f.id)).toEqual([]);
    expect(b.upcoming.map((f) => f.id)).toEqual([4]);
  });

  it("تُجمع في حزمة postponed مرتّبة زمنيًا", () => {
    expect(b.postponed.map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it("النتائج والمباريات العادية لا تتأثر", () => {
    expect(b.results.map((f) => f.id)).toEqual([5]);
    const withToday = bucketFixtures([...fixtures, fx(6, "2026-11-06T19:00:00+03:00", "NS")], NOW);
    expect(withToday.today.map((f) => f.id)).toEqual([6]);
  });

  it("المحسومة إداريًا (AWD) والجارية ليست مؤجلة", () => {
    expect(isPostponedFixture(fx(7, "2026-11-06T17:30:00+03:00", "AWD", false, true))).toBe(false);
    expect(isPostponedFixture(fx(8, "2026-11-06T17:30:00+03:00", "1H", true))).toBe(false);
    expect(isPostponedFixture(fx(9, "2026-11-06T17:30:00+03:00", "CANC"))).toBe(true);
  });
});
