/**
 * أنواع مسابقة توقّعات دوري روشن — مرآة لما يرسله /api/rsl/predictions/*
 * (محرّك المونديال نفسه: جائزة 500 تُقسَّم بين مصيبي النتيجة الدقيقة، وبطل
 * الموسم بوزن المبادر المتدرّج بالجولات).
 */
import type { RslFixture } from "../rslTypes";

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
  fixture: RslFixture;
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

// ── توقّعات الموسم طويلة المدى (البطل + الهدّاف) ──
export type RslLongTeam = { id: number; name: string; logo: string; eliminated: boolean };
export type RslLongScorer = {
  id: number;
  name: string;
  photo: string;
  team: { name: string; logo: string };
  goals: number;
  eliminated: boolean;
};
export type RslLongMine = {
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
export type RslLongData = {
  pools: { champion: number; top_scorer: number };
  currentRound: number;
  teams: RslLongTeam[];
  scorers: RslLongScorer[];
  /** المرشّحون من لوحة الموسم الماضي (قبل انطلاق الجديد) */
  scorersFromLastSeason: boolean;
  champion: {
    open: boolean;
    weight: number | null; // 100 | 60 | 30 | null(مغلق)
    stage: "early" | "mid" | "late" | "closed" | string;
    votes: { teamId: number | null; n: number; w: number }[];
  };
  topScorer: {
    open: boolean;
    votes: { playerId: number | null; n: number }[];
  };
  mine: RslLongMine[];
};
