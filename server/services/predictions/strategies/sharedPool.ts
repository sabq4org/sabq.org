// shared_pool — بركة تُقسم بالتساوي على المصيبين (محرك كأس العالم/الدوري
// القائم). معيار الإصابة (exact أو outcome) معامل في الملف لا قرار مضمّن —
// الكود القائم لكأس العالم يقسم على مصيبي الاتجاه، والحالات الذهبية تثبّت
// السلوك المعتمد لكل بطولة عند الترحيل.
//
// فرق مقصود عن المحرك القديم: القديم كان يمنح max(1, floor(pool/winners))
// فيتجاوز البركة عندما يفوق عدد الفائزين حجمها. هنا يُحفظ ثابت البركة
// (awarded + carried + remainder === available) والقسمة floor فقط.

import {
  matchScorePayloadSchema,
  matchScoreResultSchema,
  REASON_CODES,
  STRATEGY_KEYS,
  sharedPoolParamsSchema,
  type SharedPoolParams,
} from "@shared/predictions";
import { scoreTier } from "../../gulfCupPredictionScoring";
import type { ScoringStrategy, SettlementInput, StrategyAward, StrategyResult } from "../strategyTypes";

function settle(input: SettlementInput, params: SharedPoolParams): StrategyResult {
  const result = matchScoreResultSchema.parse(input.resultPayload);
  const available = params.basePool + input.carryIn;

  const winners = input.entries.flatMap((entry) => {
    const parsed = matchScorePayloadSchema.safeParse(entry.payload);
    if (!parsed.success) return [];
    const tier = scoreTier(parsed.data.predHome, parsed.data.predAway, result.finalHome, result.finalAway);
    const hit = params.winCriterion === "exact" ? tier.exactHit : tier.outcomeHit;
    return hit ? [{ entry, prediction: parsed.data }] : [];
  });

  const share = winners.length > 0 ? Math.floor(available / winners.length) : 0;
  const awarded = share * winners.length;
  const leftover = available - awarded;
  const carried = params.carryMode === "none" ? 0 : leftover;
  const remainder = params.carryMode === "none" ? leftover : 0;

  const reasonCode = params.winCriterion === "exact" ? REASON_CODES.EXACT : REASON_CODES.OUTCOME;
  const awards: StrategyAward[] = share > 0
    ? winners.map((w) => ({
        entryId: w.entry.entryId,
        userId: w.entry.userId,
        basePoints: share,
        reasonCode,
        breakdown: {
          reasonCode,
          prediction: `${w.prediction.predHome}-${w.prediction.predAway}`,
          finalScore: `${result.finalHome}-${result.finalAway}`,
          pool: {
            base: params.basePool,
            carriedIn: input.carryIn,
            tierPoints: share,
            winners: winners.length,
          },
        },
      }))
    : [];

  return { awards, pool: { available, awarded, carried, remainder } };
}

export const sharedPoolStrategy: ScoringStrategy<SharedPoolParams> = {
  key: STRATEGY_KEYS.SHARED_POOL,
  version: 1,
  validateParams: (params) => sharedPoolParamsSchema.parse(params),
  settle,
};
