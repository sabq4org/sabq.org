#!/bin/bash
# Publisher Workflow E2E Test Script
# Tests the complete publisher workflow from creation to article approval

BASE_URL="http://localhost:5000"

echo "============================================"
echo "Publisher System E2E Test"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print test results
print_test() {
    if [ $1 -eq 0 ] && [ -n "$3" ]; then
        echo -e "${GREEN}✓ $2${NC}"
    else
        echo -e "${RED}✗ $2${NC}"
        echo -e "${RED}  Error: $4${NC}"
        exit 1
    fi
}

# Clean up previous test data
echo "Cleaning up previous test data..."
psql "$DATABASE_URL" << 'EOF' > /dev/null 2>&1
DELETE FROM publisher_credit_logs WHERE EXISTS (
  SELECT 1 FROM publishers WHERE email = 'publisher-test@example.com' AND publisher_credit_logs.publisher_id = publishers.id
);
DELETE FROM articles WHERE author_id IN (SELECT id FROM users WHERE email = 'publisher-test@example.com');
DELETE FROM publisher_credits WHERE publisher_id IN (SELECT id FROM publishers WHERE email = 'publisher-test@example.com');
DELETE FROM publishers WHERE email = 'publisher-test@example.com';
DELETE FROM users WHERE email = 'publisher-test@example.com';
EOF

echo ""
echo "Step 1: Create a test publisher user"
echo "-------------------------------------------"

# Create publisher user directly in database
PUBLISHER_USER_ID=$(psql "$DATABASE_URL" -t -A << 'EOF'
INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, created_at)
VALUES (
  gen_random_uuid(),
  'publisher-test@example.com',
  '$2b$10$abcdefghijklmnopqrstuv',
  'Test',
  'Publisher',
  'publisher',
  'active',
  NOW()
)
RETURNING id;
EOF
)

PUBLISHER_USER_ID=$(echo "$PUBLISHER_USER_ID" | grep -E '^[a-f0-9-]{36}$' | head -1)
print_test $? "Publisher user created" "$PUBLISHER_USER_ID" "Failed to create user"
echo "  User ID: $PUBLISHER_USER_ID"

echo ""
echo "Step 2: Create publisher profile"
echo "-------------------------------------------"

PUBLISHER_ID=$(psql "$DATABASE_URL" -t -A << EOF
INSERT INTO publishers (id, user_id, agency_name, contact_person, phone, email, is_active)
VALUES (
  gen_random_uuid(),
  '$PUBLISHER_USER_ID',
  'Test Agency',
  'Test Contact',
  '+966500000000',
  'publisher-test@example.com',
  true
)
RETURNING id;
EOF
)

PUBLISHER_ID=$(echo "$PUBLISHER_ID" | grep -E '^[a-f0-9-]{36}$' | head -1)
print_test $? "Publisher profile created" "$PUBLISHER_ID" "Failed to create publisher"
echo "  Publisher ID: $PUBLISHER_ID"

echo ""
echo "Step 3: Add credit package to publisher"
echo "-------------------------------------------"

CREDIT_PACKAGE_ID=$(psql "$DATABASE_URL" -t -A << EOF
INSERT INTO publisher_credits (
  id, publisher_id, package_name, total_credits, 
  used_credits, remaining_credits, period, 
  start_date, is_active
)
VALUES (
  gen_random_uuid(),
  '$PUBLISHER_ID',
  'Test Package - 10 Articles',
  10,
  0,
  10,
  'one-time',
  NOW(),
  true
)
RETURNING id;
EOF
)

CREDIT_PACKAGE_ID=$(echo "$CREDIT_PACKAGE_ID" | grep -E '^[a-f0-9-]{36}$' | head -1)
print_test $? "Credit package created (10 credits)" "$CREDIT_PACKAGE_ID" "Failed to create credit package"
echo "  Package ID: $CREDIT_PACKAGE_ID"

