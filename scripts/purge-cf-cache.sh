#!/bin/bash
# Purge Cloudflare cache after successful Vercel build
# Requires env vars: CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN

set -e

# Skip silently in non-production environments
if [ "$VERCEL_ENV" != "production" ]; then
  echo "ℹ️ Skipping Cloudflare purge (VERCEL_ENV=$VERCEL_ENV, not production)"
  exit 0
fi

# Skip if env vars not set (won't break the build)
if [ -z "$CLOUDFLARE_ZONE_ID" ] || [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "⚠️ CLOUDFLARE_ZONE_ID or CLOUDFLARE_API_TOKEN not set — skipping cache purge"
  exit 0
fi

echo "🧹 Purging Cloudflare cache for zone ${CLOUDFLARE_ZONE_ID:0:8}..."

RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Cloudflare cache purged successfully"
  exit 0
else
  echo "❌ Cache purge failed. Response:"
  echo "$RESPONSE"
  # لا توقف البناء — السماح للنشر يكمل حتى لو فشل الـ purge
  exit 0
fi
