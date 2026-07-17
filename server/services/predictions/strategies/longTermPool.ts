// long_term_pool — بركة البطل/الهداف طويلة المدى. التوزيع متساوٍ أو موزون
// بالتبكير: من توقع قبل الإغلاق بمدة أطول أخذ وزنًا أكبر (نمط البطل القائم
// في محركات كأس العالم/الدوري). البطولة تنتهي هنا — لا ترحيل؛ البواقي متبقٍ.

import {
  longTermPickPayloadSchema,
  longTermPoolParamsSchema,
  longTermResultSchema,
  REASON_CODES,
  STRATEGY_KEYS,
  type LongTermPoolParams,
} from "@shared/predictions";
import type { ScoringStrategy, SettlementInput, StrategyAward, StrategyResult } from "../strategyTypes";

function weightFor(params: LongTermPoolParams, submittedAt: Date, locksAt: Date): number {
  if (params.distribution === "equal" || params.earlyTiers.length === 0) return 1;
  const hoursBefore = (locksAt.getTime() - submittedAt.getTime()) / 3_600_000;
  const tiers = [...params.earlyTiers].sort((a, b) => b.beforeHours - a.beforeHours);
  for (const tier of tiers) {
    if (hoursBefore >= tier.beforeHours) return tier.weight;
  }
  return 1;
}

function settle(input: SettlementInput, params: LongTermPoolParams): StrategyResult {
  const result = longTermResultSchema.parse(input.resultPayload);
  const available = params.basePool + input.carryIn;
  const winningIds = new Set(result.winningPickIds);

  const winners = input.entries.flatMap((entry) => {
    const parsed = longTermPickPayloadSchema.safeParse(entry.payload);
    if (!parsed.success || !winningIds.has(parsed.data.pickId)) return [];
    return [{
      entry,
      pick: parsed.data,
      weight: weightFor(params, entry.submittedAt, input.locksAt),
    }];
  });

  const totalWeight = winners.reduce((sum, w) => sum + w.weight, 0);
  const reasonCode =
    input.contestType === "top_scorer" ? REASON_CODES.TOP_SCORER : REASON_CODES.CHAMPION;

  const awards: StrategyAward[] = totalWeight > 0
    ? winners
        .map((w) => {
          const basePoints = Math.floor((available * w.weight) / totalWeight);
          return {
            entryId: w.entry.entryId,
            userId: w.entry.userId,
            basePoints,
            reasonCode,
            breakdown: {
              reasonCode,
              pickId: w.pick.pickId,
              pickName: w.pick.pickName,
              pool: {
                base: params.basePool,
                carriedIn: input.carryIn,
                weight: w.weight,
                totalWeight,
                tierPoints: basePoints,
                winners: winners.length,
              },
            },
          };
        })
        .filter((a) => a.basePoints > 0)
    : [];

  const awarded = awards.reduce((sum, a) => sum + a.basePoints, 0);
  return { awards, pool: { available, awarded, carried: 0, remainder: available - awarded } };
}

export const longTermPoolStrategy: ScoringStrategy<LongTermPoolParams> = {
  key: STRATEGY_KEYS.LONG_TERM_POOL,
  version: 1,
  validateParams: (params) => longTermPoolParamsSchema.parse(params),
  settle,
};
