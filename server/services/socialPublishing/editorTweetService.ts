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

import { and, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { articles, socialPosts, type SocialPost } from "@shared/schema";
import { db } from "../../db";
import {
  SocialPublishValidationError,
  buildArticleUrl,
  claimPostForImmediatePublish,
  createDraftPost,
  notifyDeskOfAuthorSocialProposal,
  publishClaimedPost,
  updateEditablePost,
} from "./socialPublishingService";

/** مهلة الحماية من الإرسال المكرر (إعادة المحاولة بعد انقطاع الشبكة). */
export const EDITOR_TWEET_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export function isEditorTweetChannelEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (env.BOT_DESK_EDITOR_TWEETS ?? "").trim().toLowerCase() === "on";
}

export type EditorTweetMode = "published" | "pending_approval" | "publish_failed";

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
  createDraftPost: typeof createDraftPost;
  updateEditablePost: typeof updateEditablePost;
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
  createDraftPost,
  updateEditablePost,
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
  if (article.status !== "published") {
    throw new SocialPublishValidationError("التغريدة متاحة للخبر المنشور فقط", 409);
  }

  const imageUrl = input.includeImage ? article.imageUrl : null;
  const image = imageUrl
    ? { imageSource: "article" as const, imageUrl }
    : { imageSource: "none" as const, imageUrl: null };

  if (input.canPublishNow) {
    const since = new Date(deps.now().getTime() - EDITOR_TWEET_DUPLICATE_WINDOW_MS);
    const same = await deps.findRecentSameTweet({
      articleId: article.id,
      actorUserId: input.actorUserId,
      text,
      since,
    });
    if (same) return { mode: "published", post: same, duplicate: true, updated: false };

    const draft = await deps.createDraftPost({
      articleId: article.id,
      text,
      textSource: "custom",
      includeLink: input.includeLink,
      ...image,
      createdByUserId: input.actorUserId,
    });
    const claimed = await deps.claimPostForImmediatePublish(draft.id);
    if (!claimed) {
      throw new SocialPublishValidationError("المنشور قيد النشر بالفعل أو حالته لا تسمح", 409);
    }
    const result = await deps.publishClaimedPost(claimed, input.actorUserId);
    return {
      mode: result.status === "published" ? "published" : "publish_failed",
      post: result,
      duplicate: false,
      updated: false,
    };
  }

  const pending = await deps.findPendingProposal({
    articleId: article.id,
    actorUserId: input.actorUserId,
  });
  const post = pending
    ? await deps.updateEditablePost(pending.id, {
        text,
        includeLink: input.includeLink,
        ...image,
      })
    : await deps.createDraftPost({
        articleId: article.id,
        text,
        textSource: "custom",
        includeLink: input.includeLink,
        ...image,
        createdByUserId: input.actorUserId,
        requestedAt: deps.now(),
      });

  // تنبيه «مكتب سبق» لا يؤخّر الرد ولا يُفشله.
  void deps
    .notifyDesk({
      post,
      articleTitle: article.title,
      articleUrl: article.url,
      authorUserId: input.actorUserId,
      isUpdate: Boolean(pending),
    })
    .catch((err) => console.error("[EditorTweet] تعذر تنبيه المكتب:", err));

  return { mode: "pending_approval", post, duplicate: false, updated: Boolean(pending) };
}
