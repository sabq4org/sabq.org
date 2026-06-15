import crypto from "crypto";
import { pool } from "../db";

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

type Pending = { articleId: string; ipHash: string; userId: string | null };

const buffer: Pending[] = [];
let flushing = false;
let timer: NodeJS.Timeout | null = null;

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(`${IP_HASH_SALT}|${ip}`).digest("hex");
}

/** Queue a counted view for the per-IP aggregate (cheap, non-blocking). */
export function recordArticleView(articleId: string, ip: string, userId?: string | null): void {
  if (!articleId || !ip || ip === "unknown") return;
  buffer.push({ articleId, ipHash: hashIp(ip), userId: userId || null });
}

export async function flushArticleViewStats(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0);
  try {
    // Collapse the batch to one row per (article, ipHash) before hitting the DB.
    const agg = new Map<string, { articleId: string; ipHash: string; userId: string | null; count: number }>();
    for (const e of batch) {
      const key = `${e.articleId}|${e.ipHash}`;
      const cur = agg.get(key);
      if (cur) {
        cur.count += 1;
        if (!cur.userId && e.userId) cur.userId = e.userId;
      } else {
        agg.set(key, { articleId: e.articleId, ipHash: e.ipHash, userId: e.userId, count: 1 });
      }
    }

    const rows = [...agg.values()];
    const params: any[] = [];
    const values = rows
      .map((r, i) => {
        const o = i * 4;
        params.push(r.articleId, r.ipHash, r.userId, r.count);
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, now(), now())`;
      })
      .join(", ");

    await pool.query(
      `INSERT INTO article_ip_views (article_id, ip_hash, user_id, views_count, first_seen, last_seen)
       VALUES ${values}
       ON CONFLICT (article_id, ip_hash)
       DO UPDATE SET views_count = article_ip_views.views_count + EXCLUDED.views_count,
                     last_seen = now(),
                     user_id = COALESCE(article_ip_views.user_id, EXCLUDED.user_id)`,
      params,
    );
  } catch (err) {
    console.error("[ArticleViewStats] flush failed, re-buffering:", err);
    buffer.push(...batch);
  } finally {
    flushing = false;
  }
}

/** Start the periodic flush + flush-on-shutdown. Idempotent. */
export function initArticleViewStats(): void {
  if (timer) return;
  timer = setInterval(flushArticleViewStats, FLUSH_INTERVAL_MS);
  const onExit = () => { void flushArticleViewStats(); };
  process.on("SIGTERM", onExit);
  process.on("SIGINT", onExit);
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
