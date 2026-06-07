/**
 * Diagnose WHY a given email/password fails at POST /api/login.
 *
 * The login strategy (server/auth.ts) returns the SAME generic message
 *   "البريد الإلكتروني أو كلمة المرور غير صحيحة"
 * for two completely different failures:
 *   1. No users row matches `email.toLowerCase()`  (auth.ts:159 "User not found")
 *      — note the query lowercases the INPUT but compares against the raw
 *        `users.email` column with a case-sensitive `=`, and does NOT trim.
 *        So a stored row like "Ahmad@x.com" or "ahmad@x.com " is invisible.
 *   2. bcrypt.compare(password, password_hash) === false  (auth.ts:173).
 *
 * This script tells you which one it is, plus surfaces status problems
 * (banned/deleted/locked/pending), missing password hash, OAuth-only accounts,
 * 2FA, mustChangePassword, and any case/whitespace/duplicate-row issues.
 *
 * It is STRICTLY READ-ONLY: SELECT queries + an in-memory bcrypt.compare.
 * It writes nothing, so it is safe to point at production.
 *
 * USAGE
 *   SKIP_DB_MAINTENANCE=true DATABASE_URL='...' DB_DRIVER=pg \
 *     npx tsx scripts/diagnose-login.ts 'Arafj555@yahoo.com' 'vqjHdxVH-erx'
 *
 *   The password is optional; omit it to inspect the account without
 *   verifying the hash:
 *     ... npx tsx scripts/diagnose-login.ts 'Arafj555@yahoo.com'
 *
 * ENV
 *   DATABASE_URL          target database (read-only).
 *   DB_DRIVER             "pg" for Railway PG, "neon" (default) for Neon.
 *   SKIP_DB_MAINTENANCE   ALWAYS set "true" — otherwise importing server/db
 *                         kicks off startup index builds / VACUUM on the target.
 */

import bcrypt from "bcrypt";
import { pool } from "../server/db";

const rawEmail = process.argv[2];
const password = process.argv[3];

if (!rawEmail) {
  console.error("Usage: npx tsx scripts/diagnose-login.ts '<email>' ['<password>']");
  process.exit(1);
}

// Exactly what server/auth.ts does to the input before querying:
const loginLookup = rawEmail.toLowerCase();
// What a tolerant lookup would do:
const normalized = rawEmail.toLowerCase().trim();

function statusOf(u: any): string {
  const now = new Date();
  if (u.deleted_at) return "deleted";
  if (u.status === "banned") {
    if (u.banned_until && new Date(u.banned_until) > now) return "banned";
    if (!u.banned_until) return "banned";
  }
  if (u.status === "suspended") {
    if (u.suspended_until && new Date(u.suspended_until) > now) return "suspended";
  }
  if (u.account_locked) {
    if (u.locked_until && new Date(u.locked_until) > now) return "locked";
  }
  if (!u.email_verified) return "pending";
  return "active";
}

function show(label: string, value: any) {
  console.log(`    ${label.padEnd(22)} ${value}`);
}

