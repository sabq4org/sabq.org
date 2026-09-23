/**
 * عقود «توقعاتي» (2026-08-13): تبويب مراجعة التوقعات ومقارنتها بالنتائج.
 * الخدمة تستورد db فلا تُستورد في الوحدة — نفحص السجل من المصدر مباشرة
 * (نمط sportsSeasonFallback.test.ts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SERVICE = readFileSync(
  path.resolve(import.meta.dirname, "../../server/services/predictions/predictionCoreService.ts"),
  "utf8",
);
const ROUTES = readFileSync(
  path.resolve(import.meta.dirname, "../../server/routes/predictionsCore.ts"),
  "utf8",
);
const PAGE = readFileSync(
  path.resolve(import.meta.dirname, "../../client/src/pages/PredictionCenter.tsx"),
  "utf8",
);

describe("getUserEntries — عقود الخدمة", () => {
  const fnBody = SERVICE.slice(
    SERVICE.indexOf("export async function getUserEntries"),
    SERVICE.indexOf("function encodeCursor"),
  );

  it("موجودة ومسجّلة على مسار ويب محمي بالجلسة", () => {
    expect(fnBody.length).toBeGreaterThan(0);
    expect(ROUTES).toContain('"/api/predictions/me/entries", requireAuth');
    expect(ROUTES).toContain("getUserEntries(req.user.id");
  });

  it("لا تسرّب النتيجة قبل التسوية (نفس قاعدة serializeContest)", () => {
    expect(fnBody).toContain("resultWithPenalties(contest)");
  });

  it("تقتصر على مدخلات المستخدم النشطة وتستبعد مسودات المسابقات", () => {
    expect(fnBody).toContain('eq(predictionEntries.status, "active")');
    expect(fnBody).toContain("<> 'draft'");
  });

  it("keyset ثابت على (locksAt, id) — صفحات لا تتزحزح مع الإضافة", () => {
    expect(fnBody).toMatch(/orderBy\(desc\(predictionContests\.locksAt\), desc\(predictionContests\.id\)\)/);
    expect(fnBody).toContain("limit(limit + 1)");
  });

  it("الجوائز تحمل المبرر العربي (reasonLabelAr) مع النقاط", () => {
    expect(fnBody).toContain("REASON_LABELS_AR[row.reasonCode as ReasonCode]");
    expect(fnBody).toContain("totalPoints");
  });
});

describe("تبويب توقعاتي في الويب", () => {
  it("حلّ محل «سجلّي» ويحمل تسميته المعتمدة", () => {
    expect(PAGE).toContain('label: "توقعاتي"');
    expect(PAGE).not.toContain('"سجلّي"');
  });

  it("يجلب من نقطة me/entries ويُبطل كاشها بعد كل توقّع", () => {
    expect(PAGE).toContain('"/api/predictions/me/entries"');
    const matchCard = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../client/src/components/predictions/PredictionMatchCard.tsx",
      ),
      "utf8",
    );
    expect(matchCard).toContain('["/api/predictions/me/entries"]');
  });
});
