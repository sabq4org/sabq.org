import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import {
  assertValidScheduleTime,
  buildArticleUrl,
  decideFailureTransition,
  MAX_POST_IMAGES,
  MAX_PUBLISH_ATTEMPTS,
  SocialPublishValidationError,
  validateComposeMedia,
} from "../../server/services/socialPublishing/socialPublishingService";

describe("socialPublishingService — قرارات الفشل وإعادة المحاولة", () => {
  it("خطأ مؤقت لمنشور مجدول قبل استنفاد المحاولات → يعود scheduled", () => {
    const t = decideFailureTransition({ attempts: 1, retryable: true, wasScheduled: true });
    expect(t).toEqual({ nextStatus: "scheduled", terminal: false });
  });

  it("استنفاد المحاولات → failed نهائياً حتى لو الخطأ مؤقت", () => {
    const t = decideFailureTransition({
      attempts: MAX_PUBLISH_ATTEMPTS,
      retryable: true,
      wasScheduled: true,
    });
    expect(t).toEqual({ nextStatus: "failed", terminal: true });
  });

  it("خطأ دائم (401/403/400) → failed فوراً من أول محاولة", () => {
    const t = decideFailureTransition({ attempts: 1, retryable: false, wasScheduled: true });
    expect(t.terminal).toBe(true);
    expect(t.nextStatus).toBe("failed");
  });

  it("النشر الفوري لا يُعاد آلياً — الفشل نهائي والمستخدم يعيد يدوياً", () => {
    const t = decideFailureTransition({ attempts: 1, retryable: true, wasScheduled: false });
    expect(t).toEqual({ nextStatus: "failed", terminal: true });
  });
});

describe("socialPublishingService — التحقق من وقت الجدولة", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("يرفض وقتاً في الماضي", () => {
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    expect(() => assertValidScheduleTime(new Date("2026-08-06T11:00:00Z"))).toThrow(
      SocialPublishValidationError,
    );
  });

  it("يرفض وقتاً أقرب من دقيقة", () => {
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    expect(() => assertValidScheduleTime(new Date("2026-08-06T12:00:30Z"))).toThrow();
  });

  it("يقبل وقتاً بعد دقيقتين", () => {
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    expect(() => assertValidScheduleTime(new Date("2026-08-06T12:02:00Z"))).not.toThrow();
  });

  it("يرفض وقتاً أبعد من سنة", () => {
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    expect(() => assertValidScheduleTime(new Date("2027-09-01T12:00:00Z"))).toThrow();
  });

  it("يرفض تاريخاً فاسداً (NaN)", () => {
    expect(() => assertValidScheduleTime(new Date("غير صالح"))).toThrow(
      SocialPublishValidationError,
    );
  });
});

describe("socialPublishingService — وسائط التأليف المستقل", () => {
  it("بلا وسائط: القائمة يجب أن تكون فارغة", () => {
    expect(() => validateComposeMedia("none", [])).not.toThrow();
    expect(() => validateComposeMedia("none", ["https://a"])).toThrow(SocialPublishValidationError);
  });

  it("الصور من 1 إلى 4", () => {
    expect(() => validateComposeMedia("image", ["u1"])).not.toThrow();
    expect(() =>
      validateComposeMedia("image", Array.from({ length: MAX_POST_IMAGES }, (_, i) => `u${i}`)),
    ).not.toThrow();
    expect(() => validateComposeMedia("image", [])).toThrow();
    expect(() =>
      validateComposeMedia("image", Array.from({ length: MAX_POST_IMAGES + 1 }, (_, i) => `u${i}`)),
    ).toThrow();
  });

  it("الفيديو رابط واحد بالضبط", () => {
    expect(() => validateComposeMedia("video", ["v1"])).not.toThrow();
    expect(() => validateComposeMedia("video", [])).toThrow();
    expect(() => validateComposeMedia("video", ["v1", "v2"])).toThrow();
  });
});

describe("socialPublishingService — رابط الخبر", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("يفضل englishSlug ويسقط على slug العربي", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://sabq.org");
    expect(buildArticleUrl({ slug: "خبر-عربي", englishSlug: "news-en" })).toBe(
      "https://sabq.org/article/news-en",
    );
    expect(buildArticleUrl({ slug: "خبر-عربي", englishSlug: null })).toBe(
      "https://sabq.org/article/خبر-عربي",
    );
  });

  it("يزيل الشرطة المائلة الأخيرة من الأصل", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://sabq.org/");
    expect(buildArticleUrl({ slug: "a", englishSlug: null })).toBe("https://sabq.org/article/a");
  });
});
