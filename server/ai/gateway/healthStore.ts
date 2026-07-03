// Persists circuit-breaker state to ai_provider_health (fire-and-forget) so
// it survives restarts, is shared across instances, and feeds the dashboard's
// live provider strip.

import { sql } from "drizzle-orm";
import { db } from "../../db";
import { aiProviderHealth } from "../../../shared/schema";
import type { BreakerPersistPayload } from "./circuitBreaker";

export function persistBreakerState(payload: BreakerPersistPayload): void {
  const cooldownUntil = payload.cooldownUntil ? new Date(payload.cooldownUntil) : null;
  db.insert(aiProviderHealth)
    .values({
      provider: payload.provider,
      modelId: payload.modelId,
      status: payload.status,
      failCount: payload.failCount,
      lastError: payload.lastError ?? null,
      lastErrorCode: payload.lastErrorCode ?? null,
      cooldownUntil,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [aiProviderHealth.provider, aiProviderHealth.modelId],
      set: {
        status: payload.status,
        failCount: payload.failCount,
        lastError: payload.lastError ?? null,
        lastErrorCode: payload.lastErrorCode ?? null,
        cooldownUntil,
        updatedAt: new Date(),
      },
    })
    .catch((err) => {
      console.warn("[AI Hub] health persist failed:", (err as Error).message);
    });
}

export async function loadBreakerStates(): Promise<BreakerPersistPayload[]> {
  const rows = await db.select().from(aiProviderHealth);
  return rows.map((row) => ({
    provider: row.provider as BreakerPersistPayload["provider"],
    modelId: row.modelId,
    status: row.status as BreakerPersistPayload["status"],
    failCount: row.failCount,
    cooldownUntil: row.cooldownUntil ? row.cooldownUntil.getTime() : null,
    lastError: row.lastError ?? undefined,
    lastErrorCode: row.lastErrorCode ?? undefined,
  }));
}

export async function touchLastChecked(provider: string, modelId: string): Promise<void> {
  await db
    .update(aiProviderHealth)
    .set({ lastCheckedAt: new Date() })
    .where(sql`${aiProviderHealth.provider} = ${provider} AND ${aiProviderHealth.modelId} = ${modelId}`);
}
