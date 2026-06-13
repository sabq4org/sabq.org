/**
 * Likes on article/opinion comments (the shared `comments` table).
 *
 * `comments.likesCount` is a denormalised counter so the public, cacheable
 * comments payload can show counts without a per-user join. The per-user
 * "did I like this" set is fetched separately via getLikedCommentIdsBySlug and
 * overlaid client-side — it must never enter the shared cached payload (see
 * per-user-data-shared-cache-trap). likesCount is recomputed from the
 * reactions table on every change so it can't drift.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import { comments, commentReactions, articles } from "@shared/schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function recountAndPersist(commentId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commentReactions)
    .where(eq(commentReactions.commentId, commentId));
  const n = Number(row?.count) || 0;
  await db.update(comments).set({ likesCount: n }).where(eq(comments.id, commentId));
  return n;
}

/** Returns null when the comment doesn't exist (so the route can 404). */
export async function likeComment(
  commentId: string,
  userId: string,
): Promise<{ likesCount: number; liked: boolean } | null> {
  const [exists] = await db.select({ id: comments.id }).from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!exists) return null;
  // unique(commentId,userId) makes a repeat like a no-op.
  await db.insert(commentReactions).values({ commentId, userId, type: "like" }).onConflictDoNothing();
  const likesCount = await recountAndPersist(commentId);
  return { likesCount, liked: true };
}

export async function unlikeComment(
  commentId: string,
  userId: string,
): Promise<{ likesCount: number; liked: boolean } | null> {
  const [exists] = await db.select({ id: comments.id }).from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!exists) return null;
  await db
    .delete(commentReactions)
    .where(and(eq(commentReactions.commentId, commentId), eq(commentReactions.userId, userId)));
  const likesCount = await recountAndPersist(commentId);
  return { likesCount, liked: false };
}

/**
 * Comment ids the user liked under one article — resolved by slug, englishSlug
 * or (UUID form) id, mirroring the article-page route's slug-or-id resolution
 * so opinion pages (which key by id) work too.
 */
export async function getLikedCommentIdsBySlug(slug: string, userId: string): Promise<string[]> {
  const matcher = UUID_RE.test(slug)
    ? or(eq(articles.slug, slug), eq(articles.englishSlug, slug), eq(articles.id, slug))
    : or(eq(articles.slug, slug), eq(articles.englishSlug, slug));
  const [article] = await db.select({ id: articles.id }).from(articles).where(matcher).limit(1);
  if (!article) return [];
  const rows = await db
    .select({ commentId: commentReactions.commentId })
    .from(commentReactions)
    .innerJoin(comments, eq(commentReactions.commentId, comments.id))
    .where(and(eq(comments.articleId, article.id), eq(commentReactions.userId, userId)));
  return rows.map((r) => r.commentId);
}
