/**
 * Load roles_and_permissions.sql into the Railway PG database.
 *
 * Reads scripts/seed-data/roles_and_permissions.sql, auto-detects and fixes
 * mojibake (UTF-8 bytes interpreted as Latin-1, e.g. "Ø£Ø­ÙØ¯" → "أحمد"),
 * then runs the whole SQL inside a transaction.
 *
 * The source file contains TRUNCATE TABLE role_permissions, user_roles, ...
 * — that wipes any existing RBAC assignments but leaves the bootstrap admin
 * usable via the `users.role` text column (server/rbac.ts treats the literal
 * "admin" string as superuser).
 *
 * Safety: refuses to run if DATABASE_URL contains "prod"/"production"
 * unless --i-understand is passed.
 *
 * Usage:
 *   DB_DRIVER=pg \
 *   DATABASE_URL='postgresql://postgres:****@xxx.proxy.rlwy.net:XXXXX/railway' \
 *   tsx scripts/seed-rbac.ts
 */

import fs from "node:fs";
import path from "node:path";
import { Pool as PgPool } from "pg";

const SQL_FILE = path.resolve(process.cwd(), "scripts/seed-data/roles_and_permissions.sql");

const args = new Set(process.argv.slice(2));
const I_UNDERSTAND = args.has("--i-understand");

const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl) {
  console.error("❌ DATABASE_URL is required");
  process.exit(1);
}
if (/prod|production/i.test(dbUrl) && !I_UNDERSTAND) {
  console.error("❌ ABORT: DATABASE_URL contains 'prod' or 'production'.");
  console.error("   Pass --i-understand to override (NOT recommended).");
  process.exit(2);
}

if (!fs.existsSync(SQL_FILE)) {
  console.error(`❌ File not found: ${SQL_FILE}`);
  console.error("   Place roles_and_permissions.sql in scripts/seed-data/ first.");
  process.exit(3);
}

// Mojibake fix: re-encode UTF-8 bytes that were interpreted as Latin-1 back
// to their original UTF-8. Heuristic: if the file contains common mojibake
// markers (Ø, Ù) and almost no actual Arabic, apply the round-trip.
function fixMojibake(raw: Buffer): Buffer {
  const text = raw.toString("utf8");
  const hasMojibake = /[À-ß][-¿]/.test(text);
  const hasRealArabic = /[؀-ۿ]/.test(text);
  if (!hasMojibake || hasRealArabic) {
    return raw;
  }
  console.log("[seed] Detected mojibake — converting to proper UTF-8");
  // The file's bytes are UTF-8 of a Latin-1 misreading. Encoding the
  // string as Latin-1 gives the ORIGINAL bytes back, which are the
  // correct Arabic UTF-8.
  return Buffer.from(text, "latin1");
}

function maskUrl(url: string): string {
  return url.replace(/:[^@/]+@/, ":***@");
}

async function main() {
  console.log("=".repeat(60));
  console.log("RBAC seed loader");
  console.log("=".repeat(60));
  console.log(`  DB:    ${maskUrl(dbUrl)}`);
  console.log(`  File:  ${SQL_FILE}`);
  console.log("");

  const raw = fs.readFileSync(SQL_FILE);
  const fixed = fixMojibake(raw);
  const sql = fixed.toString("utf8");

  console.log(`[seed] SQL size: ${sql.length} chars`);
  console.log(`[seed] Connecting...`);

  const pool = new PgPool({ connectionString: dbUrl, max: 1 });
  const client = await pool.connect();

  try {
    console.log("[seed] Executing roles_and_permissions.sql...");
    // The file already wraps itself in BEGIN/COMMIT, so pg will treat it
    // as one explicit transaction.
    await client.query(sql);

    const rolesCount = await client.query("SELECT COUNT(*)::int AS n FROM roles");
    const permsCount = await client.query("SELECT COUNT(*)::int AS n FROM permissions");
    const mapCount = await client.query("SELECT COUNT(*)::int AS n FROM role_permissions");

    console.log("");
    console.log("✅ Done.");
    console.log(`   roles:            ${rolesCount.rows[0].n}`);
    console.log(`   permissions:      ${permsCount.rows[0].n}`);
    console.log(`   role_permissions: ${mapCount.rows[0].n}`);
    console.log("");
    console.log("Sample roles:");
    const sample = await client.query(
      "SELECT name, name_ar FROM roles ORDER BY name"
    );
    for (const r of sample.rows) console.log(`   - ${r.name}  →  ${r.name_ar}`);
  } catch (err: any) {
    console.error("❌ SQL execution failed:");
    console.error(err.message);
    if (err.position) console.error(`   at position ${err.position}`);
    process.exit(4);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
