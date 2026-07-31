import { describe, expect, it } from "vitest";
import {
  MEDIA_LICENSE_ENFORCEMENT_AT,
  MEDIA_LICENSE_PENDING_REVIEW_WARNING,
  isMediaLicenseEnforcementActive,
  resolveContentBylineUserId,
} from "../../shared/mediaLicense";

describe("isMediaLicenseEnforcementActive", () => {
  it("false طوال يوم 31 يوليو 2026 الرياض (آخر يوم مهلة)", () => {
    expect(isMediaLicenseEnforcementActive(new Date("2026-07-31T23:59:59+03:00"))).toBe(false);
  });

  it("true من بداية 1 أغسطس 2026 الرياض", () => {
    expect(isMediaLicenseEnforcementActive(new Date(MEDIA_LICENSE_ENFORCEMENT_AT))).toBe(true);
    expect(isMediaLicenseEnforcementActive(new Date("2026-08-01T00:00:01+03:00"))).toBe(true);
  });
});

describe("MEDIA_LICENSE_PENDING_REVIEW_WARNING", () => {
  it("يوضح أن الكتابة معطّلة حتى موافقة مسؤول النظام", () => {
    expect(MEDIA_LICENSE_PENDING_REVIEW_WARNING).toMatch(/موافقة/);
    expect(MEDIA_LICENSE_PENDING_REVIEW_WARNING).toMatch(/إنشاء/);
  });
});

describe("resolveContentBylineUserId", () => {
  it("رأي → كاتب الرأي ثم authorId", () => {
    expect(
      resolveContentBylineUserId({
        articleType: "opinion",
        opinionAuthorId: "w1",
        authorId: "a1",
        reporterId: "r1",
      }),
    ).toBe("w1");
    expect(
      resolveContentBylineUserId({
        articleType: "opinion",
        authorId: "a1",
        reporterId: "r1",
      }),
    ).toBe("a1");
  });

  it("خبر → مراسل ثم authorId", () => {
    expect(
      resolveContentBylineUserId({
        articleType: "news",
        reporterId: "r1",
        authorId: "a1",
      }),
    ).toBe("r1");
  });
});
