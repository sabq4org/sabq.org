/**
 * أنواع مسابقة توقّعات «خليجي 27» (تطابق DTOs الخادم في gcPredictionsService).
 * النموذج بركة متدرّجة مشتركة: لكل مباراة 1000 نقطة (+ جائزة متراكمة) تُقسَّم
 * 50/30/20 على طبقات الدقّة/الفارق/النتيجة وتُوزَّع بالتساوي على فائزي كل طبقة.
 */
import type { GcFixture } from "../gcTypes";

export type GcTier = "exact" | "margin" | "outcome" | "none";

export interface GcModelProbs {
  home: number;
  draw: number;
  away: number;
}

export interface GcCrowd {
  home: number;
  draw: number;
  away: number;
  total: number;
}

export interface GcMyPrediction {
  predHome: number;
  predAway: number;
  status: string; // pending | correct | incorrect
  tier: GcTier;
  outcomeHit: boolean;
  marginHit: boolean;
  exactHit: boolean;
  pointsAwarded: number;
}

export interface GcMatchSettlement {
  status: string; // open | locked | settled
  finalHome: number | null;
  finalAway: number | null;
  predictionsCount: number;
  exactWinners: number;
  marginWinners: number;
  outcomeWinners: number;
  poolBase: number;
  poolCarryIn: number;
  carryOut: number;
}

export interface GcPredictableMatch {
  fixture: GcFixture;
  locked: boolean;
  probs: GcModelProbs;
  crowd: GcCrowd;
  predictionsCount: number;
  poolAvailable: number;
  myPrediction: GcMyPrediction | null;
  settlement: GcMatchSettlement | null;
}

export interface GcMeStats {
  points: number;
  correct: number;
  exact: number;
  played: number;
  currentStreak: number;
  badges: string[];
}

export interface GcLeaderRow {
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
export interface GcLeaderboardViewer {
  userId: string;
  rank: number;
  totalPoints: number;
  correctCount: number;
  exactCount: number;
  playedCount: number;
  accuracy: number;
}

export interface GcLeaderboardResponse {
  leaders: GcLeaderRow[];
  total?: number;
  viewer?: GcLeaderboardViewer | null;
}

export interface GcMyPredictionRow {
  fixtureId: string;
  predHome: number;
  predAway: number;
  status: string;
  tier: GcTier;
  outcomeHit: boolean;
  marginHit: boolean;
  exactHit: boolean;
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

export interface GcTeamLite {
  id: number;
  name: string;
  logo: string;
}

export interface GcLongData {
  teams: GcTeamLite[];
  pools: { champion: number; top_scorer: number };
  championVotes: { kind: string; teamId: number | null; n: number }[];
  mine: {
    kind: string;
    teamId: number | null;
    teamName: string | null;
    playerName: string | null;
    status: string;
    pointsAwarded: number;
  }[];
}

// ---------------------------------------------------------------------------
// مساعدات العرض
// ---------------------------------------------------------------------------

export const POOL_SPLIT = { exact: 0.5, margin: 0.3, outcome: 0.2 } as const;

/** نصيب الطبقة من البركة المتاحة (لمعاينة «كم سيربح الفائز الواحد»). */
export function tierPool(available: number, tier: Exclude<GcTier, "none">): number {
  if (tier === "exact") return Math.floor(available * POOL_SPLIT.exact);
  if (tier === "margin") return Math.floor(available * POOL_SPLIT.margin);
  return available - Math.floor(available * POOL_SPLIT.exact) - Math.floor(available * POOL_SPLIT.margin);
}

export const TIER_AR: Record<Exclude<GcTier, "none">, string> = {
  exact: "النتيجة الدقيقة",
  margin: "الفارق الصحيح",
  outcome: "النتيجة الصحيحة",
};

export const TIER_EMOJI: Record<Exclude<GcTier, "none">, string> = {
  exact: "🎯",
  margin: "📏",
  outcome: "✅",
};

export interface GcBadgeDef {
  code: string;
  emoji: string;
  name: string;
  desc: string;
}

export const GC_BADGES: GcBadgeDef[] = [
  { code: "nostradamus", emoji: "🔮", name: "نوسترداموس", desc: "أصبت النتيجة الدقيقة في 5 مباريات" },
  { code: "lionheart", emoji: "🦁", name: "قلب الأسد", desc: "أصبت نتيجة توقّعها أقل من 10% من الجمهور" },
  { code: "hot_streak", emoji: "🔥", name: "سلسلة ملتهبة", desc: "3 إصابات متتالية أو أكثر" },
  { code: "ever_present", emoji: "🎖️", name: "الحاضر دومًا", desc: "شاركت بتوقّع في كل مباريات دور المجموعات" },
];
