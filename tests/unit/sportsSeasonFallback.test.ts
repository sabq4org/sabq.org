/**
 * حادثة VARA 2026-08-05: fallbackSeason لدوري الأبطال/يوروبا بقي 2025 بعد
 * انتقال الموسم، فسمّم كاش الموسم عند فشل المزوّد وأفرغ مباريات التصفيات.
 * نقرأ السجل من المصدر مباشرة لتفادي استيراد مكدّس الخدمات الرياضية في الوحدة.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(
  path.resolve(import.meta.dirname, "../../server/services/saudiLeagueService.ts"),
  "utf8",
);

function fallbackFor(slug: string): number | null {
  const re = new RegExp(
    String.raw`slug:\s*"${slug}"[\s\S]*?fallbackSeason:\s*(\d{4})`,
  );
  const m = SRC.match(re);
  return m ? Number(m[1]) : null;
}

describe("fallbackSeason — كؤوس أوروبا الجارية", () => {
  it("دوري أبطال أوروبا والدوري الأوروبي على موسم 2026", () => {
    expect(fallbackFor("champions-league")).toBe(2026);
    expect(fallbackFor("europa-league")).toBe(2026);
  });

  it("seasonFor لا يعيد كاشًا منفصلًا يُسمَّم عند الفشل", () => {
    expect(SRC).toContain("await getCompetitionMeta(comp)");
    expect(SRC).not.toMatch(/withSWR\(`spl:season:\$\{comp\.id\}`/);
  });
});
