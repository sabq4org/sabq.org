/**
 * Comment loyalty points — awarded on APPROVAL, clawed back on later rejection.
 *
 * Before 2026-10 the web and topic routes awarded the COMMENT point at
 * creation, before moderation, so junk comments ("1", ".", copied lines)
 * paid out even when nobody would ever approve them. Now:
 *
 *   - `awardCommentPointsOnApproval(commentId)` runs after every transition
 *     to "approved" (AI pipeline incl. the trusted fast lane, the aged-queue
 *     job, and every moderator approve path). It re-checks the comment and
 *     awards at most once per commentId. Per-article dedup (one paid comment
 *     per article, LOYALTY_DEDUP_HOURS.COMMENT) and the daily cap (5) are
 *     enforced by awardPointsInTransaction.
 *   - `revokeCommentPoints(commentId)` runs when a comment is rejected or
 *     deleted by a moderator. If (and only if) a COMMENT award exists for
 *     it, a single negative COMMENT_REVOKED event is written and the balance
 *     is reduced, never below 0. lifetimePoints is reduced the same way but
 *     the rank level is never demoted — the same grandfather rule
 *     recordLoyaltyPointsInTx applies to every balance change.
 *
 * An award, once revoked, is not re-issued if the comment is approved again
 * (idempotency is keyed on commentId). Awards made at creation time before
 * this change carry the same `metadata.commentId`, so they are both found by
 * the idempotency check and eligible for clawback.
 */
import { db } from "../db";
import { comments, topicComments, topics, userLoyaltyEvents, userPointsTotal } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { LOYALTY_ACTIONS } from "@shared/loyalty";
import { awardPointsInTransaction, finalizeAwardPoints } from "./loyalty";
import {
  COMMENT_LIMITS,
  COPIED_HOLD_REASON,
  isCopiedFromArticle,
  isLowValueContent,
  isTemplateRepeat,
  loadArticleContext,
  loadRecentUserComments,
  type CommentTargetContext,
  type RecentUserComment,
} from "./commentQuality";
import { isUserFrozen } from "./commentSuspicion";

export type CommentKind = "article" | "topic";

export interface CommentForAward {
  id: string;
  userId: string | null;
  status: string;
  content: string;
  parentId: string | null;
  /** articleId, or topicId for Muqtarab topic comments. */
  targetId: string;
  aiClassification: string | null;
  moderationReason: string | null;
  createdAt: Date;
}

export type CommentAwardSkipReason =
  | "NOT_FOUND"
  | "NOT_APPROVED"
  | "NO_USER"
  | "SELF_REPLY"
  | "LOW_VALUE"
  | "LOW_QUALITY"
  | "COPIED"
  | "TEMPLATE"
  | "FROZEN"
  | "ALREADY_AWARDED"
  | "DAILY_CAP"
  | "DEDUP"
  | "NEGATIVE_POINTS"
  | "ERROR";

export type CommentAwardResult =
  | { awarded: true; points: number }
  | { awarded: false; reason: CommentAwardSkipReason };

export type CommentRevokeResult =
  | { revoked: true; points: number }
  | { revoked: false; reason: "NOT_AWARDED" | "ALREADY_REVOKED" | "ERROR" };

export interface CommentLoyaltyDeps {
  loadComment(commentId: string, kind: CommentKind): Promise<CommentForAward | null>;
  loadParentUserId(parentId: string, kind: CommentKind): Promise<string | null>;
  loadContext(targetId: string, kind: CommentKind): Promise<CommentTargetContext | null>;
  loadUserComments(userId: string, since: Date, until: Date): Promise<RecentUserComment[]>;
  isFrozen(userId: string): Promise<boolean>;
  /** Atomically: skip if a COMMENT award for this commentId exists, else award. */
  awardOnce(input: {
    commentId: string;
    userId: string;
    source: string;
    metadata: Record<string, unknown>;
  }): Promise<
    | { awarded: true; points: number }
    | { awarded: false; reason: "ALREADY_AWARDED" | "DAILY_CAP" | "DEDUP" | "NEGATIVE_POINTS" | "FROZEN" }
  >;
  revokeOnce(commentId: string, reason: string): Promise<CommentRevokeResult>;
}

