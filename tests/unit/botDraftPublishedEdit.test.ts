import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  selects: 0,
  article: null as Record<string, unknown> | null,
  lock: null as { userName: string; expiresAt: Date } | null,
  updated: null as Record<string, unknown> | null,
  setArg: null as Record<string, unknown> | null,
  updateCalls: 0,
}));

const invalidateArticleWrite = vi.hoisted(() => vi.fn());
const memoryDelete = vi.hoisted(() => vi.fn());
const logArticleEvent = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const logActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const sendArticleNotification = vi.hoisted(() => vi.fn());
const notifySearchEngines = vi.hoisted(() => vi.fn());

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            dbState.selects += 1;
            if (dbState.selects === 1) return dbState.article ? [dbState.article] : [];
            if (dbState.selects === 2) return dbState.lock ? [dbState.lock] : [];
            return [];
          },
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        dbState.setArg = patch;
        dbState.updateCalls += 1;
        return {
          where: () => ({
            returning: async () => (dbState.updated ? [dbState.updated] : []),
          }),
        };
      },
    }),
  },
}));
vi.mock("../../server/memoryCache", () => ({
  memoryCache: { invalidatePattern: vi.fn(), delete: memoryDelete },
  CACHE_TTL: {},
}));
vi.mock("../../server/services/contentInvalidation", () => ({ invalidateArticleWrite }));
vi.mock("../../server/services/articleEventsService", () => ({ logArticleEvent }));
vi.mock("../../server/rbac", () => ({ logActivity }));
vi.mock("../../server/notificationService", () => ({ sendArticleNotification }));
vi.mock("../../server/indexNow", () => ({ notifySearchEngines }));

import { BotDraftError, updateBotDraft } from "../../server/services/botDraftsService";

const publishedAt = new Date("2026-09-26T06:00:00.000Z");

function publishedArticle(over: Record<string, unknown> = {}) {
  return {
    id: "art-pub",
    status: "published",
    title: "عنوان أصلي للخبر",
    subtitle: null,
    slug: "عنوان-أصلي",
    englishSlug: "en-slug",
    excerpt: "موجز أصلي",
    content: "<p>متن أصلي طويل بما يكفي للخبر المنشور.</p>",
    categoryId: null,
    imageUrl: null,
    sourceUrl: "https://example.com/source",
    seo: { metaTitle: "قديم", keywords: ["أ"] },
    seoMetadata: {},
    source: "bot",
    sourceMetadata: { type: "bot", bot: "nashr-sabq", clientReference: "ref-1" },
    authorId: "author-1",
    reporterId: "author-1",
    isFeatured: false,
    newsType: "regular",
    hideFromHomepage: false,
    publishedAt,
    scheduledAt: null,
    createdAt: publishedAt,
    updatedAt: publishedAt,
    ...over,
  };
}

