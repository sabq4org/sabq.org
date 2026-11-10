// ----------------------------------------------------------------------------
// تغريدة المحرر من «نشر سبق» — حسب الصلاحية
//
// من يملك صلاحية النشر الفوري على X ‏(social_publish.publish_now) تُنشر تغريدته
// مباشرة. من لا يملكها تُحفظ تغريدته مقترحًا (draft + requestedAt) يظهر في
// «مكتب سبق» وينتظر قرار صاحب الصلاحية. لا تغيير في قاعدة البيانات: علامة
// المقترح هي requestedAt على منشور بلا وكالة (لا يستعملها أي مسار آخر).
//
// النطاق: خبر منشور فقط. القناة مقفلة افتراضيًا حتى BOT_DESK_EDITOR_TWEETS=on.
// ----------------------------------------------------------------------------

import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { composeXPostText, validateXPostText } from "@shared/socialPostText";
import { articles, socialPosts, type SocialPost } from "@shared/schema";
import { db } from "../../db";
import { BotSocialError } from "./botSocialLogic";
import { resolveBotSocialArticleUrl } from "./botSocialService";
import { assertSafeImageUrl } from "../../utils/safeImageUrl";
import { absolutizeImageUrl } from "./imageResolver";
import {
  MAX_POST_IMAGES,
  SocialPublishValidationError,
  buildArticleUrl,
  claimPostForImmediatePublish,
  createDraftPost,
  notifyDeskOfAuthorSocialProposal,
  publishClaimedPost,
} from "./socialPublishingService";

/** مهلة الحماية من الإرسال المكرر (إعادة المحاولة بعد انقطاع الشبكة). */
export const EDITOR_TWEET_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export function isEditorTweetChannelEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (env.BOT_DESK_EDITOR_TWEETS ?? "").trim().toLowerCase() === "on";
}

/** processing = طلب مطابق سابق ما زال قيد النشر؛ ليس تأكيد نشر. */
export type EditorTweetMode = "published" | "processing" | "pending_approval" | "publish_failed";

export type EditorTweetTextSource = "title" | "custom" | "ai";

/** صور التغريدة كما تُخزَّن: صورة الخبر، أو صور المحرر (وسائط متعددة)، أو بلا صور. */
interface EditorTweetMedia {
  imageSource: "article" | "none";
  imageUrl: string | null;
  mediaKind: "none" | "image";
  mediaUrls: string[];
}

export function resolveEditorTweetMedia(
  input: { includeImage: boolean; imageUrls?: string[] },
  articleImageUrl: string | null,
): EditorTweetMedia {
  const own = [...new Set((input.imageUrls ?? []).map((u) => u.trim()).filter(Boolean))];
  if (own.length > MAX_POST_IMAGES) {
    throw new SocialPublishValidationError(`الصور ${MAX_POST_IMAGES} كحد أقصى`);
  }
  if (own.length > 0) {
    for (const url of own) {
      try {
        assertSafeImageUrl(absolutizeImageUrl(url));
      } catch (err) {
        throw new SocialPublishValidationError(
          `رابط الصورة مرفوض: ${err instanceof Error ? err.message : "غير مسموح"}`,
        );
      }
    }
    return { imageSource: "none", imageUrl: null, mediaKind: "image", mediaUrls: own };
  }
  const imageUrl = input.includeImage ? articleImageUrl : null;
  return imageUrl
    ? { imageSource: "article", imageUrl, mediaKind: "none", mediaUrls: [] }
    : { imageSource: "none", imageUrl: null, mediaKind: "none", mediaUrls: [] };
}

export interface EditorTweetInput {
  articleId?: string;
  /** رابط الخبر العام بديلاً عن المعرّف. */
  articleUrl?: string;
  text: string;
  includeLink: boolean;
  includeImage: boolean;
  /** صور يرفعها المحرر (حتى 4) بدل صورة الخبر. */
  imageUrls?: string[];
  textSource?: EditorTweetTextSource;
  actorUserId: string;
  /** هل يملك صاحب التوكن صلاحية النشر الفوري على X؟ */
  canPublishNow: boolean;
}

export interface EditorTweetResult {
  mode: EditorTweetMode;
  post: SocialPost;
  /** true حين أُعيد منشور سابق مطابق بدل إنشاء جديد. */
  duplicate: boolean;
  /** true حين حُدّث مقترح معلّق للمحرر نفسه على الخبر نفسه. */
  updated: boolean;
}

interface EditorTweetArticle {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
  status: string;
  publishedAt: Date | null;
}

