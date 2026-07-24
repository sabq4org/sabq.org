/**
 * "May this user write to THIS article?" — the ownership half of article
 * authorization, which several endpoints were missing entirely.
 *
 * The pattern the audit found repeatedly: a route requires a broad permission
 * (`articles.edit_own`, `articles.ai_generate`) and then acts on whatever
 * article id the client sent. `articles.edit_own` is the clearest case — it
 * says "edit your own", but nothing was checking whose article it was, so it
 * behaved exactly like `articles.edit_any`. The affected surfaces write
 * publicly visible fields: SEO/OG metadata, thumbnails, smart categories and
 * article media.
 *
 * Ownership here means any of the three columns that tie a person to an
 * article: `authorId` (the byline), `submitterId` (the editor who entered it)
 * and `reporterId` (the credited reporter). All three appear in existing
 * ownership checks elsewhere in the codebase, so widening to the union keeps
 * legitimate editing working.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { articles, articleMediaAssets } from "@shared/schema";
import { getUserPermissions } from "../rbac";

export type ArticleAccess =
  | { ok: true; articleId: string }
  | { ok: false; httpStatus: number; message: string };

const NOT_FOUND = { ok: false as const, httpStatus: 404, message: "المقال غير موجود" };
const FORBIDDEN = {
  ok: false as const,
  httpStatus: 403,
  message: "غير مصرح لك بتعديل هذا المقال",
};

/**
 * @param permissions pass the caller's permissions when you already loaded
 *        them, to avoid a second lookup.
 */
export async function authorizeArticleWrite(
  userId: string,
  articleId: string | null | undefined,
  permissions?: string[],
): Promise<ArticleAccess> {
  if (!articleId) return NOT_FOUND;

  const perms = permissions ?? (await getUserPermissions(userId));
  // Desk-wide edit rights need no ownership check — that is what they mean.
  if (perms.includes("articles.edit_any")) return { ok: true, articleId };

  const [row] = await db
    .select({
      authorId: articles.authorId,
      submitterId: articles.submitterId,
      reporterId: articles.reporterId,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!row) return NOT_FOUND;

  const isOwner =
    row.authorId === userId ||
    row.submitterId === userId ||
    row.reporterId === userId;

  return isOwner ? { ok: true, articleId } : FORBIDDEN;
}

/** Same check, reached through a media asset that belongs to an article. */
export async function authorizeArticleWriteByMediaAsset(
  userId: string,
  mediaAssetId: string,
  permissions?: string[],
): Promise<ArticleAccess> {
  const [asset] = await db
    .select({ articleId: articleMediaAssets.articleId })
    .from(articleMediaAssets)
    .where(eq(articleMediaAssets.id, mediaAssetId))
    .limit(1);

  if (!asset) {
    return { ok: false, httpStatus: 404, message: "الوسيط غير موجود" };
  }
  return authorizeArticleWrite(userId, asset.articleId, permissions);
}
