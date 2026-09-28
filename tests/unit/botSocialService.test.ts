import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selects: [] as unknown[][],
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
    where: () => builder,
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
  },
}));
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
  previewBotSocialPost,
  publishBotSocialPost,
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

beforeEach(() => {
  state.selects = [];
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
