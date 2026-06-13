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
