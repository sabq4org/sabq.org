// AI Hub gateway — failover behavior (acceptance criteria #3, #4 of #589).

import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../../server/ai/gateway/circuitBreaker";
import { AIGateway, type GatewayUsageEntry } from "../../server/ai/gateway/gateway";
import type { AIIncident } from "../../server/ai/gateway/notifier";
import {
  AIGatewayError,
  type AdapterCompleteParams,
  type AdapterCompleteResult,
  type ModelRef,
  type ProviderAdapter,
  type ResolvedFeatureConfig,
} from "../../server/ai/gateway/types";

const PRIMARY: ModelRef = { provider: "openai", modelId: "gpt-test" };
const FALLBACK_1: ModelRef = { provider: "anthropic", modelId: "claude-test" };
const FALLBACK_2: ModelRef = { provider: "gemini", modelId: "gemini-test" };

function makeConfig(overrides: Partial<ResolvedFeatureConfig> = {}): ResolvedFeatureConfig {
  return {
    featureKey: "test-feature",
    displayName: "Test Feature",
    category: "test",
    primary: PRIMARY,
    fallbackChain: [FALLBACK_1, FALLBACK_2],
    maxTokens: null,
    temperature: null,
    isEnabled: true,
    allowFailover: true,
    source: "db",
    ...overrides,
  };
}

type CompleteFn = (modelId: string, params: AdapterCompleteParams) => Promise<AdapterCompleteResult>;

function makeAdapter(provider: ProviderAdapter["provider"], complete: CompleteFn): ProviderAdapter {
  return { provider, isConfigured: () => true, complete };
}

function ok(content: string): AdapterCompleteResult {
  return { content, inputTokens: 10, outputTokens: 20, truncated: false };
}

function quotaError(provider: string, modelId: string): AIGatewayError {
  return new AIGatewayError(`${provider}/${modelId}: quota exceeded`, {
    code: "QUOTA_EXCEEDED",
    provider: provider as ProviderAdapter["provider"],
    modelId,
  });
}

interface Harness {
  gateway: AIGateway;
  logs: GatewayUsageEntry[];
  incidents: AIIncident[];
  breaker: CircuitBreaker;
}

function buildHarness(
  adapters: ProviderAdapter[],
  cfg: ResolvedFeatureConfig,
  breaker = new CircuitBreaker(),
): Harness {
  const logs: GatewayUsageEntry[] = [];
  const incidents: AIIncident[] = [];
  const byProvider = new Map(adapters.map((a) => [a.provider, a]));
  const gateway = new AIGateway({
    getFeatureConfig: async () => cfg,
    getModel: async (ref) => ({
      ...ref,
      displayName: ref.modelId,
      capabilities: ["complete"],
      pricingUnit: "tokens",
      costPer1MInput: 1,
      costPer1MOutput: 2,
      costPerUnit: 0,
      isActive: true,
    }),
    getAdapter: (p) => byProvider.get(p),
    breaker,
    logUsage: (e) => logs.push(e),
    notifyIncident: (i) => incidents.push(i),
    retries: 0,
    timeoutMs: 5000,
  });
  return { gateway, logs, incidents, breaker };
}

