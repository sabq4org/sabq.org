import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({ db: mockDb }));

import {
  createOrUpdateAuthorSocialProposal,
  getAuthorSocialProposalStatus,
  getPublishStats,
  isWithinOpinionSocialWindow,
  SOCIAL_POST_OPINION_WINDOW_MS,
  SocialPublishValidationError,
} from "../../server/services/socialPublishing/socialPublishingService";
import { notifyAuthorOfSocialPostStatus } from "../../server/services/editorialNotifications";

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

describe("opinionAuthorSocialProposal — إشعارات حالة المقترح للكاتب", () => {
  const authorId = "author-user-123";
  const articleId = "article-op-789";
  const postId = "post-social-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("يُسجل إشعار social_published للكاتب عند نشر المقترح", async () => {
    const postData = {
      id: postId,
      articleId,
      createdByUserId: authorId,
      externalPostUrl: "https://x.com/sabqorg/status/123456789",
      scheduledAt: null,
    };
    const articleData = {
      id: articleId,
      title: "مقال النشر",
      slug: "published-article-slug",
      englishSlug: null,
      articleType: "opinion",
      authorId,
      submitterId: authorId,
      scheduledAt: null,
      publishedAt: new Date(),
    };

    // 1) select post + article
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ post: postData, article: articleData }]),
          }),
        }),
      }),
    });

    // 2) select user prefs (defaults)
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    // 3) insert editorialNotifications
    mockDb.insert.mockReturnValueOnce({
      values: (val: any) => {
        expect(val.userId).toBe(authorId);
        expect(val.type).toBe("social_published");
        expect(val.title).toContain("نُشر مقترحك على منصة X");
        expect(val.body).toContain("تم نشر تغريدة مقالك");
        expect(val.deepLink).toBe("https://x.com/sabqorg/status/123456789");
        return {
          returning: () => Promise.resolve([{ id: "notif-1" }]),
        };
      },
    });

    // 4) select devices (none)
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    });

    // 5) update deliveryStatus
    mockDb.update.mockReturnValueOnce({
      set: (val: any) => {
        expect(val.deliveryStatus).toBe("no_device");
        return {
          where: () => Promise.resolve(),
        };
      },
    });

    await notifyAuthorOfSocialPostStatus(postId, "social_published");
  });

  it("يُسجل إشعار social_scheduled للكاتب عند جدولة المقترح", async () => {
    const scheduledDate = new Date("2026-08-19T10:00:00.000Z");
    const postData = {
      id: postId,
      articleId,
      createdByUserId: authorId,
      externalPostUrl: null,
      scheduledAt: scheduledDate,
    };
    const articleData = {
      id: articleId,
      title: "مقال الجدولة",
      slug: "scheduled-article-slug",
      englishSlug: null,
      articleType: "opinion",
      authorId,
      submitterId: authorId,
      scheduledAt: scheduledDate,
      publishedAt: new Date(),
    };

    mockDb.select.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ post: postData, article: articleData }]),
          }),
        }),
      }),
    });

    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    mockDb.insert.mockReturnValueOnce({
      values: (val: any) => {
        expect(val.userId).toBe(authorId);
        expect(val.type).toBe("social_scheduled");
        expect(val.title).toContain("تمت جدولة مقترحك للنشر على X");
        return {
          returning: () => Promise.resolve([{ id: "notif-2" }]),
        };
      },
    });

    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    });

    mockDb.update.mockReturnValueOnce({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    });

    await notifyAuthorOfSocialPostStatus(postId, "social_scheduled");
  });

  it("يُسجل إشعار social_rejected للكاتب عند رفض أو إلغاء المقترح", async () => {
    const postData = {
      id: postId,
      articleId,
      createdByUserId: authorId,
      externalPostUrl: null,
      scheduledAt: null,
    };
    const articleData = {
      id: articleId,
      title: "مقال الرفض",
      slug: "rejected-article-slug",
      englishSlug: null,
      articleType: "opinion",
      authorId,
      submitterId: authorId,
      scheduledAt: null,
      publishedAt: new Date(),
    };

    mockDb.select.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ post: postData, article: articleData }]),
          }),
        }),
      }),
    });

    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    mockDb.insert.mockReturnValueOnce({
      values: (val: any) => {
        expect(val.userId).toBe(authorId);
        expect(val.type).toBe("social_rejected");
        expect(val.title).toContain("قرار حول مقترح النشر على X");
        expect(val.body).toContain("اعتذر فريق النشر");
        expect(val.reviewerNote).toBe("لا يتناسب مع خطة النشر اليوم");
        return {
          returning: () => Promise.resolve([{ id: "notif-3" }]),
        };
      },
    });

    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    });

    mockDb.update.mockReturnValueOnce({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    });

    await notifyAuthorOfSocialPostStatus(postId, "social_rejected", {
      reviewerNote: "لا يتناسب مع خطة النشر اليوم",
    });
  });

  it("لا يرسل إشعاراً إذا كان المنشور من إنشاء محرر وليس كاتب المقال", async () => {
    const postData = {
      id: postId,
      articleId,
      createdByUserId: "editor-user-999", // المحرر أنشأ التغريدة
      externalPostUrl: null,
      scheduledAt: null,
    };
    const articleData = {
      id: articleId,
      title: "مقال",
      slug: "article-slug",
      englishSlug: null,
      articleType: "opinion",
      authorId, // الكاتب مختلف
      submitterId: authorId,
      scheduledAt: null,
      publishedAt: new Date(),
    };

    mockDb.select.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ post: postData, article: articleData }]),
          }),
        }),
      }),
    });

    await notifyAuthorOfSocialPostStatus(postId, "social_published");

    // لا يتم استدعاء insert لإشعارات التحرير
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("opinionAuthorSocialProposal — إحصائيات لوحة التحكم ومؤشر المقترحات المعلقة", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("يعيد عدد المقترحات المعلقة للكتّاب بدقة ضمن getPublishStats", async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          total: 15,
          published_today: 4,
          scheduled_upcoming: 3,
          failed: 1,
          pending_drafts: 7,
          pending_author_proposals: 5,
        },
      ],
    });

    const stats = await getPublishStats();
    expect(stats).toEqual({
      total: 15,
      publishedToday: 4,
      scheduledUpcoming: 3,
      failed: 1,
      pendingDrafts: 7,
      pendingAuthorProposals: 5,
    });
  });

  it("يتعامل مع النتائج الفارغة بأصفار آمنة", async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });

    const stats = await getPublishStats();
    expect(stats).toEqual({
      total: 0,
      publishedToday: 0,
      scheduledUpcoming: 0,
      failed: 0,
      pendingDrafts: 0,
      pendingAuthorProposals: 0,
    });
  });
});
