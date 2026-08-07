import { pool } from "../db";
import { withCache } from "../memoryCache";

/**
 * Buffered article view-count increments.
 *
 * Hot path never locks `articles` rows (that contended with editorial PATCH and
 * caused statement_timeout 57014 on viral articles — 2026-08-06). Flow:
 *   1) memory Map per articleId
 *   2) flush → UPSERT article_view_deltas.pending
 *   3) merge → articles.views += pending (SKIP LOCKED, short timeouts)
 *
 * Readers still see articles.views; visibility lags by one flush+merge window.
 */

const FLUSH_INTERVAL_MS = 10_000;
const MERGE_INTERVAL_MS = 10_000;
/** صغر الدفعة — عبارات قصيرة تحت ضغط الذروة. */
const CHUNK_SIZE = Number(process.env.VIEW_COUNTER_CHUNK_SIZE) || 50;
const MERGE_CHUNK_SIZE = Number(process.env.VIEW_COUNTER_MERGE_CHUNK_SIZE) || 50;
const MAX_PENDING = Number(process.env.VIEW_COUNTER_MAX_PENDING) || 50_000;
const FLUSH_LOCK_TIMEOUT_MS = Number(process.env.VIEW_COUNTER_LOCK_TIMEOUT_MS) || 1_000;
const FLUSH_STATEMENT_TIMEOUT_MS = Number(process.env.VIEW_COUNTER_STATEMENT_TIMEOUT_MS) || 3_000;
const MERGE_LOCK_TIMEOUT_MS = Number(process.env.VIEW_COUNTER_MERGE_LOCK_TIMEOUT_MS) || 1_000;
const MERGE_STATEMENT_TIMEOUT_MS = Number(process.env.VIEW_COUNTER_MERGE_STATEMENT_TIMEOUT_MS) || 3_000;

const pending = new Map<string, number>();
let flushing = false;
let merging = false;
let droppedSinceWarn = 0;
let flushTimer: NodeJS.Timeout | null = null;
let mergeTimer: NodeJS.Timeout | null = null;

/**
 * قراءة العدّاد الحي بكاش قصير (10s) و single-flight — بدل SELECT لكل طلب.
 * الدمج إلى articles.views يجري كل ~10s أصلًا، فالكاش لا يضيف تأخيرًا يُذكر،
 * لكنه يحوّل آلاف قراءات ذروة العاجل إلى استعلام واحد لكل مقال كل 10 ثوانٍ.
 * المفتاح يحمل الـid فيُبطل مع كتابة المقال (الإبطال الموجّه في contentInvalidation).
 */
const LIVE_VIEWS_CACHE_MS = 10_000;
export function getLiveArticleViews(articleId: string): Promise<number | null> {
  return withCache(`article:views:${articleId}`, LIVE_VIEWS_CACHE_MS, async () => {
    const { rows } = await pool.query("SELECT views FROM articles WHERE id = $1 LIMIT 1", [articleId]);
    return rows.length ? Number(rows[0].views ?? 0) : null;
  });
}

/** Queue a view-count increment for an article (cheap, non-blocking). */
export function bufferArticleViewIncrement(articleId: string, increment: number): void {
  if (!articleId || !Number.isFinite(increment) || increment <= 0) return;
  if (!pending.has(articleId) && pending.size >= MAX_PENDING) {
    droppedSinceWarn += 1;
    return;
  }
  pending.set(articleId, (pending.get(articleId) || 0) + Math.floor(increment));
}