describe("AIGateway failover", () => {
  it("falls back to the next model on QUOTA_EXCEEDED and logs status=fallback", async () => {
    const calls: string[] = [];
    const { gateway, logs, incidents } = buildHarness(
      [
        makeAdapter("openai", async (m) => {
          calls.push(`openai:${m}`);
          throw quotaError("openai", m);
        }),
        makeAdapter("anthropic", async (m) => {
          calls.push(`anthropic:${m}`);
          return ok("from-claude");
        }),
        makeAdapter("gemini", async () => ok("unreachable")),
      ],
      makeConfig(),
    );

    const result = await gateway.complete({ feature: "test-feature", prompt: "hi" });

    expect(result.content).toBe("from-claude");
    expect(result.provider).toBe("anthropic");
    expect(result.fallbackUsed).toBe(true);
    expect(calls).toEqual(["openai:gpt-test", "anthropic:claude-test"]);

    const failed = logs.find((l) => l.status === "failed");
    expect(failed?.provider).toBe("openai");
    expect(failed?.errorCode).toBe("QUOTA_EXCEEDED");
    const success = logs.find((l) => l.status === "fallback");
    expect(success?.provider).toBe("anthropic");
    expect(success?.estimatedCostUsd).toBeGreaterThan(0);

    expect(incidents.some((i) => i.kind === "failover")).toBe(true);
  });

  it("does NOT fail over on CONTENT_FILTER", async () => {
    const calls: string[] = [];
    const { gateway } = buildHarness(
      [
        makeAdapter("openai", async (m) => {
          calls.push("openai");
          throw new AIGatewayError("blocked", { code: "CONTENT_FILTER", provider: "openai", modelId: m });
        }),
        makeAdapter("anthropic", async () => {
          calls.push("anthropic");
          return ok("should-not-run");
        }),
        makeAdapter("gemini", async () => ok("x")),
      ],
      makeConfig(),
    );

    await expect(gateway.complete({ feature: "test-feature", prompt: "hi" })).rejects.toMatchObject({
      code: "CONTENT_FILTER",
    });
    expect(calls).toEqual(["openai"]);
  });

  it("pinned features (allowFailover=false) never try the chain — embeddings safety", async () => {
    const calls: string[] = [];
    const { gateway } = buildHarness(
      [
        makeAdapter("openai", async (m) => {
          calls.push("openai");
          throw quotaError("openai", m);
        }),
        makeAdapter("anthropic", async () => {
          calls.push("anthropic");
          return ok("must-not-run");
        }),
      ],
      makeConfig({ allowFailover: false }),
    );

    await expect(gateway.complete({ feature: "test-feature", prompt: "hi" })).rejects.toBeInstanceOf(
      AIGatewayError,
    );
    expect(calls).toEqual(["openai"]);
  });

  it("throws FEATURE_DISABLED without touching any adapter", async () => {
    const calls: string[] = [];
    const { gateway } = buildHarness(
      [
        makeAdapter("openai", async () => {
          calls.push("openai");
          return ok("x");
        }),
      ],
      makeConfig({ isEnabled: false }),
    );

    await expect(gateway.complete({ feature: "test-feature", prompt: "hi" })).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    expect(calls).toEqual([]);
  });

  it("skips a model whose circuit is open and marks the result as fallback", async () => {
    const breaker = new CircuitBreaker();
    breaker.recordFailure(PRIMARY, quotaError("openai", "gpt-test"));

    const calls: string[] = [];
    const { gateway } = buildHarness(
      [
        makeAdapter("openai", async () => {
          calls.push("openai");
          return ok("must-not-run");
        }),
        makeAdapter("anthropic", async () => {
          calls.push("anthropic");
          return ok("served-by-fallback");
        }),
        makeAdapter("gemini", async () => ok("x")),
      ],
      makeConfig(),
      breaker,
    );

    const result = await gateway.complete({ feature: "test-feature", prompt: "hi" });

    expect(calls).toEqual(["anthropic"]);
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts[0]).toMatchObject({ provider: "openai", errorCode: "CIRCUIT_OPEN" });
  });

  it("reports chain exhaustion with the attempts trail when every model fails", async () => {
    const { gateway, incidents } = buildHarness(
      [
        makeAdapter("openai", async (m) => {
          throw quotaError("openai", m);
        }),
        makeAdapter("anthropic", async (m) => {
          throw quotaError("anthropic", m);
        }),
        makeAdapter("gemini", async (m) => {
          throw quotaError("gemini", m);
        }),
      ],
      makeConfig(),
    );

    const err = await gateway
      .complete({ feature: "test-feature", prompt: "hi" })
      .catch((e: AIGatewayError) => e);

    expect(err).toBeInstanceOf(AIGatewayError);
    expect((err as AIGatewayError).attempts).toHaveLength(3);
    expect(incidents.some((i) => i.kind === "chain_exhausted")).toBe(true);
  });
});

describe("AIGateway total deadline", () => {
  it("aborts transport and never dispatches a fallback after expiry", async () => {
    let signal: AbortSignal | undefined;
    let fallbacks = 0;
    const { gateway } = buildHarness([
      makeAdapter("openai", async (_m, p) => { signal = p.signal; return new Promise((_r, reject) => p.signal!.addEventListener("abort", () => reject(p.signal!.reason), { once: true })); }),
      makeAdapter("anthropic", async () => { fallbacks++; return ok("unexpected"); }),
    ], makeConfig());
    await expect(gateway.complete({ feature: "test-feature", prompt: "test", timeoutMs: 15 })).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(signal?.aborted).toBe(true); expect(fallbacks).toBe(0);
  });
  it("expires a queued request without starting provider transport later", async () => {
    const release: (() => void)[] = [];
    const { gateway } = buildHarness([makeAdapter("openai", async () => new Promise(resolve => {
      release.push(() => resolve(ok("done")));
    }))], makeConfig({ fallbackChain: [] }));
    const running = Array.from({ length: 8 }, () => gateway.complete({ feature: "test-feature", prompt: "occupy", timeoutMs: 1000 }));
    await new Promise(resolve => setImmediate(resolve));
    expect(release).toHaveLength(8);
    await expect(gateway.complete({ feature: "test-feature", prompt: "queued", timeoutMs: 15 })).rejects.toMatchObject({ code: "TIMEOUT" });
    release.forEach(r => r()); await Promise.all(running);
    await new Promise(resolve => setImmediate(resolve));
    expect(release).toHaveLength(8);
  });
});
