/**
 * Create the article_ip_views table on the target DB (additive, idempotent).
 * Matches the Drizzle definition in shared/schema.ts. We apply DDL via SQL
 * (not `db:push`) per project convention — db:push must never run against prod.
 *
 * SAFE BY DEFAULT: prints the plan but writes nothing unless --apply is passed.
 * The DDL is CREATE … IF NOT EXISTS, so re-running is harmless.
 *
 * USAGE: railway run npx tsx scripts/apply-article-ip-views-table.ts [--apply]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
const { pool } = await import("../server/db");

const apply = process.argv.includes("--apply");

const DDL = [
  `CREATE TABLE IF NOT EXISTS article_ip_views (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     article_id varchar NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
     ip_hash varchar(64) NOT NULL,
     user_id varchar,
     views_count integer NOT NULL DEFAULT 0,
     first_seen timestamp NOT NULL DEFAULT now(),
     last_seen timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_article_ip_views_article_ip ON article_ip_views (article_id, ip_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_article_ip_views_article ON article_ip_views (article_id)`,
];

async function main() {
  console.log("\n  article_ip_views DDL:");
  for (const stmt of DDL) console.log("    • " + stmt.split("\n")[0].trim());

  if (!apply) {
    console.log("\n  DRY RUN — pass --apply to execute.\n");
    return;
  }
  for (const stmt of DDL) {
    await pool.query(stmt);
  }
  const check = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'article_ip_views'`,
  );
  console.log(`\n  ✅ Applied. table exists = ${check.rows[0].n === 1}\n`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("apply-article-ip-views-table error:", e);
    return pool.end().finally(() => process.exit(1));
  });
