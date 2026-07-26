// AIGateway core — the single entry point for every AI call in the project.
// Pure class with injected dependencies (config, breaker, adapters, logging)
// so unit tests run it with fakes and no DB/SDK. The wired singleton lives
// in ./index.ts.

import pLimit from "p-limit";
import pRetry from "p-retry";
import { CircuitBreaker } from "./circuitBreaker";
import { isRetryableWithinModel, normalizeProviderError } from "./errors";
import { executeWithFailover, type FailoverOutcome } from "./failover";
import { computeCostUsd } from "./costs";
import type { AIIncident } from "./notifier";
import {
  AIGatewayError,
  type AIHubProvider,
  type AIOperation,
  type CompleteRequest,
  type CompleteResult,
  type EmbedRequest,
  type EmbedResult,
  type ImageRequest,
  type ImageResult,
  type ModelRef,
  type ProviderAdapter,
  type ResolvedFeatureConfig,
  type ResolvedModel,
  type TTSRequest,
  type TTSResult,
} from "./types";

export interface GatewayUsageEntry {
  featureKey: string;
  provider: AIHubProvider;
  modelId: string;
  operation: AIOperation;
  inputTokens?: number;
  outputTokens?: number;
  unitCount?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  status: "success" | "fallback" | "failed";
  errorCode?: string;
  errorMessage?: string;
  userId?: string;
}

export interface GatewayDeps {
  getFeatureConfig(featureKey: string): Promise<ResolvedFeatureConfig>;
  getModel(ref: ModelRef): Promise<ResolvedModel | undefined>;
  getAdapter(provider: AIHubProvider): ProviderAdapter | undefined;
  breaker: CircuitBreaker;
  logUsage(entry: GatewayUsageEntry): void;
  notifyIncident(incident: AIIncident): void;
  /** Max concurrent provider calls across the whole process. */
  concurrency?: number;
  /** Per-attempt timeout. Default 90s (matches ai-manager). */
  timeoutMs?: number;
  /** In-model retries for transient errors. Default 2 (matches ai-manager). */
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_RETRIES = 2;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error(message)), timeoutMs);
      // Don't keep the process alive for an abandoned race branch.
      (t as unknown as { unref?: () => void }).unref?.();
    }),
  ]);
}