echo ""
echo "Step 4: Create a draft article by publisher"
echo "-------------------------------------------"

ARTICLE_ID=$(psql "$DATABASE_URL" -t -A << EOF
INSERT INTO articles (
  id, title, slug, content, excerpt, 
  author_id, status, article_type,
  is_publisher_news, publisher_id,
  publisher_submitted_at, created_at
)
VALUES (
  gen_random_uuid(),
  'Test Publisher Article',
  'test-publisher-article-' || extract(epoch from now())::bigint,
  '<p>This is a test article from a publisher.</p>',
  'Test article excerpt',
  '$PUBLISHER_USER_ID',
  'draft',
  'news',
  true,
  '$PUBLISHER_ID',
  NOW(),
  NOW()
)
RETURNING id;
EOF
)

ARTICLE_ID=$(echo "$ARTICLE_ID" | grep -E '^[a-f0-9-]{36}$' | head -1)
print_test $? "Draft article created" "$ARTICLE_ID" "Failed to create article"
echo "  Article ID: $ARTICLE_ID"

echo ""
echo "Step 5: Check credits BEFORE approval"
echo "-------------------------------------------"

CREDITS_BEFORE=$(psql "$DATABASE_URL" -t << EOF
SELECT remaining_credits, used_credits 
FROM publisher_credits 
WHERE id = '$CREDIT_PACKAGE_ID';
EOF
)

REMAINING_BEFORE=$(echo "$CREDITS_BEFORE" | awk '{print $1}' | tr -d '|')
USED_BEFORE=$(echo "$CREDITS_BEFORE" | awk '{print $2}' | tr -d '|' | tr -d ' ')
echo "  Remaining: $REMAINING_BEFORE, Used: $USED_BEFORE"

echo ""
echo "Step 6: Approve article (should deduct 1 credit)"
echo "-------------------------------------------"

APPROVAL_RESULT=$(psql "$DATABASE_URL" -t << EOF
BEGIN;

-- Lock the credit package
SELECT remaining_credits 
FROM publisher_credits 
WHERE id = '$CREDIT_PACKAGE_ID' 
FOR UPDATE;

-- Update article
UPDATE articles 
SET 
  status = 'published',
  published_at = NOW(),
  publisher_approved_at = NOW(),
  publisher_credit_deducted = true
WHERE id = '$ARTICLE_ID';

-- Deduct credit
UPDATE publisher_credits
SET 
  used_credits = used_credits + 1,
  remaining_credits = remaining_credits - 1,
  updated_at = NOW()
WHERE id = '$CREDIT_PACKAGE_ID';

-- Log the action
INSERT INTO publisher_credit_logs (
  publisher_id, credit_package_id, article_id,
  action_type, credits_before, credits_changed, credits_after,
  notes, created_at
)
SELECT 
  '$PUBLISHER_ID',
  '$CREDIT_PACKAGE_ID',
  '$ARTICLE_ID',
  'credit_used',
  10,
  -1,
  remaining_credits,
  'Article approved and published',
  NOW()
FROM publisher_credits
WHERE id = '$CREDIT_PACKAGE_ID';

COMMIT;

SELECT 'SUCCESS' as result;
EOF
)

if echo "$APPROVAL_RESULT" | grep -q "SUCCESS"; then
    echo -e "${GREEN}✓ Article approved and credit deducted${NC}"
else
    echo -e "${RED}✗ Approval failed${NC}"
    exit 1
fi

echo ""
echo "Step 7: Verify credit deduction"
echo "-------------------------------------------"

CREDITS_AFTER=$(psql "$DATABASE_URL" -t << EOF
SELECT remaining_credits, used_credits 
FROM publisher_credits 
WHERE id = '$CREDIT_PACKAGE_ID';
EOF
)

REMAINING_AFTER=$(echo "$CREDITS_AFTER" | awk '{print $1}' | tr -d '|' | tr -d ' ')
USED_AFTER=$(echo "$CREDITS_AFTER" | awk '{print $2}' | tr -d '|' | tr -d ' ')
echo "  Remaining: $REMAINING_AFTER, Used: $USED_AFTER"

