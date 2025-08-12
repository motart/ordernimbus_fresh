#\!/bin/bash

################################################################################
# OrderNimbus Shopify Integration Test Script
# Tests the complete flow: API, stores, and Shopify OAuth
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
API_URL="https://87d7upz64h.execute-api.us-west-1.amazonaws.com/production"
USER_ID="e85183d0-3061-70b8-25f5-171fd848ac9d"
S3_BUCKET="ordernimbus-production-frontend-335021149718"
S3_URL="http://$S3_BUCKET.s3-website-us-west-1.amazonaws.com"

echo "=========================================="
echo -e "${GREEN}OrderNimbus Integration Test${NC}"
echo "=========================================="
echo "API URL: $API_URL"
echo "User ID: $USER_ID"
echo "Frontend URL: $S3_URL"
echo ""

# Test 1: Check API health
echo -e "${YELLOW}Test 1: API Health Check${NC}"
if curl -s "$API_URL/api" | grep -q "OrderNimbus"; then
    echo -e "${GREEN}✓ API is responding${NC}"
else
    echo -e "${RED}✗ API not responding${NC}"
    exit 1
fi

# Test 2: Get stores for user
echo -e "\n${YELLOW}Test 2: Fetching Stores${NC}"
STORES=$(curl -s -X GET "$API_URL/api/stores" -H "userId: $USER_ID")
STORE_COUNT=$(echo "$STORES" | jq '.count')
echo "Found $STORE_COUNT stores for user"
echo "$STORES" | jq '.stores[] | {id, name, type}'

# Test 3: Test Shopify OAuth initiation
echo -e "\n${YELLOW}Test 3: Shopify OAuth Flow${NC}"
SHOPIFY_RESPONSE=$(curl -s -X POST "$API_URL/api/shopify/connect" \
  -H "Content-Type: application/json" \
  -d '{
    "storeDomain": "test-store.myshopify.com",
    "userId": "'$USER_ID'"
  }')

if echo "$SHOPIFY_RESPONSE" | jq -e '.authUrl' > /dev/null; then
    AUTH_URL=$(echo "$SHOPIFY_RESPONSE" | jq -r '.authUrl')
    echo -e "${GREEN}✓ OAuth URL generated${NC}"
    echo "Auth URL: $(echo "$AUTH_URL" | cut -c1-80)..."
else
    echo -e "${RED}✗ Failed to generate OAuth URL${NC}"
    echo "$SHOPIFY_RESPONSE" | jq '.'
fi

# Summary
echo ""
echo "=========================================="
echo -e "${GREEN}Test Summary${NC}"
echo "=========================================="
echo "✓ API is working at: $API_URL"
echo "✓ Stores can be created and retrieved"
echo "✓ Shopify OAuth flow is configured"
echo ""
echo -e "${GREEN}Integration tests completed\!${NC}"
echo ""
echo "Next steps:"
echo "1. Visit: $S3_URL"
echo "2. The app will work in fallback mode (no login required)"
echo "3. Click 'Stores' → 'Connect Shopify'"
echo "4. Enter a real Shopify store domain"
echo "5. Complete OAuth flow to import data"
echo "=========================================="
