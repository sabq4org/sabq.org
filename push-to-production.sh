#!/bin/bash
set -euo pipefail

# Script to push schema changes to production database
# Usage: ./push-to-production.sh [PRODUCTION_DATABASE_URL]

if [ -z "${1:-}" ]; then
  echo "❌ Error: Production DATABASE_URL is required"
  echo ""
  echo "Usage: ./push-to-production.sh <PRODUCTION_DATABASE_URL>"
  echo ""
  echo "Use the effective Railway runtime URL: NEON_DATABASE_URL when set,"
  echo "otherwise DATABASE_URL. Copy it from Railway Variables."
  exit 1
fi

PROD_DATABASE_URL="$1"

TARGET_LABEL=$(SCHEMA_DATABASE_URL="$PROD_DATABASE_URL" node -e '
  const crypto = require("node:crypto");
  const value = process.env.SCHEMA_DATABASE_URL;
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) process.exit(2);
    const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";
    const fingerprint = crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
    process.stdout.write(`${database} (URL fingerprint ${fingerprint})`);
  } catch { process.exit(2); }
') || {
  echo "❌ Error: invalid PostgreSQL production URL"
  exit 1
}

echo "🚀 Pushing schema changes to production database..."
echo "🎯 Target: $TARGET_LABEL"
echo ""
echo "🔍 Read-only target preflight..."
SCHEMA_DATABASE_URL="$PROD_DATABASE_URL" node --input-type=module <<'NODE'
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.SCHEMA_DATABASE_URL });
await client.connect();
try {
  const { rows: [context] } = await client.query(`
    select current_database() as database,
           current_schema() as schema,
           current_setting('search_path') as search_path,
           to_regclass('gc_majalis')::text as visible_majalis,
           to_regclass('public.gc_majalis')::text as public_majalis
  `);
  console.log(`Database: ${context.database}; schema: ${context.schema}; search_path: ${context.search_path}`);
  console.log(`gc_majalis before push: ${context.visible_majalis ?? "missing"}`);
  if (context.public_majalis && !context.visible_majalis) {
    console.error("❌ public.gc_majalis exists but is hidden by search_path; fix the runtime role/search_path first.");
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
NODE
echo ""
echo "⚠️  WARNING: This will modify your PRODUCTION database!"
echo "Precondition: the CURRENT Railway deployment has GC_PREDICTIONS_ENABLED=false"
echo "and every old pod has drained. Otherwise it can write legacy fixture ids"
echo "during the schema/deploy window."
echo "Type FLAG OFF AND OLD PODS DRAINED to continue:"
read -r CONFIRMATION
if [ "$CONFIRMATION" != "FLAG OFF AND OLD PODS DRAINED" ]; then
  echo "Cancelled."
  exit 1
fi

# SCHEMA_DATABASE_URL has highest precedence and cannot be replaced by .env.local.
# --strict keeps Drizzle's own statement-level confirmation; never auto-approve
# data-loss statements across the project's full schema.
SCHEMA_DATABASE_URL="$PROD_DATABASE_URL" npm run db:push -- --strict

echo ""
echo "🔍 Verifying Majlis prerequisites on the same target..."
SCHEMA_DATABASE_URL="$PROD_DATABASE_URL" node --input-type=module <<'NODE'
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.SCHEMA_DATABASE_URL });
await client.connect();
try {
  const requiredTables = [
    "gc_predictions",
    "gc_prediction_matches",
    "gc_long_predictions",
    "gc_badges",
    "gc_majalis",
    "gc_majlis_members",
    "gc_duels",
    "gc_majlis_notification_deliveries",
    "gc_motm_votes",
    "gc_fantasy_squads",
    "user_notification_prefs",
    "notifications_inbox",
    "user_points_total",
    "user_loyalty_events",
    "push_devices",
  ];
  const { rows: tableRows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name = any($1::text[])`,
    [requiredTables],
  );
  const present = new Set(tableRows.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !present.has(table));

  const { rows: columnRows } = await client.query(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public'
       and (table_name, column_name) in (
         ('user_notification_prefs', 'gulf_cup_majlis'),
         ('push_devices', 'installation_id')
       )`,
  );
  const columns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
  for (const column of [
    "user_notification_prefs.gulf_cup_majlis",
    "push_devices.installation_id",
  ]) {
    if (!columns.has(column)) missing.push(column);
  }

  const requiredIndexes = [
    "idx_gc_majlis_code",
    "idx_gc_majlis_owner",
    "idx_gc_majlis_member",
    "idx_gc_majlis_member_user",
    "idx_gc_majlis_member_majlis",
    "idx_gc_duel_pair_fixture",
    "idx_gc_duel_fixture_status",
    "idx_gc_duel_status_expires",
    "idx_gc_duel_majlis_created",
    "idx_gc_duel_challenger_status",
    "idx_gc_duel_challenged_status",
    "idx_gc_majlis_delivery_dedupe",
    "idx_gc_majlis_delivery_status_scheduled",
    "idx_gc_majlis_delivery_user_type",
    "idx_gc_majlis_delivery_majlis",
    "idx_push_devices_installation",
  ];
  const { rows: indexRows } = await client.query(
    `select indexname from pg_indexes
     where schemaname = 'public' and indexname = any($1::text[])`,
    [requiredIndexes],
  );
  const indexes = new Set(indexRows.map((row) => row.indexname));
  for (const index of requiredIndexes) {
    if (!indexes.has(index)) missing.push(`index:${index}`);
  }

  const requiredConstraints = [
    "gc_duel_distinct_members",
    "gc_duel_stake_check",
    "gc_duel_status_check",
    "gc_majlis_delivery_status_check",
  ];
  const { rows: constraintRows } = await client.query(
    `select conname from pg_constraint where conname = any($1::text[])`,
    [requiredConstraints],
  );
  const constraints = new Set(constraintRows.map((row) => row.conname));
  for (const constraint of requiredConstraints) {
    if (!constraints.has(constraint)) missing.push(`constraint:${constraint}`);
  }

  const { rows: [visibility] } = await client.query(
    `select to_regclass('gc_majalis')::text as visible_majalis,
            to_regclass('public.gc_majalis')::text as public_majalis`,
  );
  if (!visibility.public_majalis || !visibility.visible_majalis) {
    missing.push("search_path:gc_majalis");
  }

  if (missing.length > 0) {
    console.error(`❌ Missing after push: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    const stableFixtureIds = Array.from({ length: 15 }, (_, index) => String(27_000_001 + index));
    const { rows: legacyRows } = await client.query(
      `select source, fixture_id from (
         select 'gc_prediction_matches' as source, fixture_id from gc_prediction_matches
         union all
         select 'gc_predictions' as source, fixture_id from gc_predictions
         union all
         select 'gc_duels' as source, fixture_id from gc_duels
         union all
         select 'gc_motm_votes' as source, fixture_id from gc_motm_votes
       ) fixture_refs
       where not (fixture_id = any($1::text[]))
       group by source, fixture_id
       order by source, fixture_id
       limit 50`,
      [stableFixtureIds],
    );
    if (legacyRows.length > 0) {
      const legacy = legacyRows.map((row) => `${row.source}:${row.fixture_id}`);
      console.error(`❌ Legacy provider fixture ids require explicit reconciliation: ${legacy.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("✅ Majlis schema, indexes, constraints, search_path, and fixture ids verified");
    }
  }
} finally {
  await client.end();
}
NODE

echo ""
echo "✅ Schema push complete!"
echo ""
echo "Next: deploy the new backend while the flag remains false, run smoke tests,"
echo "then enable it. Keep the additive schema in place on code rollback."