export interface EditorTweetDeps {
  loadArticle(articleId: string): Promise<EditorTweetArticle | null>;
  /** يحوّل رابط الخبر العام إلى معرّفه. */
  resolveArticleUrl(articleUrl: string): Promise<string>;
  findRecentSameTweet(input: {
    articleId: string;
    actorUserId: string;
    text: string;
    since: Date;
  }): Promise<SocialPost | null>;
  findPendingProposal(input: { articleId: string; actorUserId: string }): Promise<SocialPost | null>;
  /**
   * يحدّث المقترح فقط إن بقي مسودة تنتظر القرار (شرط ذري داخل WHERE). يعيد null
   * إن جدوله المكتب أو نشره أو رفضه بين القراءة والتحديث.
   */
  updatePendingProposal(input: {
    postId: string;
    text: string;
    linkUrl: string | null;
    textSource: EditorTweetTextSource;
    imageSource: "article" | "none";
    imageUrl: string | null;
    mediaKind: "none" | "image";
    mediaUrls: string[];
    now: Date;
  }): Promise<SocialPost | null>;
  /** قفل مشترك بين النسخ يجعل «ابحث عن مطابق ثم أنشئ واحجز» خطوة واحدة. */
  withSubmitLock<T>(lockKey: string, run: () => Promise<T>): Promise<T>;
  createDraftPost: typeof createDraftPost;
  claimPostForImmediatePublish: typeof claimPostForImmediatePublish;
  publishClaimedPost: typeof publishClaimedPost;
  notifyDesk: typeof notifyDeskOfAuthorSocialProposal;
  now(): Date;
}

const defaultDeps: EditorTweetDeps = {
  async loadArticle(articleId) {
    const [row] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        imageUrl: articles.imageUrl,
        status: articles.status,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      url: buildArticleUrl(row),
      imageUrl: row.imageUrl || null,
      status: row.status,
      publishedAt: row.publishedAt ?? null,
    };
  },
  async resolveArticleUrl(articleUrl) {
    try {
      return (await resolveBotSocialArticleUrl(articleUrl)).articleId;
    } catch (error) {
      if (error instanceof BotSocialError) {
        throw new SocialPublishValidationError(
          error.message,
          error.httpStatus === 404 ? 404 : 400,
        );
      }
      throw error;
    }
  },
  async findRecentSameTweet({ articleId, actorUserId, text, since }) {
    const [row] = await db
      .select()
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.articleId, articleId),
          eq(socialPosts.createdByUserId, actorUserId),
          eq(socialPosts.text, text),
          isNull(socialPosts.publisherId),
          inArray(socialPosts.status, ["processing", "published"]),
          gte(socialPosts.createdAt, since),
        ),
      )
      .orderBy(desc(socialPosts.createdAt))
      .limit(1);
    return row ?? null;
  },
  async findPendingProposal({ articleId, actorUserId }) {
    const [row] = await db
      .select()
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.articleId, articleId),
          eq(socialPosts.createdByUserId, actorUserId),
          eq(socialPosts.status, "draft"),
          isNull(socialPosts.publisherId),
          isNotNull(socialPosts.requestedAt),
        ),
      )
      .orderBy(desc(socialPosts.createdAt))
      .limit(1);
    return row ?? null;
  },
  async updatePendingProposal({ postId, text, linkUrl, textSource, imageSource, imageUrl, mediaKind, mediaUrls, now }) {
    const [row] = await db
      .update(socialPosts)
      .set({ text, linkUrl, textSource, imageSource, imageUrl, mediaKind, mediaUrls, requestedAt: now, updatedAt: now })
      .where(
        and(
          eq(socialPosts.id, postId),
          eq(socialPosts.status, "draft"),
          isNull(socialPosts.publisherId),
          isNotNull(socialPosts.requestedAt),
        ),
      )
      .returning();
    return row ?? null;
  },
  async withSubmitLock(lockKey, run) {
    // القفل يُحرَّر بنهاية المعاملة. الاستعلامات داخل run تجري على اتصالات أخرى
    // من المجمع، والمطلوب هنا التسلسل بين الطلبات لا العزل.
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
      return run();
    });
  },
  createDraftPost,
  claimPostForImmediatePublish,
  publishClaimedPost,
  notifyDesk: notifyDeskOfAuthorSocialProposal,
  now: () => new Date(),
};

