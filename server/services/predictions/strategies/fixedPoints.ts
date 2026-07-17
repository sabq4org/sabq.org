// fixed_points — نقاط ثابتة حسب الطبقة (النظام الكلاسيكي 3/1/0). لا بركة:
// available = المجموع الممنوح فعليًا، ولا ترحيل ولا متبقٍ.

import {
  fixedPointsParamsSchema,
  matchScorePayloadSchema,
  matchScoreResultSchema,
  REASON_CODES,
  STRATEGY_KEYS,
  type FixedPointsParams,
} from "@shared/predictions";
import { scoreTier } from "../../gulfCupPredictionScoring";
import type { ScoringStrategy, SettlementInput, StrategyAward, StrategyResult } from "../strategyTypes";

function settle(input: SettlementInput, params: FixedPointsParams): StrategyResult {
  const result = matchScoreResultSchema.parse(input.resultPayload);

  const awards: StrategyAward[] = input.entries.flatMap((entry) => {
    const parsed = matchScorePayloadSchema.safeParse(entry.payload);
    if (!parsed.success) return [];
    const tier = scoreTier(parsed.data.predHome, parsed.data.predAway, result.finalHome, result.finalAway);
    const points =
      tier.tier === "exact"
        ? params.exact
        : tier.tier === "margin"
          ? params.signedMargin
          : tier.tier === "outcome"
            ? params.outcome
            : 0;
    if (points <= 0) return [];
    const reasonCode =
      tier.tier === "exact"
        ? REASON_CODES.EXACT
        : tier.tier === "margin"
          ? REASON_CODES.MARGIN
          : REASON_CODES.OUTCOME;
    return [{
      entryId: entry.entryId,
      userId: entry.userId,
      basePoints: points,
      reasonCode,
      breakdown: {
        reasonCode,
        prediction: `${parsed.data.predHome}-${parsed.data.predAway}`,
        finalScore: `${result.finalHome}-${result.finalAway}`,
        fixed: { exact: params.exact, signedMargin: params.signedMargin, outcome: params.outcome },
      },
    }];
  });

  const awarded = awards.reduce((sum, a) => sum + a.basePoints, 0);
  return { awards, pool: { available: awarded, awarded, carried: 0, remainder: 0 } };
}

export const fixedPointsStrategy: ScoringStrategy<FixedPointsParams> = {
  key: STRATEGY_KEYS.FIXED_POINTS,
  version: 1,
  validateParams: (params) => fixedPointsParamsSchema.parse(params),
  settle,
};
