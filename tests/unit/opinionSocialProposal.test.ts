import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({ db: mockDb }));

import {
  createOrUpdateAuthorSocialProposal,
  getAuthorSocialProposalStatus,
  isWithinOpinionSocialWindow,
  SOCIAL_POST_OPINION_WINDOW_MS,
  SocialPublishValidationError,
} from "../../server/services/socialPublishing/socialPublishingService";

describe("opinionAuthorSocialProposal — نافذة الـ24 ساعة", () => {
  const baseTime = new Date("2026-08-18T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("المقال غير المنشور (null/undefined) → غير مؤهل (NOT_PUBLISHED)", () => {
    expect(isWithinOpinionSocialWindow(null)).toEqual({
      eligible: false,
      reason: "NOT_PUBLISHED",
      remainingMs: 0,
      windowExpiresAt: null,
    });
    expect(isWithinOpinionSocialWindow(undefined)).toEqual({
      eligible: false,
      reason: "NOT_PUBLISHED",
      remainingMs: 0,
      windowExpiresAt: null,
    });
  });

  it("تاريخ نشر غير صالح (NaN) → غير مؤهل (INVALID_DATE)", () => {
    expect(isWithinOpinionSocialWindow("invalid-date")).toEqual({
      eligible: false,
      reason: "INVALID_DATE",
      remainingMs: 0,
      windowExpiresAt: null,
    });
  });

  it("مقال مجدول للمستقبل (لم يحن وقت نشره) → غير مؤهل (FUTURE_PUBLISHED)", () => {
    const futureTime = new Date(baseTime.getTime() + 2 * 60 * 60 * 1000); // بعد ساعتين
    const res = isWithinOpinionSocialWindow(futureTime);
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe("FUTURE_PUBLISHED");
    expect(res.remainingMs).toBe(0);
  });

  it("مقال نُشر الآن (0 ms) → مؤهل، ومتبقٍ 24 ساعة كاملة", () => {
    const res = isWithinOpinionSocialWindow(baseTime);
    expect(res.eligible).toBe(true);
    expect(res.remainingMs).toBe(SOCIAL_POST_OPINION_WINDOW_MS);
    expect(res.windowExpiresAt).toEqual(new Date(baseTime.getTime() + SOCIAL_POST_OPINION_WINDOW_MS));
  });

  it("مقال نُشر قبل 5 ساعات → مؤهل، ومتبقٍ 19 ساعة", () => {
    const publishedAt = new Date(baseTime.getTime() - 5 * 60 * 60 * 1000);
    const res = isWithinOpinionSocialWindow(publishedAt);
    expect(res.eligible).toBe(true);
    expect(res.remainingMs).toBe(19 * 60 * 60 * 1000);
  });

  it("مقال نُشر قبل 23 ساعة و59 دقيقة → مؤهل", () => {
    const publishedAt = new Date(baseTime.getTime() - (23 * 60 + 59) * 60 * 1000);
    const res = isWithinOpinionSocialWindow(publishedAt);
    expect(res.eligible).toBe(true);
    expect(res.remainingMs).toBe(60 * 1000);
  });

  it("مقال نُشر بالضبط قبل 24 ساعة → مؤهل (0 ms)", () => {
    const publishedAt = new Date(baseTime.getTime() - SOCIAL_POST_OPINION_WINDOW_MS);
    const res = isWithinOpinionSocialWindow(publishedAt);
    expect(res.eligible).toBe(true);
    expect(res.remainingMs).toBe(0);
  });

  it("مقال تجاوز 24 ساعة بدقيقة واحدة → غير مؤهل (EXPIRED_24H)", () => {
    const publishedAt = new Date(baseTime.getTime() - (SOCIAL_POST_OPINION_WINDOW_MS + 60 * 1000));
    const res = isWithinOpinionSocialWindow(publishedAt);
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe("EXPIRED_24H");
    expect(res.remainingMs).toBe(0);
  });

  it("مقال نُشر قبل 3 أيام → غير مؤهل (EXPIRED_24H)", () => {
    const publishedAt = new Date(baseTime.getTime() - 3 * 24 * 60 * 60 * 1000);
    const res = isWithinOpinionSocialWindow(publishedAt);
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe("EXPIRED_24H");
  });
});

