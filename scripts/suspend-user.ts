/**
 * Suspend (or, with --active, reactivate) a single user by id.
 *
 * Mirrors storage.suspendUser(): sets status='suspended', suspended_until,
 * suspension_reason, and clears any ban fields. Reactivation mirrors
 * storage.unsuspendUser(): status='active' + clears suspension fields.
 *
 * SAFE BY DEFAULT: prints the current row and the planned change, but writes
 * NOTHING unless you pass --apply.
 *
 * USAGE (prod via railway):
 *   railway run npx tsx scripts/suspend-user.ts <userId> "<reason>"            # dry run
 *   railway run npx tsx scripts/suspend-user.ts <userId> "<reason>" --apply    # write
 *   railway run npx tsx scripts/suspend-user.ts <userId> "<reason>" --days 30 --apply
 *   railway run npx tsx scripts/suspend-user.ts <userId> --active --apply      # reactivate
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const { pool } = await import("../server/db");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const reactivate = args.includes("--active");
const daysIdx = args.indexOf("--days");
const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : undefined;
const positional = args.filter((a, i) => !a.startsWith("--") && !(daysIdx >= 0 && i === daysIdx + 1));
const userId = positional[0];
const reason = positional[1] || "تم تعليق العضوية من قبل الإدارة";

if (!userId) {
  console.error('Usage: npx tsx scripts/suspend-user.ts <userId> "<reason>" [--days N] [--active] [--apply]');
  process.exit(1);
}

async function main() {
  const before = await pool.query(
    `SELECT id, email, role, status, email_verified, suspended_until, suspension_reason
       FROM users WHERE id = $1`,
    [userId],
  );
  if (before.rows.length === 0) {
    console.log(`❌ No user with id ${userId}`);
    return;
  }
  const u = before.rows[0];
  console.log("\n  Current:");
  console.log(`    ${u.email}  role=${u.role}  status=${u.status}  verified=${u.email_verified}`);
  console.log(`    suspended_until=${u.suspended_until || "—"}  reason=${u.suspension_reason || "—"}`);

  if (reactivate) {
    console.log(`\n  Planned: status → 'active'  (clear suspension fields)`);
    if (!apply) {
      console.log("\n  DRY RUN — pass --apply to write.\n");
      return;
    }
    const res = await pool.query(
      `UPDATE users
          SET status='active', suspended_until=NULL, suspension_reason=NULL
        WHERE id = $1
        RETURNING status, suspended_until`,
      [userId],
    );
    console.log(`\n  ✅ Reactivated. status=${res.rows[0].status}\n`);
    return;
  }

  const suspendedUntil = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
  console.log(
    `\n  Planned: status → 'suspended'  reason="${reason}"  ` +
      `until=${suspendedUntil ? suspendedUntil.toISOString() : "indefinite (until lifted)"}`,
  );
  if (!apply) {
    console.log("\n  DRY RUN — pass --apply to write.\n");
    return;
  }

  const res = await pool.query(
    `UPDATE users
        SET status='suspended', suspended_until=$2, suspension_reason=$3,
            banned_until=NULL, ban_reason=NULL
      WHERE id = $1
      RETURNING status, suspended_until, suspension_reason`,
    [userId, suspendedUntil, reason],
  );
  const r = res.rows[0];
  console.log(`\n  ✅ Suspended. status=${r.status}  until=${r.suspended_until || "indefinite"}  reason="${r.suspension_reason}"\n`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("suspend-user error:", e);
    return pool.end().finally(() => process.exit(1));
  });
