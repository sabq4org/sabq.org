// skill_weighted — النموذج المهاري (كأس آسيا الذكي): نقاط الطبقة × مضاعف
// الجرأة × مضاعف السلسلة. المضاعفات أعداد صحيحة ×100 يوفرها محوّل البطولة
// (من تقييمات Elo وسلاسل المستخدم) وتُقَصّ إلى حدود الملف. لا بركة.

import {
  matchScorePayloadSchema,
  matchScoreResultSchema,
  REASON_CODES,
  STRATEGY_KEYS,
  skillWeightedParamsSchema,
  type SkillWeightedParams,
} from "@shared/predictions";
import { scoreTier } from "../../gulfCupPredictionScoring";
import type { ScoringStrategy, SettlementInput, StrategyAward, StrategyResult } from "../strategyTypes";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function settle(input: SettlementInput, params: SkillWeightedParams): StrategyResult {
  const result = matchScoreResultSchema.parse(input.resultPayload);

  const awards: StrategyAward[] = input.entries.flatMap((entry) => {
    const parsed = matchScorePayloadSchema.safeParse(entry.payload);
    if (!parsed.success) return [];
    const tier = scoreTier(parsed.data.predHome, parsed.data.predAway, result.finalHome, result.finalAway);
    const tierPoints =
      tier.tier === "exact"
        ? params.tierPoints.exact
        : tier.tier === "margin"
          ? params.tierPoints.signedMargin
          : tier.tier === "outcome"
            ? params.tierPoints.outcome
            : 0;
    if (tierPoints <= 0) return [];

    const boldness = clamp(
      entry.boldnessMultiplier ?? 100,
      params.boldnessMultiplierRange.min,
      params.boldnessMultiplierRange.max,
    );
    const streak = clamp(
      entry.streakMultiplier ?? 100,
      params.streakMultiplierRange.min,
      params.streakMultiplierRange.max,
    );
    const basePoints = Math.floor((tierPoints * boldness * streak) / 10000);
    if (basePoints <= 0) return [];

    return [{
      entryId: entry.entryId,
      userId: entry.userId,
      basePoints,
      reasonCode: REASON_CODES.SKILL,
      breakdown: {
        reasonCode: REASON_CODES.SKILL,
        prediction: `${parsed.data.predHome}-${parsed.data.predAway}`,
        finalScore: `${result.finalHome}-${result.finalAway}`,
        skill: { tier: tier.tier, tierPoints, boldnessMultiplier: boldness, streakMultiplier: streak },
      },
    }];
  });

  const awarded = awards.reduce((sum, a) => sum + a.basePoints, 0);
  return { awards, pool: { available: awarded, awarded, carried: 0, remainder: 0 } };
}

export const skillWeightedStrategy: ScoringStrategy<SkillWeightedParams> = {
  key: STRATEGY_KEYS.SKILL_WEIGHTED,
  version: 1,
  validateParams: (params) => skillWeightedParamsSchema.parse(params),
  settle,
};
