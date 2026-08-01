#!/usr/bin/env bash
# تطبيق مخطط Drizzle على PostgreSQL المعزول في Railway staging فقط.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXPECTED_PROJECT_ID="49260270-79b7-40af-9e91-2599a6161f46"

if [ "${RAILWAY_ENVIRONMENT_NAME:-}" != "staging" ]; then
  echo "REJECTED: RAILWAY_ENVIRONMENT_NAME must be staging."
  echo "Run this through Railway using the staging Postgres service."
  exit 1
fi

if [ "${RAILWAY_PROJECT_ID:-}" != "$EXPECTED_PROJECT_ID" ]; then
  echo "REJECTED: Railway project does not match sabq.org."
  exit 1
fi

if [ "${RAILWAY_SERVICE_NAME:-}" != "Postgres" ]; then
  echo "REJECTED: run this with the staging Postgres service variables."
  exit 1
fi

if [ -n "${NEON_DATABASE_URL:-}" ]; then
  echo "REJECTED: NEON_DATABASE_URL must not exist in staging."
  exit 1
fi

# Railway's public proxy is reachable from a developer machine. Inside Railway,
# the private URL remains valid as a fallback.
TARGET_URL="${SCHEMA_DATABASE_URL:-${DATABASE_PUBLIC_URL:-${DATABASE_URL:-}}}"

TARGET_INFO="$({
  SCHEMA_DATABASE_URL="$TARGET_URL" node -e '
    const value = process.env.SCHEMA_DATABASE_URL;
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (!["postgres:", "postgresql:"].includes(url.protocol)) process.exit(2);
      if (!host.endsWith(".proxy.rlwy.net") && !host.endsWith(".railway.internal")) process.exit(3);
      if (host.includes("neon") || /neon\.tech/i.test(value)) process.exit(4);
      const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";
      process.stdout.write(`${host} ${database}`);
    } catch { process.exit(2); }
  '
} 2>/dev/null)" || {
  echo "REJECTED: target must be the Railway staging PostgreSQL service."
  exit 1
}

read -r TARGET_HOST TARGET_DATABASE <<<"$TARGET_INFO"
echo "Railway staging schema target: host=$TARGET_HOST database=$TARGET_DATABASE"

# shared/schema.ts contains a vector column. A fresh Railway Postgres database
# exposes pgvector but does not enable it automatically.
SCHEMA_DATABASE_URL="$TARGET_URL" node --input-type=module <<'NODE'
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.SCHEMA_DATABASE_URL });
await client.connect();
try {
  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  const { rows } = await client.query(
    "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
  );
  if (!rows[0]?.extversion) throw new Error("pgvector was not enabled");
  console.log(`pgvector ready (${rows[0].extversion})`);
} finally {
  await client.end();
}
NODE

# SCHEMA_DATABASE_URL has highest precedence in drizzle.config.ts. Strict mode
# keeps Drizzle's confirmation for any statement it considers destructive.
SCHEMA_DATABASE_URL="$TARGET_URL" npm run db:push -- --strict