describe("updateBotDraft on a published article", () => {
  beforeEach(() => {
    dbState.selects = 0;
    dbState.article = null;
    dbState.lock = null;
    dbState.updated = null;
    dbState.setArg = null;
    dbState.updateCalls = 0;
    invalidateArticleWrite.mockReset();
    memoryDelete.mockReset();
    logArticleEvent.mockClear();
    logActivity.mockClear();
    sendArticleNotification.mockClear();
    notifySearchEngines.mockClear();
    vi.stubEnv("PUBLIC_SITE_URL", "https://sabq.org");
  });

  it("updates a published bot article and keeps status, publishedAt, and slug", async () => {
    const existing = publishedArticle();
    dbState.article = existing;
    dbState.updated = {
      ...existing,
      title: "عنوان بعد النشر للخبر",
      excerpt: "موجز بعد التعديل",
      updatedAt: new Date("2026-09-26T09:00:00.000Z"),
    };

    const result = await updateBotDraft(
      { name: "nashr-sabq" },
      "art-pub",
      { title: "عنوان بعد النشر للخبر", excerpt: "موجز بعد التعديل", keywords: ["جديد"] },
    );

    expect(result).toMatchObject({
      id: "art-pub",
      status: "published",
      updatable: true,
      slug: "عنوان-أصلي",
      publishedAt: publishedAt.toISOString(),
      title: "عنوان بعد النشر للخبر",
      publicUrl: "https://sabq.org/article/en-slug",
    });
    expect(dbState.updateCalls).toBe(1);
    expect(dbState.setArg).toMatchObject({
      title: "عنوان بعد النشر للخبر",
      excerpt: "موجز بعد التعديل",
      aiSummary: "موجز بعد التعديل",
      seo: { metaTitle: "قديم", keywords: ["جديد"] },
    });
    expect(dbState.setArg).not.toHaveProperty("status");
    expect(dbState.setArg).not.toHaveProperty("publishedAt");
    expect(dbState.setArg).not.toHaveProperty("slug");
    expect(dbState.setArg).not.toHaveProperty("englishSlug");
    expect(dbState.setArg).not.toHaveProperty("authorId");
    expect(dbState.setArg?.seoMetadata).toBeTruthy();
    expect(invalidateArticleWrite).toHaveBeenCalledTimes(1);
    expect(invalidateArticleWrite).toHaveBeenCalledWith(
      expect.objectContaining({ id: "art-pub", slug: "عنوان-أصلي", englishSlug: "en-slug" }),
      expect.objectContaining({
        reason: "bot-draft-published-edit:nashr-sabq",
        oldSlug: "عنوان-أصلي",
        oldEnglishSlug: "en-slug",
      }),
    );
    expect(memoryDelete).toHaveBeenCalledWith("lite-feed");
    expect(sendArticleNotification).not.toHaveBeenCalled();
    expect(notifySearchEngines).not.toHaveBeenCalled();
    expect(logArticleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: "art-pub",
        eventType: "updated",
        metadata: expect.objectContaining({ changedFields: expect.arrayContaining(["العنوان", "الملخص", "الكلمات المفتاحية"]) }),
      }),
    );
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "updated", entityId: "art-pub" }));
  });

  it("rejects a published non-bot article with 409 and does not write", async () => {
    dbState.article = publishedArticle({ source: "manual" });
    await expect(updateBotDraft({ name: "nashr-sabq" }, "art-pub", { title: "عنوان بعد النشر للخبر" })).rejects.toMatchObject({
      httpStatus: 409,
      code: "not_a_draft",
      details: { status: "published" },
    });
    expect(dbState.updateCalls).toBe(0);
    expect(invalidateArticleWrite).not.toHaveBeenCalled();
  });

  it("rejects categorySlug and other non-content fields on a published article", async () => {
    dbState.article = publishedArticle();
    const error = await updateBotDraft(
      { name: "nashr-sabq" },
      "art-pub",
      { title: "عنوان بعد النشر للخبر", categorySlug: "local", notes: "ملاحظة" },
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BotDraftError);
    expect(error).toMatchObject({
      httpStatus: 422,
      code: "forbidden_fields",
      details: { fields: ["categorySlug", "notes"] },
    });
    expect(dbState.updateCalls).toBe(0);
  });

  it("rejects an archived or deleted bot article with 409", async () => {
    dbState.article = publishedArticle({ status: "archived" });
    await expect(updateBotDraft({ name: "nashr-sabq" }, "art-pub", { title: "عنوان بعد الأرشفة للخبر" })).rejects.toMatchObject({
      httpStatus: 409,
      code: "not_a_draft",
      details: { status: "archived" },
    });
    dbState.selects = 0;
    dbState.article = publishedArticle({ status: "deleted" });
    await expect(updateBotDraft({ name: "nashr-sabq" }, "art-pub", { title: "عنوان بعد الحذف للخبر" })).rejects.toMatchObject({
      httpStatus: 409,
      code: "not_a_draft",
      details: { status: "deleted" },
    });
    expect(dbState.updateCalls).toBe(0);
  });

  it("keeps the editor lock as 409 locked_by_editor", async () => {
    dbState.article = publishedArticle();
    dbState.lock = { userName: "محرر", expiresAt: new Date("2026-09-26T12:00:00.000Z") };
    await expect(updateBotDraft({ name: "nashr-sabq" }, "art-pub", { title: "عنوان بعد النشر للخبر" })).rejects.toMatchObject({
      httpStatus: 409,
      code: "locked_by_editor",
    });
    expect(dbState.updateCalls).toBe(0);
  });

  it("does not invalidate reader caches when the published row changes before the write", async () => {
    dbState.article = publishedArticle();
    dbState.updated = null;
    await expect(updateBotDraft({ name: "nashr-sabq" }, "art-pub", { title: "عنوان بعد النشر للخبر" })).rejects.toMatchObject({
      httpStatus: 409,
      code: "not_a_draft",
    });
    expect(invalidateArticleWrite).not.toHaveBeenCalled();
    expect(sendArticleNotification).not.toHaveBeenCalled();
  });
});
