import { registerShutdownHook } from "../shutdown";
import crypto from "crypto";
import { pool } from "../db";
import {
  ArticleViewStatsBuffer,
  type PendingArticleView,
} from "./articleViewStatsBuffer";

/**
 * Per-IP article view stats.
 *
 * The IP is never stored raw — only a salted SHA-256 hash, which still lets us
 * count distinct IPs and per-IP view distribution while not retaining PII.
 * Writes are buffered in memory and flushed in a single batched UPSERT every
 * FLUSH_INTERVAL_MS, so the per-view cost on the request path is ~zero (an array
 * push). The aggregate grows with the number of DISTINCT IPs, not pageviews.
 *
 * recordArticleView() is called ONLY for COUNTED views (after the 5-min dedup in
 * POST /api/articles/:id/view), so views_count == genuine counted views per IP.
 */

const IP_HASH_SALT = process.env.VIEW_IP_HASH_SALT || "sabq-view-ip-hash-v1";
const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_CHUNK_SIZE = 100;
const FLUSH_LOCK_TIMEOUT_MS = 1_000;
const FLUSH_STATEMENT_TIMEOUT_MS = 5_000;

const buffer = new ArticleViewStatsBuffer();
let flushing = false;
let timer: NodeJS.Timeout | null = null;

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(`${IP_HASH_SALT}|${ip}`).digest("hex");
}

/** Queue a counted view for the per-IP aggregate (cheap, non-blocking). */
export function recordArticleView(articleId: string, ip: string, userId?: string | null): void {
  if (!articleId || !ip || ip === "unknown") return;
  buffer.add(articleId, hashIp(ip), userId || null);
}

async function flushChunk(rows: PendingArticleView[]): Promise<void> {
  const params: any[] = [];
  const values = rows
    .map((row, index) => {
      const offset = index * 4;
      params.push(row.articleId, row.ipHash, row.userId, row.count);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, now(), now())`;
    })
    .join(", ");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${FLUSH_LOCK_TIMEOUT_MS}ms'`);
    await client.query(`SET LOCAL statement_timeout = '${FLUSH_STATEMENT_TIMEOUT_MS}ms'`);
    await client.query(
      `INSERT INTO article_ip_views (article_id, ip_hash, user_id, views_count, first_seen, last_seen)
       VALUES ${values}
       ON CONFLICT (article_id, ip_hash)
       DO UPDATE SET views_count = article_ip_views.views_count + EXCLUDED.views_count,
                     last_seen = now(),
                     user_id = COALESCE(article_ip_views.user_id, EXCLUDED.user_id)`,
      params,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function flushArticleViewStats(): Promise<void> {
  if (flushing || buffer.size === 0) return;
  flushing = true;
  const batch = buffer.drain();
  try {
    for (let offset = 0; offset < batch.length; offset += FLUSH_CHUNK_SIZE) {
      const chunk = batch.slice(offset, offset + FLUSH_CHUNK_SIZE);
      try {
        await flushChunk(chunk);
      } catch (error: any) {
        for (const row of chunk) {
          buffer.add(row.articleId, row.ipHash, row.userId, row.count);
        }

        console.warn("[ArticleViewStats] chunk deferred", {
          rows: chunk.length,
          code: error?.code || "unknown",
          pending: buffer.size,
        });

        // A lock/statement timeout usually means one article is being edited;
        // continue so unrelated chunks still flush. Infrastructure failures
        // would affect every chunk, so requeue the remainder without hammering DB.
        if (error?.code !== "55P03" && error?.code !== "57014") {
          for (const row of batch.slice(offset + chunk.length)) {
            buffer.add(row.articleId, row.ipHash, row.userId, row.count);
          }
          break;
        }
      }
    }
  } finally {
    flushing = false;
  }
}

/** Start the periodic flush + flush-on-shutdown. Idempotent. */
export function initArticleViewStats(): void {
  if (timer) return;
  timer = setInterval(flushArticleViewStats, FLUSH_INTERVAL_MS);
  registerShutdownHook("article-ip-views", async () => {
    if (timer) clearInterval(timer);
    while (flushing) await new Promise(resolve => setTimeout(resolve, 25));
    await flushArticleViewStats();
    if (buffer.size) throw new Error("Article IP view buffer remains unflushed");
  });
}

export interface ArticleIpBreakdown {
  distinctIps: number;
  totalCountedViews: number;
  storedViews: number; // the boosted articles.views counter, for comparison
  topIps: Array<{ ipRef: string; views: number; firstSeen: Date; lastSeen: Date }>;
}

/** On-demand report — runs only when an admin asks, never during browsing. */
export async function getArticleIpBreakdown(articleId: string, limit = 50): Promise<ArticleIpBreakdown> {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const [totals, top, stored] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS distinct_ips, COALESCE(sum(views_count), 0)::int AS total_views
         FROM article_ip_views WHERE article_id = $1`,
      [articleId],
    ),
    pool.query(
      `SELECT ip_hash, views_count, first_seen, last_seen
         FROM article_ip_views WHERE article_id = $1
        ORDER BY views_count DESC, last_seen DESC
        LIMIT $2`,
      [articleId, safeLimit],
    ),
    pool.query(`SELECT views FROM articles WHERE id = $1`, [articleId]),
  ]);

  return {
    distinctIps: totals.rows[0].distinct_ips,
    totalCountedViews: totals.rows[0].total_views,
    storedViews: stored.rows[0]?.views ?? 0,
    topIps: top.rows.map((r: any) => ({
      ipRef: String(r.ip_hash).slice(0, 12), // short, non-reversible reference label
      views: r.views_count,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    })),
  };
}
