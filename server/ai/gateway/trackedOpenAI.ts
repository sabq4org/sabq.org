import { createHash } from "node:crypto";
import type OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { getFeatureConfig, getModel } from "./configStore";
import { computeCostUsd } from "./costs";
import { normalizeProviderError } from "./errors";
import { AIGatewayError } from "./types";
import { logUsage, type UsageLogEntry } from "./usageLogger";

// Transitional transport for legacy callers that need the complete SDK response
// (including vision messages and provider-specific options). Keep their client,
// model and retry policy; add attribution and the Hub's explicit disable switch.
// This is not a second routing/failover engine.
const pendingByClient = new WeakMap<OpenAI, Map<string, Promise<ChatCompletion>>>();
const MAX_PENDING_PER_CLIENT = 128;

function recordUsage(entry: UsageLogEntry): void {
  // Accounting failure must never turn a successful paid response into a retry.
  void (async () => {
    try {
      const model = await getModel({ provider: "openai", modelId: entry.modelId });
      logUsage({ ...entry, estimatedCostUsd: computeCostUsd(model, entry) });
    } catch {
      console.warn("[AI Hub] legacy OpenAI usage recording failed");
    }
  })();
}

export async function trackedOpenAICompletion(
  client: OpenAI,
  feature: string,
  body: ChatCompletionCreateParamsNonStreaming,
  options: { deduplicate?: boolean } = {},
): Promise<ChatCompletion> {
  const config = await getFeatureConfig(feature);
  if (!config.isEnabled) {
    throw new AIGatewayError(`[${feature}] الميزة معطّلة من مركز الذكاء الاصطناعي`, {
      code: "FEATURE_DISABLED",
      retryable: false,
    });
  }

  const run = async (): Promise<ChatCompletion> => {
    const startedAt = Date.now();
    try {
      const response = await client.chat.completions.create(body);
      recordUsage({
        featureKey: feature,
        provider: "openai",
        modelId: body.model,
        operation: "complete",
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
        status: "success",
        ...(response.choices.some((choice) => choice.finish_reason === "length")
          ? { errorCode: "OUTPUT_TRUNCATED", errorMessage: "OpenAI output reached the token limit" }
          : {}),
      });
      return response;
    } catch (error) {
      const normalized = normalizeProviderError("openai", body.model, error);
      recordUsage({
        featureKey: feature,
        provider: "openai",
        modelId: body.model,
        operation: "complete",
        latencyMs: Date.now() - startedAt,
        status: "failed",
        errorCode: normalized.code,
        // Provider messages may echo input or credentials. Store only a fixed code.
        errorMessage: `OpenAI request failed: ${normalized.code}`,
      });
      throw error; // Preserve callers' status/error handling and retry decisions.
    }
  };

  if (!options.deduplicate) return run();
  let pending = pendingByClient.get(client);
  if (!pending) {
    pending = new Map();
    pendingByClient.set(client, pending);
  }
  // Only identical feature + complete payload + same client can share a call.
  // Prompts never become map keys/logs; no completed result cache is retained.
  const key = createHash("sha256").update(JSON.stringify([feature, body])).digest("hex");
  const existing = pending.get(key);
  if (existing) return structuredClone(await existing);
  if (pending.size >= MAX_PENDING_PER_CLIENT) return run();

  const request = run();
  pending.set(key, request);
  try {
    return structuredClone(await request);
  } finally {
    pending.delete(key);
  }
}
