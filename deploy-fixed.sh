#!/bin/bash

################################################################################
# OrderNimbus Fixed Deployment Script
# Fixes: Stack naming, CloudFront conflicts, proper environment handling
################################################################################

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Helper functions
print_header() { echo -e "\n${CYAN}═══════════════════════════════════════${NC}\n${CYAN}$1${NC}\n${CYAN}═══════════════════════════════════════${NC}"; }
print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; exit 1; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Default values
ENVIRONMENT="${1:-staging}"
AWS_REGION="${2:-us-west-1}"
SKIP_TESTS="${3:-false}"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(local|staging|production)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT. Use: local, staging, or production"
fi

# Set stack name properly - avoid double "production"
if [ "$ENVIRONMENT" = "production" ]; then
    STACK_NAME="ordernimbus-production"
else
    STACK_NAME="ordernimbus-${ENVIRONMENT}"
fi

# CloudFormation template
TEMPLATE_FILE="cloudformation-simple.yaml"

# AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")

# Configuration based on environment
if [ "$ENVIRONMENT" = "production" ]; then
    S3_BUCKET="ordernimbus-production-frontend-${AWS_ACCOUNT_ID}"
    COGNITO_POOL_NAME="ordernimbus-production-users"
    DOMAIN_NAME="app.ordernimbus.com"
    ENABLE_CLOUDFRONT="true"
    HOSTED_ZONE_ID="Z03623712FIVU7Z4CJ949"
elif [ "$ENVIRONMENT" = "staging" ]; then
    S3_BUCKET="ordernimbus-staging-frontend-${AWS_ACCOUNT_ID}"
    COGNITO_POOL_NAME="ordernimbus-staging-users"
    DOMAIN_NAME=""
    ENABLE_CLOUDFRONT="false"
    HOSTED_ZONE_ID=""
else
    # Local environment
    print_header "Local Development Deployment"
    
    # Check prerequisites
    print_status "Checking prerequisites..."
    command -v node >/dev/null 2>&1 || print_error "Node.js is required but not installed"
    command -v npm >/dev/null 2>&1 || print_error "npm is required but not installed"
    print_success "Prerequisites checked"
    
    # Install and build
    print_status "Installing dependencies..."
    cd app/frontend && npm install --silent && cd ../..
    print_success "Dependencies installed"
    
    print_status "Building frontend..."
    cd app/frontend && npm run build && cd ../..
    print_success "Frontend built"
    
    print_success "Local deployment ready!"
    echo "Run: npm start (in app/frontend)"
    exit 0
fi

# Display deployment configuration
print_header "OrderNimbus Deployment"
echo "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo "Region: ${YELLOW}$AWS_REGION${NC}"
echo "Stack: ${YELLOW}$STACK_NAME${NC}"
echo "Account: ${YELLOW}$AWS_ACCOUNT_ID${NC}"
echo ""

################################################################################
# AWS DEPLOYMENT
################################################################################
print_header "AWS Deployment - $ENVIRONMENT"

# Check AWS credentials
print_status "Checking AWS credentials..."
if [ -z "$AWS_ACCOUNT_ID" ]; then
    print_error "AWS credentials not configured"
fi
print_success "AWS credentials valid (Account: $AWS_ACCOUNT_ID)"

# Store Shopify credentials in Secrets Manager
print_status "Configuring Shopify credentials..."
SHOPIFY_CLIENT_ID="d4599bc60ea67dabd0be7fccc10476d9"
SHOPIFY_CLIENT_SECRET="0c9bd606f75d8bebc451115f996a17bc"

