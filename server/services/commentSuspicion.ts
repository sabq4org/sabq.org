/**
 * Account-level comment-farming suspicion — computed on the fly from the
 * `comments` table (no schema change, no stored flag).
 *
 * suspicious ⇔ ≥ 10 comments in the window AND (junk ratio > 50% OR more than
 * 20 comments on a single day). A suspicious account is "frozen": it earns no
 * engagement points (READ / READ_DEEP / LIKE / SHARE / COMMENT) until its
 * recent behaviour drops below the bar — the freeze lifts itself as the
 * 7-day window rolls forward. Prediction wins, account milestones and admin
 * adjustments are never affected.
 */
import { db } from "../db";
import { comments, users } from "@shared/schema";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { COPIED_HOLD_REASON, isLowValueContent, isNumericOrSymbolsOnly, normalizeArabic } from "./commentQuality";

export const SUSPICION_RULES = {
  windowDays: 7,
  minComments: 10,
  junkRatio: 0.5,
  maxPerDay: 20,
} as const;

export interface UserCommentStats {
  total: number;
  numeric: number;
  short: number;
  copied: number;
  distinctTexts: number;
  distinctArticles: number;
  maxPerDay: number;
}

export interface CommentStatRow {
  content: string;
  articleId: string | null;
  createdAt: Date;
  moderationReason?: string | null;
}

/** Riyadh calendar day (UTC+3, no DST) for the per-day maximum. */
function riyadhDay(d: Date): string {
  return new Date(new Date(d).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function computeUserCommentStats(rows: CommentStatRow[]): UserCommentStats {
  let numeric = 0;
  let short = 0;
  let copied = 0;
  const texts = new Set<string>();
  const articleIds = new Set<string>();
  const perDay = new Map<string, number>();
  for (const r of rows) {
    if (isNumericOrSymbolsOnly(r.content)) numeric++;
    else if (isLowValueContent(r.content)) short++;
    else if (r.moderationReason?.includes(COPIED_HOLD_REASON)) copied++;
    texts.add(normalizeArabic(r.content));
    if (r.articleId) articleIds.add(r.articleId);
    const day = riyadhDay(r.createdAt);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  return {
    total: rows.length,
    numeric,
    short,
    copied,
    distinctTexts: texts.size,
    distinctArticles: articleIds.size,
    maxPerDay: perDay.size ? Math.max(...perDay.values()) : 0,
  };
}

export interface SuspicionScore {
  score: number;
  junkRatio: number;
  suspicious: boolean;
}

/**
 * 0-100 score: junk share weighs 60, daily volume (vs. 20/day) 25 and text
 * repetition 15. The boolean `suspicious` follows SUSPICION_RULES exactly;
 * the score only ranks accounts on the dashboard.
 */
export function computeSuspicionScore(stats: UserCommentStats): SuspicionScore {
  if (stats.total === 0) return { score: 0, junkRatio: 0, suspicious: false };
  const junkRatio = (stats.numeric + stats.short + stats.copied) / stats.total;
  const volume = Math.min(1, stats.maxPerDay / SUSPICION_RULES.maxPerDay);
  const repetition = 1 - stats.distinctTexts / stats.total;
  const score = Math.round(Math.min(100, junkRatio * 60 + volume * 25 + repetition * 15));
  const suspicious =
    stats.total >= SUSPICION_RULES.minComments &&
    (junkRatio > SUSPICION_RULES.junkRatio || stats.maxPerDay > SUSPICION_RULES.maxPerDay);
  return { score, junkRatio: Math.round(junkRatio * 100) / 100, suspicious };
}

export async function getUserCommentStats(
  userId: string,
  days: number = SUSPICION_RULES.windowDays,
): Promise<UserCommentStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      content: comments.content,
      articleId: comments.articleId,
      createdAt: comments.createdAt,
      moderationReason: comments.moderationReason,
    })
    .from(comments)
    .where(and(eq(comments.userId, userId), gte(comments.createdAt, since)))
    .orderBy(desc(comments.createdAt))
    .limit(1000);
  return computeUserCommentStats(rows);
}

// ── Freeze (cached per replica) ──────────────────────────────────────────────

const FREEZE_CACHE_MS = 10 * 60 * 1000;
const FREEZE_CACHE_MAX = 5000;
const freezeCache = new Map<string, { frozen: boolean; at: number }>();

/**
 * Whether the user's engagement points are frozen. Cached 10 minutes per
 * replica so READ/LIKE bursts don't re-run the stats query; fails open.
 */
export async function isUserFrozen(userId: string): Promise<boolean> {
  const hit = freezeCache.get(userId);
  if (hit && Date.now() - hit.at < FREEZE_CACHE_MS) return hit.frozen;
  try {
    const frozen = computeSuspicionScore(await getUserCommentStats(userId)).suspicious;
    if (freezeCache.size >= FREEZE_CACHE_MAX) freezeCache.clear();
    freezeCache.set(userId, { frozen, at: Date.now() });
    return frozen;
  } catch (error) {
    console.error("[Comment Suspicion] Freeze check failed (fail-open):", error);
    return false;
  }
}

/** Test hook. */
export function clearFreezeCache(): void {
  freezeCache.clear();
}

// ── Editors' dashboard ───────────────────────────────────────────────────────

export interface SuspiciousAccount {
  userId: string;
  displayName: string;
  stats: UserCommentStats;
  junkRatio: number;
  score: number;
  frozen: boolean;
}

/**
 * Top accounts by suspicion score over the last `days`. Only accounts with at
 * least SUSPICION_RULES.minComments comments are ranked. Returns id + display
 * name only — no email or phone.
 */
export async function getSuspiciousAccounts(days: number, limit = 50): Promise<SuspiciousAccount[]> {
  const windowDays = Math.min(30, Math.max(1, Math.floor(days)));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      userId: comments.userId,
      content: comments.content,
      articleId: comments.articleId,
      createdAt: comments.createdAt,
      moderationReason: comments.moderationReason,
    })
    .from(comments)
    .where(gte(comments.createdAt, since))
    .orderBy(desc(comments.createdAt))
    .limit(20000);

  const byUser = new Map<string, CommentStatRow[]>();
  for (const r of rows) {
    if (!r.userId) continue;
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  const ranked = [...byUser.entries()]
    .filter(([, list]) => list.length >= SUSPICION_RULES.minComments)
    .map(([userId, list]) => {
      const stats = computeUserCommentStats(list);
      const s = computeSuspicionScore(stats);
      return { userId, stats, junkRatio: s.junkRatio, score: s.score };
    })
    .sort((a, b) => b.score - a.score || b.stats.total - a.stats.total)
    .slice(0, Math.min(200, Math.max(1, limit)));

  if (ranked.length === 0) return [];
  const names = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(inArray(users.id, ranked.map((r) => r.userId)));
  const nameById = new Map(
    names.map((n) => [n.id, [n.firstName, n.lastName].filter(Boolean).join(" ").trim()]),
  );

  // The freeze always follows the 7-day window, independent of the display window.
  const frozenFlags = await Promise.all(ranked.map((r) => isUserFrozen(r.userId)));
  return ranked.map((r, i) => ({
    ...r,
    displayName: nameById.get(r.userId) || "مستخدم بلا اسم",
    frozen: frozenFlags[i],
  }));
}
