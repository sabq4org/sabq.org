import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/ai-manager", () => ({ aiManager: {} }));

import { allowedNumberTokens, findForeignNumbers } from "../../server/services/economy/economyNewsGenerator";
import type { WeeklySpendingStory } from "../../server/services/economy/weeklyStory";

const story = {
  weekLabelAr: "16–22 أغسطس",
  periodStart: "2026-08-16",
  periodEnd: "2026-08-22",
  kpis: [
    { key: "total", labelAr: "إجمالي الإنفاق", value: 14_173_199_000, unitAr: "ريال", changePct: -0.1, series: [] },
    { key: "count", labelAr: "عدد العمليات", value: 237_347_000, unitAr: "عملية", changePct: -4.9, series: [] },
  ],
  stories: [{ key: "sectorRiser", headline: "التعليم يقفز 133.9% في أسبوع", cardTitle: "", figure: "", detailAr: "من 446.1 مليون إلى 1.04 مليار ريال", tone: "up", weight: 90, facts: { sector: "التعليم", changePct: 133.9 } }],
  lead: { headline: "التعليم يقفز 133.9% في أسبوع", subheadline: "14.17 مليار ريال", intro: "" },
  sectors: [], cities: [], citiesShareTop: [{ ar: "الرياض", share: 36.2 }], otherCitiesShare: 63.8, risers: [], fallers: [],
  totals: { value: 14_173_199_000, count: 237_347_000, series: [], countSeries: [] },
} as unknown as WeeklySpendingStory;

describe("حارس الأرقام في الخبر الآلي", () => {
  it("يقبل نصًا كل أرقامه من الحمولة بصيغها المختلفة", () => {
    const allowed = allowedNumberTokens(story);
    const text = "<p>بلغ الإنفاق 14.17 مليار ريال عبر 237.3 مليون عملية بتراجع 0.1%، وقفز التعليم 133.9% مع استحواذ الرياض على 36.2% خلال أسبوع 16–22 أغسطس 2026.</p>";
    expect(findForeignNumbers(text, allowed)).toEqual([]);
  });

  it("يرفض أي رقم مخترع أو محسوب من النموذج", () => {
    const allowed = allowedNumberTokens(story);
    const text = "<p>بلغ الإنفاق 14.17 مليار ريال، ما يعادل 2.02 مليار يوميًا، بينما ارتفع التعليم 134%.</p>";
    const foreign = findForeignNumbers(text, allowed);
    expect(foreign).toContain("2.02");
    expect(foreign).not.toContain("14.17");
    // 134 ≈ 133.9 مقرّبًا لصفر منازل → مسموح (التقريب الصحفي المعتاد)
    expect(foreign).not.toContain("134");
  });
});