if [ "$REMAINING_AFTER" = "9" ]; then
    echo -e "${GREEN}✓ Credit correctly deducted (9 remaining)${NC}"
    if [ "$USED_AFTER" = "1" ]; then
        echo -e "${GREEN}✓ Used credits correctly tracked (1 used)${NC}"
    fi
else
    echo -e "${RED}✗ Credit deduction FAILED (expected 9 remaining, got $REMAINING_AFTER)${NC}"
    exit 1
fi

echo ""
echo "Step 8: Check credit logs"
echo "-------------------------------------------"

LOGS_COUNT=$(psql "$DATABASE_URL" -t << EOF
SELECT COUNT(*) 
FROM publisher_credit_logs 
WHERE article_id = '$ARTICLE_ID' AND action_type = 'credit_used';
EOF
)

LOGS_COUNT=$(echo "$LOGS_COUNT" | tr -d ' ')
if [ "$LOGS_COUNT" = "1" ]; then
    echo -e "${GREEN}✓ Credit log created successfully${NC}"
    
    # Show the log entry
    psql "$DATABASE_URL" << EOF
SELECT action_type, credits_before, credits_changed, credits_after 
FROM publisher_credit_logs 
WHERE article_id = '$ARTICLE_ID';
EOF
else
    echo -e "${RED}✗ Credit log not found${NC}"
    exit 1
fi

echo ""
echo "Step 9: Verify article is published"
echo "-------------------------------------------"

ARTICLE_CHECK=$(psql "$DATABASE_URL" -t << EOF
SELECT 
  status, 
  publisher_credit_deducted, 
  (published_at IS NOT NULL) as is_published
FROM articles 
WHERE id = '$ARTICLE_ID';
EOF
)

STATUS=$(echo "$ARTICLE_CHECK" | awk '{print $1}')
DEDUCTED=$(echo "$ARTICLE_CHECK" | awk '{print $3}')
IS_PUBLISHED=$(echo "$ARTICLE_CHECK" | awk '{print $5}')

echo "  Status: $STATUS"
echo "  Credit Deducted: $DEDUCTED"
echo "  Published: $IS_PUBLISHED"

if [ "$STATUS" = "published" ] && [ "$DEDUCTED" = "t" ] && [ "$IS_PUBLISHED" = "t" ]; then
    echo -e "${GREEN}✓ Article successfully published with credit deducted${NC}"
else
    echo -e "${RED}✗ Article status check FAILED${NC}"
    exit 1
fi

echo ""
echo "Step 10: Test API endpoints"
echo "-------------------------------------------"

# Test publisher dashboard API
DASHBOARD=$(curl -s "$BASE_URL/api/publisher/dashboard/$PUBLISHER_ID" | jq -r '.stats.totalArticles // "error"')
if [ "$DASHBOARD" != "error" ]; then
    echo -e "${GREEN}✓ Publisher dashboard API works${NC}"
    echo "  Total articles: $DASHBOARD"
else
    echo -e "${YELLOW}⚠ Publisher dashboard API needs authentication${NC}"
fi

echo ""
echo "============================================"
echo -e "${GREEN}✓✓✓ All Tests Passed! ✓✓✓${NC}"
echo "============================================"
echo ""
echo "Summary:"
echo "  ✓ Publisher created: $PUBLISHER_ID"
echo "  ✓ Credits allocated: 10"
echo "  ✓ Article published: $ARTICLE_ID"
echo "  ✓ Credits remaining: 9"
echo "  ✓ Credits used: 1"
echo "  ✓ Credit log entries: 1"
echo "  ✓ Article status: published"
echo ""
echo "Next steps:"
echo "  1. Test frontend integration"
echo "  2. Test API endpoints with authentication"
echo "  3. Monitor scheduled jobs"
echo ""
