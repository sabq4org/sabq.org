/**
 * Merge duplicate user accounts that share the same email (case-insensitively).
 *
 * THE BUG THIS CLEANS UP
 *   A visitor registers as a reader (email stored lowercased). Later the team
 *   sends them a writer-application link; if they retype the email with a
 *   different case ("Ahmad@x.com" vs "ahmad@x.com") the approval flow's
 *   case-sensitive lookup misses the existing reader and mints a SECOND users
 *   row with role reporter/opinion_author and a temporary password. Login
 *   lowercases the email, so it always lands on the OLD reader row → the writer
 *   features never show, or the temp password "doesn't work". Two rows, one
 *   person. This script collapses each such pair into a single account.
 *
 * POLICY (per the product decision): KEEP THE WRITER ROW.
 *   - Keeper  = the row that carries a writer role (reporter / opinion_author /
 *               editor / … or any RBAC user_roles entry).
 *   - Loser   = the reader row(s).
 *   The loser's data (bookmarks, reactions, reading history, comments, loyalty,
 *   sessions, …) is repointed onto the keeper via dynamic foreign-key discovery
 *   so nothing the user did is lost. To avoid locking the user out, the reader's
 *   real password (and any Google/Apple link) is carried onto the keeper when
 *   the keeper only has a temporary password — disable with --no-carry-auth.
 *   The keeper's email is normalized to lowercase so the new
 *   users_email_lower_unique index can be created afterwards.
 *
 * SAFETY
 *   - DRY-RUN by default. Prints the full plan and row counts. Pass --apply to
 *     write. Run against the BACKUP database first.
 *   - REJECTS a DATABASE_URL containing "prod"/"production" unless
 *     --i-understand is also passed.
 *   - Groups that are ambiguous (no writer row, or more than one writer row) are
 *     SKIPPED and reported for manual handling — never guessed.
 *   - Each table repoint runs in a savepoint; a unique-constraint collision
 *     (the keeper already has the equivalent row) falls back to dropping the
 *     loser's conflicting rows for that table, and the count is logged loudly.
 *
 * USAGE
 *   npx tsx scripts/merge-duplicate-accounts.ts                  # dry run, all dups
 *   npx tsx scripts/merge-duplicate-accounts.ts --email=a@b.com  # one email only
 *   npx tsx scripts/merge-duplicate-accounts.ts --apply          # write (backup db)
 *   npx tsx scripts/merge-duplicate-accounts.ts --apply --no-carry-auth
 *
 * ENV
 *   DATABASE_URL   target database (backup!).
 *   DB_DRIVER      "pg" for Railway PG, "neon" (default) for Neon — same as the app.
 *
 * AFTER a successful --apply run, create the case-insensitive unique index:
 *   psql "$DATABASE_URL" -f migrations/0006_users_email_lower_unique.sql
 */

import { pool } from "../server/db";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const I_UNDERSTAND = argv.includes("--i-understand");
const CARRY_AUTH = !argv.includes("--no-carry-auth");
const emailArg = argv.find((a) => a.startsWith("--email="));
const ONLY_EMAIL = emailArg ? emailArg.replace("--email=", "").toLowerCase().trim() : null;

// Roles that mark a row as a "writer" (keeper). Anything else with no RBAC role
// is treated as a reader (loser).
const WRITER_ROLES = new Set([
  "reporter",
  "opinion_author",
  "writer",
  "author",
  "correspondent",
  "editor",
  "content_manager",
  "editor_in_chief",
  "managing_editor",
  "section_editor",
  "admin",
  "system_admin",
  "superadmin",
]);

interface UserRow {
  id: string;
  email: string;
  role: string;
  password_hash: string | null;
  must_change_password: boolean;
  google_id: string | null;
  apple_id: string | null;
  auth_provider: string | null;
  email_verified: boolean;
  status: string;
  created_at: Date;
  rbac_count: number;
}

interface FkRef {
  table: string;
  column: string;
}

function isReaderRow(u: UserRow): boolean {
  return u.rbac_count === 0 && !WRITER_ROLES.has((u.role || "").toLowerCase());
}

function abortOnProd() {
  const url = process.env.DATABASE_URL || "";
  if (/prod|production/i.test(url) && !I_UNDERSTAND) {
    console.error("[merge] ABORT: DATABASE_URL looks like production.");
    console.error("        Run against the BACKUP db. Pass --i-understand to override (NOT recommended).");
    process.exit(2);
  }
}

