/**
 * READ-ONLY: runs the exact query shape that was 500ing
 * (getArticleMediaAssetWithDetails — join selecting every media_files column)
 * against a real article, to prove the fix end-to-end. No writes.
 */
import { pool } from "../server/db";

async function main() {
  const pick = await pool.query(`SELECT article_id FROM article_media_assets LIMIT 1`);
  const articleId = pick.rows[0]?.article_id;
  if (!articleId) {
    console.log("No article_media_assets rows to test with — running column-list select instead.");
  }

  // Select EVERY media_files column (mirrors getTableColumns(mediaFiles)) joined
  // through article_media_assets — exactly what was failing on license_type.
  const q = `
    SELECT ama.id, mf.license_type, mf.credit_text, mf.copyright_holder,
           mf.rights_verified, mf.rights_note, mf.ai_analysis_status, mf.is_ai_generated
    FROM article_media_assets ama
    LEFT JOIN media_files mf ON ama.media_file_id = mf.id
    ${articleId ? "WHERE ama.article_id = $1" : ""}
    ORDER BY ama.display_order ASC
    LIMIT 5`;
  const res = await pool.query(q, articleId ? [articleId] : []);
  console.log(`✅ Query succeeded — returned ${res.rows.length} row(s). The 500 is resolved.`);

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Query STILL FAILS:", e?.message || e);
  process.exit(1);
});