async function loadTweetableArticle(
  target: { articleId?: string; articleUrl?: string },
  deps: EditorTweetDeps,
): Promise<EditorTweetArticle> {
  const resolvedId = target.articleUrl ? await deps.resolveArticleUrl(target.articleUrl) : null;
  if (resolvedId && target.articleId && resolvedId !== target.articleId) {
    throw new SocialPublishValidationError("معرّف الخبر ورابطه لا يشيران إلى الخبر نفسه");
  }
  const articleId = resolvedId ?? target.articleId;
  if (!articleId) throw new SocialPublishValidationError("معرّف الخبر أو رابطه مطلوب");
  const article = await deps.loadArticle(articleId);
  if (!article) throw new SocialPublishValidationError("الخبر غير موجود", 404);
  // نفس شرط مسار البوت القائم (assertArticleTweetable): منشور ووقت نشره حلّ.
  if (
    article.status !== "published" ||
    (article.publishedAt && article.publishedAt.getTime() > deps.now().getTime())
  ) {
    throw new SocialPublishValidationError("التغريدة متاحة للخبر المنشور فقط", 409);
  }
  return article;
}

export interface EditorTweetPreview {
  /** direct = تُنشر مباشرة؛ approval = تذهب مقترحًا لمكتب سبق. */
  mode: "direct" | "approval";
  article: { id: string; title: string; url: string; imageUrl: string | null };
  text: string;
  linkUrl: string | null;
  /** أول صورة (توافقًا مع العملاء الأقدم). القائمة الكاملة في imageUrls. */
  imageUrl: string | null;
  imageUrls: string[];
  imageSource: "article" | "upload" | "none";
  textSource: EditorTweetTextSource;
  composedText: string;
  weightedLength: number;
  valid: boolean;
  /** يتجاوز 280: قد يُبتر عند النقل. */
  overStandard: boolean;
}

/** معاينة بلا أي كتابة: تتحقق من الخبر وتحسب النص المركّب وطوله. */
export async function previewEditorTweet(
  input: {
    articleId?: string;
    articleUrl?: string;
    text?: string;
    includeLink: boolean;
    includeImage: boolean;
    imageUrls?: string[];
    textSource?: EditorTweetTextSource;
    canPublishNow: boolean;
  },
  overrides: Partial<EditorTweetDeps> = {},
): Promise<EditorTweetPreview> {
  const deps: EditorTweetDeps = { ...defaultDeps, ...overrides };
  const article = await loadTweetableArticle(input, deps);
  const useTitle = input.textSource === "title" || !input.text?.trim();
  const text = useTitle ? article.title : input.text!.trim();
  const linkUrl = input.includeLink ? article.url : null;
  const validation = validateXPostText(text, linkUrl);
  const media = resolveEditorTweetMedia(input, article.imageUrl);
  const imageUrls = media.mediaUrls.length > 0 ? media.mediaUrls : media.imageUrl ? [media.imageUrl] : [];
  return {
    mode: input.canPublishNow ? "direct" : "approval",
    article: { id: article.id, title: article.title, url: article.url, imageUrl: article.imageUrl },
    text,
    linkUrl,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    imageSource: media.mediaUrls.length > 0 ? "upload" : media.imageUrl ? "article" : "none",
    textSource: useTitle ? "title" : input.textSource ?? "custom",
    composedText: composeXPostText(text, linkUrl),
    weightedLength: validation.weightedLength,
    valid: validation.valid && !validation.empty,
    overStandard: validation.overStandard,
  };
}

