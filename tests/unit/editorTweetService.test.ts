import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/staffDeskEventsService", () => ({
  recordTweetDraftEvent: vi.fn(async () => undefined),
  recordTweetScheduledEvent: vi.fn(async () => undefined),
  recordTweetPublishedEvent: vi.fn(async () => undefined),
}));

import {
  EDITOR_TWEET_DUPLICATE_WINDOW_MS,
  isEditorTweetChannelEnabled,
  submitEditorTweet,
  toEditorTweetStatus,
  type EditorTweetDeps,
} from "../../server/services/socialPublishing/editorTweetService";
import { SocialPublishValidationError } from "../../server/services/socialPublishing/socialPublishingService";
import { botDeskEditorTweetSchema } from "../../shared/botDesk";

const NOW = new Date("2026-11-10T06:00:00.000Z");
const article = {
  id: "a1",
  title: "أمانة الرياض تطلق مسار حافلات",
  url: "https://sabq.org/article/riyadh-bus",
  imageUrl: "https://media.sabq.org/news/x.webp",
  status: "published",
  publishedAt: new Date("2026-11-10T05:00:00.000Z"),
};
const post = (over: Record<string, unknown> = {}) =>
  ({ id: "p1", articleId: "a1", status: "draft", text: "نص", ...over }) as any;

function makeDeps(over: Partial<EditorTweetDeps> = {}): EditorTweetDeps {
  return {
    loadArticle: vi.fn(async () => article),
    findRecentSameTweet: vi.fn(async () => null),
    findPendingProposal: vi.fn(async () => null),
    createDraftPost: vi.fn(async () => post()) as any,
    updatePendingProposal: vi.fn(async () => post({ id: "p9", text: "محدّث" })),
    withSubmitLock: vi.fn(async (_key: string, run: () => Promise<any>) => run()) as any,
    claimPostForImmediatePublish: vi.fn(async () => post({ status: "processing" })) as any,
    publishClaimedPost: vi.fn(async () => post({ status: "published" })) as any,
    notifyDesk: vi.fn(async () => undefined) as any,
    now: () => NOW,
    ...over,
  };
}
const input = (canPublishNow: boolean) => ({
  articleId: "a1",
  text: "  نص التغريدة  ",
  includeLink: true,
  includeImage: true,
  actorUserId: "u1",
  canPublishNow,
});

