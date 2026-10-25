/**
 * Comment quality gate — anti-farming checks run BEFORE a comment is inserted.
 *
 * Readers were farming loyalty points with junk comments: bare numbers
 * ("1", "65", "١٢٣"), symbols ("." "؟" "×××"), snippets copied from the
 * article itself, and one template text pasted across dozens of articles —
 * up to 60-70 a day. The AI moderator only sees the comment text, so all of
 * it was auto-approved.
 *
 * Layers here:
 *   1. Pure text checks (no DB, unit-tested): numeric/symbol-only, minimum
 *      content, copied-from-article, cross-article template repeat.
 *   2. Per-user rate limits computed from `comments` + `topic_comments` rows
 *      (DB counts, so they hold across both API replicas).
 *   3. `evaluateCommentSubmission` — the single entry point used by the web,
 *      mobile and Muqtarab topic create routes.
 *
 * Rejections never create a row. Copied comments are held for human review
 * and template repeats publish normally — neither earns points.
 */
import { db } from "../db";
import { articles, comments, topicComments } from "@shared/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";

// ── Thresholds ───────────────────────────────────────────────────────────────

export const COMMENT_LIMITS = {
  /** Max comments per rolling 24h (article + topic comments). */
  perDay: 20,
  /** Max comments per rolling burst window. */
  perBurst: 5,
  burstWindowMs: 10 * 60 * 1000,
  /** Minimum gap between two comments. */
  cooldownMs: 30 * 1000,
  /** Same text on MORE than this many distinct articles in the window = template. */
  templateMaxArticles: 5,
  templateWindowDays: 7,
  /** Minimum letters (\p{L}) for a comment to count as content. */
  minLetters: 4,
  /** Copied detection: min normalized length for a substring hit. */
  copiedMinLength: 12,
  /** Copied detection: min word count before the trigram test applies. */
  copiedMinWords: 4,
  copiedTrigramOverlap: 0.8,
} as const;

export const COMMENT_REJECTION_CODES = {
  NUMERIC_ONLY: "COMMENT_NUMERIC_ONLY",
  TOO_SHORT: "COMMENT_TOO_SHORT",
  RATE_LIMIT: "COMMENT_RATE_LIMIT",
  COOLDOWN: "COMMENT_COOLDOWN",
} as const;

export type CommentRejectionCode =
  (typeof COMMENT_REJECTION_CODES)[keyof typeof COMMENT_REJECTION_CODES];

export const COMMENT_REJECTION_MESSAGES = {
  numericOnly: "يبدو أن تعليقك يحتوي أرقاماً أو رموزاً فقط. شاركنا رأيك بكلمات حول الخبر 🙏",
  tooShort: "التعليق قصير جداً، اكتب رأيك بكلمتين على الأقل.",
  daily: "وصلت للحد اليومي من التعليقات، شكراً لتفاعلك ويمكنك المتابعة غداً.",
  burst: "أرسلت تعليقات كثيرة خلال وقت قصير، خذ استراحة قصيرة وعد بعد دقائق.",
  cooldown: "تمهّل قليلاً، يمكنك التعليق مجدداً بعد ثوانٍ.",
} as const;

/** moderationReason written on comments held because they copy the article. */
export const COPIED_HOLD_REASON = "منسوخ من نص الخبر";

// ── Normalization ────────────────────────────────────────────────────────────

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/&[a-z0-9#]+;/gi, " ");
}

/**
 * Canonical comparison form for Arabic text: strip HTML, tashkeel and tatweel,
 * unify alef/yaa/taa-marbuta forms, drop punctuation/symbols, collapse spaces.
 */
