// Cost estimation from model pricing. Pure module (unit-tested directly).

import type { ResolvedModel } from "./types";

export interface UsageForCost {
  /** All prompt tokens, including any cache reads/writes below. */
  inputTokens?: number;
  outputTokens?: number;
  /** Anthropic prompt-cache reads (a subset of inputTokens). */
  cacheReadTokens?: number;
  /** Anthropic prompt-cache writes (a subset of inputTokens). */
  cacheWriteTokens?: number;
  /** Images generated, or characters synthesized for TTS. */
  unitCount?: number;
}

const MILLION = 1_000_000;

// 5-minute cache writes bill at 1.25× input. Reads bill at 0.1× on most models and
// 0.05× on the 5.5 generation; 0.1× keeps the estimate an upper bound for all of them.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export function computeCostUsd(model: ResolvedModel | undefined | null, usage: UsageForCost): number {
  if (!model) return 0;

  let cost = 0;
  switch (model.pricingUnit) {
    case "tokens": {
      const read = usage.cacheReadTokens ?? 0;
      const write = usage.cacheWriteTokens ?? 0;
      const uncached = Math.max(0, (usage.inputTokens ?? 0) - read - write);
      const promptUnits = uncached + write * CACHE_WRITE_MULTIPLIER + read * CACHE_READ_MULTIPLIER;
      cost = (promptUnits * model.costPer1MInput + (usage.outputTokens ?? 0) * model.costPer1MOutput) / MILLION;
      break;
    }
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
