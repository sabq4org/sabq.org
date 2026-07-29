// Cost estimation from model pricing. Pure module (unit-tested directly).

import {
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_5M_MULTIPLIER,
} from "./anthropicPromptCache";
import type { ResolvedModel } from "./types";

export interface UsageForCost {
  inputTokens?: number;
  outputTokens?: number;
  /** Images generated, or characters synthesized for TTS. */
  unitCount?: number;
  /** Prompt-cache hits — billed at CACHE_READ_MULTIPLIER × base input. */
  cacheReadInputTokens?: number;
  /** Prompt-cache writes — billed at CACHE_WRITE_5M_MULTIPLIER × base input (5m TTL). */
  cacheCreationInputTokens?: number;
}

const MILLION = 1_000_000;

/**
 * Billable input-token weight for Anthropic-style prompt caching.
 * `inputTokens` is the total (read + write + uncached). When cache fields are
 * absent/zero, the whole total is billed at the base input rate.
 */
export function billableInputTokenWeight(usage: UsageForCost): number {
  const total = usage.inputTokens ?? 0;
  const cacheRead = usage.cacheReadInputTokens ?? 0;
  const cacheWrite = usage.cacheCreationInputTokens ?? 0;
  if (cacheRead <= 0 && cacheWrite <= 0) return total;

  const uncached = Math.max(0, total - cacheRead - cacheWrite);
  return (
    uncached +
    cacheRead * CACHE_READ_MULTIPLIER +
    cacheWrite * CACHE_WRITE_5M_MULTIPLIER
  );
}

export function computeCostUsd(model: ResolvedModel | undefined | null, usage: UsageForCost): number {
  if (!model) return 0;

  let cost = 0;
  switch (model.pricingUnit) {
    case "tokens":
      cost =
        (billableInputTokenWeight(usage) * model.costPer1MInput +
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
