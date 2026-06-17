/**
 * HOTFIX: apply the Phase 6 (rights & credibility) columns that the deployed
 * code (#284) selects via getTableColumns(mediaFiles) but which were never
 * ALTERed into production — causing site-wide 500s ("column
 * media_files.license_type does not exist") on article pages, sidebar,
 * media-assets and upload.
 *
 * Idempotent + additive only (ADD COLUMN IF NOT EXISTS). Safe to re-run.
 *   Run: railway run npx tsx scripts/apply-media-rights-columns.ts
 */
import { pool } from "../server/db";

async function main() {
  console.log("Applying Phase 6 rights columns to media_files...");
  await pool.query(`
    ALTER TABLE media_files
      ADD COLUMN IF NOT EXISTS license_type text,
      ADD COLUMN IF NOT EXISTS credit_text text,
      ADD COLUMN IF NOT EXISTS copyright_holder text,
      ADD COLUMN IF NOT EXISTS rights_verified boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS rights_note text
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_media_files_rights_verified ON media_files (rights_verified)`,
  );

  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='media_files'
         AND column_name IN ('license_type','credit_text','copyright_holder','rights_verified','rights_note')
       ORDER BY column_name`,
  );
  console.log("✅ Now present:", rows.map((r: any) => r.column_name).join(", "));
  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("APPLY ERROR:", e?.message || e);
  process.exit(1);
});