async function withLocalTimeouts<T>(
  lockMs: number,
  statementMs: number,
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${lockMs}ms'`);
    await client.query(`SET LOCAL statement_timeout = '${statementMs}ms'`);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * تفريغ الذاكرة إلى article_view_deltas فقط — بلا قفل على articles.
 */
async function flushChunk(chunk: [string, number][]): Promise<void> {
  const params: unknown[] = [];
  const values = chunk
    .map(([id, inc], i) => {
      const o = i * 2;
      params.push(id, inc);
      return `($${o + 1}::text, $${o + 2}::int, now())`;
    })
    .join(", ");

  await withLocalTimeouts(FLUSH_LOCK_TIMEOUT_MS, FLUSH_STATEMENT_TIMEOUT_MS, async (client) => {
    await client.query(
      `INSERT INTO article_view_deltas (article_id, pending, updated_at)
       VALUES ${values}
       ON CONFLICT (article_id) DO UPDATE SET
         pending = article_view_deltas.pending + EXCLUDED.pending,
         updated_at = now()`,
      params,
    );
  });
}

export async function flushArticleViewCounters(): Promise<void> {
  if (flushing || pending.size === 0) return;
  flushing = true;
  const batch = [...pending.entries()];
  pending.clear();
  const startedAt = Date.now();
  let failedRows = 0;

  try {
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE);
      try {
        await flushChunk(chunk);
      } catch (err: any) {
        failedRows += chunk.length;
        for (const [id, inc] of chunk) {
          pending.set(id, (pending.get(id) || 0) + inc);
        }
        console.error(
          `[ArticleViewCounter] فشلت دفعة deltas (${chunk.length} مقالًا، code=${err?.code ?? "?"}) — أُعيدت للانتظار: ${err?.message ?? err}`,
        );
        if (err?.code !== "55P03" && err?.code !== "57014") {
          for (const [id, inc] of batch.slice(i + CHUNK_SIZE)) {
            pending.set(id, (pending.get(id) || 0) + inc);
          }
          break;
        }
      }
    }
  } finally {
    flushing = false;
    const elapsed = Date.now() - startedAt;
    if (elapsed > 1_000 || failedRows > 0) {
      console.warn(
        `[ArticleViewCounter] دفق deltas ${batch.length} مقالًا في ${elapsed}ms (فشل ${failedRows}، متبقٍ ذاكرة ${pending.size})`,
      );
    }
    if (droppedSinceWarn > 0) {
      console.warn(
        `[ArticleViewCounter] بلغ المخزن سقفه (${MAX_PENDING}) — أُسقطت ${droppedSinceWarn} زيادة مشاهدة`,
      );
      droppedSinceWarn = 0;
    }
  }
}

/**
 * دمج دفعة من article_view_deltas إلى articles.views.
 * SKIP LOCKED: صف تحت تحرير المحرر يُؤجَّل دون حبس PATCH.
 */
export async function mergeArticleViewDeltas(): Promise<void> {
  if (merging) return;
  merging = true;
  const startedAt = Date.now();
  let merged = 0;
  let deferred = 0;

  try {
    const outcome = await withLocalTimeouts(
      MERGE_LOCK_TIMEOUT_MS,
      MERGE_STATEMENT_TIMEOUT_MS,
      async (client) => {
        const result = await client.query(
          `WITH picked AS (
             SELECT d.article_id, d.pending
               FROM article_view_deltas AS d
              WHERE d.pending > 0
              ORDER BY d.updated_at ASC
              LIMIT $1
                FOR UPDATE OF d SKIP LOCKED
           ),
           locked_articles AS MATERIALIZED (
             SELECT a.id, p.pending
               FROM articles AS a
               JOIN picked AS p ON p.article_id = a.id
                FOR UPDATE OF a SKIP LOCKED
           ),
           applied AS (
             UPDATE articles AS a
                SET views = COALESCE(a.views, 0) + l.pending
               FROM locked_articles AS l
              WHERE a.id = l.id
              RETURNING a.id, l.pending
           ),
           cleared AS (
             DELETE FROM article_view_deltas AS d
              USING applied AS ap
              WHERE d.article_id = ap.id
              RETURNING d.article_id
           ),
           orphaned AS (
             DELETE FROM article_view_deltas AS d
              USING picked AS p
              WHERE d.article_id = p.article_id
                AND NOT EXISTS (SELECT 1 FROM articles AS a WHERE a.id = p.article_id)
              RETURNING d.article_id
           )
           SELECT
             (SELECT count(*)::int FROM applied) AS merged,
             (SELECT count(*)::int FROM picked)
               - (SELECT count(*)::int FROM applied)
               - (SELECT count(*)::int FROM orphaned) AS deferred`,
          [MERGE_CHUNK_SIZE],
        );
        const row = result.rows[0] as { merged: number; deferred: number } | undefined;
        return {
          merged: Number(row?.merged ?? 0),
          deferred: Number(row?.deferred ?? 0),
        };
      },
    );
    merged = outcome.merged;
    deferred = outcome.deferred;
  } catch (err: any) {
    console.error(
      `[ArticleViewCounter] فشل دمج deltas (code=${err?.code ?? "?"}): ${err?.message ?? err}`,
    );
  } finally {
    merging = false;
    const elapsed = Date.now() - startedAt;
    if (elapsed > 1_000 || merged > 0 || deferred > 0) {
      console.warn(
        `[ArticleViewCounter] دمج ${merged} مقالًا في ${elapsed}ms (مؤجل بقفل ${deferred})`,
      );
    }
  }
}

/** Start periodic flush + merge + flush-on-shutdown. Idempotent. */
export function initArticleViewCounters(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushArticleViewCounters();
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();

  mergeTimer = setInterval(() => {
    void mergeArticleViewDeltas();
  }, MERGE_INTERVAL_MS);
  mergeTimer.unref?.();

  const onExit = () => {
    void (async () => {
      await flushArticleViewCounters();
      await mergeArticleViewDeltas();
    })();
  };
  process.on("SIGTERM", onExit);
  process.on("SIGINT", onExit);
}