# Create or update secret
aws secretsmanager create-secret \
    --name "ordernimbus/${ENVIRONMENT}/shopify" \
    --description "Shopify OAuth credentials for ${ENVIRONMENT}" \
    --secret-string "{
        \"SHOPIFY_CLIENT_ID\":\"${SHOPIFY_CLIENT_ID}\",
        \"SHOPIFY_CLIENT_SECRET\":\"${SHOPIFY_CLIENT_SECRET}\",
        \"APP_URL\":\"https://${DOMAIN_NAME:-${STACK_NAME}.example.com}\",
        \"REDIRECT_URI\":\"https://api.ordernimbus.com/${ENVIRONMENT}/shopify/callback\"
    }" \
    --region "$AWS_REGION" >/dev/null 2>&1 || \
aws secretsmanager update-secret \
    --secret-id "ordernimbus/${ENVIRONMENT}/shopify" \
    --secret-string "{
        \"SHOPIFY_CLIENT_ID\":\"${SHOPIFY_CLIENT_ID}\",
        \"SHOPIFY_CLIENT_SECRET\":\"${SHOPIFY_CLIENT_SECRET}\",
        \"APP_URL\":\"https://${DOMAIN_NAME:-${STACK_NAME}.example.com}\",
        \"REDIRECT_URI\":\"https://api.ordernimbus.com/${ENVIRONMENT}/shopify/callback\"
    }" \
    --region "$AWS_REGION" >/dev/null 2>&1

print_success "Shopify credentials secured"

# Clean up any existing CloudFront distributions with conflicting CNAMEs (for production)
if [ "$ENVIRONMENT" = "production" ] && [ "$ENABLE_CLOUDFRONT" = "true" ]; then
    print_status "Checking for CloudFront conflicts..."
    
    # Find existing distributions using app.ordernimbus.com
    EXISTING_DIST=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Aliases.Items, 'app.ordernimbus.com')].Id" \
        --output text 2>/dev/null | head -1)
    
    if [ -n "$EXISTING_DIST" ]; then
        print_warning "Found existing CloudFront distribution using app.ordernimbus.com: $EXISTING_DIST"
        
        # Check if it's from our stack
        STACK_DIST=$(aws cloudformation describe-stack-resources \
            --stack-name "$STACK_NAME" \
            --query "StackResources[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId" \
            --output text 2>/dev/null || echo "")
        
        if [ "$EXISTING_DIST" != "$STACK_DIST" ]; then
            print_warning "Distribution $EXISTING_DIST is not managed by this stack"
            print_status "Disabling CloudFront for this deployment to avoid conflicts"
            ENABLE_CLOUDFRONT="false"
        else
            print_success "Distribution is managed by this stack"
        fi
    fi
    
    # Check certificate
    if [ "$ENABLE_CLOUDFRONT" = "true" ]; then
        print_status "Checking SSL certificate in us-east-1..."
        CERT_ARN=$(aws acm list-certificates \
            --region us-east-1 \
            --query "CertificateSummaryList[?DomainName=='app.ordernimbus.com' || DomainName=='*.ordernimbus.com'].CertificateArn" \
            --output text | head -1)
        
        if [ -z "$CERT_ARN" ]; then
            print_warning "No SSL certificate found for app.ordernimbus.com"
            print_status "Creating certificate request..."
            CERT_ARN=$(aws acm request-certificate \
                --domain-name "*.ordernimbus.com" \
                --subject-alternative-names "ordernimbus.com" "app.ordernimbus.com" \
                --validation-method DNS \
                --region us-east-1 \
                --query 'CertificateArn' \
                --output text)
            print_warning "Certificate requested. DNS validation required."
            ENABLE_CLOUDFRONT="false"
        else
            print_success "Found certificate: $CERT_ARN"
            
            # Check certificate status
            CERT_STATUS=$(aws acm describe-certificate \
                --certificate-arn "$CERT_ARN" \
                --region us-east-1 \
                --query 'Certificate.Status' \
                --output text)
            
            if [ "$CERT_STATUS" != "ISSUED" ]; then
                print_warning "Certificate not yet validated (Status: $CERT_STATUS)"
                ENABLE_CLOUDFRONT="false"
            else
                print_success "Certificate is valid and ready"
            fi
        fi
    fi
fi

# Deploy CloudFormation stack
print_status "Deploying CloudFormation stack..."

# Build parameter overrides
PARAMS="Environment=$ENVIRONMENT"
if [ "$ENABLE_CLOUDFRONT" = "true" ] && [ -n "$CERT_ARN" ]; then
    PARAMS="$PARAMS CertificateArn=$CERT_ARN"
