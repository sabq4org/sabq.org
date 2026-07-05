// Sabq AI Hub — wired singleton. Every AI consumer imports from here:
//
//   import { aiGateway } from "../ai/gateway";
//   const res = await aiGateway.complete({ feature: "seo-generator", prompt });
//
// Model routing comes from the DB (dashboard-editable, ~45s cache) with
// automatic failover + circuit breaker; usage and cost land in ai_usage_logs.

import { CircuitBreaker } from "./circuitBreaker";
import { getFeatureConfig, getModel } from "./configStore";
import { AIGateway } from "./gateway";
import { loadBreakerStates, persistBreakerState } from "./healthStore";
import { notifyIncident } from "./notifier";
import { getAdapter } from "./registry";
import { logUsage } from "./usageLogger";

export const circuitBreaker = new CircuitBreaker({
  failureThreshold: Number(process.env.AI_GATEWAY_FAILURE_THRESHOLD) || 3,
  cooldownMs: (Number(process.env.AI_GATEWAY_COOLDOWN_MINUTES) || 10) * 60 * 1000,
  persist: persistBreakerState,
});

// Warm breaker state from ai_provider_health so restarts don't hammer a
// provider that was already in cooldown. Best-effort: table may not exist
// before the first db:push.
loadBreakerStates()
  .then((rows) => circuitBreaker.hydrate(rows))
  .catch((err) => {
    console.warn("[AI Hub] breaker hydrate skipped:", (err as Error).message);
  });

// Wire critical-provider alerts (WhatsApp to the editor-in-chief) onto breaker
// status transitions. Dynamic import keeps the notification stack out of the
// gateway's static module graph and avoids any import cycle.
import("../../services/aiCriticalAlerts")
  .then(({ handleAiProviderStatusChange }) => {
    circuitBreaker.setStatusChangeHandler(handleAiProviderStatusChange);
  })
  .catch((err) => {
    console.warn("[AI Hub] critical-alert wiring skipped:", (err as Error).message);
  });

export const aiGateway = new AIGateway({
  getFeatureConfig,
  getModel,
  getAdapter,
  breaker: circuitBreaker,
  logUsage,
  notifyIncident,
  concurrency: Number(process.env.AI_GATEWAY_CONCURRENCY) || 8,
  timeoutMs: Number(process.env.AI_GATEWAY_TIMEOUT_MS) || 90_000,
});

export { AIGateway } from "./gateway";
export { AIGatewayError } from "./types";
export type {
  AIHubProvider,
  AIOperation,
  ChatMessage,
  CompleteRequest,
  CompleteResult,
  EmbedRequest,
  EmbedResult,
  ImageRequest,
  ImageResult,
  ModelRef,
  TTSRequest,
  TTSResult,
} from "./types";
export { invalidateAiHubConfigCache } from "./configStore";
export { setIncidentHandler } from "./notifier";
export { DEFAULT_FEATURES, DEFAULT_MODELS } from "./defaults";