async function main() {
  console.log("\n==================================================================");
  console.log("  LOGIN DIAGNOSIS");
  console.log("==================================================================");
  console.log(`  Input email        : ${JSON.stringify(rawEmail)}`);
  console.log(`  Login query value  : ${JSON.stringify(loginLookup)}   (auth.ts lowercases, no trim)`);
  console.log(`  Password provided  : ${password ? "yes" : "no"}`);

  // 1) Replicate the EXACT login query: users.email = lower(input), case-sensitive, no trim.
  const exact = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [loginLookup],
  );

  // 2) Tolerant case-insensitive + trim search — what rows actually exist for this person.
  const fuzzy = await pool.query(
    `SELECT * FROM users WHERE lower(trim(email)) = $1 ORDER BY created_at`,
    [normalized],
  );

  console.log("\n------------------------------------------------------------------");
  console.log(`  Step 1 — exact login query  (email = '${loginLookup}')`);
  console.log("------------------------------------------------------------------");
  if (exact.rows.length === 0) {
    console.log("  ❌ NO ROW. The login strategy returns 'User not found' (auth.ts:159)");
    console.log("     → the user sees the generic 'email or password incorrect' message.");
  } else {
    console.log(`  ✅ ${exact.rows.length} row(s) matched the login query.`);
  }

  console.log("\n------------------------------------------------------------------");
  console.log(`  Step 2 — all rows for this person  (lower(trim(email)) = '${normalized}')`);
  console.log("------------------------------------------------------------------");
  if (fuzzy.rows.length === 0) {
    console.log("  ❌ No account exists with this email at all (case/space-insensitive).");
    console.log("     → This person has never registered, or used a different address.");
  }

  for (const [i, u] of fuzzy.rows.entries()) {
    const matchesLogin = u.email === loginLookup;
    const eff = statusOf(u);
    console.log(`\n  Row #${i + 1}  ${matchesLogin ? "← login lands here" : "(login does NOT see this row)"}`);
    show("id", u.id);
    show("email (stored)", JSON.stringify(u.email));
    const caseNote =
      u.email === loginLookup ? "exact match" :
      u.email?.toLowerCase?.() === loginLookup ? "CASE/WHITESPACE MISMATCH ⚠" :
      "different";
    show("vs login value", caseNote);
    show("role", u.role);
    show("effective status", eff + (eff === "banned" || eff === "deleted" ? "  ❌ blocks login" : ""));
    show("email_verified", u.email_verified);
    show("auth_provider", u.auth_provider || "(local/password)");
    show("google_id", u.google_id ? "set" : "—");
    show("apple_id", u.apple_id ? "set" : "—");
    show("has password_hash", u.password_hash ? `yes (${String(u.password_hash).slice(0, 7)}…, len ${String(u.password_hash).length})` : "NO ⚠");
    show("must_change_pw", u.must_change_password);
    show("two_factor_enabled", u.two_factor_enabled);
    show("account_locked", u.account_locked);
    show("created_at", u.created_at);

    if (password) {
      if (!u.password_hash) {
        console.log("    🔑 password check        SKIPPED — no hash (OAuth-only or needs reset)");
      } else {
        const ok = await bcrypt.compare(password, u.password_hash);
        console.log(`    🔑 password check        ${ok ? "✅ MATCHES this row's hash" : "❌ does NOT match this row's hash"}`);
      }
    }
  }

  // 3) Verdict
  console.log("\n==================================================================");
  console.log("  VERDICT");
  console.log("==================================================================");

  const loginRow = exact.rows[0];
  if (!loginRow) {
    if (fuzzy.rows.length > 0) {
      const stored = fuzzy.rows.map((r: any) => JSON.stringify(r.email)).join(", ");
      console.log("  CAUSE: account EXISTS but the login query can't see it (case/whitespace).");
      console.log(`         stored email(s): ${stored}`);
      console.log(`         login looked for: ${JSON.stringify(loginLookup)}`);
      console.log("  FIX  : normalize the stored email to lowercase/trimmed, e.g.");
      console.log("         UPDATE users SET email = lower(trim(email)) WHERE id = '...';");
      console.log("         (or run scripts/merge-duplicate-accounts.ts --email=... if duplicates).");
    } else {
      console.log("  CAUSE: no such account. The person must register first,");
      console.log("         or they are typing a different email than the one on file.");
    }
  } else {
    const eff = statusOf(loginRow);
    if (!loginRow.password_hash) {
      console.log("  CAUSE: account has NO password hash (OAuth-only or never set).");
      console.log("         auth.ts:166 → 'this account needs a password reset'.");
      console.log("  FIX  : send a password-reset / set-password link, or sign in via Google/Apple.");
    } else if (password) {
      const ok = await bcrypt.compare(password, loginRow.password_hash);
      if (ok && (eff === "banned" || eff === "deleted")) {
        console.log(`  CAUSE: password is CORRECT but the account is '${eff}' → login blocked`);
        console.log("         (note: this would show a status message, not the generic one).");
      } else if (ok) {
        console.log("  CAUSE: password is CORRECT and status is fine.");
        console.log("         If production still rejects it, suspect: 2FA, a stale/duplicate");
        console.log("         row, env DB mismatch, or rate-limiting (HTTP 429, not 401).");
      } else {
        console.log("  CAUSE: WRONG PASSWORD. The hash on the login row does not match.");
        console.log("         auth.ts:173 → generic 'email or password incorrect'.");
        console.log("  FIX  : the given password is simply not this account's password.");
        console.log("         Send a reset link, or set a known password for the user.");
      }
    } else {
      console.log("  Account found and visible to login. Re-run with the password to");
      console.log("  verify the hash and get a definitive answer.");
    }
  }
  console.log("==================================================================\n");
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("diagnose-login error:", e);
    return pool.end().finally(() => process.exit(1));
  });