async function discoverFkColumns(): Promise<FkRef[]> {
  const { rows } = await pool.query(
    `SELECT tc.table_name AS table, kcu.column_name AS column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_name = 'users'
        AND ccu.column_name = 'id'`
  );
  return rows.map((r: any) => ({ table: r.table, column: r.column }));
}

async function loadDuplicateGroups(): Promise<Map<string, UserRow[]>> {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.role, u.password_hash, u.must_change_password,
            u.google_id, u.apple_id, u.auth_provider, u.email_verified, u.status,
            u.created_at,
            (SELECT count(*)::int FROM user_roles ur WHERE ur.user_id = u.id) AS rbac_count
       FROM users u
      WHERE lower(trim(u.email)) IN (
              SELECT lower(trim(email)) FROM users
               GROUP BY lower(trim(email)) HAVING count(*) > 1
            )
      ORDER BY lower(trim(u.email)), u.created_at`
  );
  const groups = new Map<string, UserRow[]>();
  for (const r of rows as UserRow[]) {
    const key = (r.email || "").toLowerCase().trim();
    if (ONLY_EMAIL && key !== ONLY_EMAIL) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return groups;
}

function classify(group: UserRow[]): { keeper: UserRow; losers: UserRow[] } | { skip: string } {
  const writers = group.filter((u) => !isReaderRow(u));
  const readers = group.filter((u) => isReaderRow(u));
  if (writers.length === 0) return { skip: "no writer row in group (nothing to promote/keep)" };
  if (writers.length > 1) return { skip: `${writers.length} writer rows in group (ambiguous)` };
  return { keeper: writers[0], losers: readers };
}

function planAuthCarry(keeper: UserRow, losers: UserRow[]) {
  if (!CARRY_AUTH) return null;
  const updates: Record<string, any> = {};
  // Adopt the reader's real password when the keeper only has a temp one.
  if (keeper.must_change_password || !keeper.password_hash) {
    const reader = losers.find((l) => l.password_hash && !l.must_change_password) ||
      losers.find((l) => l.password_hash);
    if (reader?.password_hash) {
      updates.password_hash = reader.password_hash;
      updates.must_change_password = false;
    }
  }
  if (!keeper.google_id) {
    const g = losers.find((l) => l.google_id)?.google_id;
    if (g) updates.google_id = g;
  }
  if (!keeper.apple_id) {
    const a = losers.find((l) => l.apple_id)?.apple_id;
    if (a) updates.apple_id = a;
  }
  if (!keeper.email_verified && losers.some((l) => l.email_verified)) {
    updates.email_verified = true;
  }
  return Object.keys(updates).length ? updates : null;
}

async function countLoserRows(fks: FkRef[], loserId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const fk of fks) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "${fk.table}" WHERE "${fk.column}" = $1`,
      [loserId]
    );
    const n = rows[0]?.n ?? 0;
    if (n > 0) counts.set(`${fk.table}.${fk.column}`, n);
  }
  return counts;
}

