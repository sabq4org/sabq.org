// Fire-and-forget usage logging into ai_usage_logs. Never slows down or
// fails the AI call it records.

import { db } from "../../db";
import { aiUsageLogs } from "../../../shared/schema";
import type { AIOperation, AIHubProvider } from "./types";

export interface UsageLogEntry {
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

export function logUsage(entry: UsageLogEntry): void {
  db.insert(aiUsageLogs)
    .values({
      featureKey: entry.featureKey,
      provider: entry.provider,
      modelId: entry.modelId,
      operation: entry.operation,
      inputTokens: entry.inputTokens ?? 0,
      outputTokens: entry.outputTokens ?? 0,
      unitCount: entry.unitCount ?? 0,
      estimatedCostUsd: entry.estimatedCostUsd ?? 0,
      latencyMs: entry.latencyMs ?? 0,
      status: entry.status,
      errorCode: entry.errorCode ?? null,
      // Keep error text bounded — provider messages can embed huge payloads.
      errorMessage: entry.errorMessage ? entry.errorMessage.slice(0, 2000) : null,
      userId: entry.userId ?? null,
    })
    .catch((err) => {
      console.warn("[AI Hub] usage log failed:", (err as Error).message);
    });
}
