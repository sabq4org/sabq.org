/**
 * READ-ONLY production check for the media-library schema rollout.
 *
 * After merging the media PRs, every `db.select(getTableColumns(mediaFiles))`
 * (e.g. getArticleMediaAssetWithDetails) and the upload response projection
 * select the schema-defined columns. If prod is missing any, those queries 500
 * — exactly the /api/.../media-assets and /api/media/upload errors observed.
 *
 * This script ONLY reads information_schema. No writes.
 *   Run: railway run tsx scripts/diagnose-media-schema.ts
 */
import { pool } from "../server/db";

const PHASE2 = ["ai_analysis_status", "ai_analyzed_at", "ai_quality_score", "ai_has_sensitive_content"];
const PHASE6 = ["license_type", "credit_text", "copyright_holder", "rights_verified", "rights_note"];

async function main() {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'media_files'
       ORDER BY column_name`,
  );
  const present = new Set(rows.map((r: any) => r.column_name));

  const missing2 = PHASE2.filter((c) => !present.has(c));
  const missing6 = PHASE6.filter((c) => !present.has(c));

  const mv = await pool.query(`SELECT to_regclass('public.media_vectors') AS t`);
  const mvExists = !!mv.rows[0]?.t;

  console.log("=== PRODUCTION media_files schema check ===");
  console.log("Phase 2 (auto-tag) columns:", missing2.length ? `MISSING → ${missing2.join(", ")}` : "✅ all present");
  console.log("Phase 6 (rights) columns:  ", missing6.length ? `MISSING → ${missing6.join(", ")}` : "✅ all present (Phase 6 already applied?)");
  console.log("Phase 3 media_vectors table:", mvExists ? "✅ exists" : "❌ MISSING");
  console.log("");
  if (missing2.length) {
    console.log(">>> ROOT CAUSE: Phase 2 columns missing → media-assets + upload 500. Apply the Phase 2 ALTER.");
  } else if (!mvExists) {
    console.log(">>> Phase 2 OK. media_vectors missing → only semantic-search affected (not media-assets/upload).");
  } else {
    console.log(">>> Schema looks complete. The 500 is NOT a missing-column issue — check server logs.");
  }

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("DIAGNOSTIC ERROR:", e?.message || e);
  process.exit(1);
});
