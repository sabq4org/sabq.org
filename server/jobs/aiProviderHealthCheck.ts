// AI Hub — periodic health re-check for models tripped by the circuit
// breaker. Every 5 minutes: models whose cooldown expired get one cheap
// probe; success returns them to healthy, failure re-opens the circuit.
//
// Scheduling follows the always-schedule + isLeader-inside-the-tick pattern
// (leader flips over time on Railway; a boot-time check would strand the job).

import cron from 'node-cron';
import { lte, ne, and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { aiProviderHealth } from '../../shared/schema';
import { isLeader } from '../leaderElection';
import { aiGateway } from '../ai/gateway';
import type { AIHubProvider } from '../ai/gateway';

let isRunning = false;

async function recheckTrippedModels() {
  if (!isLeader()) return;
  if (isRunning) return;
  isRunning = true;

  try {
    const now = new Date();
    const tripped = await db
      .select()
      .from(aiProviderHealth)
      .where(
        and(
          ne(aiProviderHealth.status, 'healthy'),
          isNotNull(aiProviderHealth.cooldownUntil),
          lte(aiProviderHealth.cooldownUntil, now),
        ),
      );

    for (const row of tripped) {
      const ref = { provider: row.provider as AIHubProvider, modelId: row.modelId };
      const result = await aiGateway.probeModel(ref);
      await db
        .update(aiProviderHealth)
        .set({ lastCheckedAt: new Date() })
        .where(eq(aiProviderHealth.id, row.id));
      if (result.skipped) continue;
      console.log(
        `[AI Health Check] ${row.provider}/${row.modelId}: ${result.ok ? 'recovered ✓' : `still failing (${result.errorCode})`}`,
      );
    }
  } catch (error) {
    console.error('[AI Health Check] tick failed:', error);
  } finally {
    isRunning = false;
  }
}

export function startAiProviderHealthCheckJob() {
  cron.schedule('*/5 * * * *', recheckTrippedModels);
  console.log('[AI Health Check] job started (every 5 minutes, leader-only ticks)');
}
