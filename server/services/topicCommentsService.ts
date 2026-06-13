/**
 * Comments on Muqtarab topics — a parallel family to the article `comments`
 * service. Topics live in their own table (not `articles`), so they get their
 * own comments table, but the feature set is identical: threaded replies, the
 * same pending/approved/rejected lifecycle, AI moderation + suspicious-words
 * flagging (driven by the route, mirroring the article comment flow), sentiment
 * fields, platform attribution and a denormalised likesCount.
 *
 * Per ADR-001 all Drizzle access lives here; the route module is HTTP-only.
 */
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "../db";
import {
  topicComments,
  topicCommentReactions,
  topics,
  angles,
  users,
  userPointsTotal,
  type TopicComment,
  type InsertTopicComment,
  type TopicCommentWithUser,
} from "@shared/schema";
import { userPublicSelect } from "../selectHelpers";

/** Returns the topic row (id + status) or undefined — used to 404 on POST. */
export async function getTopicForComment(
  topicId: string,
): Promise<{ id: string; status: string } | undefined> {
  const [row] = await db
    .select({ id: topics.id, status: topics.status })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  return row;
}

/**
 * Nested comment tree for one topic. Mirrors storage.getCommentsByArticle:
 * approved-only for the public, all statuses for moderators (showPending).
 * likesCount rides along on the row; per-user hasLiked is overlaid separately.
 */
export async function getTopicComments(
  topicId: string,
  showPending = false,
): Promise<TopicCommentWithUser[]> {
  const conditions = [eq(topicComments.topicId, topicId)];
  if (!showPending) {
    conditions.push(eq(topicComments.status, "approved"));
  }

  const results = await db
    .select({
      comment: topicComments,
      user: userPublicSelect,
      loyaltyRankLevel: userPointsTotal.rankLevel,
    })
    .from(topicComments)
    .leftJoin(users, eq(topicComments.userId, users.id))
    .leftJoin(userPointsTotal, eq(userPointsTotal.userId, topicComments.userId))
    .where(and(...conditions))
    .orderBy(topicComments.createdAt);

  const allComments = results.map((r) => ({
    ...r.comment,
    user: { ...(r.user as any), loyaltyRankLevel: r.loyaltyRankLevel ?? 1 } as any,
    replies: [] as TopicCommentWithUser[],
  }));

  const commentMap = new Map<string, TopicCommentWithUser>();
  const topLevel: TopicCommentWithUser[] = [];
  allComments.forEach((c) => commentMap.set(c.id, c));
  allComments.forEach((c) => {
    if (c.parentId) {
      const parent = commentMap.get(c.parentId);
      if (parent) parent.replies!.push(c);
      else topLevel.push(c); // orphaned reply — surface rather than drop
    } else {
      topLevel.push(c);
    }
  });

  return topLevel;
}

export async function createTopicComment(data: InsertTopicComment): Promise<TopicComment> {
  const [created] = await db.insert(topicComments).values(data).returning();
  return created;
}

export async function getTopicCommentById(id: string): Promise<TopicComment | undefined> {
  const [row] = await db.select().from(topicComments).where(eq(topicComments.id, id)).limit(1);
  return row;
}

export async function updateTopicCommentStatus(
  id: string,
  fields: {
    status: string;
    moderatedAt?: Date;
    moderatedBy?: string;
    moderationReason?: string;
  },
): Promise<void> {
  await db.update(topicComments).set(fields).where(eq(topicComments.id, id));
}

export async function updateTopicCommentModeration(
  id: string,
  fields: {
    aiModerationScore?: number;
    aiClassification?: string;
    aiDetectedIssues?: string[];
    aiModerationReason?: string;
    aiAnalyzedAt?: Date;
  },
): Promise<void> {
  await db.update(topicComments).set(fields).where(eq(topicComments.id, id));
}

// ---- likes -------------------------------------------------------------

async function recountAndPersist(topicCommentId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(topicCommentReactions)
    .where(eq(topicCommentReactions.topicCommentId, topicCommentId));
  const n = Number(row?.count) || 0;
  await db.update(topicComments).set({ likesCount: n }).where(eq(topicComments.id, topicCommentId));
  return n;
}

/** Returns null when the comment doesn't exist (so the route can 404). */
export async function likeTopicComment(
  topicCommentId: string,
  userId: string,
): Promise<{ likesCount: number; liked: boolean } | null> {
  const [exists] = await db
    .select({ id: topicComments.id })
    .from(topicComments)
    .where(eq(topicComments.id, topicCommentId))
    .limit(1);
  if (!exists) return null;
  await db
    .insert(topicCommentReactions)
    .values({ topicCommentId, userId, type: "like" })
    .onConflictDoNothing();
  const likesCount = await recountAndPersist(topicCommentId);
  return { likesCount, liked: true };
}

