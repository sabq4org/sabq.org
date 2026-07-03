// Cost estimation from model pricing. Pure module (unit-tested directly).

import type { ResolvedModel } from "./types";

export interface UsageForCost {
  inputTokens?: number;
  outputTokens?: number;
  /** Images generated, or characters synthesized for TTS. */
  unitCount?: number;
}

const MILLION = 1_000_000;

export function computeCostUsd(model: ResolvedModel | undefined | null, usage: UsageForCost): number {
  if (!model) return 0;

  let cost = 0;
  switch (model.pricingUnit) {
    case "tokens":
      cost =
        ((usage.inputTokens ?? 0) * model.costPer1MInput +
          (usage.outputTokens ?? 0) * model.costPer1MOutput) /
        MILLION;
      break;
    case "chars":
      cost = ((usage.unitCount ?? usage.inputTokens ?? 0) * model.costPer1MInput) / MILLION;
      break;
    case "image":
      cost = (usage.unitCount ?? 1) * model.costPerUnit;
      break;
  }

  // 6 decimals is plenty for per-call estimates (fractions of a cent).
  return Math.round(cost * MILLION) / MILLION;
}
