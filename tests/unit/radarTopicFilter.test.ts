import { describe, expect, it } from "vitest";
import {
  filterItemsBySabqInterest,
  matchesSabqInterest,
  sabqInterestXQueryClause,
  shouldApplyTopicFilter,
} from "../../server/services/radar/topicFilter";
import type { RadarSource } from "../../shared/schema";

function source(partial: Partial<RadarSource>): RadarSource {
  return {
    id: "1",
    name: "t",
    url: "https://example.com",
    type: "rss",
    language: "en",
    categorySlug: null,
    fetchIntervalMinutes: 5,
    isActive: true,
    lastFetchedAt: null,
    lastError: null,
    xType: null,
    xValue: null,
    xProvider: null,
    xSinceId: null,
    tier: null,
    region: null,
    weight: 1,
    packId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("matchesSabqInterest", () => {
  it(" يقبل السعودية والمونديال وإيران والنجوم", () => {
    expect(matchesSabqInterest("Saudi Arabia signs deal")).toBe(true);
    expect(matchesSabqInterest("World Cup 2026 draw")).toBe(true);
    expect(matchesSabqInterest("Iran and US tensions rise")).toBe(true);
    expect(matchesSabqInterest("Ronaldo scores for Al Nassr")).toBe(true);
    expect(matchesSabqInterest("الهلال يتعاقد مع نجم")).toBe(true);
  });

  it("يرفض الشأن المحلي الأمريكي الضيق", () => {
    expect(matchesSabqInterest("City council approves new parking fees in Ohio")).toBe(false);
    expect(matchesSabqInterest("NFL draft pick signs with Jets")).toBe(false);
  });
});

describe("shouldApplyTopicFilter", () => {
  it("يُفلتر المصادر الأمريكية/العالمية لا الخليجية ولا كبسولة", () => {
    expect(shouldApplyTopicFilter(source({ region: "us" }))).toBe(true);
    expect(shouldApplyTopicFilter(source({ region: "global" }))).toBe(true);
    expect(shouldApplyTopicFilter(source({ region: "gulf" }))).toBe(false);
    expect(shouldApplyTopicFilter(source({ packId: "saudi-gulf" }))).toBe(false);
    expect(shouldApplyTopicFilter(source({ packId: "capsulah", region: "us" }))).toBe(false);
    expect(shouldApplyTopicFilter(source({ packId: "capsulah", region: "global" }))).toBe(false);
  });
});

describe("filterItemsBySabqInterest", () => {
  it("يبقي المطابق فقط", () => {
    const kept = filterItemsBySabqInterest([
      { title: "Messi wins award", excerpt: "" },
      { title: "Local bake sale in Texas", excerpt: "community news" },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toContain("Messi");
  });
});

describe("sabqInterestXQueryClause", () => {
  it("يبني جملة OR صالحة لـ X", () => {
    const clause = sabqInterestXQueryClause();
    expect(clause.startsWith("(")).toBe(true);
    expect(clause).toContain("Saudi");
    expect(clause).toContain("Iran");
    expect(clause).toContain("World Cup");
  });
});
