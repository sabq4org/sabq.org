import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../../server/ai/gateway/circuitBreaker";
import { AIGateway } from "../../server/ai/gateway/gateway";
import { AIGatewayError, type AdapterCompleteParams, type AdapterCompleteResult, type ProviderAdapter } from "../../server/ai/gateway/types";

const primary = { provider: "openai" as const, modelId: "gpt-test" };

function config() {
  return {
    featureKey: "radar",
    displayName: "Radar",
    category: "intelligence",
    primary,
    fallbackChain: [{ provider: "anthropic" as const, modelId: "claude-test" }],
    maxTokens: null,
    temperature: null,
    isEnabled: true,
    allowFailover: true,
    source: "test" as const,
  };
}

function gateway(adapters: ProviderAdapter[], concurrency = 1) {
  const byProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  return new AIGateway({
    getFeatureConfig: async () => config(),
    getModel: async (ref) => ({
      ...ref,
      displayName: ref.modelId,
      capabilities: ["complete"],
      pricingUnit: "tokens",
      costPer1MInput: 1,
      costPer1MOutput: 1,
      costPerUnit: 0,
      isActive: true,
    }),
    getAdapter: (provider) => byProvider.get(provider),
    breaker: new CircuitBreaker(),
    logUsage: () => undefined,
    notifyIncident: () => undefined,
    concurrency,
    retries: 2,
    timeoutMs: 2_000,
  });
}

function ok(content: string): AdapterCompleteResult {
  return { content, inputTokens: 1, outputTokens: 1, truncated: false };
}

const adapter = (complete: ProviderAdapter["complete"]): ProviderAdapter => ({
  provider: "openai",
  isConfigured: () => true,
  complete,
});

describe("AI Hub caller guards", () => {
  it("stops a retry before the next transport and never fails over", async () => {
    let enabled = true;
    let guardCalls = 0;
    let transports = 0;
    let fallbackTransports = 0;
    const ai = gateway([
      adapter(async () => {
        transports++;
        enabled = false;
        throw new AIGatewayError("rate limited", { code: "RATE_LIMITED", retryable: true, provider: "openai", modelId: "gpt-test" });
      }),
      {
        provider: "anthropic",
        isConfigured: () => true,
        complete: async () => {
          fallbackTransports++;
          return ok("fallback");
        },
      },
    ]);

    await expect(
      ai.complete({
        feature: "radar",
        prompt: "test",
        beforeAttempt: async () => {
          guardCalls++;
          if (!enabled) throw Object.assign(new Error("RADAR_DISABLED"), { code: "RADAR_DISABLED" });
        },
      }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(transports).toBe(1);
    expect(guardCalls).toBe(2);
    expect(fallbackTransports).toBe(0);
  });

  it("checks again when a queued request finally reaches the limiter", async () => {
    let enabled = true;
    let transports = 0;
    let release!: () => void;
    const firstTransport = new Promise<AdapterCompleteResult>((resolve) => {
      release = () => resolve(ok("first"));
    });
    const ai = gateway([
      adapter(async () => {
        transports++;
        return firstTransport;
      }),
    ]);
    const guard = async () => {
      if (!enabled) throw Object.assign(new Error("RADAR_DISABLED"), { code: "RADAR_DISABLED" });
    };

    const first = ai.complete({ feature: "radar", prompt: "first", beforeAttempt: guard });
    await new Promise((resolve) => setImmediate(resolve));
    const second = ai.complete({ feature: "radar", prompt: "second", beforeAttempt: guard });
    await new Promise((resolve) => setImmediate(resolve));
    enabled = false;
    release();
    await expect(first).resolves.toMatchObject({ content: "first" });
    await expect(second).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(transports).toBe(1);
  });
});