fi
if [ -n "$HOSTED_ZONE_ID" ]; then
    PARAMS="$PARAMS HostedZoneId=$HOSTED_ZONE_ID"
fi

# Deploy the stack
aws cloudformation deploy \
    --template-file "$TEMPLATE_FILE" \
    --stack-name "$STACK_NAME" \
    --parameter-overrides $PARAMS \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --region "$AWS_REGION" \
    --no-fail-on-empty-changeset || {
        print_error "CloudFormation deployment failed. Check the stack events for details."
    }

print_success "CloudFormation stack deployed"

# Get stack outputs
print_status "Getting stack outputs..."

API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "")

S3_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
    --output text 2>/dev/null || echo "")

FRONTEND_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`FrontendURL`].OutputValue' \
    --output text 2>/dev/null || echo "")

CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text 2>/dev/null || echo "")

USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
    --output text 2>/dev/null || echo "")

USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
    --output text 2>/dev/null || echo "")

# Build and deploy frontend
print_status "Building frontend..."
cd app/frontend

# Set environment variables for build
export REACT_APP_API_URL="$API_URL"
export REACT_APP_ENVIRONMENT="$ENVIRONMENT"
export REACT_APP_USER_POOL_ID="$USER_POOL_ID"
export REACT_APP_CLIENT_ID="$USER_POOL_CLIENT_ID"
export REACT_APP_REGION="$AWS_REGION"

npm install --silent
npm run build
print_success "Frontend built"

# Deploy to S3
if [ -n "$S3_BUCKET" ]; then
    print_status "Deploying frontend to S3..."
    aws s3 sync build/ "s3://$S3_BUCKET/" \
        --delete \
        --region "$AWS_REGION" \
        --cache-control "public, max-age=31536000" \
        --exclude "index.html" \
        --exclude "*.json"
    
    # Upload index.html and JSON files with no-cache
    aws s3 cp build/index.html "s3://$S3_BUCKET/" \
        --region "$AWS_REGION" \
        --cache-control "no-cache, no-store, must-revalidate" \
        --content-type "text/html"
    
    aws s3 cp build/ "s3://$S3_BUCKET/" \
        --recursive \
        --region "$AWS_REGION" \
        --exclude "*" \
        --include "*.json" \
        --cache-control "no-cache, no-store, must-revalidate" \
        --content-type "application/json"
    
    print_success "Frontend deployed to S3"
    
    # Invalidate CloudFront if enabled
    if [ -n "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "None" ]; then
        print_status "Invalidating CloudFront cache..."
        aws cloudfront create-invalidation \
            --distribution-id "$CLOUDFRONT_ID" \
            --paths "/*" \
            --region "$AWS_REGION" >/dev/null
        print_success "CloudFront cache invalidated"
    fi
fi

cd ../..

# Display deployment summary
print_header "Deployment Complete!"
echo ""
echo "Stack Name: ${GREEN}$STACK_NAME${NC}"
echo "Region: ${GREEN}$AWS_REGION${NC}"
echo ""
if [ -n "$API_URL" ]; then
    echo "API Endpoint: ${CYAN}$API_URL${NC}"
fi
if [ -n "$FRONTEND_URL" ]; then
    echo "Frontend URL: ${CYAN}$FRONTEND_URL${NC}"
elif [ -n "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "None" ]; then
    CLOUDFRONT_DOMAIN=$(aws cloudfront get-distribution \
        --id "$CLOUDFRONT_ID" \
        --query 'Distribution.DomainName' \
        --output text 2>/dev/null)
    echo "CloudFront URL: ${CYAN}https://$CLOUDFRONT_DOMAIN${NC}"
fi
if [ "$DOMAIN_NAME" = "app.ordernimbus.com" ] && [ "$ENABLE_CLOUDFRONT" = "true" ]; then
    echo "Custom Domain: ${CYAN}https://app.ordernimbus.com${NC}"
fi
echo ""
echo "User Pool ID: ${YELLOW}$USER_POOL_ID${NC}"
echo "Client ID: ${YELLOW}$USER_POOL_CLIENT_ID${NC}"
echo ""
print_success "Deployment successful!"