/** Pure eligibility rules over an approved comment (no I/O). */
export function commentAwardBlocker(
  comment: CommentForAward,
  context: CommentTargetContext | null,
  parentUserId: string | null,
): CommentAwardSkipReason | null {
  if (comment.status !== "approved") return "NOT_APPROVED";
  if (!comment.userId) return "NO_USER";
  if (comment.parentId && parentUserId && parentUserId === comment.userId) return "SELF_REPLY";
  if (comment.aiClassification === "low_value") return "LOW_VALUE";
  if (isLowValueContent(comment.content)) return "LOW_QUALITY";
  if (comment.moderationReason?.includes(COPIED_HOLD_REASON)) return "COPIED";
  if (isCopiedFromArticle(comment.content, context)) return "COPIED";
  return null;
}

export async function awardCommentPointsOnApproval(
  commentId: string,
  kind: CommentKind = "article",
  deps: CommentLoyaltyDeps = dbCommentLoyaltyDeps,
): Promise<CommentAwardResult> {
  try {
    const comment = await deps.loadComment(commentId, kind);
    if (!comment) return { awarded: false, reason: "NOT_FOUND" };
    if (comment.status !== "approved") return { awarded: false, reason: "NOT_APPROVED" };
    if (!comment.userId) return { awarded: false, reason: "NO_USER" };
    const userId = comment.userId;

    const parentUserId = comment.parentId ? await deps.loadParentUserId(comment.parentId, kind) : null;
    const context = await deps.loadContext(comment.targetId, kind);
    const blocker = commentAwardBlocker(comment, context, parentUserId);
    if (blocker) return { awarded: false, reason: blocker };

    const createdAt = new Date(comment.createdAt);
    const since = new Date(createdAt.getTime() - COMMENT_LIMITS.templateWindowDays * 24 * 60 * 60 * 1000);
    const history = await deps.loadUserComments(userId, since, createdAt);
    if (isTemplateRepeat(comment.content, history, comment.targetId)) {
      return { awarded: false, reason: "TEMPLATE" };
    }

    if (await deps.isFrozen(userId)) return { awarded: false, reason: "FROZEN" };

    const metadata: Record<string, unknown> =
      kind === "topic"
        ? { topicId: comment.targetId, commentId, topicCommentId: commentId }
        : { articleId: comment.targetId, commentId };
    const out = await deps.awardOnce({ commentId, userId, source: comment.targetId, metadata });
    return out.awarded ? { awarded: true, points: out.points } : { awarded: false, reason: out.reason };
  } catch (error) {
    console.error(`[Comment Loyalty] Award failed for ${kind} comment ${commentId}:`, error);
    return { awarded: false, reason: "ERROR" };
  }
}

export async function revokeCommentPoints(
  commentId: string,
  reason: string,
  deps: CommentLoyaltyDeps = dbCommentLoyaltyDeps,
): Promise<CommentRevokeResult> {
  try {
    return await deps.revokeOnce(commentId, reason);
  } catch (error) {
    console.error(`[Comment Loyalty] Revoke failed for comment ${commentId}:`, error);
    return { revoked: false, reason: "ERROR" };
  }
}

/**
 * Fire-and-forget hook for every moderation status change: approve → award,
 * reject/delete → clawback. Never throws, never blocks the response.
 */
export function syncCommentPoints(
  commentId: string,
  status: "approved" | "rejected" | "deleted" | string,
  kind: CommentKind = "article",
): void {
  if (status === "approved") {
    void awardCommentPointsOnApproval(commentId, kind);
  } else if (status === "rejected" || status === "deleted") {
    void revokeCommentPoints(commentId, status === "deleted" ? "حذف التعليق" : "رفض التعليق");
  }
}

// ── DB-backed implementation ────────────────────────────────────────────────

/** COMMENT award for this comment id (article awards use commentId; legacy
 *  topic awards used topicCommentId). */
function awardForCommentCondition(commentId: string) {
  return and(
    eq(userLoyaltyEvents.action, LOYALTY_ACTIONS.COMMENT),
    sql`(${userLoyaltyEvents.metadata}->>'commentId' = ${commentId} or ${userLoyaltyEvents.metadata}->>'topicCommentId' = ${commentId})`,
  );
}

