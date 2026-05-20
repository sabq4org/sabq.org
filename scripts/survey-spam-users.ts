/**
 * Survey-only (READ-ONLY) report on spam/SQL-injection-probe accounts
 * that piled up in the `users` table from automated scanners hitting
 * /api/register without proper input validation.
 *
 * Drizzle uses parameterized queries, so none of the SQL ever executed —
 * the payloads were merely stored as plaintext in `email`, `first_name`,
 * and `last_name`. We just need to identify and (later) clean them.
 *
 * Usage (local DB by default; pass DATABASE_URL via env for prod):
 *
 *   npx tsx scripts/survey-spam-users.ts
 *
 * READ-ONLY. No DELETE/UPDATE. Run safely against any environment.
 */

import "dotenv/config";
import { or, ilike, sql } from "drizzle-orm";
import { db } from "../server/db";
import { users } from "../shared/schema";

const SPAM_PATTERNS = [
  "%union%",
  "%select%",
  "%concat%",
  "%/*%",
  "%*/%",
  "%--%",
  "%0x7158%",
  "%order by%",
  "%cast(%",
  "%version()%",
  "%ifnull%",
  "%distinctrow%",
  "%nchar%",
];

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const tag = dbUrl.includes("prod") || dbUrl.includes("production")
    ? "🟥 PROD"
    : "🟢 dev/staging";
  console.log(`[survey] target: ${tag}`);
  console.log("[survey] READ-ONLY — no DELETE/UPDATE will run.\n");

  const conditions = SPAM_PATTERNS.map(p => ilike(users.email, p));
  const spamFilter = or(...conditions);

  // Total user count
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users);
  console.log(`[survey] total users in DB: ${total}`);

  // Spam count
  const [{ spam }] = await db
    .select({ spam: sql<number>`count(*)::int` })
    .from(users)
    .where(spamFilter);
  console.log(`[survey] spam-pattern users:  ${spam}`);
  console.log(`[survey] real users:          ${total - spam}\n`);

  if (spam === 0) {
    console.log("[survey] no spam-pattern accounts found. Nothing to clean up.");
    return;
  }

  // Per-pattern breakdown
  console.log("[survey] breakdown by pattern:");
  for (const p of SPAM_PATTERNS) {
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(users)
      .where(ilike(users.email, p));
    if (c > 0) {
      console.log(`  ${p.padEnd(18)} → ${c}`);
    }
  }

  // Sample 20 rows
  console.log("\n[survey] sample (up to 20 rows):");
  const sample = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(spamFilter)
    .limit(20);

  for (const u of sample) {
    const email = (u.email || "").slice(0, 90);
    const name = `${u.firstName || ""} ${u.lastName || ""}`.trim().slice(0, 40);
    const verified = u.emailVerified ? "✓" : "·";
    const created = u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "?";
    console.log(`  [${verified}] ${created}  ${name.padEnd(40)}  ${email}`);
  }

  // Earliest + latest spam timestamps — useful to know when the attack window was
  const [first] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(spamFilter)
    .orderBy(sql`created_at ASC`)
    .limit(1);
  const [last] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(spamFilter)
    .orderBy(sql`created_at DESC`)
    .limit(1);
  if (first?.createdAt) {
    console.log(`\n[survey] earliest spam account: ${new Date(first.createdAt).toISOString()}`);
  }
  if (last?.createdAt) {
    console.log(`[survey] latest spam account:   ${new Date(last.createdAt).toISOString()}`);
  }

  console.log(`\n[survey] verified spam accounts (emailVerified=true):`);
  const [{ verifiedSpam }] = await db
    .select({ verifiedSpam: sql<number>`count(*)::int filter (where email_verified = true)` })
    .from(users)
    .where(spamFilter);
  console.log(`  ${verifiedSpam} of ${spam} spam accounts have emailVerified=true (should be 0)`);

  console.log("\n[survey] Done. Review the sample. If the filter is accurate,");
  console.log("[survey] I'll write the DELETE script next.");
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
