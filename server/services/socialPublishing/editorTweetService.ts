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
import { validateXPostText } from "@shared/socialPostText";
import { articles, socialPosts, type SocialPost } from "@shared/schema";
import { db } from "../../db";
import {
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

export interface EditorTweetInput {
  articleId: string;
  text: string;
  includeLink: boolean;
  includeImage: boolean;
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
    imageSource: "article" | "none";
    imageUrl: string | null;
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
  async updatePendingProposal({ postId, text, linkUrl, imageSource, imageUrl, now }) {
    const [row] = await db
      .update(socialPosts)
      .set({ text, linkUrl, imageSource, imageUrl, requestedAt: now, updatedAt: now })
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

export async function submitEditorTweet(
  input: EditorTweetInput,
  overrides: Partial<EditorTweetDeps> = {},
): Promise<EditorTweetResult> {
  const deps: EditorTweetDeps = { ...defaultDeps, ...overrides };
  const text = input.text.trim();

  const article = await deps.loadArticle(input.articleId);
  if (!article) throw new SocialPublishValidationError("الخبر غير موجود", 404);
  // نفس شرط مسار البوت القائم (assertArticleTweetable): منشور ووقت نشره حلّ.
  if (
    article.status !== "published" ||
    (article.publishedAt && article.publishedAt.getTime() > deps.now().getTime())
  ) {
    throw new SocialPublishValidationError("التغريدة متاحة للخبر المنشور فقط", 409);
  }
  const lockKey = `editor-tweet:${input.actorUserId}:${article.id}`;

  const imageUrl = input.includeImage ? article.imageUrl : null;
  const image = imageUrl
    ? { imageSource: "article" as const, imageUrl }
    : { imageSource: "none" as const, imageUrl: null };

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
          textSource: "custom",
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
          ...image,
          now: deps.now(),
        })
      : null;
    if (updatedPost) return { post: updatedPost, updated: true };
    const created = await deps.createDraftPost({
      articleId: article.id,
      text,
      textSource: "custom",
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