function lockUserBalance(tx: any, userId: string) {
  return tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`loyalty-balance:${userId}`}))`);
}

export const dbCommentLoyaltyDeps: CommentLoyaltyDeps = {
  async loadComment(commentId, kind) {
    if (kind === "topic") {
      const [row] = await db
        .select({
          id: topicComments.id,
          userId: topicComments.userId,
          status: topicComments.status,
          content: topicComments.content,
          parentId: topicComments.parentId,
          targetId: topicComments.topicId,
          aiClassification: topicComments.aiClassification,
          moderationReason: topicComments.moderationReason,
          createdAt: topicComments.createdAt,
        })
        .from(topicComments)
        .where(eq(topicComments.id, commentId))
        .limit(1);
      return row ?? null;
    }
    const [row] = await db
      .select({
        id: comments.id,
        userId: comments.userId,
        status: comments.status,
        content: comments.content,
        parentId: comments.parentId,
        targetId: comments.articleId,
        aiClassification: comments.aiClassification,
        moderationReason: comments.moderationReason,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);
    return row ?? null;
  },

  async loadParentUserId(parentId, kind) {
    const table = kind === "topic" ? topicComments : comments;
    const [row] = await db
      .select({ userId: table.userId })
      .from(table)
      .where(eq(table.id, parentId))
      .limit(1);
    return row?.userId ?? null;
  },

  async loadContext(targetId, kind) {
    try {
      if (kind === "topic") {
        const [row] = await db
          .select({ title: topics.title, excerpt: topics.excerpt })
          .from(topics)
          .where(eq(topics.id, targetId))
          .limit(1);
        return row ?? null;
      }
      return await loadArticleContext(targetId);
    } catch (error) {
      console.error("[Comment Loyalty] Failed to load article context:", error);
      return null;
    }
  },

  loadUserComments: (userId, since, until) => loadRecentUserComments(userId, since, until),

  isFrozen: (userId) => isUserFrozen(userId),

  async awardOnce({ commentId, userId, source, metadata }) {
    const outcome = await db.transaction(async (tx) => {
      await lockUserBalance(tx, userId);
      const [existing] = await tx
        .select({ id: userLoyaltyEvents.id })
        .from(userLoyaltyEvents)
        .where(and(eq(userLoyaltyEvents.userId, userId), awardForCommentCondition(commentId)))
        .limit(1);
      if (existing) return { awarded: false as const, reason: "ALREADY_AWARDED" as const };
      return awardPointsInTransaction(tx, {
        userId,
        action: LOYALTY_ACTIONS.COMMENT,
        source,
        metadata,
      });
    });
    if (outcome.awarded) {
      await finalizeAwardPoints(userId, LOYALTY_ACTIONS.COMMENT);
      return { awarded: true, points: outcome.points };
    }
    return outcome;
  },

  async revokeOnce(commentId, reason) {
    const [award] = await db
      .select({
        userId: userLoyaltyEvents.userId,
        points: userLoyaltyEvents.points,
        source: userLoyaltyEvents.source,
      })
      .from(userLoyaltyEvents)
      .where(awardForCommentCondition(commentId))
      .limit(1);
    if (!award || award.points <= 0) return { revoked: false, reason: "NOT_AWARDED" };

    return db.transaction(async (tx) => {
      await lockUserBalance(tx, award.userId);
      const [already] = await tx
        .select({ id: userLoyaltyEvents.id })
        .from(userLoyaltyEvents)
        .where(
          and(
            eq(userLoyaltyEvents.userId, award.userId),
            eq(userLoyaltyEvents.action, LOYALTY_ACTIONS.COMMENT_REVOKED),
            sql`${userLoyaltyEvents.metadata}->>'commentId' = ${commentId}`,
          ),
        )
        .limit(1);
      if (already) return { revoked: false as const, reason: "ALREADY_REVOKED" as const };

      await tx.insert(userLoyaltyEvents).values({
        userId: award.userId,
        action: LOYALTY_ACTIONS.COMMENT_REVOKED,
        points: -award.points,
        source: award.source,
        metadata: { commentId, extraInfo: reason },
      });
      // Floor at 0; rankLevel/currentRank untouched (never demote).
      await tx
        .update(userPointsTotal)
        .set({
          totalPoints: sql`greatest(0, ${userPointsTotal.totalPoints} - ${award.points})`,
          lifetimePoints: sql`greatest(0, ${userPointsTotal.lifetimePoints} - ${award.points})`,
          updatedAt: new Date(),
        })
        .where(eq(userPointsTotal.userId, award.userId));
      return { revoked: true as const, points: award.points };
    });
  },
};
