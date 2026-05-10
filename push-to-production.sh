#!/bin/bash

# Script to push schema changes to production database
# Usage: ./push-to-production.sh [PRODUCTION_DATABASE_URL]

if [ -z "$1" ]; then
  echo "❌ Error: Production DATABASE_URL is required"
  echo ""
  echo "Usage: ./push-to-production.sh <PRODUCTION_DATABASE_URL>"
  echo ""
  echo "To get your production DATABASE_URL:"
  echo "1. Open Deployments in Replit"
  echo "2. Go to your Reserved VM deployment"
  echo "3. Open 'Secrets' tab"
  echo "4. Copy the DATABASE_URL value"
  exit 1
fi

PROD_DATABASE_URL="$1"

echo "🚀 Pushing schema changes to production database..."
echo ""
echo "⚠️  WARNING: This will modify your PRODUCTION database!"
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

# Run drizzle-kit push with production URL
DATABASE_URL="$PROD_DATABASE_URL" npm run db:push --force

echo ""
echo "✅ Schema push complete!"
echo ""
echo "🔍 Verify by checking:"
echo "   https://sabq.news/dashboard/articles/<article-id>"
