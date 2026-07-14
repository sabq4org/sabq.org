/**
 * Comment Moderation Queue Job
 *
 * يعالج طابور الرقابة الذكية تلقائياً بدل تركه يتراكم لأشهر:
 *   1. كل ساعة: إعادة تحليل التعليقات التي فشل تحليلها (ai_error) أو لم تُحلّل.
 *   2. كل ساعة: نشر تلقائي للتعليقات المعلقة منذ أكثر من 24 ساعة بدرجة ≥ 70
 *      وبلا مخالفات جسيمة — بدل أن تموت في الطابور (رُصد طابور عمره 6 أشهر).
 *   3. يومياً: تنبيه SLA للمشرفين إذا تجاوزت تعليقات معلقة 24 ساعة.
 */
import cron from "node-cron";
import { db } from "../db";
import { comments, users } from "@shared/schema";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { log } from "../utils/logger";

let isProcessing = false;

/** Auto-publish threshold: flagged comments at/above this score with no
 * severe issues publish after the review window expires unreviewed. */
const AUTO_APPROVE_MIN_SCORE = 70;
const REVIEW_WINDOW_HOURS = 24;
const RETRY_BATCH_SIZE = 20;
const AUTO_APPROVE_BATCH_SIZE = 100;

async function retryFailedAnalyses(): Promise<number> {
  const { runCommentModerationPipeline } = await import(
    "../services/commentInsightsService"
  );

  const candidates = await db
    .select({
      id: comments.id,
      content: comments.content,
      userId: comments.userId,
      articleId: comments.articleId,
      moderationReason: comments.moderationReason,
    })
    .from(comments)
    .where(
      and(
        eq(comments.status, "pending"),
        or(
          isNull(comments.aiAnalyzedAt),
          sql`${comments.aiDetectedIssues}::text like '%ai_error%'`
        )
      )
    )
    .orderBy(asc(comments.createdAt))
    .limit(RETRY_BATCH_SIZE);

  let processed = 0;
  for (const c of candidates) {
    if (!c.userId) continue;
    // A suspicious-words hold must stay pending regardless of the AI verdict.
    const suspiciousHeld = !!c.moderationReason?.includes("كلمات مشبوهة");
    await runCommentModerationPipeline({
      commentId: c.id,
      content: c.content,
      userId: c.userId,
      articleId: c.articleId,
      suspiciousHeld,
    });
    processed++;
  }
  return processed;
}

async function autoApproveAgedFlagged(): Promise<number> {
  const { hasSevereIssue } = await import("../services/commentInsightsService");

  const cutoff = new Date(Date.now() - REVIEW_WINDOW_HOURS * 60 * 60 * 1000);
  const candidates = await db
    .select({
      id: comments.id,
      score: comments.aiModerationScore,
      detected: comments.aiDetectedIssues,
      moderationReason: comments.moderationReason,
    })
    .from(comments)
    .where(
      and(
        eq(comments.status, "pending"),
        eq(comments.aiClassification, "flagged"),
        sql`${comments.aiModerationScore} >= ${AUTO_APPROVE_MIN_SCORE}`,
        lt(comments.createdAt, cutoff)
      )
    )
    .orderBy(asc(comments.createdAt))
    .limit(AUTO_APPROVE_BATCH_SIZE);

  let approved = 0;
  for (const c of candidates) {
    // Suspicious-word holds and severe issues always wait for a human.
    if (c.moderationReason?.includes("كلمات مشبوهة")) continue;
    const detected = Array.isArray(c.detected) ? (c.detected as string[]) : [];
    if (hasSevereIssue(detected)) continue;
    if (detected.some((d) => typeof d === "string" && d.includes("كلمات مشبوهة"))) continue;

    await db
      .update(comments)
      .set({
        status: "approved",
        moderatedAt: new Date(),
        moderationReason: `نُشر تلقائياً بعد ${REVIEW_WINDOW_HOURS} ساعة دون مراجعة بشرية (درجة أمان ${c.score} ولا مخالفات جسيمة)`,
      })
      .where(eq(comments.id, c.id));
    approved++;
  }
  return approved;
}

async function processQueue() {
  if (isProcessing) {
    log.info("[Moderation Queue] Previous run still in progress, skipping");
    return;
  }
  isProcessing = true;
  try {
    const retried = await retryFailedAnalyses();
    const approved = await autoApproveAgedFlagged();
    if (retried || approved) {
      log.info(
        `[Moderation Queue] Done: re-analyzed ${retried}, auto-approved ${approved} aged flagged comments`
      );
    }
  } catch (error) {
    log.error("[Moderation Queue] Error processing queue:", error);
  } finally {
    isProcessing = false;
  }
}

async function checkModerationSla() {
  try {
    const cutoff = new Date(Date.now() - REVIEW_WINDOW_HOURS * 60 * 60 * 1000);
    const [row] = await db
      .select({
        overdue: sql<number>`count(*)`,
        oldest: sql<string | null>`min(${comments.createdAt})::date::text`,
      })
      .from(comments)
      .where(and(eq(comments.status, "pending"), lt(comments.createdAt, cutoff)));

    const overdue = Number(row?.overdue ?? 0);
    if (overdue === 0) return;

    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.role} in ('admin', 'superadmin', 'system_admin')`);

    const { storage } = await import("../storage");
    for (const admin of admins) {
      await storage.createNotification({
        userId: admin.id,
        type: "moderation_sla",
        title: "تنبيه الرقابة الذكية: تعليقات تنتظر المراجعة",
        body: `يوجد ${overdue} تعليقاً معلقاً منذ أكثر من ${REVIEW_WINDOW_HOURS} ساعة (الأقدم: ${row?.oldest ?? "غير معروف"}). الرجاء مراجعة طابور الرقابة الذكية.`,
        deeplink: "/dashboard/ai-moderation",
        metadata: { overdue, oldest: row?.oldest },
      });
    }
    log.info(`[Moderation Queue] SLA alert sent to ${admins.length} admins (${overdue} overdue comments)`);
  } catch (error) {
    log.error("[Moderation Queue] SLA check failed:", error);
  }
}

export function startCommentModerationQueueJob() {
  // Hourly queue processing (retry failures + drain aged flagged comments).
  cron.schedule("15 * * * *", processQueue);
  // Daily SLA alert to admins at 09:00 Riyadh time.
  cron.schedule("0 9 * * *", checkModerationSla, { timezone: "Asia/Riyadh" });

  log.info("[Moderation Queue] Job scheduled: hourly queue processing + daily SLA check");

  // First pass shortly after boot so a stuck queue starts draining without
  // waiting up to an hour.
  setTimeout(() => void processQueue(), 30 * 1000);
}
