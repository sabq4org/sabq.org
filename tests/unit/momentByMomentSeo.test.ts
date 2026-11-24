import { describe, it, expect } from "vitest";
import { MOMENT_BY_MOMENT_TITLE, momentByMomentDescription } from "../../shared/momentByMomentSeo";

describe("momentByMomentSeo", () => {
  it("title says latest breaking news", () => {
    expect(MOMENT_BY_MOMENT_TITLE).toContain("آخر الأخبار العاجلة");
  });
  it("falls back to base description without a headline", () => {
    expect(momentByMomentDescription()).not.toContain("الآن:");
    expect(momentByMomentDescription("   ")).not.toContain("الآن:");
  });
  it("appends the latest headline", () => {
    expect(momentByMomentDescription("أمطار على الرياض")).toMatch(/الآن: أمطار على الرياض$/);
  });
  it("caps length at 160 chars", () => {
    const d = momentByMomentDescription("خبر ".repeat(100));
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("…")).toBe(true);
  });
});
