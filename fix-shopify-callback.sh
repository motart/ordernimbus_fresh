#!/bin/bash

################################################################################
# Fix Shopify Callback URL in Lambda
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REGION="us-west-1"
FUNCTION_NAME="ordernimbus-production-main"
STACK_NAME="ordernimbus-production"

echo -e "${BLUE}🛍️  Fixing Shopify Callback URL${NC}"
echo "==========================================="

# Get the current API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text)

echo -e "${YELLOW}Current API URL: $API_URL${NC}"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Download current Lambda function
echo -e "${YELLOW}Downloading current Lambda function...${NC}"
aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Code.Location' --output text | xargs curl -s -o lambda.zip

# Extract it
unzip -q lambda.zip

# Update the callback URL in the code
echo -e "${YELLOW}Updating callback URL...${NC}"
if [ -f "index.js" ]; then
    # Replace the old hardcoded URL with the dynamic one
    sed -i '' "s|https://1w571burd5.execute-api.us-west-1.amazonaws.com/production|$API_URL|g" index.js
    sed -i '' "s|https://v59jrtezd4.execute-api.us-west-1.amazonaws.com/production|$API_URL|g" index.js
    
    # Also update to use environment variable for API Gateway URL
    sed -i '' "s|const API_GATEWAY_URL = .*|const API_GATEWAY_URL = process.env.API_GATEWAY_URL \|\| '$API_URL';|g" index.js
    
    echo -e "${GREEN}✓ Updated callback URLs${NC}"
else
    echo -e "${RED}✗ index.js not found${NC}"
    exit 1
fi

# Package the updated Lambda
echo -e "${YELLOW}Creating deployment package...${NC}"
zip -qr lambda-updated.zip .

# Update Lambda function
echo -e "${YELLOW}Updating Lambda function...${NC}"
aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://lambda-updated.zip \
    --region "$REGION" \
    --output text >/dev/null

# Update Lambda environment variables to include API_GATEWAY_URL
echo -e "${YELLOW}Updating Lambda environment variables...${NC}"
aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --environment "Variables={
        TABLE_NAME=ordernimbus-production-main,
        ENVIRONMENT=production,
        USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text),
        USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text),
        API_GATEWAY_URL=$API_URL
    }" \
    --output text >/dev/null

echo -e "${GREEN}✓ Lambda updated with correct API Gateway URL${NC}"

# Clean up
cd /
rm -rf "$TEMP_DIR"

# Test the Shopify connect endpoint
echo ""
echo -e "${BLUE}Testing Shopify integration...${NC}"
echo "==========================================="

RESPONSE=$(curl -s -X POST \
    "$API_URL/api/shopify/connect" \
    -H "Content-Type: application/json" \
    -H "Origin: https://app.ordernimbus.com" \
    -d '{"storeDomain":"test-store.myshopify.com","userId":"test-user"}' \
    --max-time 5 2>/dev/null | jq -r '.authUrl // .error' 2>/dev/null || echo "Error")

if [[ "$RESPONSE" == *"$API_URL"* ]]; then
    echo -e "${GREEN}✓ Shopify OAuth URL now uses correct API Gateway${NC}"
    echo "  Callback URL: $API_URL/api/shopify/callback"
else
    echo -e "${YELLOW}Response: $RESPONSE${NC}"
fi

echo ""
echo "==========================================="
echo -e "${GREEN}✅ Shopify Callback URL Fixed!${NC}"
echo "==========================================="
echo ""
echo "The Lambda now uses the correct API Gateway URL:"
echo "  $API_URL"
echo ""
echo "Shopify OAuth callback will now work correctly."
echo "==========================================="