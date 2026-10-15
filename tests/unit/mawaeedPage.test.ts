import { describe, expect, it } from "vitest";
// @ts-expect-error Pages function has no TypeScript declaration.
import { mawaeedSlugFromPath, renderMawaeedHtml } from "../../functions/mawaeedPage.js";
import { presentMawaeed } from "@shared/mawaeed/present";
import type { OccurrenceRecord, SeriesRecord } from "@shared/mawaeed/model";

const series: SeriesRecord = {
  id: "s1",
  slug: "salaries",
  kind: "salary",
  titleAr: "رواتب موظفي الدولة",
  summaryAr: "موعد صرف رواتب موظفي الدولة المدنيين والعسكريين.",
  sortOrder: 3,
  published: true,
  contentUpdatedAt: "2026-09-27T00:00:00.000+03:00",
};

const rows: OccurrenceRecord[] = [
  {
    id: "expected",
    seriesId: "s1",
    titleAr: "رواتب يناير 2027",
    startsOn: "2027-01-27",
    endsOn: null,
    sourceUrl: "https://www.mof.gov.sa/financial_reports",
    sourceTitle: "وزارة المالية",
    certainty: "expected",
    status: "scheduled",
    published: true,
    regionGroup: "all",
    hijriLabel: null,
    publicNote: null,
    ruleNote: "محسوب من الجدول المعتاد",
  },
  {
    id: "draft",
    seriesId: "s1",
    titleAr: "مسودة لا تظهر",
    startsOn: "2027-02-27",
    endsOn: null,
    sourceUrl: "https://www.mof.gov.sa/financial_reports",
    sourceTitle: "وزارة المالية",
    certainty: "unverified",
    status: "scheduled",
    published: false,
    regionGroup: "all",
    hijriLabel: null,
    publicNote: null,
    ruleNote: null,
  },
];

describe("mawaeed HTML", () => {
  it("recognises only the public page paths", () => {
    expect(mawaeedSlugFromPath("/mawaeed")).toBe("");
    expect(mawaeedSlugFromPath("/mawaeed/salaries")).toBe("salaries");
    expect(mawaeedSlugFromPath("/article/hello")).toBeNull();
    expect(mawaeedSlugFromPath("/dashboard/mawaeed")).toBeNull();
    expect(mawaeedSlugFromPath("/mawaeed/salaries/extra")).toBeNull();
  });

  it("prints the date, the expected label, and a countdown hook", () => {
    const presented = presentMawaeed({
      pageSlug: "salaries",
      now: new Date("2026-09-27T12:00:00+03:00"),
      series: [series],
      occurrences: rows,
    });
    if (presented.notFound) throw new Error("expected salaries view");
    const html = renderMawaeedHtml(presented.view);
    expect(html).toContain("27 يناير 2027");
    expect(html).toContain("data-countdown");
    expect(html).toContain("متوقع");
    expect(html).toContain("محسوب من الجدول المعتاد");
    expect(html).not.toContain("مسودة لا تظهر");
    expect(html).not.toContain("foundingDate");
    expect(html).toContain('dir="rtl"');
  });
});
