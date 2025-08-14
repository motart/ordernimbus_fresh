#!/bin/bash

# Shopify Redirect URI Validation Test
# This script validates that the Shopify OAuth redirect URI is correctly configured

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
ENVIRONMENT=${1:-production}
AWS_REGION=${2:-us-west-1}

echo "======================================"
echo "Shopify Redirect URI Validation Test"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo "======================================"
echo ""

# Function to print colored output
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Get API Gateway URL from CloudFormation
echo "Getting API Gateway URL from CloudFormation..."
STACK_NAME="ordernimbus-${ENVIRONMENT}"

API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -z "$API_URL" ]; then
    print_error "Failed to get API Gateway URL from CloudFormation!"
    exit 1
fi

# Extract just the domain and stage from the API URL
API_DOMAIN=$(echo "$API_URL" | sed 's|https://||' | sed 's|/.*||')
API_STAGE=$(echo "$API_URL" | sed 's|.*/||')

print_success "API Gateway URL: $API_URL"
echo "  Domain: $API_DOMAIN"
echo "  Stage: $API_STAGE"

# Test the Shopify connect endpoint
echo ""
echo "Testing Shopify connect endpoint..."

RESPONSE=$(curl -X POST "${API_URL}/api/shopify/connect" \
    -H "Content-Type: application/json" \
    -d '{"storeDomain":"test-store.myshopify.com","userId":"test-user"}' \
    -s 2>/dev/null)

# Check if we got an auth URL
AUTH_URL=$(echo "$RESPONSE" | jq -r '.authUrl' 2>/dev/null || echo "")

if [ -z "$AUTH_URL" ] || [ "$AUTH_URL" = "null" ]; then
    print_error "Failed to get auth URL from Shopify connect endpoint!"
    echo "Response: $RESPONSE"
    exit 1
fi

print_success "Got Shopify OAuth URL"

# Extract redirect URI from auth URL
REDIRECT_URI=$(echo "$AUTH_URL" | python3 -c "
import sys, urllib.parse
url = sys.stdin.read().strip()
if 'redirect_uri=' in url:
    redirect_uri = url.split('redirect_uri=')[1].split('&')[0]
    print(urllib.parse.unquote(redirect_uri))
" 2>/dev/null || echo "")

if [ -z "$REDIRECT_URI" ]; then
    print_error "Failed to extract redirect URI from auth URL!"
    echo "Auth URL: $AUTH_URL"
    exit 1
fi

print_success "Extracted redirect URI: $REDIRECT_URI"

# Validate redirect URI format
EXPECTED_REDIRECT_URI="https://${API_DOMAIN}/${API_STAGE}/api/shopify/callback"

if [ "$REDIRECT_URI" = "$EXPECTED_REDIRECT_URI" ]; then
    print_success "Redirect URI matches expected format!"
else
    print_error "Redirect URI doesn't match expected format!"
    echo "  Expected: $EXPECTED_REDIRECT_URI"
    echo "  Actual:   $REDIRECT_URI"
    exit 1
fi

# Check Lambda logs for dynamic URL generation
echo ""
echo "Checking Lambda logs for dynamic URL generation..."

LAMBDA_NAME="ordernimbus-${ENVIRONMENT}-main"
LOG_ENTRIES=$(aws logs tail "/aws/lambda/${LAMBDA_NAME}" \
    --since 5m \
    --region "$AWS_REGION" 2>/dev/null | \
    grep -E "Dynamic API Gateway URL|Redirect URI" | \
    tail -2 || echo "")

if [ -n "$LOG_ENTRIES" ]; then
    print_success "Lambda is logging dynamic URL generation"
    echo "$LOG_ENTRIES" | while read -r line; do
        echo "  $line"
    done
else
    print_warning "No recent Lambda logs found (Lambda might not have been invoked recently)"
fi

# Check Lambda environment variables
echo ""
echo "Checking Lambda environment variables..."

TABLE_NAME=$(aws lambda get-function-configuration \
    --function-name "$LAMBDA_NAME" \
    --region "$AWS_REGION" \
    --query 'Environment.Variables.TABLE_NAME' \
    --output text 2>/dev/null || echo "")

if [ -n "$TABLE_NAME" ]; then
    print_success "Lambda TABLE_NAME: $TABLE_NAME"
    
    # Verify table exists
    TABLE_STATUS=$(aws dynamodb describe-table \
        --table-name "$TABLE_NAME" \
        --region "$AWS_REGION" \
        --query 'Table.TableStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$TABLE_STATUS" = "ACTIVE" ]; then
        print_success "DynamoDB table exists and is active"
    else
        print_error "DynamoDB table not found or not active: $TABLE_STATUS"
    fi
else
    print_error "Lambda TABLE_NAME not configured!"
fi

# Summary
echo ""
echo "======================================"
echo "VALIDATION SUMMARY"
echo "======================================"

echo ""
echo "Shopify OAuth Redirect URI Configuration:"
echo "  Current Redirect URI: $REDIRECT_URI"
echo ""
echo "To configure in Shopify Partners Dashboard:"
echo "  1. Go to your app settings"
echo "  2. Add this exact redirect URI:"
echo "     $REDIRECT_URI"
echo ""

if [ "$REDIRECT_URI" = "$EXPECTED_REDIRECT_URI" ]; then
    print_success "All Shopify redirect URI validations passed!"
    echo ""
    echo "The redirect URI is correctly configured and will work"
    echo "even after stack teardown and redeployment."
    exit 0
else
    print_error "Some validations failed!"
    echo ""
    echo "Please check the errors above and fix them."
    exit 1
fi