async function mergeGroup(
  key: string,
  keeper: UserRow,
  losers: UserRow[],
  fks: FkRef[]
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let movedTotal = 0;
    const dropped: { ref: string; n: number }[] = [];

    for (const loser of losers) {
      for (const fk of fks) {
        await client.query("SAVEPOINT sp");
        try {
          const r = await client.query(
            `UPDATE "${fk.table}" SET "${fk.column}" = $1 WHERE "${fk.column}" = $2`,
            [keeper.id, loser.id]
          );
          movedTotal += r.rowCount ?? 0;
          await client.query("RELEASE SAVEPOINT sp");
        } catch (e: any) {
          if (e?.code === "23505") {
            // Keeper already has the equivalent row → drop the loser's duplicate.
            await client.query("ROLLBACK TO SAVEPOINT sp");
            const d = await client.query(
              `DELETE FROM "${fk.table}" WHERE "${fk.column}" = $1`,
              [loser.id]
            );
            dropped.push({ ref: `${fk.table}.${fk.column}`, n: d.rowCount ?? 0 });
          } else {
            throw e;
          }
        }
      }
      await client.query(`DELETE FROM users WHERE id = $1`, [loser.id]);
    }

    // Losers are gone — now normalize keeper email + carry auth (no collision risk).
    const auth = planAuthCarry(keeper, losers);
    const sets: string[] = [`email = lower(trim(email))`];
    const vals: any[] = [];
    if (auth) {
      for (const [col, val] of Object.entries(auth)) {
        vals.push(val);
        sets.push(`"${col}" = $${vals.length}`);
      }
    }
    // Preserve the earliest signup date in the group.
    const earliest = [keeper, ...losers]
      .map((u) => new Date(u.created_at).getTime())
      .reduce((a, b) => Math.min(a, b));
    vals.push(new Date(earliest));
    sets.push(`created_at = $${vals.length}`);

    vals.push(keeper.id);
    await client.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);

    await client.query("COMMIT");

    console.log(`  ✅ ${key}: merged ${losers.length} reader row(s) → keeper ${keeper.id} (role=${keeper.role})`);
    console.log(`     repointed ${movedTotal} child row(s)${auth ? `, carried auth: ${Object.keys(auth).join(", ")}` : ""}`);
    if (dropped.length) {
      console.warn(`     ⚠ dropped ${dropped.reduce((a, d) => a + d.n, 0)} conflicting loser row(s):`);
      for (const d of dropped) console.warn(`        - ${d.ref}: ${d.n}`);
    }
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`  ❌ ${key}: merge failed, rolled back —`, (e as Error).message);
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  abortOnProd();
  console.log(`[merge] mode=${APPLY ? "APPLY" : "DRY-RUN"}  carryAuth=${CARRY_AUTH}  ${ONLY_EMAIL ? `email=${ONLY_EMAIL}` : "all duplicates"}`);

  const fks = await discoverFkColumns();
  console.log(`[merge] discovered ${fks.length} foreign-key column(s) referencing users.id`);

  const groups = await loadDuplicateGroups();
  if (groups.size === 0) {
    console.log("[merge] no duplicate-email groups found. Nothing to do.");
    await pool.end();
    return;
  }
  console.log(`[merge] found ${groups.size} duplicate-email group(s)\n`);

  const skipped: { key: string; reason: string }[] = [];
  let mergedCount = 0;

  for (const [key, group] of groups) {
    const c = classify(group);
    if ("skip" in c) {
      skipped.push({ key, reason: c.skip });
      console.log(`  ⏭  ${key}: SKIP — ${c.skip}`);
      console.log(`        rows: ${group.map((g) => `${g.id}(role=${g.role},rbac=${g.rbac_count})`).join(", ")}`);
      continue;
    }
    const { keeper, losers } = c;

    if (!APPLY) {
      console.log(`  • ${key}`);
      console.log(`      KEEP   ${keeper.id}  role=${keeper.role}  rbac=${keeper.rbac_count}  mustChangePw=${keeper.must_change_password}`);
      for (const loser of losers) {
        const counts = await countLoserRows(fks, loser.id);
        const detail = counts.size
          ? [...counts.entries()].map(([k, n]) => `${k}=${n}`).join(", ")
          : "(no child rows)";
        console.log(`      DELETE ${loser.id}  role=${loser.role}  → repoint: ${detail}`);
      }
      const auth = planAuthCarry(keeper, losers);
      if (auth) console.log(`      AUTH   would carry onto keeper: ${Object.keys(auth).join(", ")}`);
      console.log(`      EMAIL  would normalize keeper email → ${key}`);
      mergedCount++;
    } else {
      await mergeGroup(key, keeper, losers, fks);
      mergedCount++;
    }
  }

  console.log(`\n[merge] ${APPLY ? "merged" : "would merge"} ${mergedCount} group(s); skipped ${skipped.length}.`);
  if (skipped.length) {
    console.log("[merge] skipped groups need manual handling:");
    for (const s of skipped) console.log(`   - ${s.key}: ${s.reason}`);
  }
  if (!APPLY) {
    console.log("\n[merge] DRY-RUN only. Re-run with --apply (against the backup db) to execute.");
  } else {
    console.log("\n[merge] Done. Now create the unique index:");
    console.log("        psql \"$DATABASE_URL\" -f migrations/0006_users_email_lower_unique.sql");
  }

  await pool.end();
}

main().catch((e) => {
  console.error("[merge] fatal:", e);
  process.exit(1);
});
