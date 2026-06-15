/**
 * READ-ONLY diagnostic: find users stuck on status='pending'.
 *
 * Background: the old EditUserDialog "حالة الحساب" toggle wrote status='pending'
 * (a value getUserEffectiveStatus ignores for verified users), so verified
 * members ended up labelled "بانتظار التفعيل" while still able to log in.
 * This script lists every pending row and splits them into:
 *   - email_verified = true   → leftover/inconsistent → should become 'active'
 *   - email_verified = false  → genuinely pending (never verified) → leave as-is
 *
 * STRICTLY READ-ONLY: SELECT only. Safe to point at production.
 *
 * USAGE
 *   SKIP_DB_MAINTENANCE=true DB_DRIVER=pg npx tsx scripts/diagnose-staff-pending.ts
 *   (or:  railway run npx tsx scripts/diagnose-staff-pending.ts)
 */

import dotenv from "dotenv";
// Never override vars already in the environment — so `railway run` (which injects
// the production DATABASE_URL) targets prod, while a plain local run falls back to
// .env.local (preferred) then .env.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const { pool } = await import("../server/db");

async function main() {
  console.log("\n==================================================================");
  console.log("  PENDING USERS DIAGNOSIS  (read-only)");
  console.log("==================================================================");

  const counts = await pool.query(
    `SELECT status, count(*)::int AS n FROM users GROUP BY status ORDER BY n DESC`,
  );
  console.log("\n  Users by stored status:");
  for (const r of counts.rows) {
    console.log(`    ${String(r.status).padEnd(12)} ${r.n}`);
  }

  const pending = await pool.query(
    `SELECT id, email, role, email_verified, created_at, last_activity_at
       FROM users
      WHERE status = 'pending'
      ORDER BY email_verified DESC, last_activity_at DESC NULLS LAST`,
  );

  const verified = pending.rows.filter((r: any) => r.email_verified);
  const unverified = pending.rows.filter((r: any) => !r.email_verified);

  console.log(`\n  Total pending rows: ${pending.rows.length}`);
  console.log(`    • email_verified = true  (→ should be ACTIVE): ${verified.length}`);
  console.log(`    • email_verified = false (genuinely pending) : ${unverified.length}`);

  if (verified.length) {
    console.log("\n------------------------------------------------------------------");
    console.log("  CANDIDATES TO RESET → 'active'  (verified but stuck on pending)");
    console.log("------------------------------------------------------------------");
    for (const u of verified) {
      console.log(
        `    ${String(u.email).padEnd(34)} role=${String(u.role).padEnd(16)} ` +
          `last_activity=${u.last_activity_at ? new Date(u.last_activity_at).toISOString().slice(0, 10) : "—"}  id=${u.id}`,
      );
    }
  }

  if (unverified.length) {
    console.log("\n------------------------------------------------------------------");
    console.log("  GENUINELY PENDING  (email never verified — leave as-is)");
    console.log("------------------------------------------------------------------");
    for (const u of unverified) {
      console.log(
        `    ${String(u.email).padEnd(34)} role=${String(u.role).padEnd(16)} ` +
          `created=${u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : "—"}  id=${u.id}`,
      );
    }
  }

  console.log("\n==================================================================");
  console.log(`  To fix the verified ones, an admin can run (with --apply guard):`);
  console.log(`    UPDATE users SET status='active'`);
  console.log(`     WHERE status='pending' AND email_verified=true;`);
  console.log("==================================================================\n");
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("diagnose-staff-pending error:", e);
    return pool.end().finally(() => process.exit(1));
  });
