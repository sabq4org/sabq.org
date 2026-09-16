#!/usr/bin/env bash
# تطبيق مخطط Drizzle على PostgreSQL المحلي فقط.
# يرفض أي hostname غير localhost / 127.0.0.1 — لا Neon ولا إنتاج.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEFAULT_LOCAL_URL="postgresql://sabq:sabq_password@localhost:5432/sabq_db"
TARGET_URL="${SCHEMA_DATABASE_URL:-${DATABASE_URL_LOCAL:-$DEFAULT_LOCAL_URL}}"

HOST="$(
  SCHEMA_DATABASE_URL="$TARGET_URL" node -e '
    try {
      const u = new URL(process.env.SCHEMA_DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(u.protocol)) process.exit(2);
      process.stdout.write(u.hostname.toLowerCase());
    } catch { process.exit(2); }
  '
)" || {
  echo "❌ رابط PostgreSQL غير صالح"
  exit 1
}

case "$HOST" in
  localhost|127.0.0.1|::1) ;;
  *)
    echo "REJECTED: hostname '${HOST}' is not local."
    echo "  db:push:local only allows localhost / 127.0.0.1"
    echo "  For production use: ./push-to-production.sh '<PROD_URL>'"
    exit 1
    ;;
esac

# ارفض روابط Neon حتى لو عُبّئ hostname بشكل ملتبس
if echo "$TARGET_URL" | grep -qiE 'neon\.tech|@ep-[a-z0-9-]+\.'; then
  echo "REJECTED: URL looks like Neon (neon.tech / @ep-...)"
  exit 1
fi

DB_NAME="$(
  SCHEMA_DATABASE_URL="$TARGET_URL" node -e '
    const u = new URL(process.env.SCHEMA_DATABASE_URL);
    process.stdout.write(decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres");
  '
)"

echo "🛢  db:push → محلي فقط"
echo "   host=$HOST  database=$DB_NAME  driver=pg (TCP)"
echo ""

# SCHEMA_DATABASE_URL أعلى أولوية في drizzle.config.ts ولن تستبدله .env.local
SCHEMA_DATABASE_URL="$TARGET_URL" npm run db:push -- "$@"
