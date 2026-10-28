import { describe, expect, it } from "vitest";
import {
  arCount,
  buildPublicView,
  pickCurrentWeek,
  AUCTION_FORMS,
  auctionPhase,
  auctionsWriteSchema,
  createWeekSchema,
  formatSar,
  formatSarParts,
  formatWeekRange,
  normalizeAuctions,
  parseInfathPaste,
  riyadhToday,
  summarizeWeek,
  weekStartOf,
  type InfathAuction,
} from "@shared/infath";


const WEEK = "2026-10-25"; // أحد

function auction(over: Partial<InfathAuction> = {}): InfathAuction {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    date: "2026-10-25",
    time: "10:00",
    city: "الرياض",
    region: "riyadh",
    assetType: "أراضٍ سكنية",
    category: "residential",
    assetsCount: 10,
    format: "online",
    url: null,
    resultStatus: "scheduled",
    assetsSold: null,
    soldValue: null,
    ...over,
  };
}

describe("infath dates", () => {
  it("anchors weeks on Sunday in Riyadh time", () => {
    expect(weekStartOf("2026-10-28")).toBe(WEEK);
    expect(weekStartOf("2026-10-31")).toBe(WEEK);
    expect(weekStartOf("2026-11-01")).toBe("2026-11-01");
    // 22:30Z يوم السبت = 01:30 الأحد في الرياض
    expect(riyadhToday(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11-01");
  });

  it("formats week ranges across months", () => {
    expect(formatWeekRange(WEEK)).toBe("25 إلى 31 أكتوبر 2026");
    expect(formatWeekRange("2026-09-27")).toBe("27 سبتمبر إلى 3 أكتوبر 2026");
    expect(formatWeekRange("2026-12-27")).toBe("27 ديسمبر 2026 إلى 2 يناير 2027");
  });

  it("rejects a week that does not start on Sunday", () => {
    expect(createWeekSchema.safeParse({ weekStart: "2026-10-26" }).success).toBe(false);
    expect(createWeekSchema.safeParse({ weekStart: WEEK }).success).toBe(true);
  });
});

describe("infath numbers", () => {
  it("shortens riyal amounts", () => {
    expect(formatSarParts(1_140_000_000)).toEqual({ value: "1.14", unit: "مليار" });
    expect(formatSarParts(14_200_000)).toEqual({ value: "14.2", unit: "مليون" });
    expect(formatSarParts(186_000_000)).toEqual({ value: "186", unit: "مليون" });
    expect(formatSar(950_000)).toBe("950 ألف ريال");
    expect(formatSar(0)).toBe("0 ريال");
  });

  it("uses Arabic count forms", () => {
    expect(arCount(1, AUCTION_FORMS)).toBe("مزاد واحد");
    expect(arCount(2, AUCTION_FORMS)).toBe("مزادان");
    expect(arCount(7, AUCTION_FORMS)).toBe("7 مزادات");
    expect(arCount(33, AUCTION_FORMS)).toBe("33 مزادًا");
    expect(arCount(103, AUCTION_FORMS)).toBe("103 مزادات");
  });
});

describe("auctionsWriteSchema", () => {
  const schema = auctionsWriteSchema(WEEK);

  it("accepts a valid week and normalizes order", () => {
    const parsed = schema.parse({
      auctions: [
        auction({ id: "b", date: "2026-10-27", time: "16:00" }),
        auction({ id: "a", date: "2026-10-25", resultStatus: "held", assetsSold: 8, soldValue: 12_500_000 }),
      ],
    });
    expect(normalizeAuctions(parsed.auctions).map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("rejects dates outside the week, missing results, and oversold rows", () => {
    const result = schema.safeParse({
      auctions: [
        auction({ id: "1", date: "2026-11-01" }),
        auction({ id: "2", resultStatus: "held" }),
        auction({ id: "3", resultStatus: "held", assetsSold: 11, soldValue: 1 }),
        auction({ id: "4", assetsSold: 2, soldValue: 3 }),
      ],
    });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((i) => i.message).join(" | ");
    expect(messages).toContain("الصف 1: التاريخ خارج الأسبوع");
    expect(messages).toContain("الصف 2: أدخل الأصول المبيعة");
    expect(messages).toContain("الصف 3: الأصول المبيعة أكثر من المعروضة");
    expect(messages).toContain("الصف 4: النتائج تُدخل فقط");
  });

  it("rejects non-https links and duplicate ids", () => {
    expect(schema.safeParse({ auctions: [auction({ url: "http://infath.gov.sa/x" })] }).success).toBe(false);
    expect(schema.safeParse({ auctions: [auction({ id: "x" }), auction({ id: "x" })] }).success).toBe(false);
  });
});

describe("summarizeWeek", () => {
  it("counts held results, sell-through, regions and the top auction", () => {
    const s = summarizeWeek(WEEK, [
      auction({ resultStatus: "held", assetsCount: 10, assetsSold: 8, soldValue: 10_000_000 }),
      auction({ date: "2026-10-26", region: "makkah", city: "جدة", assetType: "فلل", resultStatus: "held", assetsCount: 10, assetsSold: 6, soldValue: 30_000_000 }),
      auction({ date: "2026-10-27", region: "eastern" }),
      auction({ date: "2026-10-28", resultStatus: "cancelled" }),
    ]);
    expect(s.auctions).toBe(3);
    expect(s.cancelled).toBe(1);
    expect(s.held).toBe(2);
    expect(s.soldValue).toBe(40_000_000);
    expect(s.sellThrough).toBe(70);
    expect(s.regions).toBe(3);
    expect(s.top).toMatchObject({ city: "جدة", assetType: "فلل", soldValue: 30_000_000 });
    expect(s.byRegion[0].region).toBe("makkah");
    expect(s.byDay).toHaveLength(7);
    expect(s.byDay[1]).toMatchObject({ date: "2026-10-26", held: 1, soldValue: 30_000_000 });
  });

  it("has no sell-through before any result", () => {
    expect(summarizeWeek(WEEK, [auction()]).sellThrough).toBeNull();
  });
});

describe("auctionPhase", () => {
  const a = auction({ date: "2026-10-27", time: "16:00" }); // 13:00Z
  it("follows the clock, and recorded results end the auction", () => {
    expect(auctionPhase(a, Date.parse("2026-10-27T12:59:00Z"))).toBe("upcoming");
    expect(auctionPhase(a, Date.parse("2026-10-27T14:00:00Z"))).toBe("live");
    expect(auctionPhase(a, Date.parse("2026-10-27T16:30:00Z"))).toBe("past");
    expect(auctionPhase({ ...a, resultStatus: "held" }, Date.parse("2026-10-27T13:30:00Z"))).toBe("past");
    expect(auctionPhase({ ...a, resultStatus: "cancelled" }, 0)).toBe("cancelled");
  });
});

describe("parseInfathPaste", () => {
  let n = 0;
  const id = () => `p${++n}`;
  it("reads Excel rows with Arabic labels, 12h times and Arabic digits", () => {
    const text = [
      "التاريخ\tالوقت\tالمدينة\tالمنطقة\tنوع الأصل\tالفئة\tعدد الأصول\tالصيغة\tالرابط",
      "25/10/2026\t4:00 م\tالخرج\tمنطقة الرياض\tأراضٍ زراعية\tزراعي\t١٥\tحضوري\t",
      "2026-10-26\t10:00\tجدة\tمكه\tفلل\tسكني\t10\tحضوري والكتروني\thttps://infath.gov.sa/a/1",
      "bad\trow",
    ].join("\n");
    const { rows, errors } = parseInfathPaste(text, id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-10-25", time: "16:00", region: "riyadh", category: "agricultural", assetsCount: 15, format: "in_person", url: null });
    expect(rows[1]).toMatchObject({ region: "makkah", format: "hybrid", url: "https://infath.gov.sa/a/1" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("السطر 4");
  });
});

describe("public view", () => {
  const summary = (soldValue: number) => ({ ...summarizeWeek("2026-10-18", []), soldValue });
  const index = [
    { id: "w3", weekStart: "2026-10-25", summary: summary(0), publishedAt: new Date() },
    { id: "w2", weekStart: "2026-10-18", summary: summary(1_140_000_000), publishedAt: new Date() },
    { id: "w1", weekStart: "2026-10-11", summary: summary(1_000_000_000), publishedAt: new Date() },
  ];

  it("picks this week, else the latest past week, else the nearest upcoming", () => {
    const desc = ["2026-11-01", "2026-10-25", "2026-10-18"];
    expect(pickCurrentWeek(desc, "2026-10-28")).toBe("2026-10-25");
    expect(pickCurrentWeek(["2026-10-18"], "2026-10-28")).toBe("2026-10-18");
    expect(pickCurrentWeek(["2026-11-08", "2026-11-01"], "2026-10-28")).toBe("2026-11-01");
    expect(pickCurrentWeek([], "2026-10-28")).toBeNull();
  });

  it("links the previous week, change, history and navigation", () => {
    const view = buildPublicView(index, { weekStart: "2026-10-25", auctions: [], updatedAt: "2026-10-25T06:00:00.000Z" });
    expect(view.previous).toMatchObject({ weekStart: "2026-10-18", soldValue: 1_140_000_000, changePct: 14 });
    expect(view.history.map((h) => h.weekStart)).toEqual(["2026-10-11", "2026-10-18"]);
    expect(view.archive.map((h) => h.weekStart)).toEqual(["2026-10-18", "2026-10-11"]);
    expect(view.nav).toEqual({ prev: "2026-10-18", next: null });
    const older = buildPublicView(index, { weekStart: "2026-10-18", auctions: [], updatedAt: "" });
    expect(older.nav).toEqual({ prev: "2026-10-11", next: "2026-10-25" });
    expect(older.previous?.changePct).toBeNull();
  });
});
