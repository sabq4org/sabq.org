/**
 * Comment Insights Service — unified AI moderation + sentiment pipeline.
 *
 * Owns the full post-comment analysis flow shared by the web route
 * (routes.ts), the mobile route (mobileApiRoutes.ts), and the moderation
 * queue cron job:
 *   duplicate/spam-campaign detection → AI moderation (with human-feedback
 *   calibration examples) → sentiment persistence → status decision
 *   (incl. trusted-commenter fast lane) → rejection notification.
 */
import { db } from "../db";
import {
  comments,
  commentSentiments,
  flaggedCommentsLog,
} from "@shared/schema";
import { and, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import {
  moderateComment,
  getStatusFromClassification,
  type ModerationResult,
} from "../ai/commentModeration";
import type { SuspiciousWordMatch } from "../utils/suspiciousWordsChecker";
import { detectLanguage } from "../sentiment-analyzer";
import { storage } from "../storage";

/** Issues that must never be auto-published without a human decision. */
export const SEVERE_ISSUES = [
  "hate_speech",
  "profanity",
  "violence",
  "harassment",
  "adult_content",
] as const;

export function hasSevereIssue(detected: string[] | null | undefined): boolean {
  if (!Array.isArray(detected)) return false;
  return detected.some((issue) => (SEVERE_ISSUES as readonly string[]).includes(issue));
}

// ── Duplicate / spam-campaign detection ─────────────────────────────────────

/** Strip diacritics, tatweel, punctuation and collapse whitespace so cosmetic
 * variations of the same text compare equal. */
function normalizeForComparison(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenJaccard(a: string, b: string): number {
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

export interface DuplicateCheckResult {
  isDuplicate: boolean; // same user reposted the same text on the same article
  isCampaign: boolean; // near-identical long text from other users recently
  reason?: string;
}

/**
 * Detects (a) the same user reposting identical content on the same article
 * within 24h, and (b) spam campaigns: near-identical long comments posted by
 * multiple accounts over the past 7 days (the "تجارة كابيتال" pattern —
 * patriotic/religious opener followed by an investment-bank promo, reposted
 * with small variations).
 */
export async function checkDuplicateComment(params: {
  commentId: string;
  userId: string;
  articleId: string;
  content: string;
}): Promise<DuplicateCheckResult> {
  const normalized = normalizeForComparison(params.content);
  if (!normalized) return { isDuplicate: false, isCampaign: false };

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ownRecent = await db
    .select({ id: comments.id, content: comments.content })
    .from(comments)
    .where(
      and(
        eq(comments.userId, params.userId),
        eq(comments.articleId, params.articleId),
        gt(comments.createdAt, dayAgo),
        ne(comments.id, params.commentId)
      )
    )
    .orderBy(desc(comments.createdAt))
    .limit(20);

  const isDuplicate = ownRecent.some(
    (c) => normalizeForComparison(c.content) === normalized
  );
  if (isDuplicate) {
    return {
      isDuplicate: true,
      isCampaign: false,
      reason: "تعليق مكرر — نفس النص أُرسل خلال 24 ساعة على نفس الخبر",
    };
  }

  // Campaign detection only for long texts: short common phrases
  // ("الله يستر", "ان شاء الله خير") legitimately repeat across users.
  if (normalized.length >= 150) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentLong = await db
      .select({ id: comments.id, userId: comments.userId, content: comments.content })
      .from(comments)
      .where(
        and(
          gt(comments.createdAt, weekAgo),
          ne(comments.id, params.commentId),
          sql`length(${comments.content}) >= 150`
        )
      )
      .orderBy(desc(comments.createdAt))
      .limit(300);

    const similarFromOthers = new Set<string>();
    for (const c of recentLong) {
      if (c.userId === params.userId) continue;
      if (tokenJaccard(normalized, normalizeForComparison(c.content)) >= 0.7) {
        similarFromOthers.add(c.userId ?? c.id);
      }
    }
    if (similarFromOthers.size >= 2) {
      return {
        isDuplicate: false,
        isCampaign: true,
        reason: "نص شبه متطابق منشور من حسابات متعددة خلال الأيام الماضية (حملة سبام محتملة)",
      };
    }
  }

  return { isDuplicate: false, isCampaign: false };
}

// ── Commenter trust (fast lane) ──────────────────────────────────────────────

export interface CommenterTrust {
  approvedCount: number;
  rejectedCount: number;
  trusted: boolean;
}

/**
 * A commenter with a long clean history earns the fast lane: their
 * borderline-"flagged" comments (score ≥ 60, no severe issues) publish
 * immediately instead of rotting in the review queue.
 */
export async function getCommenterTrust(userId: string): Promise<CommenterTrust> {
  const [row] = await db
    .select({
      approvedCount: sql<number>`count(*) filter (where ${comments.status} = 'approved')`,
      rejectedCount: sql<number>`count(*) filter (where ${comments.status} = 'rejected')`,
    })
    .from(comments)
    .where(eq(comments.userId, userId));

  const approvedCount = Number(row?.approvedCount ?? 0);
  const rejectedCount = Number(row?.rejectedCount ?? 0);
  const total = approvedCount + rejectedCount;
  const trusted = approvedCount >= 30 && (total === 0 || rejectedCount / total < 0.05);
  return { approvedCount, rejectedCount, trusted };
}

// ── Human-feedback calibration examples (prompt feedback loop) ──────────────

let calibrationCache: { text: string; fetchedAt: number } | null = null;
const CALIBRATION_CACHE_MS = 60 * 60 * 1000; // 1h

/**
 * Recent human overrides of AI "flagged" decisions, formatted as few-shot
 * examples. Every moderator approval/rejection of a flagged comment becomes
 * a calibration signal for future runs.
 */
export async function getCalibrationExamples(): Promise<string | undefined> {
  if (calibrationCache && Date.now() - calibrationCache.fetchedAt < CALIBRATION_CACHE_MS) {
    return calibrationCache.text || undefined;
  }
  try {
    const overrides = await db
      .select({
        content: comments.content,
        status: comments.status,
        score: comments.aiModerationScore,
      })
      .from(comments)
      .where(
        and(
          eq(comments.aiClassification, "flagged"),
          isNotNull(comments.moderatedBy),
          sql`${comments.status} in ('approved', 'rejected')`
        )
      )
      .orderBy(desc(comments.moderatedAt))
      .limit(6);

    const text = overrides
      .map((o) => {
        const decision = o.status === "approved" ? "نشر (كان تحفظ النظام في غير محله)" : "رفض";
        const snippet = o.content.replace(/\s+/g, " ").slice(0, 140);
        return `- "${snippet}" → القرار البشري: ${decision}`;
      })
      .join("\n");

    calibrationCache = { text, fetchedAt: Date.now() };
    return text || undefined;
  } catch (error) {
    console.error("[Comment Insights] Failed to load calibration examples:", error);
    return undefined;
  }
}

// ── Persistence ──────────────────────────────────────────────────────────────

/** Write AI moderation fields + sentiment onto the comment row and append a
 * history row in comment_sentiments. */
export async function persistCommentAnalysis(
  commentId: string,
  content: string,
  result: ModerationResult
): Promise<void> {
  const analyzedAt = new Date();
  await db
    .update(comments)
    .set({
      aiModerationScore: result.score,
      aiClassification: result.classification,
      aiDetectedIssues: result.detected,
      aiModerationReason: result.reason,
      aiAnalyzedAt: analyzedAt,
      currentSentiment: result.sentiment,
      currentSentimentConfidence: result.sentimentConfidence,
      sentimentAnalyzedAt: analyzedAt,
    })
    .where(eq(comments.id, commentId));

  try {
    await db.insert(commentSentiments).values({
      commentId,
      sentiment: result.sentiment,
      confidence: result.sentimentConfidence,
      provider: result.provider ?? "ai-gateway",
      model: result.modelId ?? "unknown",
      language: detectLanguage(content),
      rawMetadata: {
        score: result.score,
        classification: result.classification,
        detected: result.detected,
      },
    });
  } catch (error) {
    // History is best-effort; the authoritative value lives on the comment row.
    console.error("[Comment Insights] Failed to insert sentiment history:", error);
  }
}

// ── Suspicious-words audit log (flagged_comments_log) ───────────────────────

/** Record every suspicious-word hit in flagged_comments_log — the audit table
 * existed but nothing wrote to it, so auto-rejections left no trace. */
export async function logSuspiciousWordMatches(
  commentId: string,
  originalContent: string,
  foundWords: SuspiciousWordMatch[],
  autoRejected: boolean
): Promise<void> {
  if (foundWords.length === 0) return;
  try {
    await db.insert(flaggedCommentsLog).values(
      foundWords.map((w) => ({
        commentId,
        wordId: w.wordId,
        matchedWord: w.word,
        originalContent,
        action: autoRejected ? "auto_rejected" : "flagged",
      }))
    );
  } catch (error) {
    console.error("[Comment Insights] Failed to log suspicious-word matches:", error);
  }
}

// ── Rejection notification (transparency toward the commenter) ──────────────

export async function notifyCommentRejected(params: {
  userId: string | null | undefined;
  commentId: string;
  reason: string;
}): Promise<void> {
  if (!params.userId) return;
  try {
    await storage.createNotification({
      userId: params.userId,
      type: "comment_rejected",
      title: "لم يتم نشر تعليقك",
      body: `نعتذر، لم يتم نشر تعليقك لمخالفته سياسة النشر. السبب: ${params.reason}`,
      metadata: { commentId: params.commentId },
    });
  } catch (error) {
    console.error("[Comment Insights] Failed to notify commenter:", error);
  }
}

/** Same as notifyCommentRejected but looks the owner up from the comment row —
 * for callers (manual moderation routes) that only have the comment id. */
export async function notifyCommentOwnerRejected(
  commentId: string,
  reason?: string | null
): Promise<void> {
  const [row] = await db
    .select({ userId: comments.userId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  await notifyCommentRejected({
    userId: row?.userId,
    commentId,
    reason: reason || "مخالفة سياسة النشر",
  });
}

// ── Full pipeline ────────────────────────────────────────────────────────────

export interface ModerationPipelineParams {
  commentId: string;
  content: string;
  userId: string;
  articleId: string;
  /** Comment was held for review by a suspicious word with action=review. */
  suspiciousHeld?: boolean;
  /** Comment was already auto-rejected by a suspicious word with action=reject. */
  suspiciousAutoRejected?: boolean;
  /** Human-readable list of matched suspicious words (for the audit note). */
  suspiciousWordsNote?: string;
  /** Called after the comment status changes (e.g. to invalidate caches). */
  onStatusChange?: (status: "approved" | "rejected" | "pending") => void | Promise<void>;
}

export interface ModerationPipelineOutcome {
  status: "approved" | "rejected" | "pending";
  result: ModerationResult | null;
  decisionPath:
    | "duplicate"
    | "campaign"
    | "suspicious_words"
    | "ai"
    | "trusted_fast_lane"
    | "ai_error";
}

/**
 * The single entry point for analyzing a freshly-posted (or re-analyzed)
 * comment. Safe to call from a fire-and-forget context: never throws.
 */
export async function runCommentModerationPipeline(
  params: ModerationPipelineParams
): Promise<ModerationPipelineOutcome> {
  try {
    // 1. Duplicate / campaign check — rejects without burning an AI call.
    if (!params.suspiciousAutoRejected) {
      const dup = await checkDuplicateComment({
        commentId: params.commentId,
        userId: params.userId,
        articleId: params.articleId,
        content: params.content,
      });
      if (dup.isDuplicate || dup.isCampaign) {
        const reason = dup.reason ?? "محتوى مكرر";
        await db
          .update(comments)
          .set({
            status: "rejected",
            moderatedAt: new Date(),
            moderationReason: `رُفض تلقائياً - ${reason}`,
            aiClassification: "spam",
            aiModerationScore: 40,
            aiDetectedIssues: [dup.isCampaign ? "spam_campaign" : "duplicate", "spam"],
            aiModerationReason: reason,
            aiAnalyzedAt: new Date(),
          })
          .where(eq(comments.id, params.commentId));
        await notifyCommentRejected({
          userId: params.userId,
          commentId: params.commentId,
          reason,
        });
        await params.onStatusChange?.("rejected");
        console.log(
          `[Comment Insights] Comment ${params.commentId} rejected as ${dup.isCampaign ? "campaign" : "duplicate"}`
        );
        return {
          status: "rejected",
          result: null,
          decisionPath: dup.isCampaign ? "campaign" : "duplicate",
        };
      }
    }

    // 2. AI moderation + sentiment (single call), calibrated by human feedback.
    const calibrationExamples = await getCalibrationExamples();
    const result = await moderateComment(params.content, { calibrationExamples });
    await persistCommentAnalysis(params.commentId, params.content, result);

    // 3. Suspicious-words note (kept from the legacy flow).
    if (params.suspiciousWordsNote) {
      await db
        .update(comments)
        .set({
          aiDetectedIssues: [...(result.detected || []), `كلمات مشبوهة: ${params.suspiciousWordsNote}`],
          aiModerationReason:
            `يحتوي على كلمات مشبوهة: ${params.suspiciousWordsNote}` +
            (result.reason ? ` - ${result.reason}` : ""),
        })
        .where(eq(comments.id, params.commentId));
    }

    // 4. Status decision.
    if (params.suspiciousAutoRejected) {
      // Already rejected by the word filter — analysis recorded, status stands.
      return { status: "rejected", result, decisionPath: "suspicious_words" };
    }
    if (params.suspiciousHeld) {
      // Word filter demands a human look regardless of the AI verdict.
      return { status: "pending", result, decisionPath: "suspicious_words" };
    }

    const aiError = result.detected.includes("ai_error");
    let status = getStatusFromClassification(result.classification);
    let decisionPath: ModerationPipelineOutcome["decisionPath"] = aiError ? "ai_error" : "ai";
    let statusReason =
      result.classification === "safe"
        ? "تم الاعتماد تلقائياً بواسطة الذكاء الاصطناعي"
        : `تم الرفض تلقائياً - ${result.reason}`;

    // Trusted-commenter fast lane: borderline "flagged" from a long clean
    // history publishes immediately instead of queueing for weeks.
    if (
      !aiError &&
      status === "pending" &&
      result.score >= 60 &&
      !hasSevereIssue(result.detected)
    ) {
      const trust = await getCommenterTrust(params.userId);
      if (trust.trusted) {
        status = "approved";
        decisionPath = "trusted_fast_lane";
        statusReason = `اعتماد تلقائي — معلّق موثوق (${trust.approvedCount} تعليقاً معتمداً) ودرجة أمان ${result.score}`;
      }
    }

    if (status !== "pending") {
      await db
        .update(comments)
        .set({
          status,
          moderatedAt: new Date(),
          moderationReason: statusReason,
        })
        .where(eq(comments.id, params.commentId));
      if (status === "rejected") {
        await notifyCommentRejected({
          userId: params.userId,
          commentId: params.commentId,
          reason: result.reason,
        });
      }
      await params.onStatusChange?.(status);
    }

    console.log(
      `[Comment Insights] Comment ${params.commentId}: ${result.classification} (${result.score}) sentiment=${result.sentiment} → ${status} [${decisionPath}]`
    );
    return { status, result, decisionPath };
  } catch (error) {
    console.error("[Comment Insights] Pipeline error:", error);
    return { status: "pending", result: null, decisionPath: "ai_error" };
  }
}

// ── Sentiment aggregates (dashboard) ─────────────────────────────────────────

export interface SentimentStats {
  analyzed: number;
  notAnalyzed: number;
  positive: number;
  neutral: number;
  negative: number;
  avgConfidence: number | null;
}

export async function getSentimentStats(): Promise<SentimentStats> {
  const [row] = await db
    .select({
      analyzed: sql<number>`count(*) filter (where ${comments.currentSentiment} is not null)`,
      notAnalyzed: sql<number>`count(*) filter (where ${comments.currentSentiment} is null)`,
      positive: sql<number>`count(*) filter (where ${comments.currentSentiment} = 'positive')`,
      neutral: sql<number>`count(*) filter (where ${comments.currentSentiment} = 'neutral')`,
      negative: sql<number>`count(*) filter (where ${comments.currentSentiment} = 'negative')`,
      avgConfidence: sql<number | null>`avg(${comments.currentSentimentConfidence})`,
    })
    .from(comments);

  return {
    analyzed: Number(row?.analyzed ?? 0),
    notAnalyzed: Number(row?.notAnalyzed ?? 0),
    positive: Number(row?.positive ?? 0),
    neutral: Number(row?.neutral ?? 0),
    negative: Number(row?.negative ?? 0),
    avgConfidence: row?.avgConfidence == null ? null : Number(row.avgConfidence),
  };
}
