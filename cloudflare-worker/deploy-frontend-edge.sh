#!/bin/bash

# Deploy the frontend edge worker (sabq.news / sabq.org).
#
# Required env vars:
#   CLOUDFLARE_WORKERS_API_TOKEN   API token with Workers:Edit + Zone:Edit
#   CLOUDFLARE_ZONE_ID             Zone ID for the target domain
#
# Optional env vars:
#   WORKER_NAME       Default: sabq-frontend-edge
#   ROUTE_PATTERNS    Comma-separated, default: sabq.news/*,www.sabq.news/*
#   API_ORIGIN        Default: https://api.sabq.news
#   FRONTEND_ORIGIN   Default: https://sabq.news

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Sabq Frontend Edge Worker Deployment   ${NC}"
echo -e "${GREEN}=========================================${NC}"

API_TOKEN="${CLOUDFLARE_WORKERS_API_TOKEN:-$CLOUDFLARE_API_TOKEN}"
if [ -z "$API_TOKEN" ]; then
    echo -e "${RED}Error: CLOUDFLARE_WORKERS_API_TOKEN is not set${NC}"
    exit 1
fi

if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
    echo -e "${RED}Error: CLOUDFLARE_ZONE_ID is not set${NC}"
    exit 1
fi

WORKER_NAME="${WORKER_NAME:-sabq-frontend-edge}"
ROUTE_PATTERNS="${ROUTE_PATTERNS:-sabq.news/*,www.sabq.news/*}"
API_ORIGIN="${API_ORIGIN:-https://api.sabq.news}"
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-https://sabq.news}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_SCRIPT="$SCRIPT_DIR/frontend-edge-worker.js"

if [ ! -f "$WORKER_SCRIPT" ]; then
    echo -e "${RED}Error: $WORKER_SCRIPT not found${NC}"
    exit 1
fi

echo -e "${YELLOW}Resolving account ID from zone...${NC}"
ZONE_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json")

ACCOUNT_ID=$(echo "$ZONE_RESPONSE" | jq -r '.result.account.id')
if [ -z "$ACCOUNT_ID" ] || [ "$ACCOUNT_ID" == "null" ]; then
    echo -e "${RED}Error: could not resolve account ID${NC}"
    echo "$ZONE_RESPONSE" | jq '.'
    exit 1
fi
echo -e "${GREEN}Account ID: $ACCOUNT_ID${NC}"

# Upload as a Modules-format worker with env-var bindings via multipart.
# Workers API: PUT /accounts/{account_id}/workers/scripts/{script_name}
# with multipart/form-data, where:
#   - metadata part declares main_module + bindings
#   - the JS file part is the actual script
echo -e "${YELLOW}Uploading worker script (modules format with bindings)...${NC}"

METADATA=$(jq -n \
  --arg api "$API_ORIGIN" \
  --arg frontend "$FRONTEND_ORIGIN" \
  '{
    main_module: "frontend-edge-worker.js",
    compatibility_date: "2024-09-01",
    bindings: [
      { type: "plain_text", name: "API_ORIGIN", text: $api },
      { type: "plain_text", name: "FRONTEND_ORIGIN", text: $frontend }
    ]
  }')

UPLOAD_RESPONSE=$(curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME" \
  -H "Authorization: Bearer $API_TOKEN" \
  -F "metadata=$METADATA;type=application/json" \
  -F "frontend-edge-worker.js=@$WORKER_SCRIPT;type=application/javascript+module")

SUCCESS=$(echo "$UPLOAD_RESPONSE" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
    echo -e "${RED}Error uploading worker:${NC}"
    echo "$UPLOAD_RESPONSE" | jq '.'
    exit 1
fi
echo -e "${GREEN}Worker uploaded.${NC}"

# Configure routes (one or more, comma-separated)
IFS=',' read -ra PATTERNS <<< "$ROUTE_PATTERNS"
for PATTERN in "${PATTERNS[@]}"; do
    PATTERN="$(echo "$PATTERN" | xargs)"
    echo -e "${YELLOW}Setting route: $PATTERN${NC}"

    EXISTING_ROUTES=$(curl -s -X GET \
      "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/workers/routes" \
      -H "Authorization: Bearer $API_TOKEN")

    EXISTING_ID=$(echo "$EXISTING_ROUTES" | jq -r --arg p "$PATTERN" '.result[] | select(.pattern == $p) | .id')

    if [ -n "$EXISTING_ID" ] && [ "$EXISTING_ID" != "null" ]; then
        ROUTE_RESPONSE=$(curl -s -X PUT \
          "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/workers/routes/$EXISTING_ID" \
          -H "Authorization: Bearer $API_TOKEN" \
          -H "Content-Type: application/json" \
          --data "{\"pattern\": \"$PATTERN\", \"script\": \"$WORKER_NAME\"}")
    else
        ROUTE_RESPONSE=$(curl -s -X POST \
          "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/workers/routes" \
          -H "Authorization: Bearer $API_TOKEN" \
          -H "Content-Type: application/json" \
          --data "{\"pattern\": \"$PATTERN\", \"script\": \"$WORKER_NAME\"}")
    fi

    ROUTE_SUCCESS=$(echo "$ROUTE_RESPONSE" | jq -r '.success')
    if [ "$ROUTE_SUCCESS" != "true" ]; then
        echo -e "${RED}Error setting route $PATTERN:${NC}"
        echo "$ROUTE_RESPONSE" | jq '.'
        exit 1
    fi
done

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Deployment Complete                    ${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "Worker:  ${YELLOW}$WORKER_NAME${NC}"
echo -e "Routes:  ${YELLOW}$ROUTE_PATTERNS${NC}"
echo -e "Bindings: API_ORIGIN=$API_ORIGIN, FRONTEND_ORIGIN=$FRONTEND_ORIGIN"
echo ""
echo -e "${YELLOW}Test:${NC}"
echo "  curl -s -A 'WhatsApp/2.21' https://www.sabq.news/article/zmElGwC | grep -E 'og:title|og:image'"
