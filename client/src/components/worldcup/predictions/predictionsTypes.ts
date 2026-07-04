/**
 * أنواع مسابقة التوقّعات — مرآة لما يرسله /api/world-cup/predictions/*.
 */
import type { WcFixture } from "../wcTypes";

export type MyPrediction = {
  predHome: number;
  predAway: number;
  status: "pending" | "correct" | "incorrect" | string;
  pointsAwarded: number;
};

export type MatchSettlement = {
  status: "open" | "locked" | "settled" | string;
  finalHome: number | null;
  finalAway: number | null;
  winnersCount: number;
  pointsPerWinner: number;
  predictionsCount: number;
};

export type PredictableMatch = {
  fixture: WcFixture;
  locked: boolean;
  predictionsCount: number;
  myPrediction: MyPrediction | null;
  settlement: MatchSettlement | null;
};

export type MyPredictionRow = {
  fixtureId: string;
  predHome: number;
  predAway: number;
  status: "pending" | "correct" | "incorrect" | string;
  pointsAwarded: number;
  createdAt: string;
  kickoffAt: string | null;
  homeTeamName: string | null;
  homeTeamLogo: string | null;
  awayTeamName: string | null;
  awayTeamLogo: string | null;
  finalHome: number | null;
  finalAway: number | null;
  finalPenHome?: number | null;
  finalPenAway?: number | null;
  matchStatus: string | null;
  winnersCount: number | null;
  pointsPerWinner: number | null;
};

export type LeaderRow = {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  totalPoints: number;
  correctCount: number;
  playedCount: number;
};

/** صف الزائر نفسه ورتبته الحقيقية — يصل حتى لو كان خارج الصفحة المعروضة. */
export type LeaderboardViewer = {
  rank: number;
  totalPoints: number;
  correctCount: number;
  playedCount: number;
};

export type LeaderboardResponse = {
  leaders: LeaderRow[];
  total?: number;
  viewer?: LeaderboardViewer | null;
};

// ── توقّعات البطولة طويلة المدى (البطل + الهدّاف) ──
// eliminated: خرج من البطولة (المنتخب نفسه، أو منتخب الهدّاف) — يبقى ظاهرًا في
// القائمة لكن معطَّلًا (لا يُحذف)، لأنه لم يعد بإمكانه رفع الكأس أو تسجيل أهداف.
export type WcLongTeam = { id: number; name: string; logo: string; eliminated: boolean };
export type WcLongScorer = {
  id: number;
  name: string;
  photo: string;
  team: { name: string; logo: string };
  goals: number;
  eliminated: boolean;
};
export type WcLongMine = {
  kind: "champion" | "top_scorer" | string;
  teamId: number | null;
  teamName: string | null;
  teamLogo: string | null;
  playerId: number | null;
  playerName: string | null;
  playerPhoto: string | null;
  weight: number;
  status: "pending" | "correct" | "incorrect" | string;
  pointsAwarded: number;
};
export type WcLongData = {
  pools: { champion: number; top_scorer: number };
  teams: WcLongTeam[];
  scorers: WcLongScorer[];
  champion: {
    open: boolean;
    weight: number | null; // 100 | 60 | 30 | null(مغلق)
    stage: "r32" | "r16" | "qf" | "closed" | string;
    votes: { teamId: number | null; n: number; w: number }[];
  };
  topScorer: {
    open: boolean;
    votes: { playerId: number | null; n: number }[];
  };
  mine: WcLongMine[];
};