function dedupeCandidates(candidates: ModelRef[]): ModelRef[] {
  const seen = new Set<string>();
  return candidates.filter((m) => {
    const key = `${m.provider}:${m.modelId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class AIGateway {
  private readonly deps: GatewayDeps;
  private readonly limiter: <T>(fn: () => Promise<T>) => Promise<T>;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(deps: GatewayDeps) {
    this.deps = deps;
    this.limiter = pLimit(deps.concurrency ?? 8);
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = deps.retries ?? DEFAULT_RETRIES;
  }

  // ── Public API ──

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    if (!req.prompt && !req.messages?.length) {
      throw new Error(`[${req.feature}] complete() requires prompt or messages`);
    }
    const messages = req.messages?.length
      ? req.messages
      : [{ role: "user" as const, content: req.prompt ?? "" }];

    const { cfg, candidates } = await this.prepare("complete", req.feature, req.model);
    const timeoutMs = req.timeoutMs ?? this.timeoutMs;

    const outcome = await this.runChain("complete", req, cfg, candidates, (model, adapter) =>
      adapter.complete!(model.modelId, {
        messages,
        maxTokens: req.options?.maxTokens ?? cfg.maxTokens ?? undefined,
        temperature: req.options?.temperature ?? cfg.temperature ?? undefined,
        jsonMode: req.options?.jsonMode,
        timeoutMs,
      }),
    );

    const cacheReadInputTokens = outcome.result.cacheReadInputTokens ?? 0;
    const cacheCreationInputTokens = outcome.result.cacheCreationInputTokens ?? 0;
    const usage = {
      inputTokens: outcome.result.inputTokens,
      outputTokens: outcome.result.outputTokens,
      ...(cacheReadInputTokens > 0 || cacheCreationInputTokens > 0
        ? { cacheReadInputTokens, cacheCreationInputTokens }
        : {}),
    };
    const { latencyMs, estimatedCostUsd } = await this.logSuccess("complete", req, outcome, usage);

    return {
      content: outcome.result.content,
      provider: outcome.used.provider,
      modelId: outcome.used.modelId,
      usage,
      latencyMs,
      estimatedCostUsd,
      truncated: outcome.result.truncated,
      fallbackUsed: outcome.fallbackUsed,
      attempts: outcome.attempts,
    };
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const input = Array.isArray(req.input) ? req.input : [req.input];
    const { cfg, candidates } = await this.prepare("embed", req.feature, req.model);
    const timeoutMs = req.timeoutMs ?? this.timeoutMs;

    const outcome = await this.runChain("embed", req, cfg, candidates, (model, adapter) =>
      adapter.embed!(model.modelId, { input, dimensions: req.dimensions, timeoutMs }),
    );

    const usage = { inputTokens: outcome.result.inputTokens, outputTokens: 0 };
    const { latencyMs, estimatedCostUsd } = await this.logSuccess("embed", req, outcome, usage);

    return {
      embeddings: outcome.result.embeddings,
      provider: outcome.used.provider,
      modelId: outcome.used.modelId,
      usage,
      latencyMs,
      estimatedCostUsd,
    };
  }

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    const { cfg, candidates } = await this.prepare("image", req.feature, req.model);
    const timeoutMs = req.timeoutMs ?? this.timeoutMs;

    const outcome = await this.runChain("image", req, cfg, candidates, (model, adapter) =>
      adapter.image!(model.modelId, {
        prompt: req.prompt,
        size: req.options?.size,
        quality: req.options?.quality,
        n: req.options?.n,
        timeoutMs,
      }),
    );

    const unitCount = outcome.result.images.length || 1;
    const { latencyMs, estimatedCostUsd } = await this.logSuccess("image", req, outcome, { unitCount });

    return {
      images: outcome.result.images,
      provider: outcome.used.provider,
      modelId: outcome.used.modelId,
      latencyMs,
      estimatedCostUsd,
    };
  }

  async tts(req: TTSRequest): Promise<TTSResult> {
    const { cfg, candidates } = await this.prepare("tts", req.feature, req.model);
    const timeoutMs = req.timeoutMs ?? this.timeoutMs;

    const outcome = await this.runChain("tts", req, cfg, candidates, (model, adapter) =>
      adapter.tts!(model.modelId, {
        text: req.text,
        voice: req.voice,
        format: req.format,
        timeoutMs,
      }),
    );

    const unitCount = outcome.result.charCount;
    const { latencyMs, estimatedCostUsd } = await this.logSuccess("tts", req, outcome, { unitCount });

    return {
      audio: outcome.result.audio,
      contentType: outcome.result.contentType,
      charCount: outcome.result.charCount,
      provider: outcome.used.provider,
      modelId: outcome.used.modelId,
      latencyMs,
      estimatedCostUsd,
    };
  }

  /**
   * Cheap connectivity probe for the health-check job and the dashboard's
   * "test keys" button. Uses the model's cheapest capability; image/tts
   * models are not probed (cost) — they recover via cooldown expiry.
   */
  async probeModel(ref: ModelRef): Promise<{ ok: boolean; latencyMs: number; errorCode?: string; skipped?: boolean }> {
    const adapter = this.deps.getAdapter(ref.provider);
    if (!adapter || !adapter.isConfigured()) {
      return { ok: false, latencyMs: 0, errorCode: "NOT_CONFIGURED" };
    }

    const startedAt = Date.now();
    try {
      if (adapter.embed && !adapter.complete) {
        await adapter.embed(ref.modelId, { input: ["ping"], timeoutMs: 15_000 });
      } else if (adapter.complete && !ref.modelId.includes("embedding")) {
        await adapter.complete(ref.modelId, {
          messages: [{ role: "user", content: "ping" }],
          maxTokens: 16,
          timeoutMs: 15_000,
        });
      } else if (adapter.embed) {
        await adapter.embed(ref.modelId, { input: ["ping"], timeoutMs: 15_000 });
      } else {
        return { ok: false, latencyMs: 0, skipped: true };
      }
      this.deps.breaker.recordSuccess(ref);
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (err) {
      const gwErr = normalizeProviderError(ref.provider, ref.modelId, err);
      this.deps.breaker.recordFailure(ref, gwErr);
      return { ok: false, latencyMs: Date.now() - startedAt, errorCode: gwErr.code };
    }
  }

  // ── Internals ──

  private async prepare(
    op: AIOperation,
    featureKey: string,
    override?: ModelRef,
  ): Promise<{ cfg: ResolvedFeatureConfig; candidates: ModelRef[] }> {
    const cfg = await this.deps.getFeatureConfig(featureKey);
    if (!cfg.isEnabled) {
      throw new AIGatewayError(`[${featureKey}] الميزة معطّلة من مركز الذكاء الاصطناعي`, {
        code: "FEATURE_DISABLED",
      });
    }

    let candidates: ModelRef[];
    if (override) {
      candidates = [override];
    } else {
      candidates = dedupeCandidates([...(cfg.primary ? [cfg.primary] : []), ...cfg.fallbackChain]);
    }

    if (candidates.length === 0) {
      throw new AIGatewayError(`[${featureKey}] no model configured for ${op}`, {
        code: "NO_MODEL_AVAILABLE",
      });
    }

    return { cfg, candidates };
  }

  private supports(op: AIOperation, m: ModelRef): boolean {
    const adapter = this.deps.getAdapter(m.provider);
    return Boolean(adapter && typeof adapter[op] === "function" && adapter.isConfigured());
  }

  private runChain<TRes>(
    op: AIOperation,
    req: { feature: string; userId?: string },
    cfg: ResolvedFeatureConfig,
    candidates: ModelRef[],
    call: (model: ModelRef, adapter: ProviderAdapter) => Promise<TRes>,
  ): Promise<FailoverOutcome<TRes>> {
    return executeWithFailover<TRes>({
      feature: req.feature,
      candidates,
      allowFailover: cfg.allowFailover,
      isConfigured: (m) => this.supports(op, m),
      isAvailable: (m) => this.deps.breaker.isAvailable(m),
      run: (m) => this.limiter(() => this.attempt(op, m, call)),
      onSuccess: (m) => this.deps.breaker.recordSuccess(m),
      onFailure: (m, err) => {
        this.deps.breaker.recordFailure(m, err);
        this.deps.logUsage({
          featureKey: req.feature,
          provider: m.provider,
          modelId: m.modelId,
          operation: op,
          status: "failed",
          errorCode: err.code,
          errorMessage: err.message,
          userId: req.userId,
        });
        this.deps.notifyIncident({
          kind: "failover",
          featureKey: req.feature,
          provider: m.provider,
          modelId: m.modelId,
          errorCode: err.code,
          message: err.message,
        });
      },
    }).catch((err) => {
      if (err instanceof AIGatewayError && err.attempts && err.attempts.length > 0) {
        this.deps.notifyIncident({
          kind: "chain_exhausted",
          featureKey: req.feature,
          provider: err.provider ?? "openai",
          modelId: err.modelId ?? "-",
          errorCode: err.code,
          message: err.message,
        });
      }
      throw err;
    });
  }

  private async attempt<TRes>(
    op: AIOperation,
    model: ModelRef,
    call: (model: ModelRef, adapter: ProviderAdapter) => Promise<TRes>,
  ): Promise<TRes> {
    const adapter = this.deps.getAdapter(model.provider)!;
    const timeoutMessage = `AI model ${model.provider}/${model.modelId} timed out`;

    try {
      return await pRetry(
        async () => {
          try {
            return await withTimeout(call(model, adapter), this.timeoutMs + 1000, timeoutMessage);
          } catch (err) {
            throw normalizeProviderError(model.provider, model.modelId, err);
          }
        },
        {
          retries: this.retries,
          minTimeout: 1000,
          shouldRetry: ({ error }: { error: unknown }) =>
            error instanceof AIGatewayError && isRetryableWithinModel(error),
        },
      );
    } catch (err) {
      throw normalizeProviderError(model.provider, model.modelId, err);
    }
  }

  private async logSuccess(
    op: AIOperation,
    req: { feature: string; userId?: string },
    outcome: FailoverOutcome<unknown>,
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      unitCount?: number;
      cacheReadInputTokens?: number;
      cacheCreationInputTokens?: number;
    },
  ): Promise<{ latencyMs: number; estimatedCostUsd: number }> {
    const latencyMs = outcome.attempts.find((a) => a.ok)?.latencyMs ?? 0;
    const model = await this.deps.getModel(outcome.used);
    const estimatedCostUsd = computeCostUsd(model, usage);

    this.deps.logUsage({
      featureKey: req.feature,
      provider: outcome.used.provider,
      modelId: outcome.used.modelId,
      operation: op,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      unitCount: usage.unitCount,
      estimatedCostUsd,
      latencyMs,
      status: outcome.fallbackUsed ? "fallback" : "success",
      userId: req.userId,
    });

    return { latencyMs, estimatedCostUsd };
  }
}