describe("تغريدة المحرر من «نشر سبق» — حسب الصلاحية", () => {
  it("القناة مقفلة افتراضيًا وتفتح بـ on فقط", () => {
    expect(isEditorTweetChannelEnabled({})).toBe(false);
    expect(isEditorTweetChannelEnabled({ BOT_DESK_EDITOR_TWEETS: "true" })).toBe(false);
    expect(isEditorTweetChannelEnabled({ BOT_DESK_EDITOR_TWEETS: " ON " })).toBe(true);
  });

  it("المخطط يفترض الرابط والصورة ويرفض الحقول الغريبة", () => {
    expect(botDeskEditorTweetSchema.parse({ articleId: "a1", text: "نص" })).toEqual({
      articleId: "a1",
      text: "نص",
      includeLink: true,
      includeImage: true,
    });
    expect(botDeskEditorTweetSchema.safeParse({ articleId: "a1", text: " " }).success).toBe(false);
    expect(
      botDeskEditorTweetSchema.safeParse({ articleId: "a1", text: "نص", scheduledAt: "x" }).success,
    ).toBe(false);
  });

  it("صاحب صلاحية النشر: ينشر مباشرة بلا علامة مقترح ولا تنبيه للمكتب", async () => {
    const deps = makeDeps();
    const result = await submitEditorTweet(input(true), deps);
    expect(result).toMatchObject({ mode: "published", duplicate: false, updated: false });
    const created = (deps.createDraftPost as any).mock.calls[0][0];
    expect(created).toMatchObject({
      articleId: "a1",
      text: "نص التغريدة",
      imageSource: "article",
      imageUrl: article.imageUrl,
      createdByUserId: "u1",
    });
    expect(created.requestedAt).toBeUndefined();
    expect(deps.publishClaimedPost).toHaveBeenCalledTimes(1);
    expect(deps.notifyDesk).not.toHaveBeenCalled();
  });

  it("بلا صلاحية النشر: مقترح بعلامة requestedAt وتنبيه للمكتب، بلا نشر", async () => {
    const deps = makeDeps();
    const result = await submitEditorTweet(input(false), deps);
    expect(result).toMatchObject({ mode: "pending_approval", updated: false });
    expect((deps.createDraftPost as any).mock.calls[0][0].requestedAt).toEqual(NOW);
    expect(deps.claimPostForImmediatePublish).not.toHaveBeenCalled();
    expect(deps.publishClaimedPost).not.toHaveBeenCalled();
    expect(deps.notifyDesk).toHaveBeenCalledWith(
      expect.objectContaining({ authorUserId: "u1", isUpdate: false, articleTitle: article.title }),
    );
  });

  it("إعادة الإرسال للخبر نفسه تحدّث المقترح المعلّق ولا تنشئ ثانيًا", async () => {
    const deps = makeDeps({ findPendingProposal: vi.fn(async () => post({ id: "p9" })) });
    const result = await submitEditorTweet(input(false), deps);
    expect(result).toMatchObject({ mode: "pending_approval", updated: true });
    expect(deps.createDraftPost).not.toHaveBeenCalled();
    expect(deps.updatePendingProposal).toHaveBeenCalledWith(
      expect.objectContaining({ postId: "p9", text: "نص التغريدة", linkUrl: article.url }),
    );
  });

  it("إن قرّر المكتب في المقترح السابق للتو: مقترح جديد ولا يُمس المعتمد", async () => {
    const deps = makeDeps({
      findPendingProposal: vi.fn(async () => post({ id: "p9" })),
      updatePendingProposal: vi.fn(async () => null),
    });
    const result = await submitEditorTweet(input(false), deps);
    expect(result).toMatchObject({ mode: "pending_approval", updated: false });
    expect((deps.createDraftPost as any).mock.calls[0][0].requestedAt).toEqual(NOW);
  });

  it("طلبان متزامنان بالنص نفسه: منشور واحد فقط يُنشأ ويُنشر", async () => {
    const store: any[] = [];
    let chain: Promise<unknown> = Promise.resolve();
    const deps = makeDeps({
      withSubmitLock: ((_key: string, run: () => Promise<any>) => {
        const next = chain.then(run);
        chain = next.catch(() => undefined);
        return next;
      }) as any,
      findRecentSameTweet: vi.fn(async () => store[0] ?? null),
      createDraftPost: vi.fn(async () => post({ id: "only" })) as any,
      claimPostForImmediatePublish: vi.fn(async () => {
        const claimed = post({ id: "only", status: "processing" });
        store.push(claimed);
        return claimed;
      }) as any,
    });
    const [first, second] = await Promise.all([
      submitEditorTweet(input(true), deps),
      submitEditorTweet(input(true), deps),
    ]);
    expect(deps.createDraftPost).toHaveBeenCalledTimes(1);
    expect(deps.publishClaimedPost).toHaveBeenCalledTimes(1);
    expect(first.mode).toBe("published");
    expect(second).toMatchObject({ mode: "processing", duplicate: true });
  });

  it("تكرار النص نفسه خلال المهلة لا ينشر مرة ثانية", async () => {
    const findRecentSameTweet = vi.fn(async () => post({ id: "old", status: "published" }));
    const deps = makeDeps({ findRecentSameTweet });
    const result = await submitEditorTweet(input(true), deps);
    expect(result).toMatchObject({ mode: "published", duplicate: true });
    expect(result.post.id).toBe("old");
    expect(findRecentSameTweet.mock.calls[0][0].since).toEqual(
      new Date(NOW.getTime() - EDITOR_TWEET_DUPLICATE_WINDOW_MS),
    );
    expect(deps.createDraftPost).not.toHaveBeenCalled();
    expect(deps.publishClaimedPost).not.toHaveBeenCalled();
  });

  it("فشل المنصة يعود publish_failed مع المنشور", async () => {
    const deps = makeDeps({
      publishClaimedPost: vi.fn(async () => post({ status: "failed", lastError: "X 503" })) as any,
    });
    const result = await submitEditorTweet(input(true), deps);
    expect(result.mode).toBe("publish_failed");
  });

  it("بلا صورة حين يطلب المحرر ذلك أو لا صورة للخبر", async () => {
    const deps = makeDeps();
    await submitEditorTweet({ ...input(false), includeImage: false }, deps);
    expect((deps.createDraftPost as any).mock.calls[0][0]).toMatchObject({
      imageSource: "none",
      imageUrl: null,
    });
  });

  it("يرفض الخبر غير الموجود (404) وغير المنشور (409) قبل أي كتابة", async () => {
    const missing = makeDeps({ loadArticle: vi.fn(async () => null) });
    await expect(submitEditorTweet(input(true), missing)).rejects.toMatchObject({ status: 404 });
    const draft = makeDeps({ loadArticle: vi.fn(async () => ({ ...article, status: "draft" })) });
    const err = await submitEditorTweet(input(false), draft).catch((e) => e);
    expect(err).toBeInstanceOf(SocialPublishValidationError);
    expect(err.status).toBe(409);
    expect(draft.createDraftPost).not.toHaveBeenCalled();
    const future = makeDeps({
      loadArticle: vi.fn(async () => ({
        ...article,
        publishedAt: new Date(NOW.getTime() + 60_000),
      })),
    });
    await expect(submitEditorTweet(input(true), future)).rejects.toMatchObject({ status: 409 });
  });

  it("طلبا مقترح متزامنان من المحرر نفسه: مقترح واحد والثاني تحديث له", async () => {
    let stored: any = null;
    let chain: Promise<unknown> = Promise.resolve();
    const deps = makeDeps({
      withSubmitLock: ((_key: string, run: () => Promise<any>) => {
        const next = chain.then(run);
        chain = next.catch(() => undefined);
        return next;
      }) as any,
      findPendingProposal: vi.fn(async () => stored),
      createDraftPost: vi.fn(async () => (stored = post({ id: "one" }))) as any,
      updatePendingProposal: vi.fn(async () => post({ id: "one", text: "محدّث" })),
    });
    const results = await Promise.all([
      submitEditorTweet(input(false), deps),
      submitEditorTweet(input(false), deps),
    ]);
    expect(deps.createDraftPost).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.updated)).toEqual([false, true]);
  });

  it("التنبيه بصياغة المحرر، وحالة التغريدة لصاحبها بلا حقول داخلية", async () => {
    const deps = makeDeps();
    await submitEditorTweet(input(false), deps);
    expect(deps.notifyDesk).toHaveBeenCalledWith(expect.objectContaining({ proposer: "editor" }));
    expect(
      toEditorTweetStatus(post({ status: "canceled", lastError: "العنوان مكرر" })),
    ).toMatchObject({ state: "rejected", reason: "العنوان مكرر" });
    expect(toEditorTweetStatus(post({ status: "draft", lastError: "x" }))).toMatchObject({
      state: "pending_approval",
      reason: null,
    });
    expect(
      toEditorTweetStatus(post({ status: "published", externalPostUrl: "https://x.com/s/1" })),
    ).toMatchObject({ state: "published", externalPostUrl: "https://x.com/s/1" });
  });
});
