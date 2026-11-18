import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/staffDeskEventsService", () => ({
  recordTweetDraftEvent: vi.fn(async () => undefined),
  recordTweetScheduledEvent: vi.fn(async () => undefined),
  recordTweetPublishedEvent: vi.fn(async () => undefined),
}));

import {
  EDITOR_TWEET_DUPLICATE_WINDOW_MS,
  resolveEditorTweetMedia,
  isEditorTweetChannelEnabled,
  previewEditorTweet,
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
    resolveArticleUrl: vi.fn(async () => "a1"),
    findRecentSameTweet: vi.fn(async () => null),
    findPendingProposal: vi.fn(async () => null),
    createDraftPost: vi.fn(async () => post()) as any,
    updatePendingProposal: vi.fn(async () => post({ id: "p9", text: "محدّث" })),
    withSubmitLock: vi.fn(async (_key: string, run: () => Promise<any>) => run()) as any,
    claimPostForImmediatePublish: vi.fn(async () => post({ status: "processing" })) as any,
    publishClaimedPost: vi.fn(async () => post({ status: "published" })) as any,
    schedulePost: vi.fn(async (_id: string, at: Date) => post({ status: "scheduled", scheduledAt: at })) as any,
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

  it("المعاينة بلا كتابة: رابط الخبر يُحل، والنص الغائب = العنوان، والوضع حسب الصلاحية", async () => {
    const deps = makeDeps();
    const preview = await previewEditorTweet(
      { articleUrl: article.url, includeLink: true, includeImage: true, canPublishNow: false },
      deps,
    );
    expect(deps.resolveArticleUrl).toHaveBeenCalledWith(article.url);
    expect(preview).toMatchObject({
      mode: "approval",
      text: article.title,
      linkUrl: article.url,
      imageUrl: article.imageUrl,
      valid: true,
    });
    expect(preview.composedText).toContain(article.url);
    expect(deps.createDraftPost).not.toHaveBeenCalled();
    const direct = await previewEditorTweet(
      { articleId: "a1", text: "نص", includeLink: false, includeImage: false, canPublishNow: true },
      deps,
    );
    expect(direct).toMatchObject({ mode: "direct", linkUrl: null, imageUrl: null, text: "نص" });
  });

  it("صور المحرر (حتى 4) تحل محل صورة الخبر، والرابط اختياري، ومصدر النص يُحفظ", async () => {
    const own = ["https://media.sabq.org/news/a.webp", "https://media.sabq.org/news/b.webp"];
    const deps = makeDeps();
    await submitEditorTweet(
      { ...input(false), includeLink: false, imageUrls: own, textSource: "ai" },
      deps,
    );
    expect((deps.createDraftPost as any).mock.calls[0][0]).toMatchObject({
      includeLink: false,
      textSource: "ai",
      imageSource: "none",
      imageUrl: null,
      mediaKind: "image",
      mediaUrls: own,
    });
    const preview = await previewEditorTweet(
      { articleId: "a1", text: "نص", includeLink: false, includeImage: true, imageUrls: own, canPublishNow: false },
      deps,
    );
    expect(preview).toMatchObject({ imageUrls: own, imageUrl: own[0], imageSource: "upload", linkUrl: null });
    const title = await previewEditorTweet(
      { articleId: "a1", text: "نص", textSource: "title", includeLink: true, includeImage: true, canPublishNow: false },
      deps,
    );
    expect(title).toMatchObject({ text: article.title, textSource: "title", imageSource: "article", imageUrls: [article.imageUrl] });
  });

  it("يرفض أكثر من 4 صور ورابط صورة من مضيف غير مسموح", async () => {
    const five = [1, 2, 3, 4, 5].map((n) => `https://media.sabq.org/news/${n}.webp`);
    expect(botDeskEditorTweetSchema.safeParse({ articleId: "a1", text: "نص", imageUrls: five }).success).toBe(false);
    const deps = makeDeps();
    await expect(submitEditorTweet({ ...input(false), imageUrls: five }, deps)).rejects.toThrow(/4/);
    await expect(
      submitEditorTweet({ ...input(false), imageUrls: ["https://evil.example.test/x.png"] }, deps),
    ).rejects.toThrow(/مرفوض/);
    expect(deps.createDraftPost).not.toHaveBeenCalled();
  });

  it("يرفض معرّفًا ورابطًا لا يشيران إلى الخبر نفسه (غيابهما مع نص = تغريدة حرة)", async () => {
    const deps = makeDeps({ resolveArticleUrl: vi.fn(async () => "other") });
    await expect(
      submitEditorTweet({ ...input(true), articleUrl: article.url }, deps),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      botDeskEditorTweetSchema.safeParse({ text: "نص" }).success,
    ).toBe(true);
    expect(
      botDeskEditorTweetSchema.safeParse({ articleUrl: article.url, text: "نص" }).success,
    ).toBe(true);
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

describe("جدولة تغريدة المحرر", () => {
  const inThreeHours = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

  it("المخطط يقبل موعدًا بمنطقة زمنية ويرفض بدونها", () => {
    const at = inThreeHours();
    expect(botDeskEditorTweetSchema.parse({ articleId: "a1", text: "نص", scheduledAt: at }).scheduledAt).toBe(at);
    expect(
      botDeskEditorTweetSchema.safeParse({ articleId: "a1", text: "نص", scheduledAt: "2026-12-01T10:00:00" }).success,
    ).toBe(false);
  });

  it("صاحب صلاحية الجدولة: مسودة ثم جدولة بالموعد، بلا نشر ولا تنبيه للمكتب", async () => {
    const deps = makeDeps();
    const at = inThreeHours();
    const result = await submitEditorTweet({ ...input(false), scheduledAt: at, canSchedule: true }, deps);
    expect(result).toMatchObject({ mode: "scheduled", duplicate: false });
    expect((deps.createDraftPost as any).mock.calls[0][0].requestedAt).toBeUndefined();
    expect(deps.schedulePost).toHaveBeenCalledWith("p1", new Date(at), { actorUserId: "u1" });
    expect(deps.claimPostForImmediatePublish).not.toHaveBeenCalled();
    expect(deps.publishClaimedPost).not.toHaveBeenCalled();
    expect(deps.notifyDesk).not.toHaveBeenCalled();
  });

  it("الجدولة تغلب النشر الفوري حتى لصاحب الصلاحيتين", async () => {
    const deps = makeDeps();
    const result = await submitEditorTweet({ ...input(true), scheduledAt: inThreeHours(), canSchedule: true }, deps);
    expect(result.mode).toBe("scheduled");
    expect(deps.publishClaimedPost).not.toHaveBeenCalled();
  });

  it("تكرار طلب الجدولة نفسه يعيد المجدول السابق بلا جدولة ثانية", async () => {
    const deps = makeDeps({ findRecentSameTweet: vi.fn(async () => post({ status: "scheduled" })) });
    const result = await submitEditorTweet({ ...input(true), scheduledAt: inThreeHours(), canSchedule: true }, deps);
    expect(result).toMatchObject({ mode: "scheduled", duplicate: true });
    expect((deps.findRecentSameTweet as any).mock.calls[0][0].statuses).toContain("scheduled");
    expect(deps.createDraftPost).not.toHaveBeenCalled();
  });

  it("بلا صلاحية الجدولة: مقترح للمكتب والموعد المطلوب في requestedAt", async () => {
    const deps = makeDeps();
    const at = inThreeHours();
    const result = await submitEditorTweet({ ...input(true), scheduledAt: at, canSchedule: false }, deps);
    expect(result.mode).toBe("pending_approval");
    expect((deps.createDraftPost as any).mock.calls[0][0].requestedAt).toEqual(new Date(at));
    expect(deps.schedulePost).not.toHaveBeenCalled();
    expect(deps.publishClaimedPost).not.toHaveBeenCalled();
    expect(deps.notifyDesk).toHaveBeenCalledTimes(1);
  });

  it("تحديث مقترح معلّق يحمل الموعد الجديد", async () => {
    const deps = makeDeps({ findPendingProposal: vi.fn(async () => post({ id: "p9" })) });
    const at = inThreeHours();
    await submitEditorTweet({ ...input(false), scheduledAt: at }, deps);
    expect(deps.updatePendingProposal).toHaveBeenCalledWith(expect.objectContaining({ requestedAt: new Date(at) }));
  });

  it("يرفض موعدًا ماضيًا أو أقرب من دقيقة برمز 400 قبل أي كتابة", async () => {
    const deps = makeDeps();
    const past = new Date(Date.now() - 60_000).toISOString();
    await expect(
      submitEditorTweet({ ...input(true), scheduledAt: past, canSchedule: true }, deps),
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.createDraftPost).not.toHaveBeenCalled();
  });

  it("حالة التغريدة: إلغاء صاحبها canceled لا rejected، والموعد المطلوب يظهر للمقترح فقط", () => {
    expect(
      toEditorTweetStatus(post({ status: "canceled", createdByUserId: "u1", canceledByUserId: "u1" })),
    ).toMatchObject({ state: "canceled", reason: null });
    expect(
      toEditorTweetStatus(post({ status: "canceled", createdByUserId: "u1", canceledByUserId: "e2", lastError: "لا" })),
    ).toMatchObject({ state: "rejected", reason: "لا" });
    const updatedAt = new Date("2026-11-18T09:00:00Z");
    expect(
      toEditorTweetStatus(post({ status: "draft", updatedAt, requestedAt: new Date("2026-11-18T12:00:00Z") })).requestedAt,
    ).toBe("2026-11-18T12:00:00.000Z");
    expect(toEditorTweetStatus(post({ status: "draft", updatedAt, requestedAt: updatedAt })).requestedAt).toBeNull();
  });
});

describe("فيديو تغريدة المحرر", () => {
  afterEach(() => vi.unstubAllEnvs());
  const video = "https://media.sabq.org/uploads/clip.mp4";
  const publer = () => {
    vi.stubEnv("SOCIAL_PUBLISH_TRANSPORT", "publer");
    vi.stubEnv("PUBLER_API_KEY", "k");
    vi.stubEnv("PUBLER_WORKSPACE_ID", "w");
  };

  it("فيديو واحد يحل محل الصور ويُخزَّن mediaKind=video", async () => {
    publer();
    const deps = makeDeps();
    await submitEditorTweet({ ...input(false), videoUrl: video }, deps);
    expect((deps.createDraftPost as any).mock.calls[0][0]).toMatchObject({
      imageSource: "none",
      imageUrl: null,
      mediaKind: "video",
      mediaUrls: [video],
    });
    const preview = await previewEditorTweet(
      { articleId: "a1", text: "نص", includeLink: true, includeImage: true, videoUrl: video, canPublishNow: true },
      deps,
    );
    expect(preview).toMatchObject({ videoUrl: video, imageUrls: [], imageUrl: null, imageSource: "none" });
  });

  it("بلا Publer: 409 بلا كتابة", async () => {
    vi.stubEnv("SOCIAL_PUBLISH_TRANSPORT", "");
    const deps = makeDeps();
    await expect(submitEditorTweet({ ...input(true), videoUrl: video }, deps)).rejects.toMatchObject({ status: 409 });
    expect(deps.createDraftPost).not.toHaveBeenCalled();
  });

  it("يرفض فيديو مع صور، ورابطًا من مضيف غير مسموح", () => {
    expect(
      botDeskEditorTweetSchema.safeParse({ articleId: "a1", text: "نص", videoUrl: video, imageUrls: [video] }).success,
    ).toBe(false);
    expect(() =>
      resolveEditorTweetMedia({ includeImage: true, videoUrl: "https://evil.example.test/v.mp4" }, null, true),
    ).toThrow(/مرفوض/);
  });
});

describe("تغريدة حرة بلا خبر", () => {
  const STATUS = "https://x.com/someone/status/2122692885657116789";
  const free = (canPublishNow: boolean) => ({
    text: `  نص حر\n${STATUS}  `,
    includeLink: true,
    includeImage: true,
    actorUserId: "u1",
    canPublishNow,
  });

  it("المخطط يقبل نصًا بلا خبر ويرفض الفراغ التام", () => {
    expect(botDeskEditorTweetSchema.safeParse({ text: "نص حر" }).success).toBe(true);
    expect(botDeskEditorTweetSchema.safeParse({ text: " " }).success).toBe(false);
  });

  it("صاحب صلاحية النشر: تُنشر بلا خبر ولا رابط خبر ولا صورة خبر", async () => {
    const deps = makeDeps();
    const result = await submitEditorTweet(free(true), deps);
    expect(result.mode).toBe("published");
    expect(deps.loadArticle).not.toHaveBeenCalled();
    expect((deps.findRecentSameTweet as any).mock.calls[0][0].articleId).toBeNull();
    expect((deps.createDraftPost as any).mock.calls[0][0]).toMatchObject({
      articleId: null,
      text: `نص حر\n${STATUS}`,
      textSource: "custom",
      includeLink: false,
      imageSource: "none",
      imageUrl: null,
    });
  });

  it("بلا صلاحية النشر: مقترح جديد دائمًا (لا يُدمج في مقترح سابق) وتنبيه بلا عنوان خبر", async () => {
    const deps = makeDeps({ findPendingProposal: vi.fn(async () => post({ id: "p9" })) });
    const result = await submitEditorTweet(free(false), deps);
    expect(result).toMatchObject({ mode: "pending_approval", updated: false });
    expect(deps.findPendingProposal).not.toHaveBeenCalled();
    expect((deps.createDraftPost as any).mock.calls[0][0]).toMatchObject({ articleId: null, requestedAt: NOW });
    expect(deps.notifyDesk).toHaveBeenCalledWith(expect.objectContaining({ articleTitle: "", articleUrl: "" }));
  });

  it("تُجدول بلا خبر، والمعاينة تعيد article=null بالنص كما كُتب", async () => {
    const deps = makeDeps();
    const at = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const result = await submitEditorTweet({ ...free(false), canSchedule: true, scheduledAt: at }, deps);
    expect(result.mode).toBe("scheduled");
    expect((deps.createDraftPost as any).mock.calls[0][0].articleId).toBeNull();
    const preview = await previewEditorTweet(
      { text: "نص حر", textSource: "title", includeLink: true, includeImage: true, canPublishNow: false },
      deps,
    );
    expect(preview).toMatchObject({ article: null, text: "نص حر", linkUrl: null, textSource: "custom", imageUrls: [] });
    await expect(
      previewEditorTweet({ includeLink: true, includeImage: true, canPublishNow: false }, deps),
    ).rejects.toBeInstanceOf(SocialPublishValidationError);
  });
});
