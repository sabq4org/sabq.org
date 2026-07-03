// AI Hub — nightly rollup of ai_usage_logs into ai_usage_daily (the table
// dashboard charts read from), then pruning of raw logs older than 90 days.
// Re-aggregates the last 3 days each run so late writes and missed nights
// self-heal. Always-scheduled; isLeader checked inside the tick.

import cron from 'node-cron';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { isLeader } from '../leaderElection';

const RETENTION_DAYS = 90;
const PRUNE_BATCH = 5000;
const MAX_PRUNE_BATCHES = 40;

let isRunning = false;

export async function rollupAiUsage(): Promise<void> {
  await db.execute(sql`
    INSERT INTO ai_usage_daily (
      date, feature_key, provider, model_id, operation,
      requests, success_count, fallback_count, failed_count,
      input_tokens, output_tokens, unit_count, estimated_cost_usd,
      avg_latency_ms, p50_latency_ms, p95_latency_ms
    )
    SELECT
      created_at::date,
      feature_key, provider, model_id, operation,
      COUNT(*)::int,
      (COUNT(*) FILTER (WHERE status = 'success'))::int,
      (COUNT(*) FILTER (WHERE status = 'fallback'))::int,
      (COUNT(*) FILTER (WHERE status = 'failed'))::int,
      COALESCE(SUM(input_tokens), 0)::bigint,
      COALESCE(SUM(output_tokens), 0)::bigint,
      COALESCE(SUM(unit_count), 0)::int,
      COALESCE(SUM(estimated_cost_usd), 0)::real,
      COALESCE(AVG(latency_ms) FILTER (WHERE status <> 'failed'), 0)::real,
      COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status <> 'failed'), 0)::real,
      COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status <> 'failed'), 0)::real
    FROM ai_usage_logs
    WHERE created_at >= (CURRENT_DATE - INTERVAL '3 days')
      AND created_at < CURRENT_DATE
    GROUP BY 1, 2, 3, 4, 5
    ON CONFLICT (date, feature_key, provider, model_id, operation) DO UPDATE SET
      requests = EXCLUDED.requests,
      success_count = EXCLUDED.success_count,
      fallback_count = EXCLUDED.fallback_count,
      failed_count = EXCLUDED.failed_count,
      input_tokens = EXCLUDED.input_tokens,
      output_tokens = EXCLUDED.output_tokens,
      unit_count = EXCLUDED.unit_count,
      estimated_cost_usd = EXCLUDED.estimated_cost_usd,
      avg_latency_ms = EXCLUDED.avg_latency_ms,
      p50_latency_ms = EXCLUDED.p50_latency_ms,
      p95_latency_ms = EXCLUDED.p95_latency_ms
  `);
}

async function pruneOldLogs(): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_PRUNE_BATCHES; i++) {
    const result = (await db.execute(sql`
      DELETE FROM ai_usage_logs
      WHERE id IN (
        SELECT id FROM ai_usage_logs
        WHERE created_at < NOW() - (${RETENTION_DAYS} || ' days')::interval
        LIMIT ${PRUNE_BATCH}
      )
    `)) as { rowCount?: number; rows?: unknown[] };
    const deleted = result?.rowCount ?? result?.rows?.length ?? 0;
    total += deleted;
    if (deleted < PRUNE_BATCH) break;
  }
  return total;
}

async function tick() {
  if (!isLeader()) return;
  if (isRunning) return;
  isRunning = true;
  try {
    await rollupAiUsage();
    const pruned = await pruneOldLogs();
    console.log(`[AI Usage Rollup] done${pruned > 0 ? ` — pruned ${pruned} old log rows` : ''}`);
  } catch (error) {
    console.error('[AI Usage Rollup] failed:', error);
  } finally {
    isRunning = false;
  }
}

export function startAiUsageRollupJob() {
  cron.schedule('20 3 * * *', tick);
  console.log('[AI Usage Rollup] job started (daily 03:20, leader-only ticks)');
}
