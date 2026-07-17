// Strategy Registry — السجل المركزي الوحيد للاستراتيجيات المدعومة.
// الإعدادات في قاعدة البيانات تشير إلى strategy_key من هنا فقط؛ لا يُنفَّذ
// أي منطق يأتي من JSON.

import type { StrategyKey } from "@shared/predictions";
import { STRATEGY_KEYS } from "@shared/predictions";
import type { ScoringStrategy, SettlementInput, StrategyResult } from "./strategyTypes";
import { fixedPointsStrategy } from "./strategies/fixedPoints";
import { longTermPoolStrategy } from "./strategies/longTermPool";
import { playerPoolStrategy } from "./strategies/playerPool";
import { sharedPoolStrategy } from "./strategies/sharedPool";
import { skillWeightedStrategy } from "./strategies/skillWeighted";
import { tieredPoolStrategy } from "./strategies/tieredPool";

const STRATEGIES: Record<StrategyKey, ScoringStrategy<any>> = {
  [STRATEGY_KEYS.TIERED_POOL]: tieredPoolStrategy,
  [STRATEGY_KEYS.SHARED_POOL]: sharedPoolStrategy,
  [STRATEGY_KEYS.FIXED_POINTS]: fixedPointsStrategy,
  [STRATEGY_KEYS.SKILL_WEIGHTED]: skillWeightedStrategy,
  [STRATEGY_KEYS.PLAYER_POOL]: playerPoolStrategy,
  [STRATEGY_KEYS.LONG_TERM_POOL]: longTermPoolStrategy,
};

export function getStrategy(key: string): ScoringStrategy<any> {
  const strategy = STRATEGIES[key as StrategyKey];
  if (!strategy) {
    throw new Error(`UNKNOWN_STRATEGY:${key}`);
  }
  return strategy;
}

/** تشغيل تسوية كاملة: تحقق من المعاملات ثم تنفيذ حتمي بلا آثار جانبية. */
export function runStrategy(
  key: string,
  input: SettlementInput,
  rawParams: unknown,
): { result: StrategyResult; strategyVersion: number } {
  const strategy = getStrategy(key);
  const params = strategy.validateParams(rawParams);
  const result = strategy.settle(input, params);
  return { result, strategyVersion: strategy.version };
}
