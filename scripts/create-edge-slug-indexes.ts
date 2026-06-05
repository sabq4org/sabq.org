/**
 * Create englishSlug indexes to speed up /api/edge/slug-redirect.
 *
 * Why: that endpoint is hit on (nearly) every HTML pageview by the Cloudflare
 * worker and was running 1–3.4s ([APM] Slow request warnings, 2026-06-05). It
 * filters articles with OR(english_slug, slug); english_slug was unindexed →
 * sequential scan. These indexes mirror the definitions added to
 * shared/schema.ts (same names), so a later `db:push` treats them as present.
 *
 * SAFE on a live DB: CREATE INDEX CONCURRENTLY does NOT lock the table for
 * writes. It cannot run inside a transaction, so we issue each statement on a
 * plain autocommit connection (node-postgres does not wrap single queries in a
 * transaction). IF NOT EXISTS makes it idempotent.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/create-edge-slug-indexes.ts
 *
 * Run this BEFORE any `db:push` so push never attempts a blocking CREATE INDEX
 * on these columns.
 */
import { Client } from "pg";

const STATEMENTS = [
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_english_slug ON articles (english_slug)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_en_articles_english_slug ON en_articles (english_slug)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ur_articles_english_slug ON ur_articles (english_slug)",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const sql of STATEMENTS) {
      console.log(`> ${sql}`);
      const started = Date.now();
      await client.query(sql);
      console.log(`  done in ${Date.now() - started}ms`);
    }
    console.log("✅ All edge slug-redirect indexes ensured.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Failed to create indexes:", err);
  process.exit(1);
});
