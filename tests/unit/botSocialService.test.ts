import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selects: [] as unknown[][],
  wheres: [] as unknown[],
  create: vi.fn(),
  update: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  claim: vi.fn(),
  publishClaimed: vi.fn(),
  getPost: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  suggest: vi.fn(),
  audit: vi.fn(),
  resolveLink: vi.fn(),
  updateReturning: vi.fn(),
  lastUpdate: null as Record<string, unknown> | null,
}));

function chain(rows: unknown) {
  const pending = Promise.resolve(rows);
  const builder: {
    from: () => typeof builder;
    innerJoin: () => typeof builder;
    where: () => typeof builder;
    orderBy: () => typeof builder;
    limit: () => Promise<unknown>;
    then: (onOk: (value: unknown) => unknown, onErr?: (error: unknown) => unknown) => Promise<unknown>;
  } = {
    from: () => builder,
    innerJoin: () => builder,
    where: (clause: unknown) => {
      state.wheres.push(clause);
      return builder;
    },
    orderBy: () => builder,
    limit: () => pending,
    then: (onOk, onErr) => pending.then(onOk, onErr),
  };
  return builder;
}

vi.mock("../../server/db", () => ({
  db: {
    select: () => chain(state.selects.shift() ?? []),
    insert: () => ({ values: () => state.insert() }),
    delete: () => ({ where: () => state.delete() }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.lastUpdate = values;
        return { where: () => ({ returning: () => state.updateReturning() }) };
      },
    }),
  },
}));
vi.mock("../../server/services/socialPublishing/publerApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/services/socialPublishing/publerApiClient")>();
  return {
    ...actual,
    resolvePublishedPostLink: (...args: unknown[]) => state.resolveLink(...args),
  };
});
vi.mock("../../server/rbac", () => ({
  logActivity: (...args: unknown[]) => state.audit(...args),
}));
vi.mock("../../server/services/socialPublishing/suggestService", () => ({
  suggestSocialPostForArticle: (...args: unknown[]) => state.suggest(...args),
}));
vi.mock("../../server/services/socialPublishing/socialPublishingService", () => ({
  SocialPublishValidationError: class SocialPublishValidationError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.name = "SocialPublishValidationError";
      this.status = status;
    }
  },
  buildArticleUrl: (article: { slug: string; englishSlug: string | null }) =>
    `https://sabq.org/article/${article.englishSlug || article.slug}`,
  createDraftPost: (...args: unknown[]) => state.create(...args),
  updateEditablePost: (...args: unknown[]) => state.update(...args),
  schedulePost: (...args: unknown[]) => state.schedule(...args),
  cancelPost: (...args: unknown[]) => state.cancel(...args),
  claimPostForImmediatePublish: (...args: unknown[]) => state.claim(...args),
  publishClaimedPost: (...args: unknown[]) => state.publishClaimed(...args),
  getPost: (...args: unknown[]) => state.getPost(...args),
}));

import { BotSocialError } from "../../server/services/socialPublishing/botSocialLogic";
import {
  getBotSocialPost,
  listBotSocialPosts,
  previewBotSocialPost,
  publishBotSocialPost,
  resolveBotSocialArticleUrl,
  scheduleBotSocialPost,
} from "../../server/services/socialPublishing/botSocialService";

const bot = { name: "nashr-x" };
const now = new Date("2026-09-28T12:00:00Z");

function article(status = "published") {
  return {
    id: "art-1",
    title: "عنوان الخبر",
    slug: "عنوان",
    englishSlug: "english-slug",
    imageUrl: "https://media.sabq.org/a.jpg",
    excerpt: "موجز",
    status,
    publishedAt: new Date("2026-09-01T00:00:00Z"),
  };
}

function socialPost(over: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    articleId: "art-1",
    platform: "x",
    accountId: "acc-1",
    textSource: "custom",
    text: "نص التغريدة",
    linkUrl: "https://sabq.org/article/english-slug",
    imageSource: "article",
    imageUrl: "https://media.sabq.org/a.jpg",
    mediaKind: "none",
    mediaUrls: [],
    status: "draft",
    scheduledAt: null,
    publishedAt: null,
    externalPostId: null,
    externalPostUrl: null,
    createdByUserId: "user-1",
    publishedByUserId: null,
    canceledByUserId: null,
    attempts: 0,
    lastError: null,
    lockedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function binding(post = socialPost()) {
  return {
    key: { id: "key-1", botName: "nashr-x", clientReference: "ref-1", postId: post.id, createdAt: now },
    post,
  };
}

const publishBody = {
  articleId: "art-1",
  clientReference: "ref-1",
  text: "نص التغريدة",
  textSource: "custom" as const,
  includeLink: true,
  imageSource: "article" as const,
};

function whereColumns(clause: unknown): string[] {
  const names: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if ("name" in node && "table" in node && typeof (node as { name: unknown }).name === "string") {
      names.push((node as { name: string }).name);
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) {
      for (const chunk of chunks) walk(chunk);
    }
  };
  walk(clause);
  return names;
}

