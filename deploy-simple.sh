#!/bin/bash

################################################################################
# OrderNimbus FAST Deployment Script with Domain Support (3-5 minutes)
# Simplified version for quick deployments
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-staging}
REGION=${2:-us-west-1}
ENABLE_DOMAIN=${3:-true}  # Enable domain by default
STACK_NAME="ordernimbus-${ENVIRONMENT}-simple"
TEMPLATE_FILE="cloudformation-simple.yaml"
HOSTED_ZONE_ID="Z03623712FIVU7Z4CJ949"

print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Main deployment
echo "=========================================="
echo -e "${GREEN}OrderNimbus FAST Deployment${NC}"
echo "=========================================="
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Domain: $([ "$ENABLE_DOMAIN" = "true" ] && echo "Enabled" || echo "Disabled")"
echo ""

# Check template
if [ ! -f "$TEMPLATE_FILE" ]; then
    print_error "Template not found: $TEMPLATE_FILE"
    exit 1
fi

# Check if existing app.ordernimbus.com record exists (only for production)
if [ "$ENVIRONMENT" = "production" ] && [ "$ENABLE_DOMAIN" = "true" ]; then
    existing_record=$(aws route53 list-resource-record-sets \
        --hosted-zone-id "$HOSTED_ZONE_ID" \
        --query "ResourceRecordSets[?Name=='app.ordernimbus.com.' && Type=='A']" \
        --output json | jq -r '.[0]' 2>/dev/null)
    
    if [ "$existing_record" != "null" ] && [ -n "$existing_record" ]; then
        print_warning "app.ordernimbus.com already has an A record pointing elsewhere"
        print_warning "Using app-staging.ordernimbus.com instead"
        ENVIRONMENT="staging"
        STACK_NAME="ordernimbus-staging-simple"
    fi
fi

# Deploy stack
print_status "Deploying CloudFormation stack..."
aws cloudformation deploy \
    --template-file "$TEMPLATE_FILE" \
    --stack-name "$STACK_NAME" \
    --parameter-overrides \
        Environment="$ENVIRONMENT" \
        EnableDomain="$ENABLE_DOMAIN" \
        HostedZoneId="$HOSTED_ZONE_ID" \
    --capabilities CAPABILITY_IAM \
    --region "$REGION" \
    --no-fail-on-empty-changeset 2>&1 | grep -v "No changes to deploy" || true

# Get outputs
print_status "Getting stack outputs..."
API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)
FRONTEND_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`FrontendURL`].OutputValue' --output text)
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text)
API_DOMAIN_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`ApiDomainURL`].OutputValue' --output text 2>/dev/null || echo "$API_URL")

# Use domain API if available
if [ -n "$API_DOMAIN_URL" ] && [ "$API_DOMAIN_URL" != "None" ]; then
    API_URL_FOR_BUILD="$API_DOMAIN_URL/$ENVIRONMENT"
else
    API_URL_FOR_BUILD="$API_URL"
fi

# Build frontend
print_status "Building frontend..."
cd app/frontend
npm install --silent 2>/dev/null || npm install
REACT_APP_API_URL="$API_URL_FOR_BUILD" \
REACT_APP_ENVIRONMENT="$ENVIRONMENT" \
REACT_APP_REGION="$REGION" \
npm run build

# Deploy frontend
print_status "Deploying frontend to S3..."
aws s3 sync build/ "s3://$S3_BUCKET/" --delete --region "$REGION"
cd ../..

# Test API
print_status "Testing API..."
curl -s "$API_URL/api/products" -H "userId: test" --max-time 5 >/dev/null && print_success "API is working" || print_warning "API may need initialization"

# Test domain if enabled
if [ "$ENABLE_DOMAIN" = "true" ]; then
    print_status "DNS Configuration:"
    if [ "$ENVIRONMENT" = "production" ]; then
        echo "  • app.ordernimbus.com → S3 website"
        echo "  • api.ordernimbus.com → API Gateway"
    else
        echo "  • app-${ENVIRONMENT}.ordernimbus.com → S3 website"
        echo "  • api-${ENVIRONMENT}.ordernimbus.com → API Gateway"
    fi
    
    # Quick DNS check
    domain_name=$([ "$ENVIRONMENT" = "production" ] && echo "app.ordernimbus.com" || echo "app-${ENVIRONMENT}.ordernimbus.com")
    if nslookup "$domain_name" >/dev/null 2>&1; then
        print_success "DNS is resolving"
    else
        print_warning "DNS may take a few minutes to propagate"
    fi
fi

# Summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "=========================================="
echo -e "Frontend: ${YELLOW}$FRONTEND_URL${NC}"
echo -e "API: ${YELLOW}$API_URL${NC}"
if [ "$ENABLE_DOMAIN" = "true" ]; then
    echo ""
    echo -e "${GREEN}Custom Domain:${NC}"
    if [ "$ENVIRONMENT" = "production" ]; then
        echo -e "  ${YELLOW}http://app.ordernimbus.com${NC}"
    else
        echo -e "  ${YELLOW}http://app-${ENVIRONMENT}.ordernimbus.com${NC}"
    fi
fi
echo ""
echo "Time: ~3-5 minutes (no CloudFront = fast!)"
echo "=========================================="