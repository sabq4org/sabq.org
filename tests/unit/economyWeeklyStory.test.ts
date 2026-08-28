import { describe, expect, it } from "vitest";
import { buildWeeklySpendingStory, fmtSar, seasonalContext } from "../../server/services/economy/weeklyStory";
import type { PosReport, PosRow } from "../../server/services/sama/parsers/posReport";

function row(en: string, ar: string, v: number[], n: number[], extra: Partial<PosRow> = {}): PosRow {
  const dv = ((v[3] - v[2]) / v[2]) * 100;
  const dn = ((n[3] - n[2]) / n[2]) * 100;
  return { en, ar, v, n, dv: Number(dv.toFixed(1)), dn: Number(dn.toFixed(1)), ...extra };
}

const report: PosReport = {
  weeks: [
    { start: "2026-07-26", end: "2026-08-01", labelAr: "26 يوليو – 1 أغسطس" },
    { start: "2026-08-02", end: "2026-08-08", labelAr: "2–8 أغسطس" },
    { start: "2026-08-09", end: "2026-08-15", labelAr: "9–15 أغسطس" },
    { start: "2026-08-16", end: "2026-08-22", labelAr: "16–22 أغسطس" },
  ],
  activities: [
    row("Transportation", "النقل", [300, 280, 270, 260], [30, 28, 27, 26], { isGroup: true }),
    row("Airlines", "الطيران", [100, 90, 80, 70], [10, 9, 8, 7], { group: "Transportation" }),
    row("Others", "أخرى", [200, 190, 190, 190], [20, 19, 19, 19], { group: "Transportation" }),
    row("Education", "التعليم", [180, 270, 450, 1040], [1, 1, 2, 3]),
    row("Food & Beverages", "الأطعمة والمشروبات", [2700, 2300, 2200, 2100], [60, 58, 58, 55]),
    row("Hotels", "الفنادق", [370, 360, 350, 305], [1.1, 1.1, 1.0, 0.9]),
  ],
  cities: [
    row("Riyadh", "الرياض", [5200, 4900, 4800, 5100], [83, 80, 79, 78]),
    row("Jeddah", "جدة", [2200, 2000, 1900, 1800], [30, 28, 27, 26]),
    row("Najran", "نجران", [190, 160, 170, 210], [3, 3, 3, 2.9]),
  ],
  total: row("Total", "الإجمالي", [16300, 14600, 14190, 14170], [267, 253, 250, 237]),
  otherCities: row("Others", "مدن أخرى", [8710, 7540, 7320, 7060], [151, 142, 141, 130]),
};

describe("محرك أرقام الأسبوع", () => {
  it("يبني المؤشرات الأربعة بقيم الريال (لا الآلاف)", () => {
    const s = buildWeeklySpendingStory(report);
    expect(s.kpis.map((k) => k.key)).toEqual(["total", "count", "avgTicket", "vs4w"]);
    expect(s.kpis[0].value).toBe(14_170_000);
    expect(s.kpis[1].value).toBe(237_000);
    expect(s.kpis[2].value).toBeCloseTo(14170 / 237, 3);
  });

  it("يستبعد المجموعات من قصص القطاعات ويلتقط التعليم صعودًا والفنادق هبوطًا", () => {
    const s = buildWeeklySpendingStory(report);
    const riser = s.stories.find((x) => x.key === "sectorRiser")!;
    const faller = s.stories.find((x) => x.key === "sectorFaller")!;
    expect(riser.facts.sector).toBe("التعليم");
    expect(riser.headline).toContain("التعليم");
    expect(riser.headline).toContain("131.1%");
    expect(riser.headline).toContain("مع عودة المدارس");
    expect(faller.facts.sector).toBe("الفنادق");
    expect(faller.headline).toContain("تتراجع");
    // الفنادق هبطت 3 أسابيع متتالية
    expect(faller.facts.streak).toBe(3);
    expect(s.stories.some((x) => x.facts.sector === "النقل")).toBe(false);
  });

  it("كل رقم في العنوان الرئيسي يطابق الحمولة", () => {
    const s = buildWeeklySpendingStory(report);
    expect(s.lead.subheadline).toContain(fmtSar(14170));
    expect(s.lead.subheadline).toContain("0.1%");
    expect(s.lead.intro).toContain("16–22 أغسطس");
    expect(s.citiesShareTop[0].ar).toBe("الرياض");
    expect(s.citiesShareTop[0].share).toBeCloseTo((5100 / 14170) * 100, 5);
    expect(s.otherCitiesShare).toBeGreaterThan(0);
  });

  it("القصص مرتبة بالثقل والعنوان الرئيسي هو أثقلها", () => {
    const s = buildWeeklySpendingStory(report);
    for (let i = 1; i < s.stories.length; i++) expect(s.stories[i - 1].weight).toBeGreaterThanOrEqual(s.stories[i].weight);
    expect(s.lead.headline).toBe(s.stories[0].headline);
  });

  it("الموسمية: عودة المدارس بين 15 أغسطس و10 سبتمبر فقط", () => {
    expect(seasonalContext("2026-08-22")).toBe("مع عودة المدارس");
    expect(seasonalContext("2026-09-05")).toBe("مع عودة المدارس");
    expect(seasonalContext("2026-07-30")).toBeNull();
  });
});