beforeEach(() => {
  state.selects = [];
  state.wheres = [];
  state.create.mockReset();
  state.update.mockReset();
  state.schedule.mockReset();
  state.cancel.mockReset();
  state.claim.mockReset();
  state.publishClaimed.mockReset();
  state.getPost.mockReset();
  state.insert.mockReset();
  state.delete.mockReset();
  state.suggest.mockReset();
  state.audit.mockReset();
  state.resolveLink.mockReset();
  state.updateReturning.mockReset();
  state.lastUpdate = null;
  state.resolveLink.mockResolvedValue(null);
  state.updateReturning.mockResolvedValue([]);
  state.insert.mockResolvedValue(undefined);
  state.delete.mockResolvedValue(undefined);
  state.audit.mockResolvedValue(undefined);
  vi.stubEnv("SABQ_BOT_SOCIAL_USER_ID", "user-1");
});

describe("publishBotSocialPost", () => {
  it("creates one post and publishes it through the existing claim path", async () => {
    state.selects = [[article()], [], [{ id: "user-1", status: "active" }]];
    state.create.mockResolvedValue(socialPost());
    state.claim.mockResolvedValue(socialPost({ status: "processing", attempts: 1 }));
    state.publishClaimed.mockResolvedValue(
      socialPost({
        status: "published",
        externalPostId: "99",
        externalPostUrl: "https://x.com/sabqorg/status/99",
        publishedAt: now,
      }),
    );

    const result = await publishBotSocialPost(bot, publishBody, { ip: "1.2.3.4" });

    expect(result.idempotentReplay).toBe(false);
    expect(result.post.status).toBe("published");
    expect(result.post.externalPostId).toBe("99");
    expect(result.post.externalPostUrl).toBe("https://x.com/sabqorg/status/99");
    expect(result.post.clientReference).toBe("ref-1");
    expect(result.post.botName).toBe("nashr-x");
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.create.mock.calls[0][0]).toMatchObject({ articleId: "art-1", includeLink: true });
    expect(state.create.mock.calls[0][0].linkUrl).toBeUndefined();
    expect(JSON.stringify(state.create.mock.calls[0][0])).not.toContain("utm_");
    expect(state.update).not.toHaveBeenCalled();
    expect(state.claim).toHaveBeenCalledWith("post-1");
    expect(state.publishClaimed).toHaveBeenCalledTimes(1);
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "bot_social_publish",
      entityType: "social_post",
      metadata: expect.objectContaining({ channel: "bot-social-api", bot: "nashr-x", clientReference: "ref-1" }),
    }));
  });

  it("does not call the provider again when the same clientReference is already published", async () => {
    state.selects = [[
      article(),
    ], [
      binding(socialPost({
        status: "published",
        externalPostId: "99",
        externalPostUrl: "https://x.com/sabqorg/status/99",
        publishedAt: now,
      })),
    ]];

    const result = await publishBotSocialPost(bot, publishBody);

    expect(result.idempotentReplay).toBe(true);
    expect(result.post.externalPostUrl).toBe("https://x.com/sabqorg/status/99");
    expect(state.create).not.toHaveBeenCalled();
    expect(state.claim).not.toHaveBeenCalled();
    expect(state.publishClaimed).not.toHaveBeenCalled();
  });

  it("refuses an unpublished article before creating a post", async () => {
    state.selects = [[article("draft")]];
    await expect(publishBotSocialPost(bot, publishBody)).rejects.toMatchObject({
      code: "article_not_published",
      httpStatus: 422,
    });
    expect(state.create).not.toHaveBeenCalled();
  });

  it("returns the winning post when a parallel insert hits the unique key", async () => {
    const winner = socialPost({
      id: "post-winner",
      status: "published",
      externalPostId: "77",
      externalPostUrl: "https://x.com/sabqorg/status/77",
      publishedAt: now,
    });
    state.selects = [[article()], [], [{ id: "user-1", status: "active" }], [binding(winner)]];
    state.create.mockResolvedValue(socialPost({ id: "post-orphan" }));
    state.insert.mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }));

    const result = await publishBotSocialPost(bot, publishBody);

    expect(result.idempotentReplay).toBe(true);
    expect(result.post.id).toBe("post-winner");
    expect(state.publishClaimed).not.toHaveBeenCalled();
    expect(state.delete).toHaveBeenCalled();
  });

  it("maps a missing X account to account_not_connected and does not insert a key", async () => {
    state.selects = [[article()], [], [{ id: "user-1", status: "active" }]];
    const { SocialPublishValidationError } = await import("../../server/services/socialPublishing/socialPublishingService");
    state.create.mockRejectedValue(new SocialPublishValidationError("لا يوجد حساب X مرتبط", 409));

    await expect(publishBotSocialPost(bot, publishBody)).rejects.toMatchObject({
      code: "account_not_connected",
      httpStatus: 409,
    });
    expect(state.insert).not.toHaveBeenCalled();
  });
});

