#!/bin/bash
cd /home/runner/workspace
TOTAL_FILES=66
PROGRESS_FILE="/home/runner/workspace/.quintype-data/import-state.txt"

if [ ! -f "$PROGRESS_FILE" ]; then
  echo "1" > "$PROGRESS_FILE"
fi

while true; do
  START_FILE=$(cat "$PROGRESS_FILE")
  
  if [ "$START_FILE" -gt "$TOTAL_FILES" ]; then
    echo "$(date) | ALL FILES COMPLETE!"
    break
  fi

  TOTAL_BEFORE=$(NODE_OPTIONS="--max-old-space-size=512" npx tsx -e "
import{db}from'./server/db';import{sql}from'drizzle-orm';
async function c(){const r=await db.execute(sql\`SELECT count(*) as c FROM articles WHERE legacy_slug IS NOT NULL\`);console.log(r.rows[0].c);process.exit(0);}
c();" 2>/dev/null | grep -E '^[0-9]+$' | tail -1)

  echo "$(date) | Starting from file $START_FILE | Total articles: ${TOTAL_BEFORE:-unknown}"
  
  NODE_OPTIONS="--max-old-space-size=2048" npx tsx scripts/import-quintype.ts --start=$START_FILE --end=$START_FILE --skip-images 2>&1
  EXIT_CODE=$?
  
  echo "$(date) | File $START_FILE done (exit=$EXIT_CODE)"
  
  NEXT_FILE=$((START_FILE + 1))
  echo "$NEXT_FILE" > "$PROGRESS_FILE"
  
  sleep 2
done
