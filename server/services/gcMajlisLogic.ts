import { scoreTier, type GcTier } from "./gulfCupPredictionScoring";

export type GcMajlisVisibility = "sealed" | "revealed" | "settled";
export type GcMemberEvaluation = "pending" | "exact" | "margin" | "outcome" | "miss" | "void";

export type VisibleMemberPrediction = {
  home: number;
  away: number;
  evaluation: GcMemberEvaluation;
  provisional: boolean;
  points: number;
};

type PredictionForVisibility = {
  predHome: number;
  predAway: number;
  status: string;
  tier: string;
  pointsAwarded: number;
} | null;

export function matchVisibility(input: {
  nowMs: number;
  kickoffMs: number;
  live: boolean;
  finished: boolean;
  settled: boolean;
}): GcMajlisVisibility {
  // Kickoff is the privacy boundary, even when a stale settlement snapshot is
  // still present after the provider postpones/reschedules a fixture. Current
  // live/final provider state may reveal it; a historical `settled` flag alone
  // must never reveal a newly-future match.
  if (!input.live && !input.finished && input.nowMs < input.kickoffMs) return "sealed";
  if (input.settled) return "settled";
  return "revealed";
}

function tierEvaluation(tier: string): GcMemberEvaluation {
  if (tier === "exact" || tier === "margin" || tier === "outcome") return tier;
  return tier === "none" ? "miss" : "pending";
}

/**
 * The single privacy gate for member predictions. A sealed match returns null
 * even though the service already loaded the database row. This helper is kept
 * pure and boundary-tested so later DTO changes cannot accidentally leak scores.
 */
export function visibleMemberPrediction(input: {
  visibility: GcMajlisVisibility;
  prediction: PredictionForVisibility;
  currentHome: number | null;
  currentAway: number | null;
}): VisibleMemberPrediction | null {
  const prediction = input.prediction;
  if (input.visibility === "sealed" || !prediction) return null;

  if (prediction.status === "void") {
    return {
      home: prediction.predHome,
      away: prediction.predAway,
      evaluation: "void",
      provisional: false,
      points: 0,
    };
  }

  if (prediction.status !== "pending") {
    return {
      home: prediction.predHome,
      away: prediction.predAway,
      evaluation: tierEvaluation(prediction.tier),
      provisional: false,
      points: Number(prediction.pointsAwarded || 0),
    };
  }

  if (input.currentHome == null || input.currentAway == null) {
    return {
      home: prediction.predHome,
      away: prediction.predAway,
      evaluation: "pending",
      provisional: true,
      points: 0,
    };
  }

  const scored = scoreTier(
    prediction.predHome,
    prediction.predAway,
    input.currentHome,
    input.currentAway,
  );
  return {
    home: prediction.predHome,
    away: prediction.predAway,
    evaluation: tierEvaluation(scored.tier),
    provisional: true,
    points: 0,
  };
}

export type DayChampionCandidate = {
  userId: string;
  name: string;
  avatar: string | null;
  points: number;
  exact: number;
  correct: number;
  played: number;
};

const sameChampionScore = (a: DayChampionCandidate, b: DayChampionCandidate): boolean =>
  a.points === b.points && a.exact === b.exact && a.correct === b.correct;

export function selectDayChampions(rows: DayChampionCandidate[]): Omit<DayChampionCandidate, "played">[] {
  const eligible = rows.filter((row) => row.played > 0);
  if (eligible.length === 0) return [];
  eligible.sort((a, b) =>
    b.points - a.points || b.exact - a.exact || b.correct - a.correct || a.userId.localeCompare(b.userId),
  );
  const top = eligible[0];
  return eligible
    .filter((row) => sameChampionScore(row, top))
    .map(({ played: _played, ...row }) => row);
}

export function dayChampionStatus(
  totalMatches: number,
  settledMatches: number,
  hasLiveMatch: boolean,
): "pending" | "in_progress" | "final" {
  if (totalMatches > 0 && settledMatches >= totalMatches) return "final";
  if (settledMatches > 0 || hasLiveMatch) return "in_progress";
  return "pending";
}

export type DuelResolution = "challenger" | "challenged" | "refund";
export type GcDuelFixtureDisposition = "wait" | "settle" | "refund";
export type GcDuelAcceptanceDecision =
  | { allowed: true; expiresAtMs: number; kickoffChanged: boolean }
  | { allowed: false; reason: "EXPIRED" | "LOCKED" };

const GC_DUEL_SETTLEABLE_CODES = new Set(["FT", "AET", "PEN"]);
const GC_DUEL_VOID_CODES = new Set(["CANC", "ABD", "PST", "WO", "AWD"]);

/** Pure provider-state gate used before a duel touches escrow. */
export function duelFixtureDisposition(fixture: {
  status: { code: string; finished: boolean };
  goals: { home: number | null; away: number | null };
}): GcDuelFixtureDisposition {
  if (GC_DUEL_VOID_CODES.has(fixture.status.code)) return "refund";
  if (GC_DUEL_SETTLEABLE_CODES.has(fixture.status.code)) {
    return fixture.goals.home != null && fixture.goals.away != null ? "settle" : "refund";
  }
  return fixture.status.finished ? "refund" : "wait";
}

