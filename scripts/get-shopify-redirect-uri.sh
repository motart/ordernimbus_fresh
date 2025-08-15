#!/bin/bash

# Script to get the exact Shopify redirect URI that needs to be whitelisted
# This URI must be added to your Shopify Partners Dashboard

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Fetching Shopify Redirect URI Configuration..."
echo ""

# Get the API Gateway URL
API_URL="https://p12brily0d.execute-api.us-west-1.amazonaws.com/production"

# Test the connect endpoint to get the actual redirect URI
echo "Testing Shopify connect endpoint..."
RESPONSE=$(curl -s -X POST "${API_URL}/api/shopify/connect" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","storeDomain":"test.myshopify.com"}')

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Failed to connect to API${NC}"
  exit 1
fi

# Extract the redirect URI from the OAuth URL
REDIRECT_URI=$(echo "$RESPONSE" | jq -r '.authUrl' | grep -o 'redirect_uri=[^&]*' | cut -d= -f2 | python3 -c "import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read().strip()))")

if [ -z "$REDIRECT_URI" ]; then
  echo -e "${RED}❌ Could not extract redirect URI${NC}"
  echo "Response: $RESPONSE"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ Successfully retrieved redirect URI${NC}"
echo ""
echo "=========================================="
echo -e "${YELLOW}SHOPIFY REDIRECT URI TO WHITELIST:${NC}"
echo "=========================================="
echo ""
echo -e "${GREEN}$REDIRECT_URI${NC}"
echo ""
echo "=========================================="
echo ""
echo "📝 Instructions:"
echo "1. Log in to Shopify Partners Dashboard: https://partners.shopify.com"
echo "2. Navigate to your OrderNimbus app"
echo "3. Go to 'App setup' or 'Configuration'"
echo "4. Find 'Allowed redirection URL(s)' section"
echo "5. Add the EXACT URL shown above (copy and paste it)"
echo "6. Save the changes"
echo ""
echo "⚠️  IMPORTANT: The URL must match EXACTLY - no trailing slashes or extra spaces!"
echo ""

# Also check current Secrets Manager configuration
echo "📦 Current Secrets Manager Configuration:"
AWS_REGION=${AWS_REGION:-us-west-1}
SECRET_VALUE=$(aws secretsmanager get-secret-value \
  --secret-id ordernimbus/production/shopify \
  --region "$AWS_REGION" \
  --query SecretString \
  --output text 2>/dev/null || echo "{}")

if [ "$SECRET_VALUE" != "{}" ]; then
  CLIENT_ID=$(echo "$SECRET_VALUE" | jq -r '.SHOPIFY_CLIENT_ID // "Not found"')
  echo "Client ID: $CLIENT_ID"
else
  echo -e "${YELLOW}⚠️  Could not retrieve Shopify credentials from Secrets Manager${NC}"
fi

echo ""
echo "✨ Once you've added the redirect URI to Shopify, the OAuth flow will work!"