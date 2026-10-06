import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/email", () => ({ sendEmailNotification: vi.fn() }));
import {
  addMonths,
  currentRenewalMilestone,
  renewalMilestones,
  renewalPackageName,
  renewalReminderEmail,
} from "../../server/services/publisherRenewalService";
import { compareToUsual } from "../../server/services/publisherInsightsService";

describe("renewal reminder milestones", () => {
  it("starts three months ahead for open packages and one month for limited ones", () => {
    expect(renewalMilestones(true)).toEqual([90, 30, 7]);
    expect(renewalMilestones(false)).toEqual([30, 7]);
  });

  it("picks the smallest milestone reached, so each one fires once", () => {
    expect(currentRenewalMilestone(120, true)).toBeNull();
    expect(currentRenewalMilestone(90, true)).toBe(90);
    expect(currentRenewalMilestone(85, true)).toBe(90);
    expect(currentRenewalMilestone(30, true)).toBe(30);
    expect(currentRenewalMilestone(6, true)).toBe(7);
    expect(currentRenewalMilestone(0, true)).toBe(7);
    expect(currentRenewalMilestone(-1, true)).toBeNull();
    expect(currentRenewalMilestone(85, false)).toBeNull();
    expect(currentRenewalMilestone(20, false)).toBe(30);
  });
});

describe("renewal package", () => {
  it("adds calendar months without overflowing short months", () => {
    expect(addMonths(new Date("2026-12-30T21:00:00Z"), 12).toISOString()).toBe("2027-12-30T21:00:00.000Z");
    expect(addMonths(new Date("2027-01-31T10:00:00Z"), 1).toISOString()).toBe("2027-02-28T10:00:00.000Z");
  });

  it("names the package from the offer", () => {
    const base = { durationMonths: 12, startDate: "", price: null, currency: "SAR", validUntil: "", note: null, sentAt: "", sentBy: "" };
    expect(renewalPackageName({ ...base, packageType: "unlimited", totalCredits: null })).toBe("باقة مفتوحة سنوية");
    expect(renewalPackageName({ ...base, packageType: "limited", totalCredits: 50, durationMonths: 3 })).toBe("باقة 50 خبر · 3 أشهر");
  });
});

describe("renewal reminder email (agreed copy)", () => {
  const email = renewalReminderEmail({
    agencyName: "وكالة <المثال>",
    contactPerson: "أحمد",
    expiryDate: "2026-12-30T21:00:00Z",
    isUnlimited: true,
    daysLeft: 85,
    published: 73,
    views: 412000,
  });

  it("carries the expiry date, the package's numbers and the renewal button", () => {
    expect(email.subject).toContain("وكالة <المثال>");
    expect(email.subject).toContain("تنتهي في");
    expect(email.html).toContain("باقة النشر المفتوحة");
    expect(email.html).toContain("أي بعد نحو ثلاثة أشهر");
    expect(email.html).toContain("الأستاذ/ة أحمد المحترم/ة");
    expect(email.html).toContain("٧٣");
    expect(email.html).toContain("https://sabq.org/dashboard/publisher/credits");
    expect(email.html).toContain("اطلب التجديد");
    expect(email.html).toContain("info@sabq.org");
    expect(email.html).toContain("فريق شراكات صحيفة سبق");
  });

  it("omits the numbers line when nothing was published", () => {
    const empty = renewalReminderEmail({
      agencyName: "x",
      contactPerson: null,
      expiryDate: "2026-12-30T21:00:00Z",
      isUnlimited: false,
      daysLeft: 6,
      published: 0,
      views: 0,
    });
    expect(empty.html).not.toContain("منذ بداية الباقة");
    expect(empty.html).not.toContain("الأستاذ/ة");
    expect(empty.html).toContain("أي بعد ٦ أيام");
  });
});

describe("comparison with the section's usual reads", () => {
  const medians = new Map([["biz", { median: 2000 }]]);
  const now = new Date("2026-10-06T00:00:00Z");
  const old = "2026-10-01T00:00:00Z";

  it("returns the ratio to the section median for settled published stories", () => {
    expect(compareToUsual({ status: "published", views: 9000, publishedAt: old, categoryId: "biz" }, medians, now)).toEqual({
      ratio: 4.5,
      median: 2000,
    });
  });

  it("holds judgement for fresh, unpublished or unbenchmarked stories", () => {
    expect(compareToUsual({ status: "published", views: 9000, publishedAt: "2026-10-05T12:00:00Z", categoryId: "biz" }, medians, now)).toBeNull();
    expect(compareToUsual({ status: "draft", views: 0, publishedAt: null, categoryId: "biz" }, medians, now)).toBeNull();
    expect(compareToUsual({ status: "published", views: 10, publishedAt: old, categoryId: "other" }, medians, now)).toBeNull();
  });
});
