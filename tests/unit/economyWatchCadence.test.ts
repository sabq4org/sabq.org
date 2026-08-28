import { describe, expect, it } from "vitest";
import { intervalMinutes, isDecisionNight, isDue, nextDecisionDate, toRiyadh } from "../../server/services/economy/watchCadence";

// 2026-09-16 هو يوم قرار فيدرالي (الأربعاء)
const fomc = new Set(["2026-09-16"]);
const riyadh = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000); // يحوّل «توقيت الرياض» إلى UTC

describe("إيقاع رصد ساما", () => {
  it("يحوّل إلى توقيت الرياض (UTC+3)", () => {
    const r = toRiyadh(new Date("2026-08-25T06:30:00Z"));
    expect(r.hour).toBe(9);
    expect(r.weekday).toBe(2); // الثلاثاء
    expect(r.dateIso).toBe("2026-08-25");
  });

  it("المؤشرات: كل دقيقة ليلة قرار الفائدة، وكل 30 دقيقة في يوم عادي", () => {
    expect(intervalMinutes("indicators", riyadh("2026-09-16T21:30:00Z"), fomc)).toBe(1);
    expect(intervalMinutes("indicators", riyadh("2026-09-16T10:00:00Z"), fomc)).toBe(10); // نهار يوم القرار يقع في نافذة منتصف الشهر
    expect(intervalMinutes("indicators", riyadh("2026-09-22T12:00:00Z"), fomc)).toBe(30);
  });

  it("المؤشرات: كثافة 10 دقائق في نافذتي منتصف الشهر ونهايته", () => {
    expect(intervalMinutes("indicators", riyadh("2026-08-14T11:00:00Z"), fomc)).toBe(10);
    expect(intervalMinutes("indicators", riyadh("2026-08-30T11:00:00Z"), fomc)).toBe(10);
    expect(intervalMinutes("indicators", riyadh("2026-08-14T23:00:00Z"), fomc)).toBe(30);
  });

  it("أسعار الصرف: 10 دقائق صباح أيام العمل، وساعة خارجها", () => {
    expect(intervalMinutes("fx", riyadh("2026-08-25T10:00:00Z"), fomc)).toBe(10); // الثلاثاء
    expect(intervalMinutes("fx", riyadh("2026-08-28T10:00:00Z"), fomc)).toBe(60); // الجمعة
    expect(intervalMinutes("fx", riyadh("2026-08-25T16:00:00Z"), fomc)).toBe(60);
  });

  it("نقاط البيع: 15 دقيقة نهار الثلاثاء فقط؛ عرض النقود: الخميس", () => {
    expect(intervalMinutes("pos_weekly", riyadh("2026-08-25T12:00:00Z"), fomc)).toBe(15);
    expect(intervalMinutes("pos_weekly", riyadh("2026-08-26T12:00:00Z"), fomc)).toBe(360);
    expect(intervalMinutes("money_supply_weekly", riyadh("2026-08-27T12:00:00Z"), fomc)).toBe(15);
    expect(intervalMinutes("money_supply_weekly", riyadh("2026-08-25T12:00:00Z"), fomc)).toBe(360);
  });

  it("isDue: أول مرة دائمًا، ثم حسب الفاصل", () => {
    const now = riyadh("2026-08-25T12:00:00Z");
    expect(isDue("pos_weekly", now, null, fomc)).toBe(true);
    expect(isDue("pos_weekly", now, new Date(now.getTime() - 10 * 60_000), fomc)).toBe(false);
    expect(isDue("pos_weekly", now, new Date(now.getTime() - 15 * 60_000), fomc)).toBe(true);
  });

  it("ليلة القرار والتاريخ التالي", () => {
    expect(isDecisionNight(riyadh("2026-09-16T15:00:00Z"), fomc)).toBe(true);
    expect(isDecisionNight(riyadh("2026-09-16T08:00:00Z"), fomc)).toBe(false);
    expect(nextDecisionDate(riyadh("2026-09-01T08:00:00Z"), fomc)).toBe("2026-09-16");
    expect(nextDecisionDate(riyadh("2026-09-17T08:00:00Z"), fomc)).toBeNull();
  });
});
