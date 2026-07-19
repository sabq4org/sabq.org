/**
 * READ-ONLY report for a single article by slug.
 * Shows the aggregate `views` counter and — because organic per-view IPs are NOT
 * stored — the ONLY IP-linked signal that exists: native_ad_impressions (ad views
 * inside the article, a partial proxy that only exists if native ads were served).
 *
 * USAGE: railway run npx tsx scripts/article-view-report.ts <slug>
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
const { pool } = await import("../server/db");

const slug = process.argv[2];
if (!slug) { console.error("Usage: ... article-view-report.ts <slug>"); process.exit(1); }

async function main() {
  const a = await pool.query(
    `SELECT id, slug, english_slug, article_type, views, status,
            published_at, created_at, title
       FROM articles WHERE slug = $1 OR english_slug = $1 LIMIT 1`,
    [slug],
  );
  if (a.rows.length === 0) { console.log(`❌ No article for slug ${slug}`); return; }
  const art = a.rows[0];
  console.log("\n==================================================================");
  console.log("  ARTICLE VIEW REPORT (read-only)");
  console.log("==================================================================");
  console.log(`  title        : ${art.title}`);
  console.log(`  id           : ${art.id}`);
  console.log(`  type/status  : ${art.article_type} / ${art.status}`);
  console.log(`  published_at : ${art.published_at}`);
  console.log(`  views (stored aggregate counter): ${art.views}`);
  console.log(`  NOTE: each counted view increments the counter by a RANDOM 5–10,`);
  console.log(`        so this number is NOT a literal visit count.`);

  // Per-IP view breakdown (article_ip_views — forward-only, fills after deploy).
  let hasTable = true;
  let totals: any = { rows: [{ distinct_ips: 0, total_views: 0 }] };
  let topIps: any = { rows: [] };
  try {
    totals = await pool.query(
      `SELECT count(*)::int AS distinct_ips, COALESCE(sum(views_count),0)::int AS total_views
         FROM article_ip_views WHERE article_id = $1`,
      [art.id],
    );
    topIps = await pool.query(
      `SELECT ip_hash, views_count, last_seen
         FROM article_ip_views WHERE article_id = $1
        ORDER BY views_count DESC LIMIT 20`,
      [art.id],
    );
  } catch {
    hasTable = false;
  }

  console.log("\n------------------------------------------------------------------");
  console.log("  per-IP view breakdown (article_ip_views, hashed IPs)");
  console.log("------------------------------------------------------------------");
  if (!hasTable) {
    console.log("  (table article_ip_views not created yet — apply DDL + deploy first)");
  } else {
    console.log(`  distinct IPs        : ${totals.rows[0].distinct_ips}`);
    console.log(`  counted views (real): ${totals.rows[0].total_views}   (vs boosted counter ${art.views})`);
    if (topIps.rows.length) {
      console.log(`  top IPs by counted views:`);
      for (const r of topIps.rows) {
        console.log(`    ${String(r.ip_hash).slice(0, 12)}…  views=${String(r.views_count).padStart(5)}  last=${r.last_seen ? new Date(r.last_seen).toISOString().slice(0, 16) : "—"}`);
      }
    } else {
      console.log(`  (no per-IP rows yet for this article)`);
    }
  }
  console.log("==================================================================\n");
}

main().then(() => pool.end()).catch((e) => {
  console.error("article-view-report error:", e);
  return pool.end().finally(() => process.exit(1));
});