export async function submitEditorTweet(
  input: EditorTweetInput,
  overrides: Partial<EditorTweetDeps> = {},
): Promise<EditorTweetResult> {
  const deps: EditorTweetDeps = { ...defaultDeps, ...overrides };
  const text = input.text.trim();

  const article = await loadTweetableArticle(input, deps);
  const lockKey = `editor-tweet:${input.actorUserId}:${article.id}`;

  const image = resolveEditorTweetMedia(input, article.imageUrl);
  const textSource: EditorTweetTextSource = input.textSource ?? "custom";

  if (input.canPublishNow) {
    // البحث عن مطابق + الإنشاء + الحجز تحت قفل واحد: طلبان متزامنان بالنص نفسه
    // لا ينشئان منشورين. النشر نفسه خارج القفل.
    const locked = await deps.withSubmitLock(lockKey, async () => {
        const since = new Date(deps.now().getTime() - EDITOR_TWEET_DUPLICATE_WINDOW_MS);
        const same = await deps.findRecentSameTweet({
          articleId: article.id,
          actorUserId: input.actorUserId,
          text,
          since,
        });
        if (same) return { same, claimed: null };
        const draft = await deps.createDraftPost({
          articleId: article.id,
          text,
          textSource,
          includeLink: input.includeLink,
          ...image,
          createdByUserId: input.actorUserId,
        });
        return { same: null, claimed: await deps.claimPostForImmediatePublish(draft.id) };
    });
    if (locked.same) {
      return {
        mode: locked.same.status === "published" ? "published" : "processing",
        post: locked.same,
        duplicate: true,
        updated: false,
      };
    }
    if (!locked.claimed) {
      throw new SocialPublishValidationError("المنشور قيد النشر بالفعل أو حالته لا تسمح", 409);
    }
    const result = await deps.publishClaimedPost(locked.claimed, input.actorUserId);
    return {
      mode: result.status === "published" ? "published" : "publish_failed",
      post: result,
      duplicate: false,
      updated: false,
    };
  }

  const linkUrl = input.includeLink ? article.url : null;
  const validation = validateXPostText(text, linkUrl);
  if (validation.empty) throw new SocialPublishValidationError("نص المنشور فارغ");
  if (!validation.valid) {
    throw new SocialPublishValidationError(
      `النص يتجاوز الحد الأقصى لمنصة X (${validation.weightedLength}/25000)`,
    );
  }
  // القفل نفسه: طلبان متزامنان من المحرر نفسه للخبر نفسه لا ينشئان مقترحين.
  const { post, updated } = await deps.withSubmitLock(lockKey, async () => {
    const pending = await deps.findPendingProposal({
      articleId: article.id,
      actorUserId: input.actorUserId,
    });
    // null = المكتب قرّر في المقترح السابق للتو؛ الطلب الحالي يصبح مقترحًا جديدًا
    // ولا يمس ما اعتُمد أو جُدول.
    const updatedPost = pending
      ? await deps.updatePendingProposal({
          postId: pending.id,
          text,
          linkUrl,
          textSource,
          ...image,
          now: deps.now(),
        })
      : null;
    if (updatedPost) return { post: updatedPost, updated: true };
    const created = await deps.createDraftPost({
      articleId: article.id,
      text,
      textSource,
      includeLink: input.includeLink,
      ...image,
      createdByUserId: input.actorUserId,
      requestedAt: deps.now(),
    });
    return { post: created, updated: false };
  });

  // تنبيه «مكتب سبق» لا يؤخّر الرد ولا يُفشله.
  void deps
    .notifyDesk({
      post,
      articleTitle: article.title,
      articleUrl: article.url,
      authorUserId: input.actorUserId,
      isUpdate: updated,
      proposer: "editor",
    })
    .catch((err) => console.error("[EditorTweet] تعذر تنبيه المكتب:", err));

  return { mode: "pending_approval", post, duplicate: false, updated };
}

/** ما يراه صاحب التغريدة عن قرار المكتب — بلا حقول داخلية. */
export interface EditorTweetStatus {
  id: string;
  articleId: string | null;
  status: string;
  /** pending_approval | scheduled | processing | published | rejected | failed */
  state: "pending_approval" | "scheduled" | "processing" | "published" | "rejected" | "failed";
  text: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPostUrl: string | null;
  /** سبب الرفض أو آخر خطأ نشر إن وُجد. */
  reason: string | null;
}

export function toEditorTweetStatus(post: SocialPost): EditorTweetStatus {
  const state: EditorTweetStatus["state"] =
    post.status === "draft"
      ? "pending_approval"
      : post.status === "canceled"
        ? "rejected"
        : post.status === "scheduled" || post.status === "processing" || post.status === "published"
          ? post.status
          : "failed";
  const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
  return {
    id: post.id,
    articleId: post.articleId ?? null,
    status: post.status,
    state,
    text: post.text,
    scheduledAt: iso(post.scheduledAt),
    publishedAt: iso(post.publishedAt),
    externalPostUrl: post.externalPostUrl ?? null,
    reason: state === "rejected" || state === "failed" ? post.lastError ?? null : null,
  };
}

/** يقرأ تغريدة المحرر لصاحبها فقط؛ null إن لم توجد أو كانت لغيره. */
export async function getEditorTweetForOwner(
  postId: string,
  ownerUserId: string,
): Promise<EditorTweetStatus | null> {
  const [row] = await db
    .select()
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.id, postId),
        eq(socialPosts.createdByUserId, ownerUserId),
        isNull(socialPosts.publisherId),
      ),
    )
    .limit(1);
  return row ? toEditorTweetStatus(row) : null;
}
