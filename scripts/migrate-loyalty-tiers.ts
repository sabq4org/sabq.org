/**
 * Phase-1 loyalty migration — syncs user_points_total.rank_level (which
 * production never wrote) to match user_points_total.current_rank, and
 * lifts everyone currently sitting at the legacy top rank "سفير سبق" to
 * the new level 5 so the new tier 4 "القارئ الموثوق" can slot between
 * the old gold and ambassador bands without demoting anyone.
 *
 * SAFETY:
 *   • DRY-RUN by default. Pass --apply to actually write to the DB.
 *   • Refuses to run on a DATABASE_URL containing "prod"/"production"
 *     unless --i-understand is also passed (same guard as the R2
 *     migration script).
 *   • Re-runnable. The grandfather rule keys off the existing
 *     current_rank text, so a second run on already-migrated rows is a
 *     no-op.
 *
 * Usage:
 *   tsx scripts/migrate-loyalty-tiers.ts                  # dry-run
 *   tsx scripts/migrate-loyalty-tiers.ts --apply          # writes
 *   tsx scripts/migrate-loyalty-tiers.ts --apply --i-understand   # prod
 *
 * Run AFTER the CHECK constraint has been widened from 1-4 to 1-5
 * (migrations/20260518_loyalty_tier_5.sql). Without that, any row this
 * script tries to lift to level 5 will fail with a constraint violation.
 */

import { db, pool } from "../server/db";
import { userPointsTotal } from "@shared/schema";
import {
  GRANDFATHER_LEGACY_TOP_RANK,
  LOYALTY_TIERS,
  computeTier,
} from "@shared/loyalty";
import { eq, sql } from "drizzle-orm";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const I_UNDERSTAND = args.has("--i-understand");

const dbUrl = process.env.DATABASE_URL || "";
if (/prod|production/i.test(dbUrl) && !I_UNDERSTAND) {
  console.error("[loyalty-migrate] ABORT: DATABASE_URL contains 'prod' or 'production'.");
  console.error("                  Pass --i-understand to override (NOT recommended).");
  process.exit(2);
}

type Row = {
  userId: string;
  totalPoints: number;
  currentRank: string;
  rankLevel: number;
  lifetimePoints: number;
};

type Decision = {
  row: Row;
  newRank: string;
  newLevel: number;
  bucket: "unchanged" | "orphan_fixed" | "promoted_by_lifetime" | "grandfathered_top" | "demotion_blocked";
};

function decide(row: Row): Decision {
  // 1. Pure compute from lifetime (no protection).
  const computed = computeTier(row.lifetimePoints);

  // 2. Grandfather: anyone whose currentRank text was the legacy top
  //    name keeps level 5 regardless of points. Their stripe stays
  //    "سفير سبق".
  if (row.currentRank === GRANDFATHER_LEGACY_TOP_RANK) {
    const top = LOYALTY_TIERS[LOYALTY_TIERS.length - 1];
    if (row.rankLevel === top.level && row.currentRank === top.nameAr) {
      return { row, newRank: top.nameAr, newLevel: top.level, bucket: "unchanged" };
    }
    return { row, newRank: top.nameAr, newLevel: top.level, bucket: "grandfathered_top" };
  }

  // 3. No demotion. If the computed tier is lower than what's already
  //    on the row, preserve the existing rank/level.
  if (computed.level < row.rankLevel) {
    return { row, newRank: row.currentRank, newLevel: row.rankLevel, bucket: "demotion_blocked" };
  }

  // 4. Orphan rank_level: name matches but level is wrong / never written.
  if (computed.nameAr === row.currentRank && computed.level !== row.rankLevel) {
    return { row, newRank: computed.nameAr, newLevel: computed.level, bucket: "orphan_fixed" };
  }

  // 5. Plain promotion driven by lifetime points.
  if (computed.level > row.rankLevel) {
    return { row, newRank: computed.nameAr, newLevel: computed.level, bucket: "promoted_by_lifetime" };
  }

  return { row, newRank: row.currentRank, newLevel: row.rankLevel, bucket: "unchanged" };
}

async function main() {
  console.log(`[loyalty-migrate] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

  const rows = (await db
    .select({
      userId: userPointsTotal.userId,
      totalPoints: userPointsTotal.totalPoints,
      currentRank: userPointsTotal.currentRank,
      rankLevel: userPointsTotal.rankLevel,
      lifetimePoints: userPointsTotal.lifetimePoints,
    })
    .from(userPointsTotal)) as Row[];

  const decisions = rows.map(decide);

  const counts: Record<Decision["bucket"], number> = {
    unchanged: 0,
    orphan_fixed: 0,
    promoted_by_lifetime: 0,
    grandfathered_top: 0,
    demotion_blocked: 0,
  };
  for (const d of decisions) counts[d.bucket]++;

  console.log("[loyalty-migrate] rows scanned:", rows.length);
  console.log("[loyalty-migrate] breakdown:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }

  // Sample of each non-trivial bucket
  for (const bucket of ["orphan_fixed", "promoted_by_lifetime", "grandfathered_top", "demotion_blocked"] as const) {
    const sample = decisions.filter((d) => d.bucket === bucket).slice(0, 5);
    if (sample.length === 0) continue;
    console.log(`\n[loyalty-migrate] sample of ${bucket}:`);
    for (const d of sample) {
      console.log(
        `  user=${d.row.userId} lifetime=${d.row.lifetimePoints} ` +
        `was="${d.row.currentRank}" (L${d.row.rankLevel}) → ` +
        `now="${d.newRank}" (L${d.newLevel})`,
      );
    }
  }

  if (!APPLY) {
    console.log("\n[loyalty-migrate] DRY-RUN complete. Re-run with --apply to write.");
    await pool.end();
    return;
  }

  const toWrite = decisions.filter((d) => d.bucket !== "unchanged");
  console.log(`\n[loyalty-migrate] writing ${toWrite.length} rows...`);

  let written = 0;
  for (const d of toWrite) {
    await db
      .update(userPointsTotal)
      .set({
        currentRank: d.newRank,
        rankLevel: d.newLevel,
        updatedAt: sql`now()`,
      })
      .where(eq(userPointsTotal.userId, d.row.userId));
    written++;
    if (written % 100 === 0) console.log(`  ...${written}/${toWrite.length}`);
  }

  console.log(`[loyalty-migrate] DONE. Wrote ${written} rows.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error("[loyalty-migrate] FAILED:", err);
  await pool.end();
  process.exit(1);
});