export async function unlikeTopicComment(
  topicCommentId: string,
  userId: string,
): Promise<{ likesCount: number; liked: boolean } | null> {
  const [exists] = await db
    .select({ id: topicComments.id })
    .from(topicComments)
    .where(eq(topicComments.id, topicCommentId))
    .limit(1);
  if (!exists) return null;
  await db
    .delete(topicCommentReactions)
    .where(
      and(
        eq(topicCommentReactions.topicCommentId, topicCommentId),
        eq(topicCommentReactions.userId, userId),
      ),
    );
  const likesCount = await recountAndPersist(topicCommentId);
  return { likesCount, liked: false };
}

export async function getLikedTopicCommentIds(topicId: string, userId: string): Promise<string[]> {
  const rows = await db
    .select({ topicCommentId: topicCommentReactions.topicCommentId })
    .from(topicCommentReactions)
    .innerJoin(topicComments, eq(topicCommentReactions.topicCommentId, topicComments.id))
    .where(and(eq(topicComments.topicId, topicId), eq(topicCommentReactions.userId, userId)));
  return rows.map((r) => r.topicCommentId);
}

// ---- admin / unified moderation -----------------------------------------
// Consumed by the unified /api/admin/comments dashboard (source = "muqtarab").

interface AdminListOpts {
  status?: string;
  search?: string;
  limit: number;
  offset: number;
}

function adminFilters(status?: string, search?: string) {
  const conds: any[] = [];
  if (status && status !== "all") conds.push(eq(topicComments.status, status));
  if (search) conds.push(ilike(topicComments.content, `%${search}%`));
  return conds.length ? and(...conds) : undefined;
}

/** Rows shaped to slot into the unified moderation list alongside article comments. */
export async function adminListTopicComments(opts: AdminListOpts) {
  return db
    .select({
      id: topicComments.id,
      topicId: topicComments.topicId,
      userId: topicComments.userId,
      content: topicComments.content,
      status: topicComments.status,
      parentId: topicComments.parentId,
      moderatedBy: topicComments.moderatedBy,
      moderatedAt: topicComments.moderatedAt,
      moderationReason: topicComments.moderationReason,
      currentSentiment: topicComments.currentSentiment,
      aiClassification: topicComments.aiClassification,
      aiDetectedIssues: topicComments.aiDetectedIssues,
      aiModerationReason: topicComments.aiModerationReason,
      createdAt: topicComments.createdAt,
      topicTitle: topics.title,
      topicSlug: topics.slug,
      angleSlug: angles.slug,
      userName: users.firstName,
      userLastName: users.lastName,
      userEmail: users.email,
    })
    .from(topicComments)
    .leftJoin(topics, eq(topicComments.topicId, topics.id))
    .leftJoin(angles, eq(topics.angleId, angles.id))
    .leftJoin(users, eq(topicComments.userId, users.id))
    .where(adminFilters(opts.status, opts.search) as any)
    .orderBy(desc(topicComments.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function adminCountTopicComments(opts: { status?: string; search?: string }): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(topicComments)
    .where(adminFilters(opts.status, opts.search) as any);
  return Number(row?.count) || 0;
}

export async function adminUpdateTopicCommentContent(
  id: string,
  content: string,
  moderatorId: string,
): Promise<TopicComment | undefined> {
  const [updated] = await db
    .update(topicComments)
    .set({ content: content.trim(), moderatedBy: moderatorId, moderatedAt: new Date() })
    .where(eq(topicComments.id, id))
    .returning();
  return updated;
}

export async function adminSetTopicCommentStatus(
  id: string,
  fields: { status: string; moderatedBy: string; moderationReason?: string | null },
): Promise<TopicComment | undefined> {
  const [updated] = await db
    .update(topicComments)
    .set({
      status: fields.status,
      moderatedBy: fields.moderatedBy,
      moderatedAt: new Date(),
      ...(fields.moderationReason !== undefined ? { moderationReason: fields.moderationReason } : {}),
    })
    .where(eq(topicComments.id, id))
    .returning();
  return updated;
}

export async function adminDeleteTopicComment(id: string): Promise<TopicComment | undefined> {
  const [deleted] = await db.delete(topicComments).where(eq(topicComments.id, id)).returning();
  return deleted;
}

export async function adminTopicCommentStats() {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      pending: sql<number>`count(*) filter (where ${topicComments.status} = 'pending')`,
      approved: sql<number>`count(*) filter (where ${topicComments.status} = 'approved')`,
      rejected: sql<number>`count(*) filter (where ${topicComments.status} = 'rejected')`,
      flagged: sql<number>`count(*) filter (where ${topicComments.status} = 'flagged')`,
    })
    .from(topicComments);
  return {
    total: Number(stats?.total) || 0,
    pending: Number(stats?.pending) || 0,
    approved: Number(stats?.approved) || 0,
    rejected: Number(stats?.rejected) || 0,
    flagged: Number(stats?.flagged) || 0,
  };
}
