import { describe, expect, it } from "vitest";
import {
  buildOpportunities,
  buildReview,
  expectedCtr,
  pageKind,
  pickLesson,
  pickWinners,
  reportPeriod,
  suggestVerdict,
  targetCtrFor,
  type GscPageRow,
} from "@shared/seoWeekly";

const row = (page: string, clicks: number, impressions: number, position: number): GscPageRow => ({
  page: `https://sabq.org${page}`,
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

describe("reportPeriod", () => {
  it("ends three days before today and compares with the 7 days before", () => {
    const p = reportPeriod(new Date("2026-11-29T06:00:00Z"));
    expect(p).toEqual({ start: "2026-11-20", end: "2026-11-26", prevStart: "2026-11-13", prevEnd: "2026-11-19" });
  });
});

describe("pageKind", () => {
  it("classifies Sabq paths", () => {
    expect(pageKind("/")).toBe("home");
    expect(pageKind("/article/abc")).toBe("article");
    expect(pageKind("/category/CWtMvGT")).toBe("category");
    expect(pageKind("/en/article/x")).toBe("en_article");
    expect(pageKind("/moment-by-moment")).toBe("other");
  });
});

describe("buildOpportunities", () => {
  // أرقام أسبوع 16–22 نوفمبر 2026 الفعلية لصفحتين
  const current = [
    row("/", 170804, 285443, 1.3),
    row("/moment-by-moment", 3706, 269783, 1.1),
    row("/category/CWtMvGT", 2903, 247541, 1.0),
    row("/article/dja8911", 4350, 95109, 4.7),
    row("/category/sports", 400, 9000, 3),
    row("/en/article/libya", 10, 2000, 12),
  ];
  const previous = [row("/category/sports", 900, 10000, 3), row("/moment-by-moment", 3965, 275928, 1.1)];

  it("never proposes the homepage or a news article", () => {
    const opps = buildOpportunities(current, previous);
    expect(opps.map((o) => o.path)).not.toContain("/");
    expect(opps.map((o) => o.path)).not.toContain("/article/dja8911");
  });

  it("picks one per lane, ranked by expected gain", () => {
    const opps = buildOpportunities(current, previous);
    expect(opps).toHaveLength(3);
    expect(opps.map((o) => o.lane).sort()).toEqual(["english", "low_ctr", "section_drop"]);
    expect(opps[0].path).toBe("/moment-by-moment");
    expect(opps[0].expectedGain).toBeGreaterThan(opps[1].expectedGain);
    expect(opps.every((o) => o.status === "proposed")).toBe(true);
    const drop = opps.find((o) => o.lane === "section_drop")!;
    expect(drop.path).toBe("/category/sports");
    expect(drop.expectedGain).toBe(500);
  });

  it("fills with the next best when a lane is empty, and skips pages under experiment", () => {
    const opps = buildOpportunities(current, [], { exclude: new Set(["https://sabq.org/moment-by-moment"]) });
    expect(opps.map((o) => o.path)).not.toContain("/moment-by-moment");
    expect(opps.map((o) => o.path)).toContain("/category/CWtMvGT");
  });

  it("keeps the same key for the same page and lane", () => {
    expect(buildOpportunities(current, previous)[0].key).toBe(buildOpportunities(current, [])[0].key);
  });
});

describe("targets", () => {
  it("doubles CTR but never above the expected CTR for the position", () => {
    expect(targetCtrFor(0.014, 1.1)).toBeCloseTo(0.028);
    expect(targetCtrFor(0.15, 1.1)).toBe(expectedCtr(1.1));
  });
});

describe("winners and lesson", () => {
  const current = [
    row("/article/qahr687", 7800, 30863, 1.3),
    row("/article/6vjz121", 10250, 99815, 1.2),
    row("/article/dja8911", 4350, 95109, 4.7),
    row("/category/x", 9000, 20000, 1),
  ];
  it("lists articles with CTR ≥ 10% only", () => {
    expect(pickWinners(current).map((w) => w.path)).toEqual(["/article/qahr687", "/article/6vjz121"]);
  });
  it("flags a big-impression article outside the top 3", () => {
    expect(pickLesson(current)?.path).toBe("/article/dja8911");
  });
});

describe("experiment verdict", () => {
  const base = { clicks: 3706, impressions: 269783, ctr: 0.0137, position: 1.1 };
  it("suggests continue, stop or extend", () => {
    expect(suggestVerdict(base, { ...base, ctr: 0.026, clicks: 7000 })).toBe("continue");
    expect(suggestVerdict(base, { ...base, ctr: 0.008, clicks: 2000 })).toBe("stop");
    expect(suggestVerdict(base, { ...base, ctr: 0.015 })).toBe("extend");
    expect(suggestVerdict(base, null)).toBe("extend");
  });
  it("builds a review with deltas", () => {
    const [opp] = buildOpportunities([row("/moment-by-moment", 3706, 269783, 1.1)], []);
    const review = buildReview("r1", opp, { clicks: 7000, impressions: 270000, ctr: 0.026, position: 1.1 });
    expect(review.clicksDelta).toBe(3294);
    expect(review.suggestion).toBe("continue");
    expect(review.verdict).toBeNull();
  });
});
