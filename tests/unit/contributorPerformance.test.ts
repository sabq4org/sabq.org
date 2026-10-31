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

describe("snapshotViewDeltas", () => {
  it("turns cumulative snapshots into per-day views and counts today from the live counter", async () => {
    const { snapshotViewDeltas } = await import("../../shared/contributorPerformance");
    const out = snapshotViewDeltas({
      rows: [
        { articleId: "old", date: "2026-10-28", views: 1000 },
        { articleId: "old", date: "2026-10-29", views: 1100 },
        { articleId: "old", date: "2026-10-30", views: 1150 },
      ],
      articles: [
        { id: "old", views: 1200, publishedAt: new Date("2026-01-01T00:00:00Z") },
        { id: "new", views: 1078, publishedAt: new Date("2026-10-31T09:29:00Z") },
        { id: "noBase", views: 500, publishedAt: new Date("2025-12-01T00:00:00Z") },
      ],
      baseDay: "2026-10-28",
      today: "2026-10-31",
    });
    expect(out).toEqual([
      { articleId: "old", date: "2026-10-29", views: 100 },
      { articleId: "old", date: "2026-10-30", views: 50 },
      { articleId: "old", date: "2026-10-31", views: 50 },
      { articleId: "new", date: "2026-10-31", views: 1078 },
    ]);
  });
});
