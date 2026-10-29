import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  selects: 0,
  article: null as Record<string, unknown> | null,
  lock: null as { userName: string; expiresAt: Date } | null,
  updated: null as Record<string, unknown> | null,
  setArg: null as Record<string, unknown> | null,
  updateCalls: 0,
  /** نتائج `.limit()` بالترتيب؛ إن فرغت يعود الترتيب الافتراضي (مقال ثم قفل). */
  limitQueue: [] as unknown[][],
}));

const invalidateArticleWrite = vi.hoisted(() => vi.fn());
const memoryDelete = vi.hoisted(() => vi.fn());
const logArticleEvent = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const recordArticleSave = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const logActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const sendArticleNotification = vi.hoisted(() => vi.fn());
const notifySearchEngines = vi.hoisted(() => vi.fn());
const summarizeArticle = vi.hoisted(() => vi.fn());
const generateSeoMetadata = vi.hoisted(() => vi.fn());

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          const query = {
            limit: async () => {
              if (dbState.limitQueue.length > 0) return dbState.limitQueue.shift()!;
              dbState.selects += 1;
              if (dbState.selects === 1) return dbState.article ? [dbState.article] : [];
              if (dbState.selects === 2) return dbState.lock ? [dbState.lock] : [];
              return [];
            },
            then: (resolve: (rows: unknown[]) => void, reject?: (error: unknown) => void) =>
              Promise.resolve([]).then(resolve, reject),
          };
          return query;
        },
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: "rev-1" }],
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
vi.mock("../../server/services/articleHistoryService", () => ({ recordArticleSave }));
vi.mock("../../server/rbac", () => ({ logActivity }));
vi.mock("../../server/notificationService", () => ({ sendArticleNotification }));
vi.mock("../../server/indexNow", () => ({ notifySearchEngines }));
vi.mock("../../server/openai", () => ({
  summarizeArticle,
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock("../../server/seo-generator", () => ({ generateSeoMetadata }));

import {
  archiveBotDraft,
  BotDraftError,
  buildRegeneratedExtrasInput,
  regenerateBotDraftExtras,
  updateBotDraft,
} from "../../server/services/botDraftsService";

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
    dbState.limitQueue = [];
    summarizeArticle.mockReset();
    generateSeoMetadata.mockReset();
    invalidateArticleWrite.mockReset();
    memoryDelete.mockReset();
    logArticleEvent.mockClear();
    recordArticleSave.mockClear();
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
      {
        title: "عنوان بعد النشر للخبر",
        excerpt: "موجز بعد التعديل",
        keywords: ["جديد"],
        seoTitle: "عنوان SEO بعد التعديل",
        seoDescription: "وصف SEO بعد التعديل",
      },
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
      seo: {
        metaTitle: "عنوان SEO بعد التعديل",
        metaDescription: "وصف SEO بعد التعديل",
        keywords: ["جديد"],
      },
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
    // تعديل البوت يمر بسجل النسخ: المادة قبل وبعد كاملة، لا وصف الحدث وحده
    expect(recordArticleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        before: expect.objectContaining({ id: "art-pub" }),
        after: expect.objectContaining({ id: "art-pub" }),
        summary: expect.stringContaining("الخبر المنشور"),
        metadata: expect.objectContaining({ changedFields: expect.arrayContaining(["العنوان", "الملخص", "الكلمات المفتاحية"]) }),
      }),
    );
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "updated", entityId: "art-pub" }));
  });

  it("syncs excerpt to the smart summary and clears stale bullets on a draft", async () => {
    const existing = publishedArticle({ status: "draft", sourceMetadata: { type: "bot", bot: "nashr-sabq" } });
    dbState.article = existing;
    dbState.updated = {
      ...existing,
      excerpt: "موجز مسودة جديد",
      aiSummary: "موجز مسودة جديد",
      aiBullets: null,
      aiBulletsGeneratedAt: null,
      updatedAt: new Date("2026-09-26T09:00:00.000Z"),
    };

    await updateBotDraft({ name: "nashr-sabq" }, "art-pub", { excerpt: "  موجز مسودة جديد  " });

    expect(dbState.setArg).toMatchObject({
      excerpt: "موجز مسودة جديد",
      aiSummary: "موجز مسودة جديد",
      aiBullets: null,
      aiBulletsGeneratedAt: null,
    });
  });

  it("persists the archive reason in notes and both audit surfaces", async () => {
    const existing = publishedArticle({
      sourceMetadata: { type: "bot", bot: "publisher-u", publisherUserId: "u", publisherTokenId: "t", clientReference: "ref-1" },
    });
    dbState.article = existing;
    dbState.updated = {
      ...existing,
      status: "archived",
      reviewNotes: "خبر مكرر",
      updatedAt: new Date("2026-09-26T09:00:00.000Z"),
    };

    await archiveBotDraft(
      { name: "publisher-u", personal: { userId: "u", tokenId: "t", capabilities: ["archive"] } as any },
      "art-pub",
      { reason: "  خبر مكرر  " },
    );

    expect(dbState.setArg).toMatchObject({ status: "archived", reviewStatus: null, reviewNotes: "خبر مكرر" });
    expect(recordArticleSave).toHaveBeenCalledWith(expect.objectContaining({
      after: expect.objectContaining({ status: "archived" }),
      metadata: expect.objectContaining({ archiveReason: "خبر مكرر" }),
    }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: "archived",
      newValue: expect.objectContaining({ reviewNotes: "خبر مكرر" }),
      metadata: expect.objectContaining({ archiveReason: "خبر مكرر" }),
    }));
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

  it("rejects notes and clientReference on a published article", async () => {
    dbState.article = publishedArticle();
    const error = await updateBotDraft(
      { name: "nashr-sabq" },
      "art-pub",
      { title: "عنوان بعد النشر للخبر", categorySlug: "local", notes: "ملاحظة", clientReference: "ref-2" },
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BotDraftError);
    expect(error).toMatchObject({
      httpStatus: 422,
      code: "forbidden_fields",
      details: { fields: ["clientReference", "notes"] },
    });
    expect(dbState.updateCalls).toBe(0);
  });

  it("moves a published article to another category with the dashboard save invalidation", async () => {
    const existing = publishedArticle({ categoryId: "cat-old" });
    dbState.limitQueue = [[existing], [], [{ id: "cat-new", slug: "economy", status: "visible" }]];
    dbState.updated = { ...existing, categoryId: "cat-new", updatedAt: new Date("2026-09-26T09:00:00.000Z") };

    const result = await updateBotDraft({ name: "nashr-sabq" }, "art-pub", { categorySlug: "economy" });

    expect(dbState.setArg).toMatchObject({ categoryId: "cat-new" });
    expect(dbState.setArg).not.toHaveProperty("slug");
    expect(dbState.setArg).not.toHaveProperty("englishSlug");
    expect(dbState.setArg?.seoMetadata).toBeTruthy();
    expect(result).toMatchObject({
      status: "published",
      categoryId: "cat-new",
      categorySlug: "economy",
      slug: "عنوان-أصلي",
      publicUrl: "https://sabq.org/article/en-slug",
    });
    // نفس نداء PATCH /api/admin/articles/:id: الرابط لا يتغير، والإبطال يشمل السلاقين القديمين.
    expect(invalidateArticleWrite).toHaveBeenCalledWith(
      expect.objectContaining({ id: "art-pub", categoryId: "cat-new" }),
      expect.objectContaining({ oldSlug: "عنوان-أصلي", oldEnglishSlug: "en-slug" }),
    );
    expect(memoryDelete).toHaveBeenCalledWith("lite-feed");
    expect(recordArticleSave).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ changedFields: ["التصنيف"] }),
    }));
  });

  it("rejects an unknown category on a published article with 422 category_not_found", async () => {
    const existing = publishedArticle({ categoryId: "cat-old" });
    dbState.limitQueue = [[existing], [], []];
    await expect(updateBotDraft({ name: "nashr-sabq" }, "art-pub", { categorySlug: "nope" })).rejects.toMatchObject({
      httpStatus: 422,
      code: "category_not_found",
    });
    expect(dbState.updateCalls).toBe(0);
    expect(invalidateArticleWrite).not.toHaveBeenCalled();
  });

  it("appends body images to a published article without duplicating existing or repeated urls", async () => {
    const existing = publishedArticle({
      content: '<p>متن أصلي طويل بما يكفي للخبر المنشور.</p>\n<img src="https://media.sabq.org/news/a.webp" alt="صورة">',
    });
    dbState.article = existing;
    dbState.updated = { ...existing, updatedAt: new Date("2026-09-26T09:00:00.000Z") };

    await updateBotDraft({ name: "nashr-sabq" }, "art-pub", {
      imageUrls: [
        "https://media.sabq.org/news/a.webp",
        "https://media.sabq.org/news/b.webp",
        "https://media.sabq.org/news/b.webp",
      ],
    });

    const content = String(dbState.setArg?.content);
    expect(content.startsWith("<p>متن أصلي")).toBe(true);
    expect(content.match(/news\/a\.webp/g)).toHaveLength(1);
    expect(content.match(/news\/b\.webp/g)).toHaveLength(1);
    expect(recordArticleSave).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ changedFields: ["صور المتن"] }),
    }));
  });

  it("dedupes body images against replacement content sent in the same request", async () => {
    const existing = publishedArticle();
    dbState.article = existing;
    dbState.updated = { ...existing, updatedAt: new Date("2026-09-26T09:00:00.000Z") };

    await updateBotDraft({ name: "nashr-sabq" }, "art-pub", {
      content: '<p>متن جديد للخبر المنشور بعد التحديث.</p><img src="https://media.sabq.org/news/c.webp">',
      imageUrls: ["https://media.sabq.org/news/c.webp", "https://media.sabq.org/news/d.webp"],
    });

    const content = String(dbState.setArg?.content);
    expect(content).toContain("متن جديد");
    expect(content).not.toContain("متن أصلي");
    expect(content.match(/news\/c\.webp/g)).toHaveLength(1);
    expect(content.match(/news\/d\.webp/g)).toHaveLength(1);
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

describe("regenerateBotDraftExtras", () => {
  const longContent = `<p>${"نص الخبر المنشور الذي يكفي لتوليد الملحقات. ".repeat(6)}</p>`;

  beforeEach(() => {
    dbState.selects = 0;
    dbState.article = null;
    dbState.lock = null;
    dbState.updated = null;
    dbState.setArg = null;
    dbState.updateCalls = 0;
    dbState.limitQueue = [];
    summarizeArticle.mockReset();
    generateSeoMetadata.mockReset();
    invalidateArticleWrite.mockReset();
    recordArticleSave.mockClear();
    vi.stubEnv("PUBLIC_SITE_URL", "https://sabq.org");
  });

  it("regenerates summary, keywords and SEO on a published article through the published edit path", async () => {
    const existing = publishedArticle({ content: longContent });
    // قراءة + قفل في التوليد، ثم قراءة + قفل في updateBotDraft
    dbState.limitQueue = [[existing], [], [existing], []];
    dbState.updated = { ...existing, excerpt: "موجز مولد", updatedAt: new Date("2026-09-26T09:00:00.000Z") };
    summarizeArticle.mockResolvedValue("  موجز مولد  ");
    generateSeoMetadata.mockResolvedValue({
      provider: "openai",
      model: "gpt-5.1",
      content: { metaTitle: "عنوان SEO مولد", metaDescription: "وصف SEO مولد", keywords: ["سبق", "سبق", " اقتصاد ", ""] },
    });

    const result = await regenerateBotDraftExtras({ name: "nashr-sabq" }, "art-pub", {});

    expect(summarizeArticle).toHaveBeenCalledWith(longContent);
    expect(generateSeoMetadata).toHaveBeenCalledWith(expect.objectContaining({ id: "art-pub", content: longContent }), "ar");
    expect(dbState.setArg).toMatchObject({
      excerpt: "موجز مولد",
      aiSummary: "موجز مولد",
      seo: { metaTitle: "عنوان SEO مولد", metaDescription: "وصف SEO مولد", keywords: ["سبق", "اقتصاد"] },
    });
    expect(dbState.setArg).not.toHaveProperty("status");
    expect(invalidateArticleWrite).toHaveBeenCalledTimes(1);
    expect(result.draft).toMatchObject({ id: "art-pub", status: "published" });
    expect(result.regenerated).toMatchObject({
      fields: ["summary", "keywords", "seo"],
      excerpt: "موجز مولد",
      keywords: ["سبق", "اقتصاد"],
      seoTitle: "عنوان SEO مولد",
      seoProvider: "openai",
      seoModel: "gpt-5.1",
    });
  });

  it("only calls the requested generator", async () => {
    const existing = publishedArticle({ status: "draft", content: longContent });
    dbState.limitQueue = [[existing], [], [existing], []];
    dbState.updated = { ...existing };
    summarizeArticle.mockResolvedValue("موجز فقط");

    const result = await regenerateBotDraftExtras({ name: "nashr-sabq" }, "art-pub", { fields: ["summary"] });

    expect(generateSeoMetadata).not.toHaveBeenCalled();
    expect(dbState.setArg).toMatchObject({ excerpt: "موجز فقط" });
    expect(dbState.setArg).not.toHaveProperty("seo");
    expect(result.regenerated.fields).toEqual(["summary"]);
  });

  it("refuses short content before calling AI", async () => {
    dbState.limitQueue = [[publishedArticle({ content: "<p>قصير</p>" })], []];
    await expect(regenerateBotDraftExtras({ name: "nashr-sabq" }, "art-pub", {})).rejects.toMatchObject({
      httpStatus: 422,
      code: "content_too_short",
    });
    expect(summarizeArticle).not.toHaveBeenCalled();
    expect(dbState.updateCalls).toBe(0);
  });

  it("returns 409 locked_by_editor before calling AI", async () => {
    dbState.limitQueue = [[publishedArticle({ content: longContent })], [{ userName: "محرر", expiresAt: new Date(Date.now() + 60_000) }]];
    await expect(regenerateBotDraftExtras({ name: "nashr-sabq" }, "art-pub", {})).rejects.toMatchObject({
      httpStatus: 409,
      code: "locked_by_editor",
    });
    expect(summarizeArticle).not.toHaveBeenCalled();
    expect(generateSeoMetadata).not.toHaveBeenCalled();
  });

  it("maps a generator failure to 502 generation_failed and writes nothing", async () => {
    dbState.limitQueue = [[publishedArticle({ content: longContent })], []];
    summarizeArticle.mockRejectedValue(new Error("Failed to summarize article"));
    generateSeoMetadata.mockResolvedValue({ provider: "openai", model: "gpt-5.1", content: { metaTitle: "س", metaDescription: "و", keywords: [] } });
    await expect(regenerateBotDraftExtras({ name: "nashr-sabq" }, "art-pub", {})).rejects.toMatchObject({
      httpStatus: 502,
      code: "generation_failed",
    });
    expect(dbState.updateCalls).toBe(0);
    expect(invalidateArticleWrite).not.toHaveBeenCalled();
  });

  it("rejects a non-bot article like PATCH does", async () => {
    dbState.limitQueue = [[publishedArticle({ source: "manual", content: longContent })]];
    await expect(regenerateBotDraftExtras({ name: "nashr-sabq" }, "art-pub", {})).rejects.toMatchObject({
      httpStatus: 409,
      code: "not_a_draft",
    });
    expect(summarizeArticle).not.toHaveBeenCalled();
  });
});

describe("buildRegeneratedExtrasInput", () => {
  it("clamps generated values to the PATCH contract limits and skips empty ones", () => {
    const input = buildRegeneratedExtrasInput(["summary", "keywords", "seo"], {
      summary: "",
      seo: {
        metaTitle: `${"كلمة ".repeat(30)}`,
        metaDescription: null,
        keywords: Array.from({ length: 25 }, (_, i) => `ك${i}`).concat(["x".repeat(61)]),
      },
    });
    expect(input).not.toHaveProperty("excerpt");
    expect(input).not.toHaveProperty("seoDescription");
    expect(input.seoTitle!.length).toBeLessThanOrEqual(70);
    expect(input.seoTitle!.endsWith(" ")).toBe(false);
    expect(input.keywords).toHaveLength(20);
  });
});
