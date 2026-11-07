import { pool } from "../db";

/**
 * Real article opens per 10-minute bucket (table `article_open_buckets`).
 *
 * Every counted open (web POST /api/articles/:id/view after its dwell + dedup
 * gate, app /api/v1/articles/:id/view, offline batch-view) adds 1 here, with no
 * 5-10 boost. It feeds «مرات فتح الأخبار» and the hourly chart on the newsroom
 * dashboard. Memory buffer → one UPSERT per bucket on each view-counter flush
 * (~10s). The table is optional: until the migration runs, flushes fail with
 * 42P01, are dropped quietly, and the dashboard falls back to the old query.
 */

export const OPEN_BUCKET_MS = 10 * 60 * 1000;
const MAX_BUCKETS = 500;
const LOCK_TIMEOUT_MS = 1_000;
const STATEMENT_TIMEOUT_MS = 3_000;

const pendingOpens = new Map<number, number>();
let flushingOpens = false;
let missingTableWarned = false;

export function openBucketStart(at: Date | number): number {
  const ms = typeof at === "number" ? at : at.getTime();
  return ms - (ms % OPEN_BUCKET_MS);
}

/** Add real opens to the current bucket (cheap, non-blocking). */
export function recordArticleOpens(opens: number, at: number = Date.now()): void {
  if (!Number.isFinite(opens) || opens <= 0) return;
  const bucket = openBucketStart(at);
  if (!pendingOpens.has(bucket) && pendingOpens.size >= MAX_BUCKETS) return;
  pendingOpens.set(bucket, (pendingOpens.get(bucket) || 0) + Math.floor(opens));
}

/** Test helper: what is waiting to be flushed. */
export function peekPendingOpens(): Array<[number, number]> {
  return [...pendingOpens.entries()].sort((a, b) => a[0] - b[0]);
}

export async function flushArticleOpenBuckets(): Promise<void> {
  if (flushingOpens || pendingOpens.size === 0) return;
  flushingOpens = true;
  const batch = [...pendingOpens.entries()];
  pendingOpens.clear();

  const params: unknown[] = [];
  const values = batch
    .map(([bucket, opens], i) => {
      params.push(new Date(bucket).toISOString(), opens);
      return `($${i * 2 + 1}::timestamptz, $${i * 2 + 2}::int, now())`;
    })
    .join(", ");

  let client: import("pg").PoolClient | null = null;
  try {
    const conn = await pool.connect();
    client = conn;
    await conn.query("BEGIN");
    await conn.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
    await conn.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
    await conn.query(
      `INSERT INTO article_open_buckets (bucket_start, opens, updated_at)
       VALUES ${values}
       ON CONFLICT (bucket_start) DO UPDATE SET
         opens = article_open_buckets.opens + EXCLUDED.opens,
         updated_at = now()`,
      params,
    );
    await conn.query("COMMIT");
  } catch (err: any) {
    await client?.query("ROLLBACK").catch(() => {});
    if (err?.code === "42P01" || err?.code === "42501") {
      // Table not created / not granted yet: drop (bounded), warn once.
      if (!missingTableWarned) {
        missingTableWarned = true;
        console.warn(`[ArticleOpens] article_open_buckets غير جاهز (code=${err.code}) — العدّاد متوقف حتى تنفيذ migrations/20261107_article_open_buckets.sql`);
      }
    } else {
      for (const [bucket, opens] of batch) {
        if (!pendingOpens.has(bucket) && pendingOpens.size >= MAX_BUCKETS) continue;
        pendingOpens.set(bucket, (pendingOpens.get(bucket) || 0) + opens);
      }
      console.warn(`[ArticleOpens] تأجيل ${batch.length} خانة (code=${err?.code ?? "?"}): ${err?.message ?? err}`);
    }
  } finally {
    client?.release();
    flushingOpens = false;
  }
}
