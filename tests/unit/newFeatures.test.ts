import { describe, expect, it } from "vitest";
import {
  isFeatureNew,
  markFeatureOpened,
  markFeaturesShown,
  parseNewFeatureSeen,
  pathHasNewFeature,
  type NewFeature,
} from "@/lib/newFeatures";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-11-24T10:00:00Z");
const feature: NewFeature = { key: "x", label: "x", paths: ["/dashboard/my-services"], showUntil: "2027-03-31" };

describe("new feature badge", () => {
  it("is new until opened", () => {
    expect(isFeatureNew(feature, {}, now)).toBe(true);
    const opened = markFeatureOpened({}, "x", now)!;
    expect(isFeatureNew(feature, opened, now)).toBe(false);
    expect(markFeatureOpened(opened, "x", now + 1)).toBeNull();
  });

  it("expires 14 days after it was first shown", () => {
    const shown = markFeaturesShown({}, now, [feature])!;
    expect(isFeatureNew(feature, shown, now + 13 * DAY)).toBe(true);
    expect(isFeatureNew(feature, shown, now + 15 * DAY)).toBe(false);
    expect(markFeaturesShown(shown, now + DAY, [feature])).toBeNull();
  });

  it("never shows after the end date", () => {
    expect(isFeatureNew(feature, {}, Date.parse("2027-04-01T00:00:00Z"))).toBe(false);
  });

  it("matches nav paths ignoring query and trailing slash", () => {
    expect(pathHasNewFeature("/dashboard/my-services/", {}, now, [feature])).toBe(true);
    expect(pathHasNewFeature("/dashboard/my-services?tab=1", {}, now, [feature])).toBe(true);
    expect(pathHasNewFeature("/dashboard/files", {}, now, [feature])).toBe(false);
    expect(pathHasNewFeature(undefined, {}, now, [feature])).toBe(false);
  });

  it("parses stored state defensively", () => {
    expect(parseNewFeatureSeen("not json")).toEqual({});
    expect(parseNewFeatureSeen("[1]")).toEqual({});
    expect(parseNewFeatureSeen('{"x":{"openedAt":5,"bad":"y"},"z":3}')).toEqual({ x: { openedAt: 5 } });
  });
});
