#!/bin/bash

################################################################################
# OrderNimbus Production Deployment Script (3-5 minutes)
# Deploys directly to production on app.ordernimbus.com
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
REGION=${1:-us-west-1}
STACK_NAME="ordernimbus-production"
TEMPLATE_FILE="cloudformation-simple.yaml"
HOSTED_ZONE_ID="Z03623712FIVU7Z4CJ949"

print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

echo "=========================================="
echo -e "${GREEN}OrderNimbus Production Deployment${NC}"
echo "=========================================="
echo "Region: $REGION"
echo "Domain: app.ordernimbus.com"
echo ""

# Check for existing DNS records
existing_record=$(aws route53 list-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --query "ResourceRecordSets[?Name=='app.ordernimbus.com.' && Type=='A']" \
    --output json)

if [ "$existing_record" != "[]" ]; then
    echo -e "${YELLOW}Warning: Found existing A record for app.ordernimbus.com${NC}"
    echo "This deployment will create a CNAME record instead."
    echo "You may need to manually remove the A record if there are conflicts."
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 1
    fi
fi

# Deploy CloudFormation stack
print_status "Deploying CloudFormation stack..."
aws cloudformation deploy \
    --template-file "$TEMPLATE_FILE" \
    --stack-name "$STACK_NAME" \
    --parameter-overrides \
        HostedZoneId="$HOSTED_ZONE_ID" \
    --capabilities CAPABILITY_IAM \
    --region "$REGION" \
    --no-fail-on-empty-changeset

# Get stack outputs
print_status "Getting stack outputs..."
API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)
FRONTEND_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`FrontendURL`].OutputValue' --output text)
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)

# Build frontend with production API URL
print_status "Building frontend..."
cd app/frontend
npm install --silent 2>/dev/null || npm install
REACT_APP_API_URL="$API_URL" \
REACT_APP_ENVIRONMENT="production" \
REACT_APP_REGION="$REGION" \
REACT_APP_USER_POOL_ID="$USER_POOL_ID" \
REACT_APP_CLIENT_ID="$USER_POOL_CLIENT_ID" \
npm run build

# Deploy frontend
print_status "Deploying frontend to S3..."
aws s3 sync build/ "s3://$S3_BUCKET/" --delete --region "$REGION"
cd ../..

# Test API (now requires authentication)
print_status "Testing API..."
if curl -s "$API_URL/api/auth/register" --max-time 5 -o /dev/null; then
  print_success "API is working (authentication required for endpoints)"
else 
  print_warning "API may need initialization"
fi

# Test domain
print_status "DNS Configuration:"
echo "  • app.ordernimbus.com → S3 website"
echo "  • api.ordernimbus.com → API Gateway"

# Quick DNS check
if nslookup "app.ordernimbus.com" >/dev/null 2>&1; then
    print_success "DNS is resolving"
else
    print_warning "DNS may take a few minutes to propagate"
fi

# Summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "=========================================="
echo -e "Frontend: ${YELLOW}http://app.ordernimbus.com${NC}"
echo -e "API: ${YELLOW}$API_URL${NC}"
echo ""
echo -e "${BLUE}🔐 Authentication System:${NC}"
echo "  • User Pool: $USER_POOL_ID"
echo "  • Client ID: $USER_POOL_CLIENT_ID"
echo "  • JWT-based authentication with company isolation"
echo ""
echo -e "${BLUE}📝 Next Steps:${NC}"
echo "  1. Visit http://app.ordernimbus.com"
echo "  2. Register new account with company name"
echo "  3. Login and access company-scoped dashboard"
echo ""
echo "Time: ~3-5 minutes"
echo "=========================================="