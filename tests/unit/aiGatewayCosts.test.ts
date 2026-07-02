// AI Hub — cost estimation unit tests (acceptance criterion #7 of #589).

import { describe, expect, it } from "vitest";
import { computeCostUsd } from "../../server/ai/gateway/costs";
import type { ResolvedModel } from "../../server/ai/gateway/types";

function model(overrides: Partial<ResolvedModel>): ResolvedModel {
  return {
    provider: "openai",
    modelId: "test-model",
    displayName: "Test",
    capabilities: ["complete"],
    pricingUnit: "tokens",
    costPer1MInput: 0,
    costPer1MOutput: 0,
    costPerUnit: 0,
    isActive: true,
    ...overrides,
  };
}

describe("computeCostUsd", () => {
  it("token pricing: (in × inPrice + out × outPrice) / 1M", () => {
    const m = model({ costPer1MInput: 1.25, costPer1MOutput: 10 });
    // 100k in + 10k out → 0.125 + 0.1 = 0.225
    expect(computeCostUsd(m, { inputTokens: 100_000, outputTokens: 10_000 })).toBeCloseTo(0.225, 6);
  });

  it("char pricing (TTS): unitCount chars × price / 1M", () => {
    const m = model({ pricingUnit: "chars", costPer1MInput: 15 });
    // 4,000-char newsletter at $15/1M chars → $0.06
    expect(computeCostUsd(m, { unitCount: 4000 })).toBeCloseTo(0.06, 6);
  });

  it("image pricing: n × costPerUnit", () => {
    const m = model({ pricingUnit: "image", costPerUnit: 0.04 });
    expect(computeCostUsd(m, { unitCount: 3 })).toBeCloseTo(0.12, 6);
    // defaults to 1 image when unitCount missing
    expect(computeCostUsd(m, {})).toBeCloseTo(0.04, 6);
  });

  it("unknown model → 0 (never blocks the request)", () => {
    expect(computeCostUsd(undefined, { inputTokens: 1000, outputTokens: 1000 })).toBe(0);
    expect(computeCostUsd(null, { unitCount: 5 })).toBe(0);
  });

  it("missing usage numbers are treated as zero", () => {
    const m = model({ costPer1MInput: 3, costPer1MOutput: 15 });
    expect(computeCostUsd(m, {})).toBe(0);
  });
});