export function duelRefundRecipientIds(duel: {
  status: string;
  challengerId: string;
  challengedId: string;
}): string[] {
  return duel.status === "accepted"
    ? [duel.challengerId, duel.challengedId]
    : [duel.challengerId];
}

/**
 * Privacy-first acceptance gate. A future reschedule is adopted only while the
 * original invitation is still sealed; an already-expired invitation is never
 * revived because member predictions might have been visible at its old gate.
 * For any still-sealed change (earlier or later), expiry follows the provider's
 * current kickoff so the stored timestamp cannot become a second authority.
 */
export function evaluateDuelAcceptance(input: {
  nowMs: number;
  storedExpiresAtMs: number;
  currentKickoffMs: number;
  live: boolean;
  finished: boolean;
  disposition: GcDuelFixtureDisposition;
}): GcDuelAcceptanceDecision {
  if (
    !Number.isFinite(input.currentKickoffMs) ||
    input.currentKickoffMs <= 0 ||
    input.live ||
    input.finished ||
    input.disposition !== "wait" ||
    input.nowMs >= input.currentKickoffMs
  ) {
    return { allowed: false, reason: "LOCKED" };
  }
  if (input.nowMs >= input.storedExpiresAtMs) {
    return { allowed: false, reason: "EXPIRED" };
  }
  return {
    allowed: true,
    expiresAtMs: input.currentKickoffMs,
    kickoffChanged: input.currentKickoffMs !== input.storedExpiresAtMs,
  };
}

const DUEL_TIER_RANK: Record<GcTier, number> = {
  none: 0,
  outcome: 1,
  margin: 2,
  exact: 3,
};

/** Missing prediction forfeits; equal tiers refund both stakes. */
export function resolveDuel(
  challengerTier: GcTier | null,
  challengedTier: GcTier | null,
): DuelResolution {
  if (challengerTier == null && challengedTier == null) return "refund";
  if (challengerTier == null) return "challenged";
  if (challengedTier == null) return "challenger";
  const challenger = DUEL_TIER_RANK[challengerTier];
  const challenged = DUEL_TIER_RANK[challengedTier];
  if (challenger === challenged) return "refund";
  return challenger > challenged ? "challenger" : "challenged";
}

export type HarvestChampionCandidate = {
  userId: string;
  name: string;
  avatar: string | null;
  totalPoints: number;
  exactCount: number;
  correctCount: number;
  playedCount: number;
};

export type HarvestAccuracyCandidate = {
  userId: string;
  name: string;
  avatar: string | null;
  accuracy: number;
  correctCount: number;
  playedCount: number;
};

export type HarvestBoldCandidate = {
  userId: string;
  name: string;
  avatar: string | null;
  pickProb: number;
  fixtureId: number;
};

export type HarvestStubbornCandidate = {
  userId: string;
  name: string;
  avatar: string | null;
  teamId: number;
  teamName: string;
  picksCount: number;
};

export function selectHarvestAwards(input: {
  champions: HarvestChampionCandidate[];
  accurate: HarvestAccuracyCandidate[];
  bold: HarvestBoldCandidate[];
  stubborn: HarvestStubbornCandidate[];
}) {
  const champions = [...input.champions]
    .filter((row) => row.playedCount > 0)
    .sort((a, b) =>
      b.totalPoints - a.totalPoints ||
      b.exactCount - a.exactCount ||
      b.correctCount - a.correctCount ||
      a.userId.localeCompare(b.userId),
    );
  const championTop = champions[0];

  const accurate = [...input.accurate].sort((a, b) =>
    b.accuracy - a.accuracy ||
    b.correctCount - a.correctCount ||
    b.playedCount - a.playedCount ||
    a.userId.localeCompare(b.userId),
  );
  const accurateTop = accurate[0];

  const bold = [...input.bold].sort((a, b) => a.pickProb - b.pickProb || a.userId.localeCompare(b.userId));
  const boldTop = bold[0];

  const stubborn = [...input.stubborn].sort((a, b) =>
    b.picksCount - a.picksCount || a.userId.localeCompare(b.userId),
  );
  const stubbornTop = stubborn[0];

  return {
    champions: championTop
      ? champions.filter((row) =>
          row.totalPoints === championTop.totalPoints &&
          row.exactCount === championTop.exactCount &&
          row.correctCount === championTop.correctCount,
        )
      : [],
    mostAccurate: accurateTop
      ? accurate.filter((row) =>
          row.accuracy === accurateTop.accuracy &&
          row.correctCount === accurateTop.correctCount &&
          row.playedCount === accurateTop.playedCount,
        )
      : [],
    boldest: boldTop ? bold.filter((row) => row.pickProb === boldTop.pickProb) : [],
    stubborn: stubbornTop ? stubborn.filter((row) => row.picksCount === stubbornTop.picksCount) : [],
  };
}
