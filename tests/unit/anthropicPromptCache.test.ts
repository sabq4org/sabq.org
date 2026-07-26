import { describe, expect, it } from "vitest";
import {
  buildCachedSystemBlocks,
  isAnthropicPromptCachingEnabled,
  normalizeAnthropicUsage,
  shouldCacheGrowingConversation,
  withTrailingMessageCacheBreakpoint,
} from "../../server/ai/gateway/anthropicPromptCache";
import { billableInputTokenWeight, computeCostUsd } from "../../server/ai/gateway/costs";
import type { ResolvedModel } from "../../server/ai/gateway/types";

function model(overrides: Partial<ResolvedModel> = {}): ResolvedModel {
  return {
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    displayName: "Sonnet",
    capabilities: ["complete"],
    pricingUnit: "tokens",
    costPer1MInput: 3,
    costPer1MOutput: 15,
    costPerUnit: 0,
    isActive: true,
    ...overrides,
  };
}

describe("isAnthropicPromptCachingEnabled", () => {
  it("defaults to on", () => {
    expect(isAnthropicPromptCachingEnabled({})).toBe(true);
  });

  it("honors off / 0 / false / no", () => {
    expect(isAnthropicPromptCachingEnabled({ ANTHROPIC_PROMPT_CACHE: "off" })).toBe(false);
    expect(isAnthropicPromptCachingEnabled({ ANTHROPIC_PROMPT_CACHE: "0" })).toBe(false);
    expect(isAnthropicPromptCachingEnabled({ AI_ANTHROPIC_PROMPT_CACHE: "false" })).toBe(false);
    expect(isAnthropicPromptCachingEnabled({ ANTHROPIC_PROMPT_CACHE: "NO" })).toBe(false);
  });
});

describe("buildCachedSystemBlocks", () => {
  it("adds cache_control when enabled", () => {
    const blocks = buildCachedSystemBlocks("You are Sabq editor.", true);
    expect(blocks).toEqual([
      {
        type: "text",
        text: "You are Sabq editor.",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("omits cache_control when disabled or blank", () => {
    expect(buildCachedSystemBlocks("x", false)[0].cache_control).toBeUndefined();
    expect(buildCachedSystemBlocks("   ", true)[0].cache_control).toBeUndefined();
  });
});

describe("shouldCacheGrowingConversation", () => {
  it("only for multi-turn when enabled", () => {
    expect(shouldCacheGrowingConversation([{ role: "user" }], true)).toBe(false);
    expect(
      shouldCacheGrowingConversation(
        [
          { role: "user" },
          { role: "assistant" },
          { role: "user" },
        ],
        true,
      ),
    ).toBe(true);
    expect(
      shouldCacheGrowingConversation(
        [
          { role: "user" },
          { role: "assistant" },
        ],
        false,
      ),
    ).toBe(false);
  });
});

describe("withTrailingMessageCacheBreakpoint", () => {
  it("marks only the last message when enabled", () => {
    const out = withTrailingMessageCacheBreakpoint(
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "mars?" },
      ],
      true,
    );
    expect(out[0]).toEqual({ role: "user", content: "hi" });
    expect(out[2]).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "mars?",
          cache_control: { type: "ephemeral" },
        },
      ],
    });
  });

  it("is a no-op when disabled", () => {
    const msgs = [{ role: "user" as const, content: "x" }];
    expect(withTrailingMessageCacheBreakpoint(msgs, false)).toEqual(msgs);
  });
});

describe("normalizeAnthropicUsage", () => {
  it("sums cache + uncached into inputTokens", () => {
    expect(
      normalizeAnthropicUsage({
        input_tokens: 50,
        output_tokens: 10,
        cache_read_input_tokens: 100_000,
        cache_creation_input_tokens: 0,
      }),
    ).toEqual({
      inputTokens: 100_050,
      outputTokens: 10,
      cacheReadInputTokens: 100_000,
      cacheCreationInputTokens: 0,
      uncachedInputTokens: 50,
    });
  });
});

describe("billableInputTokenWeight / computeCostUsd with cache", () => {
  it("applies 0.1× read and 1.25× write multipliers", () => {
    // 100k read + 2k write + 50 uncached
    const weight = billableInputTokenWeight({
      inputTokens: 102_050,
      cacheReadInputTokens: 100_000,
      cacheCreationInputTokens: 2_000,
    });
    expect(weight).toBeCloseTo(100_000 * 0.1 + 2_000 * 1.25 + 50, 6);

    const m = model({ costPer1MInput: 3, costPer1MOutput: 15 });
    const cost = computeCostUsd(m, {
      inputTokens: 102_050,
      outputTokens: 100,
      cacheReadInputTokens: 100_000,
      cacheCreationInputTokens: 2_000,
    });
    // (weight * 3 + 100 * 15) / 1e6
    expect(cost).toBeCloseTo((weight * 3 + 1500) / 1_000_000, 6);
  });

  it("falls back to base input pricing when no cache fields", () => {
    expect(billableInputTokenWeight({ inputTokens: 1000 })).toBe(1000);
    expect(computeCostUsd(model(), { inputTokens: 1000, outputTokens: 0 })).toBeCloseTo(0.003, 6);
  });
});