describe("schedule and preview", () => {
  it("schedules through schedulePost and resets attempts after a failure", async () => {
    const failed = socialPost({ status: "failed", attempts: 3, lastError: "boom" });
    state.selects = [[article()], [binding(failed)], [{ id: "user-1", status: "active" }]];
    state.update.mockResolvedValue(failed);
    state.schedule.mockResolvedValue(socialPost({ status: "scheduled", attempts: 0, scheduledAt: new Date("2026-09-28T18:00:00Z") }));

    const result = await scheduleBotSocialPost(bot, {
      ...publishBody,
      scheduledAt: "2026-09-28T21:00:00+03:00",
    });

    expect(result.post.status).toBe("scheduled");
    expect(state.schedule).toHaveBeenCalledWith("post-1", new Date("2026-09-28T21:00:00+03:00"), { resetAttempts: true });
    expect(state.publishClaimed).not.toHaveBeenCalled();
  });

  it("previews length, link, and image without writing", async () => {
    state.selects = [[article()]];
    const preview = await previewBotSocialPost({
      articleId: "art-1",
      text: "مرحبا",
      includeLink: true,
      imageSource: "article",
    });
    expect(preview.linkUrl).toBe("https://sabq.org/article/english-slug");
    expect(preview.imageUrl).toBe("https://media.sabq.org/a.jpg");
    expect(preview.weightedLength).toBe(5 + 1 + 23);
    expect(preview.valid).toBe(true);
    expect(preview.maxWeightedLength).toBe(280);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("preview of a draft article is article_not_published", async () => {
    state.selects = [[article("scheduled")]];
    await expect(previewBotSocialPost({ articleId: "art-1", text: "نص" })).rejects.toBeInstanceOf(BotSocialError);
  });
});

function located(over: Record<string, unknown> = {}) {
  return {
    id: "art-1",
    title: "عنوان الخبر",
    slug: "عنوان",
    englishSlug: "jrdic6y",
    status: "published",
    publishedAt: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
}

describe("article URL resolution", () => {
  it("resolves a short code, a www URL, and a percent-encoded Arabic slug to articles.id", async () => {
    state.selects = [
      [],
      [located({ id: "art-ar", slug: "خبر-عاجل", englishSlug: "jrdic6y" })],
      [{ ...article(), id: "art-ar", slug: "خبر-عاجل", englishSlug: "jrdic6y" }],
    ];
    const preview = await previewBotSocialPost({
      articleUrl: `https://www.sabq.org/article/${encodeURIComponent("خبر-عاجل")}/?utm=1#x`,
      text: "مرحبا",
      includeLink: true,
    });
    expect(preview.articleId).toBe("art-ar");
    expect(preview.linkUrl).toBe("https://sabq.org/article/jrdic6y");
    expect(state.wheres.slice(0, 2).map(whereColumns)).toEqual([["english_slug"], ["slug"]]);

    state.wheres = [];
    state.selects = [[located({ englishSlug: "y68a4q6" })]];
    await expect(resolveBotSocialArticleUrl("https://sabq.org/article/y68a4q6")).resolves.toEqual({
      articleId: "art-1",
      title: "عنوان الخبر",
      status: "published",
      publishedAt: "2026-09-01T00:00:00.000Z",
      linkUrl: "https://sabq.org/article/y68a4q6",
      lang: "ar",
    });
    expect(state.wheres.map(whereColumns)).toEqual([["english_slug"]]);
  });

  it("falls back to legacy_slug before a UUID, after english_slug and slug miss", async () => {
    const id = "0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11";
    state.selects = [
      [],
      [],
      [],
      [located({ id, englishSlug: "jrdic6y" })],
      [{ ...article(), id, englishSlug: "jrdic6y" }],
    ];
    await expect(previewBotSocialPost({
      articleUrl: `https://sabq.org/article/${id}`,
      text: "نص",
    })).resolves.toMatchObject({ articleId: id });
    expect(state.wheres.slice(0, 4).map(whereColumns)).toEqual([
      ["english_slug"],
      ["slug"],
      ["legacy_slug"],
      ["id"],
    ]);

    state.wheres = [];
    state.selects = [
      [],
      [],
      [located({ id: "art-legacy", englishSlug: "canon", slug: "arabic-slug" })],
      [{ ...article(), id: "art-legacy", englishSlug: "canon", slug: "arabic-slug" }],
    ];
    await expect(previewBotSocialPost({
      articleUrl: "https://sabq.org/article/old-legacy-id/",
      text: "نص",
    })).resolves.toMatchObject({ articleId: "art-legacy", linkUrl: "https://sabq.org/article/canon" });
    expect(state.wheres.slice(0, 3).map(whereColumns)).toEqual([
      ["english_slug"],
      ["slug"],
      ["legacy_slug"],
    ]);
  });

  it("returns 404 when the public token matches nothing, and 400 for another host", async () => {
    state.selects = [[], [], []];
    await expect(previewBotSocialPost({
      articleUrl: "https://sabq.org/article/missing",
      text: "نص",
    })).rejects.toMatchObject({ httpStatus: 404, code: "not_found" });

    await expect(resolveBotSocialArticleUrl("https://example.com/article/jrdic6y")).rejects.toMatchObject({
      httpStatus: 400,
      code: "validation_error",
    });
    await expect(resolveBotSocialArticleUrl("https://sabq.org/en/article/abc")).rejects.toMatchObject({
      httpStatus: 422,
      code: "unsupported_language",
    });
  });

  it("rejects articleId and articleUrl when they resolve to different articles", async () => {
    state.selects = [[located({ id: "art-2", englishSlug: "other-slug" })]];
    await expect(publishBotSocialPost(bot, {
      articleId: "art-1",
      articleUrl: "https://sabq.org/article/other-slug",
      clientReference: "ref-1",
      text: "نص التغريدة",
    })).rejects.toMatchObject({ httpStatus: 400, code: "validation_error" });
    expect(state.create).not.toHaveBeenCalled();
  });

  it("keeps clientReference idempotency on the resolved article id", async () => {
    state.selects = [
      [located({ id: "art-2", englishSlug: "other-slug", slug: "آخر" })],
      [{ ...article(), id: "art-2", englishSlug: "other-slug", slug: "آخر" }],
      [binding(socialPost({ articleId: "art-1" }))],
    ];
    await expect(publishBotSocialPost(bot, {
      articleUrl: "https://www.sabq.org/article/other-slug/?utm=1#top",
      clientReference: "ref-1",
      text: "نص التغريدة",
    })).rejects.toMatchObject({ httpStatus: 409, code: "reference_article_mismatch" });
    expect(state.create).not.toHaveBeenCalled();
    expect(state.claim).not.toHaveBeenCalled();
  });
});

describe("Publer status URL backfill on bot reads", () => {
  const pending = () => socialPost({
    status: "published",
    publishedAt: now,
    externalPostId: "publer:6abb3fc20d073712d4416efc",
    externalPostUrl: "https://x.com/صحيفة سبق الإلكترونية",
  });

  it("GET detail stores the tweet id and status URL from post_link", async () => {
    state.selects = [
      [binding(pending())],
      [{ externalAccountId: "publer-acc", handle: "صحيفة سبق الإلكترونية" }],
    ];
    state.resolveLink.mockResolvedValue({
      tweetId: "2104791827802911159",
      statusUrl: "https://x.com/sabqorg/status/2104791827802911159",
      handle: "sabqorg",
    });
    state.updateReturning.mockResolvedValue([socialPost({
      status: "published",
      publishedAt: now,
      externalPostId: "2104791827802911159",
      externalPostUrl: "https://x.com/sabqorg/status/2104791827802911159",
    })]);

    const result = await getBotSocialPost(bot, "post-1");

    expect(result.post.externalPostId).toBe("2104791827802911159");
    expect(result.post.externalPostUrl).toBe("https://x.com/sabqorg/status/2104791827802911159");
    expect(state.resolveLink).toHaveBeenCalledWith(
      "publer-acc",
      "نص التغريدة\nhttps://sabq.org/article/english-slug",
      expect.objectContaining({
        linkUrl: "https://sabq.org/article/english-slug",
        publishedAt: now,
      }),
    );
    expect(state.lastUpdate).toEqual(expect.objectContaining({
      externalPostId: "2104791827802911159",
      externalPostUrl: "https://x.com/sabqorg/status/2104791827802911159",
    }));
  });

  it("drops a display-name URL when post_link is still missing and keeps the publer id", async () => {
    state.selects = [
      [binding(pending())],
      [{ externalAccountId: "publer-acc", handle: "صحيفة سبق الإلكترونية" }],
    ];
    state.updateReturning.mockResolvedValue([socialPost({
      status: "published",
      publishedAt: now,
      externalPostId: "publer:6abb3fc20d073712d4416efc",
      externalPostUrl: null,
    })]);

    const result = await getBotSocialPost(bot, "post-1");

    expect(result.post.externalPostUrl).toBeNull();
    expect(result.post.externalPostId).toBe("publer:6abb3fc20d073712d4416efc");
    expect(state.lastUpdate).toEqual(expect.objectContaining({
      externalPostId: "publer:6abb3fc20d073712d4416efc",
      externalPostUrl: null,
    }));
    expect(JSON.stringify(result.post)).not.toContain("صحيفة");
  });

  it("uses the stored @handle as a profile URL while the status link is pending", async () => {
    state.selects = [
      [binding(pending())],
      [{ externalAccountId: "publer-acc", handle: "sabqorg" }],
    ];
    state.updateReturning.mockResolvedValue([socialPost({
      status: "published",
      publishedAt: now,
      externalPostId: "publer:6abb3fc20d073712d4416efc",
      externalPostUrl: "https://x.com/sabqorg",
    })]);

    const result = await getBotSocialPost(bot, "c89bd0fd-2e80-4608-ab3a-302e6c72d5bd");

    expect(result.post.externalPostUrl).toBe("https://x.com/sabqorg");
    expect(state.lastUpdate).toEqual(expect.objectContaining({
      externalPostUrl: "https://x.com/sabqorg",
    }));
  });

  it("does not call Publer when the row already has a status URL", async () => {
    state.selects = [[binding(socialPost({
      status: "published",
      publishedAt: now,
      externalPostId: "99",
      externalPostUrl: "https://x.com/sabqorg/status/99",
    }))]];

    const result = await getBotSocialPost(bot, "post-1");

    expect(result.post.externalPostUrl).toBe("https://x.com/sabqorg/status/99");
    expect(state.resolveLink).not.toHaveBeenCalled();
    expect(state.lastUpdate).toBeNull();
  });

  it("list backfills a published Publer row and leaves scheduled and direct X rows alone", async () => {
    const scheduled = socialPost({
      id: "post-sched",
      status: "scheduled",
      externalPostId: null,
      externalPostUrl: null,
    });
    const direct = socialPost({
      id: "post-x",
      status: "published",
      publishedAt: now,
      externalPostId: "99",
      externalPostUrl: "https://x.com/sabqorg/status/99",
    });
    state.selects = [
      [
        binding(pending()),
        { ...binding(scheduled), key: { ...binding().key, postId: "post-sched", clientReference: "ref-sched" } },
        { ...binding(direct), key: { ...binding().key, postId: "post-x", clientReference: "ref-x" } },
      ],
      [{ externalAccountId: "publer-acc", handle: "sabqorg" }],
    ];
    state.resolveLink.mockResolvedValue({
      tweetId: "2104791827802911159",
      statusUrl: "https://x.com/sabqorg/status/2104791827802911159",
      handle: "sabqorg",
    });
    state.updateReturning.mockResolvedValue([socialPost({
      status: "published",
      publishedAt: now,
      externalPostId: "2104791827802911159",
      externalPostUrl: "https://x.com/sabqorg/status/2104791827802911159",
    })]);

    const result = await listBotSocialPosts(bot, { limit: 20 });

    expect("posts" in result).toBe(true);
    if (!("posts" in result)) return;
    expect(result.posts).toHaveLength(3);
    expect(result.posts[0].externalPostUrl).toBe("https://x.com/sabqorg/status/2104791827802911159");
    expect(result.posts[0].externalPostId).toBe("2104791827802911159");
    expect(result.posts[1].status).toBe("scheduled");
    expect(result.posts[1].externalPostUrl).toBeNull();
    expect(result.posts[2].externalPostUrl).toBe("https://x.com/sabqorg/status/99");
    expect(state.resolveLink).toHaveBeenCalledTimes(1);
  });

  it("clientReference lookup backfills the same way after a scheduled post is published", async () => {
    state.selects = [
      [binding(pending())],
      [{ externalAccountId: "publer-acc", handle: null }],
    ];
    state.resolveLink.mockResolvedValue({
      tweetId: "2104791827802911159",
      statusUrl: "https://x.com/sabqorg/status/2104791827802911159",
      handle: "sabqorg",
    });
    state.updateReturning.mockResolvedValue([socialPost({
      status: "published",
      publishedAt: now,
      externalPostId: "2104791827802911159",
      externalPostUrl: "https://x.com/sabqorg/status/2104791827802911159",
    })]);

    const result = await listBotSocialPosts(bot, { clientReference: "ref-1" });

    expect("post" in result && result.post.externalPostId).toBe("2104791827802911159");
    expect(state.resolveLink).toHaveBeenCalledTimes(1);
  });
});

function originalRow(over: Record<string, unknown> = {}) {
  return socialPost({
    id: "post-orig",
    articleId: null,
    text: "شرح الخدمة",
    textSource: "custom",
    linkUrl: null,
    imageSource: "upload",
    imageUrl: "https://media.sabq.org/a.png",
    mediaKind: "image",
    mediaUrls: ["https://media.sabq.org/a.png"],
    ...over,
  });
}

describe("original bot posts", () => {
  it("previews a post without an article and does not publish", async () => {
    const preview = await previewBotSocialPost({
      kind: "original",
      text: "شرح الخدمة",
      linkUrl: "https://sabq.org/services/water?utm_source=bot&email=user@example.com",
      imageUrl: "https://media.sabq.org/a.png",
    });
    expect(state.create).not.toHaveBeenCalled();
    expect(state.claim).not.toHaveBeenCalled();
    expect(state.publishClaimed).not.toHaveBeenCalled();
    expect(preview.articleId).toBeNull();
    expect(preview.kind).toBe("original");
    expect(preview.imageUrls).toEqual(["https://media.sabq.org/a.png"]);
    const link = new URL(String(preview.linkUrl));
    expect(link.searchParams.get("utm_source")).toBe("x");
    expect(link.searchParams.get("utm_medium")).toBe("social");
    expect(link.searchParams.get("utm_campaign")).toBe("sabqorg");
    expect(link.searchParams.get("utm_content")).toBe("preview");
    expect(link.searchParams.get("email")).toBeNull();
    expect(preview.valid).toBe(true);
    expect(preview.hardMaxWeightedLength).toBe(2000);
  });

  it("rejects empty text and text over 2000 before creating a post", async () => {
    state.selects = [[]];
    await expect(publishBotSocialPost(bot, {
      kind: "original",
      clientReference: "ref-empty",
      text: " ",
    })).rejects.toMatchObject({ code: "validation_error", httpStatus: 400 });
    state.selects = [[]];
    await expect(publishBotSocialPost(bot, {
      kind: "original",
      clientReference: "ref-long",
      text: "ا".repeat(2001),
    })).rejects.toMatchObject({ code: "validation_error", httpStatus: 400 });
    expect(state.create).not.toHaveBeenCalled();
    expect(state.publishClaimed).not.toHaveBeenCalled();
  });

  it("accepts one image and publishes through the existing claim path", async () => {
    const created = originalRow();
    state.selects = [[], [{ id: "user-1", status: "active" }]];
    state.create.mockResolvedValue(created);
    state.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({ ...created, ...patch }));
    state.claim.mockImplementation(async () => {
      const patch = (state.update.mock.calls.at(-1)?.[1] ?? {}) as Record<string, unknown>;
      return { ...created, ...patch, status: "processing", attempts: 1 };
    });
    state.publishClaimed.mockImplementation(async (claimed: ReturnType<typeof originalRow>) => ({
      ...claimed,
      status: "published",
      externalPostId: "555",
      externalPostUrl: "https://x.com/sabqorg/status/555",
      publishedAt: now,
    }));

    const result = await publishBotSocialPost(bot, {
      kind: "original",
      clientReference: "ref-one",
      text: "شرح الخدمة",
      imageUrl: "https://media.sabq.org/a.png",
    });

    expect(result.idempotentReplay).toBe(false);
    expect(result.post.articleId).toBeNull();
    expect(result.post.kind).toBe("original");
    expect(result.post.imageUrls).toEqual(["https://media.sabq.org/a.png"]);
    expect(result.post.externalPostUrl).toBe("https://x.com/sabqorg/status/555");
    expect(state.create.mock.calls[0][0]).toMatchObject({
      articleId: null,
      mediaUrls: ["https://media.sabq.org/a.png"],
      mediaKind: "image",
    });
    expect(state.publishClaimed).toHaveBeenCalledTimes(1);
  });

  it("accepts more than one image and leaves the link with four measurement params", async () => {
    const images = ["https://media.sabq.org/a.png", "https://media.sabq.org/b.jpg"];
    const created = originalRow({ mediaUrls: images, imageUrl: images[0] });
    state.selects = [[], [{ id: "user-1", status: "active" }]];
    state.create.mockResolvedValue(created);
    state.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({ ...created, ...patch }));
    state.claim.mockImplementation(async () => {
      const patch = (state.update.mock.calls.at(-1)?.[1] ?? {}) as Record<string, unknown>;
      return { ...created, ...patch, status: "processing", attempts: 1 };
    });
    state.publishClaimed.mockImplementation(async (claimed: ReturnType<typeof originalRow>) => ({
      ...claimed,
      status: "published",
      externalPostId: "556",
      externalPostUrl: "https://x.com/sabqorg/status/556",
      publishedAt: now,
    }));

    const result = await publishBotSocialPost(bot, {
      kind: "original",
      clientReference: "ref-many",
      text: "بطاقتان",
      linkUrl: "https://sabq.org/explain/networks?utm_source=forget&utm_medium=email",
      imageUrls: images,
      campaign: "networks",
    });

    expect(result.post.imageUrls).toEqual(images);
    expect(result.post.externalPostUrl).toBe("https://x.com/sabqorg/status/556");
    const outbound = state.publishClaimed.mock.calls[0][0] as { linkUrl: string; articleId: string | null };
    expect(outbound.articleId).toBeNull();
    const link = new URL(outbound.linkUrl);
    expect(link.searchParams.get("utm_source")).toBe("x");
    expect(link.searchParams.get("utm_medium")).toBe("social");
    expect(link.searchParams.get("utm_campaign")).toBe("networks");
    expect(link.searchParams.get("utm_content")).toBe("post-orig");
    expect(link.search).not.toContain("forget");
    expect(link.search).not.toContain("email");
    expect(state.update.mock.invocationCallOrder[0]).toBeLessThan(state.claim.mock.invocationCallOrder[0]);
  });

  it("schedules an original post without publishing it", async () => {
    const created = originalRow();
    state.selects = [[], [{ id: "user-1", status: "active" }]];
    state.create.mockResolvedValue(created);
    state.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({ ...created, ...patch }));
    state.schedule.mockImplementation(async () => {
      const patch = (state.update.mock.calls.at(-1)?.[1] ?? {}) as Record<string, unknown>;
      return { ...created, ...patch, status: "scheduled", scheduledAt: new Date("2026-10-04T18:00:00Z") };
    });

    const result = await scheduleBotSocialPost(bot, {
      kind: "original",
      clientReference: "ref-sched",
      text: "موعد لاحق",
      linkUrl: "https://sabq.org/calendar",
      scheduledAt: "2026-10-04T21:00:00+03:00",
    });

    expect(result.post.status).toBe("scheduled");
    expect(state.publishClaimed).not.toHaveBeenCalled();
    expect(state.claim).not.toHaveBeenCalled();
    const stored = state.update.mock.calls[0][1] as { linkUrl: string };
    const link = new URL(stored.linkUrl);
    expect(link.searchParams.get("utm_source")).toBe("x");
    expect(link.searchParams.get("utm_medium")).toBe("social");
    expect(link.searchParams.get("utm_campaign")).toBe("sabqorg");
    expect(link.searchParams.get("utm_content")).toBe("post-orig");
  });
});
