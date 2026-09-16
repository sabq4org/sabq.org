import { describe, expect, it } from "vitest";
import { buildPredictionPromoFeed } from "../../server/services/predictions/predictionPromoFeed";

describe("buildPredictionPromoFeed", () => {
  const now = new Date("2026-07-31T12:00:00+03:00");

  it("يبني سطر إثبات اجتماعي بعدد المشاركين واسم المباراة", () => {
    const items = buildPredictionPromoFeed(
      [
        {
          id: "c1",
          competitionSlug: "rsl-2026",
          competitionNameAr: "دوري روشن السعودي",
          homeName: "الأهلي",
          awayName: "الدرعية",
          round: "الجولة 1",
          entriesCount: 128,
          locksAt: "2026-08-01T21:00:00+03:00",
        },
      ],
      { limit: 4, now },
    );

    expect(items[0]?.kind).toBe("crowd");
    expect(items[0]?.text).toContain("128");
    expect(items[0]?.text).toContain("الأهلي × الدرعية");
    expect(items[0]?.href).toBe("/predictions?competition=rsl-2026");
  });

  it("يدعو لأول متوقّع عندما لا يوجد مشاركون", () => {
    const items = buildPredictionPromoFeed(
      [
        {
          id: "c2",
          competitionSlug: "rsl-2026",
          competitionNameAr: "دوري روشن السعودي",
          homeName: "الحزم",
          awayName: "أبها",
          entriesCount: 0,
          locksAt: "2026-08-01T21:00:00+03:00",
        },
      ],
      { limit: 3, now },
    );

    expect(items[0]?.kind).toBe("invite");
    expect(items[0]?.text).toContain("كن أول المتوقّعين");
    expect(items[0]?.text).toContain("الحزم × أبها");
  });

  it("يتجاهل المباريات بلا أسماء ويكمل بسطور الحماس", () => {
    const items = buildPredictionPromoFeed(
      [
        {
          id: "c3",
          competitionSlug: "rsl-2026",
          competitionNameAr: "دوري روشن السعودي",
          homeName: null,
          awayName: null,
          entriesCount: 9,
          locksAt: "2026-08-01T21:00:00+03:00",
        },
      ],
      { limit: 2, now },
    );

    expect(items.every((i) => i.kind === "hype")).toBe(true);
    expect(items.length).toBe(2);
  });
});
