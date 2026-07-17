// tiered_pool — البركة المتدرجة (pari-mutuel) بطبقات حصرية دقيق/فارق/اتجاه.
// المنطق الحسابي هو نفسه محرك خليجي 27 (scoreTier/distributePool) مستوردًا
// من وحدته النقية القائمة — لا نسخ ولا تغيير نتائج.

import {
  matchScorePayloadSchema,
  matchScoreResultSchema,
  REASON_CODES,
  STRATEGY_KEYS,
  tieredPoolParamsSchema,
  type TieredPoolParams,
} from "@shared/predictions";
import { distributePool, scoreTier, shareForTier } from "../../gulfCupPredictionScoring";
import type { ScoringStrategy, SettlementInput, StrategyAward, StrategyResult } from "../strategyTypes";

function settle(input: SettlementInput, params: TieredPoolParams): StrategyResult {
  const result = matchScoreResultSchema.parse(input.resultPayload);
  const available = params.basePool + input.carryIn;

  const scored = input.entries.flatMap((entry) => {
    const parsed = matchScorePayloadSchema.safeParse(entry.payload);
    if (!parsed.success) return [];
    const tier = scoreTier(parsed.data.predHome, parsed.data.predAway, result.finalHome, result.finalAway);
    return [{ entry, prediction: parsed.data, tier }];
  });

  // الطبقات حصرية في العد: exact لا يُحسب ضمن margin/outcome
  const winners = {
    exact: scored.filter((s) => s.tier.tier === "exact").length,
    margin: scored.filter((s) => s.tier.tier === "margin").length,
    outcome: scored.filter((s) => s.tier.tier === "outcome").length,
  };

  const dist = distributePool(available, winners);

  const awards: StrategyAward[] = scored
    .filter((s) => s.tier.tier !== "none")
    .map((s) => {
      const share = shareForTier(dist, s.tier.tier);
      const reasonCode =
        s.tier.tier === "exact"
          ? REASON_CODES.EXACT
          : s.tier.tier === "margin"
            ? REASON_CODES.MARGIN
            : REASON_CODES.OUTCOME;
      return {
        entryId: s.entry.entryId,
        userId: s.entry.userId,
        basePoints: share,
        reasonCode,
        breakdown: {
          reasonCode,
          prediction: `${s.prediction.predHome}-${s.prediction.predAway}`,
          finalScore: `${result.finalHome}-${result.finalAway}`,
          pool: {
            base: params.basePool,
            carriedIn: input.carryIn,
            tierShare:
              s.tier.tier === "exact"
                ? params.tiers.exact
                : s.tier.tier === "margin"
                  ? params.tiers.signedMargin
                  : params.tiers.outcome,
            tierPoints: share,
            winners: winners[s.tier.tier as "exact" | "margin" | "outcome"],
          },
        },
      };
    })
    .filter((a) => a.basePoints > 0);

  const awarded = dist.paidExact + dist.paidMargin + dist.paidOutcome;
  const carried = params.carryMode === "none" ? 0 : dist.carryOut;
  const remainder = params.carryMode === "none" ? dist.carryOut : 0;

  return { awards, pool: { available, awarded, carried, remainder } };
}

export const tieredPoolStrategy: ScoringStrategy<TieredPoolParams> = {
  key: STRATEGY_KEYS.TIERED_POOL,
  version: 1,
  validateParams: (params) => tieredPoolParamsSchema.parse(params),
  settle,
};
