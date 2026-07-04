/**
 * أنواع مسابقة توقّعات كأس آسيا الذكية (تطابق DTOs خادم acPredictionsService)
 * + مساعدات تسجيل تُحاكي محرّك الخادم حرفيًّا، كي تعرض البطاقة «النقاط المحتملة»
 * لحظيًّا بنفس الأرقام التي ستُحتسب فعلًا عند التسوية.
 */
import type { AcFixture } from "../acTypes";

export type AcOutcome = "home" | "draw" | "away";

export interface AcModelProbs {
  home: number; // نِسَب مئوية صحيحة تجمع 100
  draw: number;
  away: number;
}

export interface AcCrowd {
  home: number;
  draw: number;
  away: number;
  total: number; // عدد المشاركين الكلي
}

export interface AcMyPrediction {
  predHome: number;
  predAway: number;
  status: string; // pending | correct | incorrect
  outcomeHit: boolean;
  marginHit: boolean;
  exactHit: boolean;
  boldnessMult: number; // ×100
  streakMult: number; // ×100
  pointsAwarded: number;
}

export interface AcMatchSettlement {
  status: string; // open | locked | settled
  finalHome: number | null;
  finalAway: number | null;
  predictionsCount: number;
  outcomeWinners: number;
  exactWinners: number;
}

export interface AcPredictableMatch {
  fixture: AcFixture;
  locked: boolean;
  probs: AcModelProbs;
  crowd: AcCrowd;
  predictionsCount: number;
  myPrediction: AcMyPrediction | null;
  settlement: AcMatchSettlement | null;
}

export interface AcMeStats {
  points: number;
  correct: number;
  exact: number;
  played: number;
  currentStreak: number;
}

export interface AcLeaderRow {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  totalPoints: number;
  correctCount: number;
  exactCount: number;
  playedCount: number;
  accuracy: number;
}

/** صف الزائر نفسه ورتبته الحقيقية — يصل حتى لو كان خارج الصفحة المعروضة. */
export interface AcLeaderboardViewer {
  rank: number;
  totalPoints: number;
  correctCount: number;
  exactCount: number;
  playedCount: number;
  accuracy: number;
}

export interface AcLeaderboardResponse {
  leaders: AcLeaderRow[];
  total?: number;
  viewer?: AcLeaderboardViewer | null;
}

export interface AcMyPredictionRow {
  fixtureId: string;
  predHome: number;
  predAway: number;
  status: string;
  outcomeHit: boolean;
  marginHit: boolean;
  exactHit: boolean;
  boldnessMult: number;
  streakMult: number;
  pointsAwarded: number;
  createdAt: string;
  kickoffAt: string | null;
  homeTeamName: string;
  homeTeamLogo: string;
  awayTeamName: string;
  awayTeamLogo: string;
  finalHome: number | null;
  finalAway: number | null;
  matchStatus: string | null;
}

// ---------------------------------------------------------------------------
// مساعدات التسجيل — نسخة طبق الأصل من asianCupRatings على الخادم.
// ---------------------------------------------------------------------------

export const TIER_POINTS = { outcome: 10, margin: 8, exact: 12 } as const;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export function pickOutcome(predHome: number, predAway: number): AcOutcome {
  if (predHome > predAway) return "home";
  if (predHome < predAway) return "away";
  return "draw";
}

/** مضاعِف الجرأة من احتمال النتيجة المختارة (نسبة مئوية صحيحة). */
export function boldnessMultiplier(probPercentOfPick: number): number {
  const p = clamp(probPercentOfPick / 100, 0.02, 0.98);
  return clamp(Math.round((0.4 / p) * 100) / 100, 0.5, 3.0);
}

/** مضاعِف السلسلة من عدد الإصابات المتتالية الحالية. */
export function streakMultiplier(currentStreak: number): number {
  if (currentStreak >= 7) return 1.5;
  if (currentStreak >= 5) return 1.25;
  if (currentStreak >= 3) return 1.1;
  return 1;
}

/**
 * مدى النقاط المحتملة لتوقّع (الحدّ الأدنى = نتيجة صحيحة فقط، الأعلى = نتيجة
 * مطابقة) بعد الجرأة والسلسلة — لمعاينة البطاقة قبل الحفظ.
 */
export function potentialPoints(
  predHome: number,
  predAway: number,
  probs: AcModelProbs,
  currentStreak: number,
): { boldness: number; min: number; max: number } {
  const pick = pickOutcome(predHome, predAway);
  const probPct = pick === "home" ? probs.home : pick === "away" ? probs.away : probs.draw;
  const boldness = boldnessMultiplier(probPct);
  const streak = streakMultiplier(currentStreak);
  const min = Math.max(1, Math.round(TIER_POINTS.outcome * boldness * streak));
  const max = Math.max(
    1,
    Math.round((TIER_POINTS.outcome + TIER_POINTS.margin + TIER_POINTS.exact) * boldness * streak),
  );
  return { boldness, min, max };
}
