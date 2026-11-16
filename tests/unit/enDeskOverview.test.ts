import { describe, expect, it } from "vitest";
import { buildEnDeskNeeds, enPublishedSource, nextEnAutoTranslateRun, riyadhDayStart, riyadhNextMidnight, type EnDeskNeedRow } from "@shared/enDeskOverview";

const row = (o: Partial<EnDeskNeedRow>): EnDeskNeedRow => ({
  id: "x", title: "t", status: "draft", reviewStatus: null, imageUrl: "img", hasSeoTitle: true,
  hideFromHomepage: false, isAutoTranslated: false, scheduledAt: null, publishedAt: null,
  updatedAt: "2026-11-16T20:00:00Z", categoryName: null, ...o,
});

describe("Riyadh day helpers", () => {
  it("day starts at 21:00 UTC the day before", () => {
    expect(riyadhDayStart(new Date("2026-11-16T21:03:00Z")).toISOString()).toBe("2026-11-16T21:00:00.000Z");
    expect(riyadhDayStart(new Date("2026-11-16T20:59:00Z")).toISOString()).toBe("2026-11-15T21:00:00.000Z");
    expect(riyadhNextMidnight(new Date("2026-11-16T20:59:00Z")).toISOString()).toBe("2026-11-16T21:00:00.000Z");
  });
  it("next auto-translate run is :05 past the next even Riyadh hour", () => {
    // 00:03 Riyadh → 00:05 Riyadh
    expect(nextEnAutoTranslateRun(new Date("2026-11-16T21:03:00Z")).toISOString()).toBe("2026-11-16T21:05:00.000Z");
    // 00:06 Riyadh → 02:05 Riyadh
    expect(nextEnAutoTranslateRun(new Date("2026-11-16T21:06:00Z")).toISOString()).toBe("2026-11-16T23:05:00.000Z");
    // 23:30 Riyadh → 00:05 next day
    expect(nextEnAutoTranslateRun(new Date("2026-11-16T20:30:00Z")).toISOString()).toBe("2026-11-16T21:05:00.000Z");
  });
});

describe("buildEnDeskNeeds", () => {
  it("orders scheduled, in review, hidden, drafts and gives hints", () => {
    const out = buildEnDeskNeeds([
      row({ id: "d1", imageUrl: null }),
      row({ id: "h1", status: "published", hideFromHomepage: true, isAutoTranslated: true }),
      row({ id: "s2", status: "scheduled", scheduledAt: "2026-11-16T23:00:00Z" }),
      row({ id: "s1", status: "scheduled", scheduledAt: "2026-11-16T22:00:00Z" }),
      row({ id: "r1", reviewStatus: "pending_review" }),
      row({ id: "d2", hasSeoTitle: false }),
      row({ id: "p1", status: "published" }),
    ]);
    expect(out.map((n) => n.id)).toEqual(["s1", "s2", "r1", "h1", "d1", "d2"]);
    expect(out.find((n) => n.id === "d1")?.hint).toBe("no image yet");
    expect(out.find((n) => n.id === "d2")?.hint).toBe("SEO missing");
    expect(out.find((n) => n.id === "h1")?.hint).toContain("hidden from homepage");
  });
  it("respects the limit", () => {
    expect(buildEnDeskNeeds(Array.from({ length: 12 }, (_, i) => row({ id: String(i) })), 8)).toHaveLength(8);
  });
});

describe("enPublishedSource", () => {
  it("labels bot, auto, translated and editor rows", () => {
    expect(enPublishedSource({ source: "bot" })).toBe("bot");
    expect(enPublishedSource({ trigger: "auto", sourceArticleId: "a" })).toBe("auto");
    expect(enPublishedSource({ sourceArticleId: "a", trigger: "manual" })).toBe("translated");
    expect(enPublishedSource(null)).toBe("editor");
  });
});
