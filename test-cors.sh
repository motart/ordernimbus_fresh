#!/bin/bash

################################################################################
# CORS Testing Script for OrderNimbus
# Tests all CORS configurations across different origins
################################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[TEST]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Get API URL
REGION=${1:-us-west-1}
STACK_NAME="ordernimbus-production"

echo "=========================================="
echo -e "${BLUE}CORS Configuration Test${NC}"
echo "=========================================="

# Get API endpoint
API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text 2>/dev/null)

if [ -z "$API_URL" ]; then
    print_error "Stack not found. Please run ./deploy-simple.sh first"
    exit 1
fi

echo "API Endpoint: $API_URL"
echo ""

# Test origins
ORIGINS=(
    "http://app.ordernimbus.com"
    "https://app.ordernimbus.com"
    "http://localhost:3000"
    "http://app.ordernimbus.com.s3-website-${REGION}.amazonaws.com"
)

# Test each origin
for origin in "${ORIGINS[@]}"; do
    echo "Testing origin: $origin"
    echo "-----------------------------------"
    
    # Test OPTIONS (preflight)
    echo -n "  OPTIONS /api/auth/login: "
    OPTIONS_RESPONSE=$(curl -s -X OPTIONS "$API_URL/api/auth/login" \
        -H "Origin: $origin" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        -I --max-time 5 2>/dev/null)
    
    ALLOW_ORIGIN=$(echo "$OPTIONS_RESPONSE" | grep -i "access-control-allow-origin:" | head -1 | cut -d: -f2 | tr -d ' \r')
    ALLOW_METHODS=$(echo "$OPTIONS_RESPONSE" | grep -i "access-control-allow-methods:" | head -1 | cut -d: -f2 | tr -d ' \r')
    
    if [ -n "$ALLOW_ORIGIN" ]; then
        print_success "Origin: $ALLOW_ORIGIN"
        echo "                           Methods: $ALLOW_METHODS"
    else
        print_error "No CORS headers"
    fi
    
    # Test POST request
    echo -n "  POST /api/auth/login: "
    POST_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -H "Origin: $origin" \
        -d '{"email":"test@example.com","password":"Test123!"}' \
        -w "\nHTTP_CODE:%{http_code}" \
        --max-time 5 2>/dev/null)
    
    HTTP_CODE=$(echo "$POST_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
    RESPONSE_BODY=$(echo "$POST_RESPONSE" | grep -v "HTTP_CODE:")
    
    if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "200" ]; then
        print_success "HTTP $HTTP_CODE - Endpoint working"
        if [[ "$RESPONSE_BODY" == *"Invalid credentials"* ]]; then
            echo "                           Response: Invalid credentials (expected)"
        elif [[ "$RESPONSE_BODY" == *"Email and password required"* ]]; then
            echo "                           Response: Validation working"
        fi
    else
        print_error "HTTP $HTTP_CODE"
    fi
    
    echo ""
done

# Test other endpoints
echo "Testing other endpoints:"
echo "-----------------------------------"

ENDPOINTS=("products" "orders" "stores")
for endpoint in "${ENDPOINTS[@]}"; do
    echo -n "  GET /api/$endpoint: "
    RESPONSE=$(curl -s -X GET "$API_URL/api/$endpoint" \
        -H "Origin: http://app.ordernimbus.com" \
        -H "userId: test-user" \
        -w "\nHTTP_CODE:%{http_code}" \
        --max-time 5 2>/dev/null)
    
    HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
    if [ "$HTTP_CODE" = "200" ]; then
        print_success "HTTP 200"
    else
        print_warning "HTTP $HTTP_CODE"
    fi
done

echo ""
echo "=========================================="
echo -e "${GREEN}CORS Test Complete!${NC}"
echo "=========================================="
echo ""
echo "Summary:"
echo "  • API URL: $API_URL"
echo "  • Frontend: http://app.ordernimbus.com"
echo ""
echo "If CORS issues persist:"
echo "  1. Run: ./update-lambda-cors.sh"
echo "  2. Clear browser cache"
echo "  3. Try incognito/private browsing"
echo "=========================================="