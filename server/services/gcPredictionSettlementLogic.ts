/** Pure terminal-state rules for Gulf Cup prediction settlement. */

export const GC_SCORED_FIXTURE_STATUSES = new Set(["FT", "AET", "PEN"]);
export const GC_VOID_FIXTURE_STATUSES = new Set(["CANC", "ABD", "WO", "AWD"]);

export type GcFixtureSettlementDisposition = "score" | "void" | "wait";

export type GcSettlementOrderKey = {
  timestamp: number;
  /** Stable internal id; for Gulf Cup 27 this follows official matchNo. */
  fixtureId: number;
};

/** Actual kickoff first, then the immutable Sabq id for simultaneous matches. */
export function compareGcSettlementOrder(
  a: GcSettlementOrderKey,
  b: GcSettlementOrderKey,
): number {
  return a.timestamp - b.timestamp || a.fixtureId - b.fixtureId;
}

/**
 * Administrative/cancelled results are void even when a provider supplies an
 * awarded score. Postponed fixtures stay pending and may later be rescheduled.
 */
export function gcFixtureSettlementDisposition(input: {
  statusCode: string;
  goalsHome: number | null;
  goalsAway: number | null;
}): GcFixtureSettlementDisposition {
  if (GC_VOID_FIXTURE_STATUSES.has(input.statusCode)) return "void";
  if (
    GC_SCORED_FIXTURE_STATUSES.has(input.statusCode) &&
    input.goalsHome != null &&
    input.goalsAway != null
  ) {
    return "score";
  }
  return "wait";
}

export type GcVoidSettlementPlan = {
  status: "void";
  poolCarryIn: number;
  carryOut: number;
  paidExact: 0;
  paidMargin: 0;
  paidOutcome: 0;
  exactWinners: 0;
  marginWinners: 0;
  outcomeWinners: 0;
  predictionsCount: number;
};

/** A void fixture carries only the existing jackpot; its 1000 base is never injected. */
export function planGcVoidSettlement(
  carryIn: number,
  predictionsCount: number,
): GcVoidSettlementPlan {
  const safeCarry = Number.isFinite(carryIn) ? Math.max(0, Math.trunc(carryIn)) : 0;
  return {
    status: "void",
    poolCarryIn: safeCarry,
    carryOut: safeCarry,
    paidExact: 0,
    paidMargin: 0,
    paidOutcome: 0,
    exactWinners: 0,
    marginWinners: 0,
    outcomeWinners: 0,
    predictionsCount: Math.max(0, Math.trunc(predictionsCount)),
  };
}

export function isGcCountedPredictionStatus(status: string): boolean {
  return status === "correct" || status === "incorrect";
}

export function isGcClosedMatchStatus(status: string | null | undefined): boolean {
  return status === "settled" || status === "void";
}
