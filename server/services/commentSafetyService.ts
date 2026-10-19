import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { commentReports, comments, userBlocks, users } from "@shared/schema";

/**
 * الإبلاغ عن التعليقات وحظر المستخدمين — متطلب أبل 1.2 للمحتوى الذي ينشره
 * المستخدمون (فلترة + إبلاغ + حظر + تواصل). الفلترة قائمة قبل النشر
 * (كلمات محظورة + تصنيف آلي + «قيد المراجعة»)، وهنا الإبلاغ والحظر.
 *
 * البلاغ يحوّل التعليق المعتمد إلى `flagged` فورًا: يختفي من العرض العام
 * (لا يُعرض إلا `approved`) ويظهر في تبويب «مُبلَّغ عنها» بلوحة التعليقات،
 * والمشرف يعيد اعتماده أو يرفضه. الحد اليومي يمنع حسابًا واحدًا من إخفاء
 * التعليقات بالجملة.
 */

export const COMMENT_REPORT_REASONS = [
  "offensive",
  "harassment",
  "spam",
  "misinformation",
  "other",
] as const;
export type CommentReportReason = (typeof COMMENT_REPORT_REASONS)[number];

const REASON_LABELS: Record<CommentReportReason, string> = {
  offensive: "محتوى مسيء",
  harassment: "تحرش أو إساءة لشخص",
  spam: "رسائل مزعجة",
  misinformation: "معلومة مضللة",
  other: "سبب آخر",
};

export const DAILY_REPORT_LIMIT = 20;

export type ReportResult =
  | { ok: true; alreadyReported: boolean }
  | { ok: false; code: "not_found" | "own_comment" | "rate_limited" };

export async function reportComment(input: {
  commentId: string;
  reporterId: string;
  reason: CommentReportReason;
  details?: string | null;
}): Promise<ReportResult> {
  const [comment] = await db
    .select({ id: comments.id, userId: comments.userId, status: comments.status })
    .from(comments)
    .where(eq(comments.id, input.commentId))
    .limit(1);
  if (!comment) return { ok: false, code: "not_found" };
  if (comment.userId === input.reporterId) return { ok: false, code: "own_comment" };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commentReports)
    .where(and(eq(commentReports.reporterId, input.reporterId), gt(commentReports.createdAt, since)));
  if (count >= DAILY_REPORT_LIMIT) return { ok: false, code: "rate_limited" };

  const details = input.details?.trim().slice(0, 500) || null;
  const inserted = await db
    .insert(commentReports)
    .values({
      commentId: comment.id,
      reporterId: input.reporterId,
      reason: input.reason,
      details,
    })
    .onConflictDoNothing()
    .returning({ id: commentReports.id });

  if (inserted.length === 0) return { ok: true, alreadyReported: true };

  // التعليق المعتمد فقط يُسحب؛ «قيد المراجعة» و«المرفوض» ليسا ظاهرين أصلًا.
  if (comment.status === "approved") {
    await db
      .update(comments)
      .set({
        status: "flagged",
        moderationReason: `بلاغ قارئ: ${REASON_LABELS[input.reason]}${details ? ` — ${details}` : ""}`,
      })
      .where(and(eq(comments.id, comment.id), eq(comments.status, "approved")));
  }

  return { ok: true, alreadyReported: false };
}

export type BlockResult = { ok: true } | { ok: false; code: "self" | "not_found" };

export async function blockUser(blockerId: string, blockedId: string): Promise<BlockResult> {
  if (blockerId === blockedId) return { ok: false, code: "self" };
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, blockedId)).limit(1);
  if (!target) return { ok: false, code: "not_found" };
  await db.insert(userBlocks).values({ blockerId, blockedId }).onConflictDoNothing();
  return { ok: true };
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
}

export async function listBlockedUsers(blockerId: string) {
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
      blockedAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, blockerId))
    .orderBy(desc(userBlocks.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || null,
    profileImageUrl: r.profileImageUrl,
    blockedAt: r.blockedAt.toISOString(),
  }));
}

/** عند حذف الحساب: لا يبقى للحساب المحذوف قائمة حظر. */
export async function removeBlocksByUser(userId: string): Promise<void> {
  await db.delete(userBlocks).where(eq(userBlocks.blockerId, userId));
}
