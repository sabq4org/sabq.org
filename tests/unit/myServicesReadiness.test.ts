import { describe, expect, it } from "vitest";
import { bylineReadiness, lettersReadiness, licenseReadiness, profileReadiness } from "@/lib/myServicesReadiness";

describe("my services readiness", () => {
  it("byline", () => {
    expect(bylineReadiness(null).value).toBe("…");
    expect(bylineReadiness({ current: { titleAr: null }, request: null }).value).toBe("أضف صفتك");
    expect(bylineReadiness({ current: { titleAr: "كاتب" }, request: { status: "approved" } }).tone).toBe("ok");
    expect(bylineReadiness({ current: { titleAr: "كاتب" }, request: { status: "pending" } }).value).toBe("بانتظار المحرر");
  });
  it("profile", () => {
    expect(profileReadiness({ profile: { profileReviewStatus: "approved" } }).value).toBe("معتمد");
    expect(profileReadiness({ profile: { profileReviewStatus: "draft", completionPercent: 62.4 } }).value).toBe("مكتمل 62٪");
    expect(profileReadiness({ profile: null }).value).toBe("مكتمل 0٪");
  });
  it("letters", () => {
    expect(lettersReadiness({ letters: [{ status: "cancelled" }] }).tone).toBe("action");
    expect(lettersReadiness({ letters: [{ status: "issued" }, { status: "issued" }] }).chip).toBe("2 صادرة");
  });
  it("license", () => {
    expect(licenseReadiness({ submitted: false }).value).toBe("غير مسجّل");
    expect(licenseReadiness({ submitted: true, valid: true, expiresAt: "2027-03-14T00:00:00.000Z" }).value).toMatch(/^ساري حتى 2027-03-1[34]$/);
    expect(licenseReadiness({ submitted: true, expired: true }).value).toBe("منتهٍ");
    expect(licenseReadiness({ submitted: true, pendingReview: true }).tone).toBe("wait");
  });
});
