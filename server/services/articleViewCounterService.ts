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
/**
 * عدد المقالات في عبارة UPDATE واحدة.
 *
 * كانت الدفعة كلها تُرسَل في عبارة واحدة مهما بلغ حجمها. على موقع أخبار
 * تُشاهَد فيه آلاف المقالات في نافذة العشر ثوانٍ، تصير العبارة آلاف صفوف
 * VALUES تحتجز اتصال المسبح وأقفال صفوف على `articles` طوال تنفيذها. ومع
 * سقف statement_timeout المضاف 2026-07-25 صارت تُلغى بـ57014 وتُعاد الدفعة
 * كاملة إلى الانتظار — فتكبر بمشاهدات الفترة التالية وتفشل ثانيةً. حلقة
 * لا تتقارب. التقسيم يجعل كل عبارة قصيرة ومستقلة.
 */
const CHUNK_SIZE = Number(process.env.VIEW_COUNTER_CHUNK_SIZE) || 500;
/**
 * سقف المخزن المؤقت. المفتاح هو معرّف المقال فالحجم محدود بعدد المقالات
 * المتميّزة لا بعدد المشاهدات، لكن لو تعذّر التفريغ طويلًا فلا داعي لنموّ
 * بلا حد: عدّاد مشاهدات ليس سببًا كافيًا لخنق العملية.
 */
const MAX_PENDING = Number(process.env.VIEW_COUNTER_MAX_PENDING) || 50_000;

const pending = new Map<string, number>();
let flushing = false;
let droppedSinceWarn = 0;
let timer: NodeJS.Timeout | null = null;

/** Queue a view-count increment for an article (cheap, non-blocking). */
export function bufferArticleViewIncrement(articleId: string, increment: number): void {
  if (!articleId || !Number.isFinite(increment) || increment <= 0) return;
  if (!pending.has(articleId) && pending.size >= MAX_PENDING) {
    droppedSinceWarn += 1;
    return;
  }
  pending.set(articleId, (pending.get(articleId) || 0) + Math.floor(increment));
}

/** تحديث دفعة واحدة — عبارة قصيرة مستقلة، فشلها لا يُسقط بقية الدفعات. */
async function flushChunk(chunk: [string, number][]): Promise<void> {
  const params: any[] = [];
  const values = chunk
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
        // فشل دفعة واحدة لا يُسقط الباقي — تُعاد وحدها إلى الانتظار.
        failedRows += chunk.length;
        for (const [id, inc] of chunk) {
          pending.set(id, (pending.get(id) || 0) + inc);
        }
        console.error(
          `[ArticleViewCounter] فشلت دفعة (${chunk.length} مقالًا، code=${err?.code ?? "?"}) — أُعيدت للانتظار: ${err?.message ?? err}`,
        );
      }
    }
  } finally {
    flushing = false;
    const elapsed = Date.now() - startedAt;
    // سطر مرئي فقط عند وجود ما يستحق النظر — الحجم هو ما كان مجهولًا.
    if (elapsed > 1_000 || failedRows > 0) {
      console.warn(
        `[ArticleViewCounter] دفق ${batch.length} مقالًا في ${elapsed}ms (فشل ${failedRows}، متبقٍ ${pending.size})`,
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

/** Start the periodic flush + flush-on-shutdown. Idempotent. */
export function initArticleViewCounters(): void {
  if (timer) return;
  timer = setInterval(flushArticleViewCounters, FLUSH_INTERVAL_MS);
  timer.unref?.();
  const onExit = () => { void flushArticleViewCounters(); };
  process.on("SIGTERM", onExit);
  process.on("SIGINT", onExit);
}
