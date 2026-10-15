import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import {
  mediaLicenseFromApplication,
  toMediaLicenseStatus,
} from "../../server/services/mediaLicenseService";
import {
  MEDIA_LICENSE_DASHBOARD_WARNING,
  MEDIA_LICENSE_EXPIRED_WARNING,
  MEDIA_LICENSE_NEEDS_CORRECTION_WARNING,
  MEDIA_LICENSE_PENDING_REVIEW_WARNING,
  mediaLicenseActionMessage,
} from "../../shared/mediaLicense";

const NOW = new Date("2026-09-29T10:00:00+03:00");

describe("mediaLicenseFromApplication — قبول الطلب يعتمد الترخيص", () => {
  it("ترخيص كامل وساري → يُنقل إلى الحساب بحالة approved فيصبح الكاتب مرخّصاً فوراً", () => {
    const fields = mediaLicenseFromApplication(
      {
        licenseNumber: " 12345 ",
        licenseFileKey: "opinion-author-docs/x-license.bin",
        licenseExpiresAt: new Date("2027-03-01T00:00:00Z"),
      },
      NOW,
    );
    expect(fields).not.toBeNull();
    expect(fields!.mediaLicenseNumber).toBe("12345");
    expect(fields!.mediaLicenseReviewStatus).toBe("approved");
    expect(fields!.mediaLicenseSubmittedAt).toEqual(NOW);

    // ما يراه الكاتب بعد أول دخول: ساري، لا مراجعة، لا حجب للإرسال
    const status = toMediaLicenseStatus(fields!);
    expect(status.valid).toBe(true);
    expect(status.pendingReview).toBe(false);
    expect(status.submissionBlocked).toBe(false);
  });

  it("طلب بلا رقم أو بلا ملف → null (لا نمسح ما في الحساب)", () => {
    expect(mediaLicenseFromApplication({ licenseNumber: "1", licenseFileKey: null }, NOW)).toBeNull();
    expect(mediaLicenseFromApplication({ licenseNumber: "  ", licenseFileKey: "k" }, NOW)).toBeNull();
  });

  it("ترخيص منتهٍ → يرفض القبول", () => {
    expect(() =>
      mediaLicenseFromApplication(
        { licenseNumber: "1", licenseFileKey: "k", licenseExpiresAt: new Date("2026-01-01T00:00:00Z") },
        NOW,
      ),
    ).toThrow(/منتهٍ/);
  });
});

describe("mediaLicenseActionMessage — رسالة واحدة بحسب الحالة", () => {
  it("يختار الرسالة الصحيحة ولا يذكر مهلة 31 يوليو المنقضية", () => {
    expect(mediaLicenseActionMessage({ pendingReview: true, expired: true })).toBe(MEDIA_LICENSE_PENDING_REVIEW_WARNING);
    expect(mediaLicenseActionMessage({ needsCorrection: true })).toBe(MEDIA_LICENSE_NEEDS_CORRECTION_WARNING);
    expect(mediaLicenseActionMessage({ expired: true })).toBe(MEDIA_LICENSE_EXPIRED_WARNING);
    expect(mediaLicenseActionMessage({})).toBe(MEDIA_LICENSE_DASHBOARD_WARNING);
    expect(MEDIA_LICENSE_DASHBOARD_WARNING).not.toMatch(/يوليو/);
  });
});
