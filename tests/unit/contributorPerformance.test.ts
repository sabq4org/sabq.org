import { describe, expect, it } from "vitest";
import { fillSeries, peakDay, performanceQuerySchema, rankOf, trendPct } from "../../shared/contributorPerformance";

describe("contributor performance helpers", () => {
  it("fills missing days with zeros, newest last", () => {
    const today = new Date("2026-10-31T10:00:00Z");
    const series = fillSeries([{ date: "2026-10-30", views: 5 }, { date: "2026-10-30", views: 2 }], 3, today);
    expect(series).toEqual([
      { date: "2026-10-29", views: 0 },
      { date: "2026-10-30", views: 7 },
      { date: "2026-10-31", views: 0 },
    ]);
    expect(peakDay(series)).toEqual({ date: "2026-10-30", views: 7 });
    expect(peakDay([{ date: "2026-10-31", views: 0 }])).toBeNull();
  });

  it("computes trend only with a baseline", () => {
    expect(trendPct(118, 100)).toBe(18);
    expect(trendPct(50, 0)).toBeNull();
  });

  it("ranks the user among owners", () => {
    const rows = [{ ownerId: "a", views: 10 }, { ownerId: "u", views: 30 }, { ownerId: null, views: 99 }, { ownerId: "b", views: 50 }];
    expect(rankOf(rows, "u")).toEqual({ rank: 2, total: 3 });
    expect(rankOf(rows, "x")).toBeNull();
  });

  it("defaults to 30 days and rejects other periods", () => {
    expect(performanceQuerySchema.parse({}).period).toBe("30");
    expect(performanceQuerySchema.safeParse({ period: "90" }).success).toBe(false);
  });
});