describe("opinionAuthorSocialProposal — التحقق والأمان والملكية", () => {
  const authorId = "author-user-123";
  const otherUserId = "other-user-456";
  const articleId = "article-op-789";
  const nowTime = new Date("2026-08-18T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(nowTime);
    vi.clearAllMocks();
    vi.stubEnv("PUBLIC_SITE_URL", "https://sabq.org");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("يرفض الطلب إذا كان المقال غير موجود (404)", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    await expect(
      createOrUpdateAuthorSocialProposal({
        articleId,
        authorUserId: authorId,
        text: "نص المقترح",
        textSource: "custom",
      }),
    ).rejects.toThrow(SocialPublishValidationError);
  });

  it("يرفض إذا كان نوع المقال ليس رأي (articleType !== opinion)", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: articleId,
                title: "خبر عام",
                slug: "general-news",
                englishSlug: null,
                imageUrl: "https://sabq.org/img.jpg",
                status: "published",
                articleType: "general",
                authorId,
                submitterId: authorId,
                publishedAt: new Date(nowTime.getTime() - 2 * 60 * 60 * 1000),
              },
            ]),
        }),
      }),
    });

    await expect(
      createOrUpdateAuthorSocialProposal({
        articleId,
        authorUserId: authorId,
        text: "نص المقترح",
        textSource: "custom",
      }),
    ).rejects.toThrow("هذه الميزة مخصصة لمقالات الرأي فقط");
  });

  it("يرفض إذا حاول كاتب الوصول لمقال كاتب آخر (403)", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: articleId,
                title: "مقال كاتب آخر",
                slug: "other-opinion",
                englishSlug: null,
                imageUrl: null,
                status: "published",
                articleType: "opinion",
                authorId: otherUserId,
                submitterId: otherUserId,
                publishedAt: new Date(nowTime.getTime() - 2 * 60 * 60 * 1000),
              },
            ]),
        }),
      }),
    });

    await expect(
      createOrUpdateAuthorSocialProposal({
        articleId,
        authorUserId: authorId,
        text: "نص المقترح",
        textSource: "custom",
      }),
    ).rejects.toThrow("لا تملك صلاحية على هذا المقال");
  });

  it("يرفض إذا كان المقال غير منشور بعد (status = draft)", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: articleId,
                title: "مسودة مقال",
                slug: "draft-op",
                englishSlug: null,
                imageUrl: null,
                status: "draft",
                articleType: "opinion",
                authorId,
                submitterId: authorId,
                publishedAt: null,
              },
            ]),
        }),
      }),
    });

    await expect(
      createOrUpdateAuthorSocialProposal({
        articleId,
        authorUserId: authorId,
        text: "نص المقترح",
        textSource: "custom",
      }),
    ).rejects.toThrow("لا يمكن تقديم مقترح لمقال غير منشور بعد");
  });

  it("يرفض إذا تجاوز المقال 24 ساعة من تاريخ النشر الفعلي", async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: articleId,
                title: "مقال قديم",
                slug: "old-op",
                englishSlug: null,
                imageUrl: null,
                status: "published",
                articleType: "opinion",
                authorId,
                submitterId: authorId,
                publishedAt: new Date(nowTime.getTime() - 25 * 60 * 60 * 1000), // قبل 25 ساعة
              },
            ]),
        }),
      }),
    });

    await expect(
      createOrUpdateAuthorSocialProposal({
        articleId,
        authorUserId: authorId,
        text: "نص المقترح",
        textSource: "custom",
      }),
    ).rejects.toThrow("انتهت مهلة الـ24 ساعة لتقديم مقترح النشر الاجتماعي لهذا المقال");
  });

  it("ينشئ مسودة مقترح جديدة بنجاح ضمن الـ24 ساعة مع تثبيت الرابط والصورة", async () => {
    const articleData = {
      id: articleId,
      title: "مقال رأي متميز",
      slug: "distinct-opinion",
      englishSlug: "distinct-opinion-en",
      imageUrl: "https://media.sabq.org/news/sample.webp",
      status: "published",
      articleType: "opinion",
      authorId,
      submitterId: authorId,
      publishedAt: new Date(nowTime.getTime() - 2 * 60 * 60 * 1000), // قبل ساعتين
    };

    // 1) select article
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([articleData]),
        }),
      }),
    });

    // 2) select connected account
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: "acc-1", platform: "x", status: "connected" }]),
        }),
      }),
    });

    // 3) select existing draft (none)
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    // 4) select other active (none)
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    // 5) insert into socialPosts
    const insertedPost = {
      id: "post-1",
      articleId,
      platform: "x",
      accountId: "acc-1",
      textSource: "title",
      text: "مقال رأي متميز",
      linkUrl: "https://sabq.org/article/distinct-opinion-en",
      imageSource: "article",
      imageUrl: "https://media.sabq.org/news/sample.webp",
      status: "draft",
      createdByUserId: authorId,
    };

    mockDb.insert.mockReturnValueOnce({
      values: (values: any) => ({
        returning: () => {
          expect(values.articleId).toBe(articleId);
          expect(values.status).toBe("draft");
          expect(values.createdByUserId).toBe(authorId);
          expect(values.linkUrl).toBe("https://sabq.org/article/distinct-opinion-en");
          expect(values.imageUrl).toBe("https://media.sabq.org/news/sample.webp");
          expect(values.imageSource).toBe("article");
          return Promise.resolve([insertedPost]);
        },
      }),
    });

    const result = await createOrUpdateAuthorSocialProposal({
      articleId,
      authorUserId: authorId,
      text: "مقال رأي متميز",
      textSource: "title",
    });

    expect(result).toEqual(insertedPost);
  });

  it("يحدّث المسودة القائمة بدلاً من التكرار عند إعادة الإرسال من الكاتب", async () => {
    const articleData = {
      id: articleId,
      title: "مقال رأي",
      slug: "my-opinion",
      englishSlug: null,
      imageUrl: null,
      status: "published",
      articleType: "opinion",
      authorId,
      submitterId: authorId,
      publishedAt: new Date(nowTime.getTime() - 1 * 60 * 60 * 1000),
    };

    // 1) select article
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([articleData]),
        }),
      }),
    });

    // 2) select connected account
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: "acc-1", platform: "x", status: "connected" }]),
        }),
      }),
    });

    // 3) select existing draft (found existing)
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: "post-existing-1",
                articleId,
                status: "draft",
                text: "النص القديم",
                accountId: "acc-1",
              },
            ]),
        }),
      }),
    });

    // update mock
    const updatedPost = {
      id: "post-existing-1",
      articleId,
      status: "draft",
      text: "النص المحدث الجديد",
      textSource: "custom",
    };

    mockDb.update.mockReturnValueOnce({
      set: (values: any) => ({
        where: () => ({
          returning: () => {
            expect(values.text).toBe("النص المحدث الجديد");
            expect(values.textSource).toBe("custom");
            return Promise.resolve([updatedPost]);
          },
        }),
      }),
    });

    const result = await createOrUpdateAuthorSocialProposal({
      articleId,
      authorUserId: authorId,
      text: "النص المحدث الجديد",
      textSource: "custom",
    });

    expect(result).toEqual(updatedPost);
  });
});
