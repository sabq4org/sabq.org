import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { annotateGroups, parsePosReport, parseWeekHeader } from "../../server/services/sama/parsers/posReport";
import { parseMoneySupplyReport } from "../../server/services/sama/parsers/moneySupplyReport";
import { parseReportIndexHtml } from "../../server/services/sama/samaReports";
import { parseSamaDate, parseSamaNumber } from "../../server/services/sama/samaClient";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "..", "fixtures", "sama", name));

describe("محلّلات ملفات ساما", () => {
  it("يقرأ تقرير نقاط البيع الحقيقي كاملًا (30 نشاطًا، 60 مدينة، 4 أسابيع)", async () => {
    const r = await parsePosReport(fixture("pos-2026-08-22.pdf"));
    expect(r.weeks.map((w) => w.end)).toEqual(["2026-08-01", "2026-08-08", "2026-08-15", "2026-08-22"]);
    expect(r.weeks[3].labelAr).toBe("16–22 أغسطس");
    expect(r.activities).toHaveLength(30);
    expect(r.cities).toHaveLength(60);
    expect(r.total.v).toEqual([16310584, 14596013, 14191529, 14173199]);
    expect(r.total.dv).toBe(-0.1);
    const edu = r.activities.find((a) => a.en === "Education")!;
    expect(edu.ar).toBe("التعليم");
    expect(edu.dv).toBe(133.9);
    expect(r.activities.filter((a) => a.isGroup).map((a) => a.en)).toEqual(["Transportation", "Health", "Recreation & Culture"]);
    expect(r.activities.find((a) => a.en === "Pharmacies & Medical Supplies")?.group).toBe("Health");
    expect(r.cities.find((c) => c.en === "Riyadh")?.ar).toBe("الرياض");
    expect(r.otherCities?.v[3]).toBe(1042337);
  }, 30_000);

  it("يقرأ تقرير عرض النقود: كما في 20 أغسطس، ن3 = 3,398 مليار", async () => {
    const r = await parseMoneySupplyReport(fixture("money-supply-2026-08-20.pdf"));
    expect(r.asOf).toBe("2026-08-20");
    expect(r.aggregates).toEqual([
      { key: "M1", weeklyChangePct: -0.06, periodChangePct: -2.29 },
      { key: "M2", weeklyChangePct: 0.16, periodChangePct: 9.98 },
      { key: "M3", weeklyChangePct: 0.21, periodChangePct: 7.28 },
    ]);
    expect(r.m3Billion).toBe(3398);
    expect(r.m3Series[0]).toEqual({ label: "31st Dec 2025", value: 3168 });
    expect(r.m3Series).toHaveLength(7);
  }, 30_000);

  it("يفكّ رأس الأسابيع الذي يعبر شهرين", () => {
    const w = parseWeekHeader("26 Jul,26 - 1 Aug,26 2 Aug,26 - 8 Aug,26");
    expect(w).toHaveLength(2);
    expect(w[0]).toEqual({ start: "2026-07-26", end: "2026-08-01", labelAr: "26 يوليو – 1 أغسطس" });
  });

  it("يستنتج المجموعات من مجموع الفروع لا من أسماء ثابتة", () => {
    const mk = (en: string, v: number[]) => ({ en, ar: en, v, n: v, dn: 0, dv: 0 });
    const rows = annotateGroups([mk("G", [30, 30, 30, 30]), mk("a", [10, 10, 10, 10]), mk("b", [20, 20, 20, 20]), mk("solo", [5, 5, 5, 5])]);
    expect(rows[0].isGroup).toBe(true);
    expect(rows[1].group).toBe("G");
    expect(rows[2].group).toBe("G");
    expect(rows[3].isGroup).toBeUndefined();
    expect(rows[3].group).toBeUndefined();
  });

  it("يقرأ فهرس الملفات من WPQ1ListData ويتجاهل غير المطابق", () => {
    const html = `var WPQ1ListData = { "Row" : [
      {"ID": "339", "FileRef": "\\u002far-sa\\u002fStatistics\\u002fIndices\\u002fPOS\\u002fWeekly_Points_of_Sale_Transactions_Report_22nd_Aug_2026.pdf", "FileLeafRef": "x", "SAMAFilePublishDate": "25\\u002f08\\u002f2026"},
      {"ID": "338", "FileRef": "\\u002far-sa\\u002fStatistics\\u002fIndices\\u002fPOS\\u002fSomething_Else.pdf", "SAMAFilePublishDate": "18\\u002f08\\u002f2026"}
    ]};`;
    const files = parseReportIndexHtml(html, "pos_weekly");
    expect(files).toHaveLength(1);
    expect(files[0].url).toBe("https://www.sama.gov.sa/ar-sa/Statistics/Indices/POS/Weekly_Points_of_Sale_Transactions_Report_22nd_Aug_2026.pdf");
    expect(files[0].publishedAt).toBe("2026-08-25");
  });

  it("يوحّد تواريخ وأرقام ساما", () => {
    expect(parseSamaDate("10-12-2025")).toBe("2025-12-10");
    expect(parseSamaDate("30/07/2026")).toBe("2026-07-30");
    expect(parseSamaDate("2026-08-28T00:00:00")).toBe("2026-08-28");
    expect(parseSamaNumber("4.25%")).toBe(4.25);
    expect(parseSamaNumber("1,234.5")).toBe(1234.5);
    expect(parseSamaNumber("")).toBeNull();
  });
});
