/**
 * عقود لوحة متصدري التوقعات (Leaderboard Pagination & Total Count)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SERVICE = readFileSync(
  path.resolve(import.meta.dirname, "../../server/services/predictions/predictionCoreService.ts"),
  "utf8",
);
const PAGE = readFileSync(
  path.resolve(import.meta.dirname, "../../client/src/pages/PredictionCenter.tsx"),
  "utf8",
);

describe("getLeaderboard — عقود الخدمة والترقيم", () => {
  const fnBody = SERVICE.slice(
    SERVICE.indexOf("export async function getLeaderboard"),
    SERVICE.indexOf("export async function getContestSettlement"),
  );

  it("تحسب إجمالي المشاركين totalCount وتعيده في الرد", () => {
    expect(fnBody).toContain("count(*)::int");
    expect(fnBody).toContain("totalCount");
  });

  it("تحدد الحد الافتراضي بـ 50 وسقف 100", () => {
    expect(fnBody).toContain("params.limit ?? 50, 100");
  });

  it("تدعم الإزاحة (offset) للتنقل بين الصفحات", () => {
    expect(fnBody).toContain(".offset(offset)");
  });
});

describe("تبويب المتصدرين في الويب — PredictionCenter", () => {
  it("يعرض إجمالي المشاركين ويدعم تحميل المزيد", () => {
    expect(PAGE).toContain("totalCount != null && totalCount > 0");
    expect(PAGE).toContain("مشارك");
    expect(PAGE).toContain("loadMoreLeaders");
    expect(PAGE).toContain("عرض المزيد من المتصدرين");
  });
});
