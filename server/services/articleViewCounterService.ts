import { pool } from "../db";

/**
 * Buffered article view-count increments.
 *
 * POST /api/articles/:id/view used to run a synchronous
 *   UPDATE articles SET views = views + <boost> WHERE id = ?
 * on the request path. Under load this both (a) added DB latency to every view
 * and (b) serialized concurrent UPDATEs on the same hot article row, which — on
 * a pool starved by slow search queries — showed up as multi-second /view
 * requests in prod logs.
 *
 * Increments are now accumulated in memory per article and flushed in a single
 * batched UPDATE every FLUSH_INTERVAL_MS, collapsing N per-view writes into one
 * write per article per window. Tradeoff: the counter's increase becomes visible
 * on the reader's NEXT load rather than instantly (bounded by the flush window).
 */

const FLUSH_INTERVAL_MS = 10_000;

const pending = new Map<string, number>();
let flushing = false;
let timer: NodeJS.Timeout | null = null;

/** Queue a view-count increment for an article (cheap, non-blocking). */
export function bufferArticleViewIncrement(articleId: string, increment: number): void {
  if (!articleId || !Number.isFinite(increment) || increment <= 0) return;
  pending.set(articleId, (pending.get(articleId) || 0) + Math.floor(increment));
}

export async function flushArticleViewCounters(): Promise<void> {
  if (flushing || pending.size === 0) return;
  flushing = true;
  const batch = [...pending.entries()];
  pending.clear();
  try {
    const params: any[] = [];
    const values = batch
      .map(([id, inc], i) => {
        const o = i * 2;
        params.push(id, inc);
        return `($${o + 1}::text, $${o + 2}::int)`;
      })
      .join(", ");

    await pool.query(
      `UPDATE articles AS a
         SET views = COALESCE(a.views, 0) + v.inc
        FROM (VALUES ${values}) AS v(id, inc)
       WHERE a.id = v.id`,
      params,
    );
  } catch (err) {
    console.error("[ArticleViewCounter] flush failed, re-buffering:", err);
    // Merge failed increments back so they're retried next tick.
    for (const [id, inc] of batch) {
      pending.set(id, (pending.get(id) || 0) + inc);
    }
  } finally {
    flushing = false;
  }
}

/** Start the periodic flush + flush-on-shutdown. Idempotent. */
export function initArticleViewCounters(): void {
  if (timer) return;
  timer = setInterval(flushArticleViewCounters, FLUSH_INTERVAL_MS);
  timer.unref?.();
  const onExit = () => { void flushArticleViewCounters(); };
  process.on("SIGTERM", onExit);
  process.on("SIGINT", onExit);
}