export function normalizeArabic(text: string | null | undefined): string {
  if (!text) return "";
  return stripHtml(String(text))
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countLetters(text: string): number {
  return (text.match(/\p{L}/gu) || []).length;
}

// ── Pure content checks ──────────────────────────────────────────────────────

/**
 * True when the comment has no letter at all — only digits (Latin, Arabic-Indic
 * ٠-٩, Persian ۰-۹), whitespace, punctuation, symbols or emoji.
 */
export function isNumericOrSymbolsOnly(text: string | null | undefined): boolean {
  return !/\p{L}/u.test(stripHtml(String(text ?? "")));
}

/**
 * At least 4 letters in total, as two words or one word of ≥ 4 letters.
 * «آمين» / «احسنت» / «رحمه الله» pass; «جيد» (3 letters) and «.» fail.
 */
export function meetsMinimumContent(text: string | null | undefined): boolean {
  const normalized = normalizeArabic(text);
  if (countLetters(normalized) < COMMENT_LIMITS.minLetters) return false;
  const words = normalized.split(" ").filter((w) => /\p{L}/u.test(w));
  return words.length >= 2 || words.some((w) => countLetters(w) >= COMMENT_LIMITS.minLetters);
}

/**
 * Formulaic phrases (condolence, du'a, praise) that legitimately match the
 * article body on death/health news — never treated as "copied".
 */
const FORMULAIC_PHRASES = new Set(
  [
    "إنا لله وإنا إليه راجعون",
    "انا لله وانا اليه راجعون",
    "رحمه الله",
    "رحمها الله",
    "رحمهم الله",
    "الله يرحمه",
    "الله يرحمها",
    "الله يرحمهم",
    "حسبنا الله ونعم الوكيل",
    "لا حول ولا قوة إلا بالله",
    "ما شاء الله",
    "ما شاء الله تبارك الله",
    "الحمد لله",
    "سبحان الله",
    "قواهم الله",
    "الله يحفظه",
    "الله يحفظهم",
    "اللهم آمين",
  ].map(normalizeArabic),
);

function wordTrigrams(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 2 < words.length; i++) out.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

export interface CommentTargetContext {
  title?: string | null;
  excerpt?: string | null;
  content?: string | null;
}

/**
 * The comment is (mostly) a copy of the article's own title/excerpt/body:
 * its normalized text (≥ 12 chars) is a substring of one of them, or ≥ 80%
 * of its word trigrams appear there (only for comments of ≥ 4 words).
 */
export function isCopiedFromArticle(
  comment: string | null | undefined,
  target: CommentTargetContext | null | undefined,
): boolean {
  if (!target) return false;
  const normalized = normalizeArabic(comment);
  if (normalized.length < COMMENT_LIMITS.copiedMinLength) return false;
  if (FORMULAIC_PHRASES.has(normalized)) return false;

  const sources = [target.title, target.excerpt, target.content]
    .map(normalizeArabic)
    .filter((s) => s.length > 0);
  if (sources.length === 0) return false;
  if (sources.some((s) => s.includes(normalized))) return true;

  const words = normalized.split(" ");
  if (words.length < COMMENT_LIMITS.copiedMinWords) return false;
  const trigrams = wordTrigrams(words);
  if (trigrams.length === 0) return false;
  const sourceTrigrams = new Set(sources.flatMap((s) => wordTrigrams(s.split(" "))));
  const matched = trigrams.filter((t) => sourceTrigrams.has(t)).length;
  return matched / trigrams.length >= COMMENT_LIMITS.copiedTrigramOverlap;
}

export interface RecentUserComment {
  /** Article id (or topic id for Muqtarab topic comments). */
  targetId: string | null;
  content: string;
  createdAt: Date;
}

/**
 * Same normalized text by the same user on MORE than 5 distinct articles
 * (counting the current one) within the window → template farming.
 */
export function isTemplateRepeat(
  content: string,
  recent: RecentUserComment[],
  currentTargetId: string,
): boolean {
  const normalized = normalizeArabic(content);
  if (!normalized) return false;
  const targets = new Set<string>([currentTargetId]);
  for (const r of recent) {
    if (r.targetId && normalizeArabic(r.content) === normalized) targets.add(r.targetId);
  }
  return targets.size > COMMENT_LIMITS.templateMaxArticles;
}

/** Junk that should not count toward trust or points even when published. */
export function isLowValueContent(text: string | null | undefined): boolean {
  return isNumericOrSymbolsOnly(text) || !meetsMinimumContent(text);
}

/** Max share of low-value comments among the last 50 approved for the
 *  trusted-commenter fast lane (commentInsightsService.getCommenterTrust). */
export const TRUST_MAX_LOW_VALUE_SHARE = 0.3;

/** Low value for trust purposes: junk content or ≤ 10 normalized characters. */
export function isLowValueForTrust(content: string): boolean {
  return isLowValueContent(content) || normalizeArabic(content).length <= 10;
}

/** Share of low-value texts (0 for an empty list). */
export function lowValueShare(contents: string[]): number {
  if (contents.length === 0) return 0;
  return contents.filter(isLowValueForTrust).length / contents.length;
}

// ── Rate limits (pure over timestamps) ──────────────────────────────────────

export type CommentRejection = {
  ok: false;
  code: CommentRejectionCode;
  messageAr: string;
  httpStatus: 400 | 429;
  retryAfterSeconds?: number;
};

export function evaluateRateLimits(
  createdAts: Date[],
  now: Date = new Date(),
): CommentRejection | null {
  const t = now.getTime();
  const sorted = createdAts
    .map((d) => new Date(d).getTime())
    .filter((ms) => Number.isFinite(ms) && ms <= t)
    .sort((a, b) => b - a); // newest first

  const dayWindow = sorted.filter((ms) => t - ms < 24 * 60 * 60 * 1000);
  if (dayWindow.length >= COMMENT_LIMITS.perDay) {
    const oldestCounted = dayWindow[COMMENT_LIMITS.perDay - 1];
    return {
      ok: false,
      code: COMMENT_REJECTION_CODES.RATE_LIMIT,
      messageAr: COMMENT_REJECTION_MESSAGES.daily,
      httpStatus: 429,
      retryAfterSeconds: Math.max(1, Math.ceil((oldestCounted + 24 * 60 * 60 * 1000 - t) / 1000)),
    };
  }

  const burstWindow = sorted.filter((ms) => t - ms < COMMENT_LIMITS.burstWindowMs);
  if (burstWindow.length >= COMMENT_LIMITS.perBurst) {
    const oldestCounted = burstWindow[COMMENT_LIMITS.perBurst - 1];
    return {
      ok: false,
      code: COMMENT_REJECTION_CODES.RATE_LIMIT,
      messageAr: COMMENT_REJECTION_MESSAGES.burst,
      httpStatus: 429,
      retryAfterSeconds: Math.max(1, Math.ceil((oldestCounted + COMMENT_LIMITS.burstWindowMs - t) / 1000)),
    };
  }

  const last = sorted[0];
  if (last !== undefined && t - last < COMMENT_LIMITS.cooldownMs) {
    return {
      ok: false,
      code: COMMENT_REJECTION_CODES.COOLDOWN,
      messageAr: COMMENT_REJECTION_MESSAGES.cooldown,
      httpStatus: 429,
      retryAfterSeconds: Math.max(1, Math.ceil((last + COMMENT_LIMITS.cooldownMs - t) / 1000)),
    };
  }
  return null;
}

// ── DB loaders ───────────────────────────────────────────────────────────────

/** The user's article + topic comments in [since, until], newest first. */
export async function loadRecentUserComments(
  userId: string,
  since: Date,
  until?: Date,
): Promise<RecentUserComment[]> {
  const articleRows = await db
    .select({ targetId: comments.articleId, content: comments.content, createdAt: comments.createdAt })
    .from(comments)
    .where(
      and(
        eq(comments.userId, userId),
        gte(comments.createdAt, since),
        ...(until ? [lte(comments.createdAt, until)] : []),
      ),
    )
    .orderBy(desc(comments.createdAt))
    .limit(500);
  const topicRows = await db
    .select({ targetId: topicComments.topicId, content: topicComments.content, createdAt: topicComments.createdAt })
    .from(topicComments)
    .where(
      and(
        eq(topicComments.userId, userId),
        gte(topicComments.createdAt, since),
        ...(until ? [lte(topicComments.createdAt, until)] : []),
      ),
    )
    .orderBy(desc(topicComments.createdAt))
    .limit(200);
  return [...articleRows, ...topicRows];
}

/** Title/excerpt/body of an article for the copied check (null when missing). */
export async function loadArticleContext(articleId: string): Promise<CommentTargetContext | null> {
  const [row] = await db
    .select({ title: articles.title, excerpt: articles.excerpt, content: articles.content })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  return row ?? null;
}

// ── Submission entry point ───────────────────────────────────────────────────

export type CommentSubmissionResult =
  | CommentRejection
  | {
      ok: true;
      flags: { copied: boolean; template: boolean };
      /** false → the comment may publish but must never earn loyalty points. */
      awardEligible: boolean;
    };

export interface CommentSubmissionInput {
  userId: string;
  content: string;
  /** The commented article (or Muqtarab topic): id plus the text used for the copied check. */
  article: { id: string } & CommentTargetContext;
  now?: Date;
}

export interface CommentSubmissionDeps {
  loadRecent: (userId: string, since: Date) => Promise<RecentUserComment[]>;
}

const defaultSubmissionDeps: CommentSubmissionDeps = {
  loadRecent: (userId, since) => loadRecentUserComments(userId, since),
};

export async function evaluateCommentSubmission(
  input: CommentSubmissionInput,
  deps: CommentSubmissionDeps = defaultSubmissionDeps,
): Promise<CommentSubmissionResult> {
  const content = String(input.content ?? "");
  if (isNumericOrSymbolsOnly(content)) {
    return {
      ok: false,
      code: COMMENT_REJECTION_CODES.NUMERIC_ONLY,
      messageAr: COMMENT_REJECTION_MESSAGES.numericOnly,
      httpStatus: 400,
    };
  }
  if (!meetsMinimumContent(content)) {
    return {
      ok: false,
      code: COMMENT_REJECTION_CODES.TOO_SHORT,
      messageAr: COMMENT_REJECTION_MESSAGES.tooShort,
      httpStatus: 400,
    };
  }

  const now = input.now ?? new Date();
  let recent: RecentUserComment[] = [];
  try {
    const since = new Date(now.getTime() - COMMENT_LIMITS.templateWindowDays * 24 * 60 * 60 * 1000);
    recent = await deps.loadRecent(input.userId, since);
  } catch (error) {
    // Fail open: a transient read error must not block every commenter.
    console.error("[Comment Quality] Failed to load recent comments:", error);
  }

  const limited = evaluateRateLimits(recent.map((r) => r.createdAt), now);
  if (limited) return limited;

  const copied = isCopiedFromArticle(content, input.article);
  const template = isTemplateRepeat(content, recent, input.article.id);
  return { ok: true, flags: { copied, template }, awardEligible: !copied && !template };
}
