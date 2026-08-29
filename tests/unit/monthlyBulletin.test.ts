import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseMonthlyBulletin } from "../../server/services/sama/parsers/monthlyBulletin";
import { buildMonthlyStory, monthLabelAr } from "../../server/services/economy/monthlyStory";

const fixture = fs.readFileSync(path.join(__dirname, "..", "fixtures", "sama", "monthly-bulletin-2026-06.trimmed.xlsx"));

describe("النشرة الإحصائية الشهرية (Excel)", () => {
  let b: Awaited<ReturnType<typeof parseMonthlyBulletin>>;
  beforeAll(async () => { b = await parseMonthlyBulletin(fixture); });

  it("يحدد آخر شهر ويقرأ الأعمدة المستهدفة بوحداتها الطبيعية", () => {
    expect(b.latestMonth).toBe("2026-06");
    const last = (k: keyof typeof b.monthly) => b.monthly[k].at(-1)!;
    expect(last("pos.sales").value).toBeCloseTo(57_484_646_778, -3);          // ألف ريال → ريال
    expect(last("atm.count").value).toBe(14392);
    expect(last("atm.cashWithdrawals").value).toBeCloseTo(39_021_107_880, -3); // مليون → ريال
    expect(last("mortgage.contracts").value).toBe(8834);
    expect(last("mortgage.total").value).toBe(5_702_000_000);
    expect(last("deposits.timeSavings").value).toBeCloseTo(1_375_382_551_560, -3);
    expect(last("cpi.general").value).toBeCloseTo(105.45, 2);
    expect(last("cpi.housing").value).toBeCloseTo(116.75, 2);
    expect(last("sadad.count").value).toBe(38_134_839);
    expect(last("instant.count").value).toBe(85_864_630);
    expect(last("cheques.count").value).toBe(31_414);
    expect(last("ecom.sales").value).toBeCloseTo(33_633_876_061, -3);
  });

  it("يقرأ الربعي (القروض الاستهلاكية) وميزان المدفوعات بالتسميات", () => {
    expect(b.quarterly["consumer.creditCards"].at(-1)?.period).toBe("2026-Q2");
    expect(b.quarterly["consumer.creditCards"].at(-1)?.value).toBeCloseTo(34_353_736_000, -2);
    expect(b.quarterly["consumer.education"].at(-1)?.value).toBe(9_836_086_000);
    const rem = b.quarterly["bop.workersRemittances"];
    expect(rem.at(-1)?.period).toBe("2026-Q1");
    expect(rem.at(-1)?.value).toBeCloseTo(64_837_554_301, -3);
    expect(rem.find((p) => p.period === "2025-Q1")?.value).toBeCloseTo(50_683_000_000, -8);
  });

  it("السلاسل الشهرية مرتبة زمنيًا وبلا تكرار", () => {
    for (const s of Object.values(b.monthly)) {
      const periods = s.map((p) => p.period);
      expect([...periods].sort()).toEqual(periods);
      expect(new Set(periods).size).toBe(periods.length);
    }
  });

  it("محرك «السعوديون في شهر» يولّد البطاقات بعناوين مطابقة للأرقام", () => {
    const st = buildMonthlyStory(b);
    expect(st.monthLabelAr).toBe("يونيو 2026");
    expect(monthLabelAr("2026-01")).toBe("يناير 2026");
    const byKey = Object.fromEntries(st.cards.map((c) => [c.key, c]));
    expect(byKey.mobileVsCard.headline).toContain("30.8 مليار");
    expect(byKey.mobileVsCard.headline).toContain("23.8 مليار");
    expect(byKey.mortgages.headline).toContain("8,834");
    expect(byKey.mortgages.headline).toContain("5.7 مليار");
    expect(byKey.cash.headline).toContain("14,392");
    expect(byKey.inflation.figure).toBe("1.8%");
    expect(byKey.inflation.headline).toContain("السكن والإيجار");
    expect(byKey.savings.facts.record).toBe(1);
    expect(byKey.remittances.headline).toContain("64.8 مليار");
    expect(byKey.creditCards.headline).toContain("34.4 مليار");
    // كل بطاقة شهرية معها 13 نقطة للرسم
    for (const c of st.cards) if (!["creditCards", "remittances"].includes(c.key)) expect(c.series).toHaveLength(13);
    // الترتيب بالثقل والعنوان الرئيسي هو الأثقل
    for (let i = 1; i < st.cards.length; i++) expect(st.cards[i - 1].weight).toBeGreaterThanOrEqual(st.cards[i].weight);
    expect(st.lead.headline).toBe(st.cards[0].headline);
    expect(st.trackers).toHaveLength(4);
  });
});
