#!/bin/bash

# Sabq.org SEO 404 Worker Deployment Script
# This script deploys the Cloudflare Worker that handles proper 404 responses

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN}  Sabq SEO 404 Worker Deployment  ${NC}"
echo -e "${GREEN}=================================${NC}"

# Check for required environment variables
# Use CLOUDFLARE_WORKERS_API_TOKEN if available, otherwise fall back to CLOUDFLARE_API_TOKEN
API_TOKEN="${CLOUDFLARE_WORKERS_API_TOKEN:-$CLOUDFLARE_API_TOKEN}"

if [ -z "$API_TOKEN" ]; then
    echo -e "${RED}Error: CLOUDFLARE_WORKERS_API_TOKEN or CLOUDFLARE_API_TOKEN is not set${NC}"
    exit 1
fi

if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
    echo -e "${RED}Error: CLOUDFLARE_ZONE_ID is not set${NC}"
    exit 1
fi

# Get account ID from zone info (more reliable than accounts list)
echo -e "${YELLOW}Fetching account ID from zone info...${NC}"
ZONE_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json")

ACCOUNT_ID=$(echo "$ZONE_RESPONSE" | jq -r '.result.account.id')

if [ -z "$ACCOUNT_ID" ] || [ "$ACCOUNT_ID" == "null" ]; then
    echo -e "${RED}Error: Could not fetch account ID from zone${NC}"
    echo "$ZONE_RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}Account ID: $ACCOUNT_ID${NC}"

# Worker name
WORKER_NAME="sabq-seo-404"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_SCRIPT="$SCRIPT_DIR/seo-404-worker.js"

if [ ! -f "$WORKER_SCRIPT" ]; then
    echo -e "${RED}Error: Worker script not found at $WORKER_SCRIPT${NC}"
    exit 1
fi

echo -e "${YELLOW}Uploading worker script...${NC}"

# Upload the worker
UPLOAD_RESPONSE=$(curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/javascript" \
  --data-binary @"$WORKER_SCRIPT")

SUCCESS=$(echo "$UPLOAD_RESPONSE" | jq -r '.success')

if [ "$SUCCESS" != "true" ]; then
    echo -e "${RED}Error uploading worker:${NC}"
    echo "$UPLOAD_RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}Worker uploaded successfully!${NC}"

# Create route for sabq.org/*
echo -e "${YELLOW}Creating route for sabq.org/*...${NC}"

ROUTE_PATTERN="sabq.org/*"

# Check if route already exists
EXISTING_ROUTES=$(curl -s -X GET \
  "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/workers/routes" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json")

EXISTING_ROUTE_ID=$(echo "$EXISTING_ROUTES" | jq -r --arg pattern "$ROUTE_PATTERN" '.result[] | select(.pattern == $pattern) | .id')

if [ -n "$EXISTING_ROUTE_ID" ] && [ "$EXISTING_ROUTE_ID" != "null" ]; then
    echo -e "${YELLOW}Route already exists, updating...${NC}"
    
    ROUTE_RESPONSE=$(curl -s -X PUT \
      "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/workers/routes/$EXISTING_ROUTE_ID" \
      -H "Authorization: Bearer $API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "{\"pattern\": \"$ROUTE_PATTERN\", \"script\": \"$WORKER_NAME\"}")
else
    echo -e "${YELLOW}Creating new route...${NC}"
    
    ROUTE_RESPONSE=$(curl -s -X POST \
      "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/workers/routes" \
      -H "Authorization: Bearer $API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "{\"pattern\": \"$ROUTE_PATTERN\", \"script\": \"$WORKER_NAME\"}")
fi

ROUTE_SUCCESS=$(echo "$ROUTE_RESPONSE" | jq -r '.success')

if [ "$ROUTE_SUCCESS" != "true" ]; then
    echo -e "${RED}Error creating route:${NC}"
    echo "$ROUTE_RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}Route created/updated successfully!${NC}"

echo ""
echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN}  Deployment Complete!          ${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""
echo -e "Worker: ${YELLOW}$WORKER_NAME${NC}"
echo -e "Route:  ${YELLOW}$ROUTE_PATTERN${NC}"
echo ""
echo -e "${YELLOW}Test the deployment:${NC}"
echo "  curl -I https://sabq.org/ZZZZZZZ"
echo "  (Should return HTTP 404)"
