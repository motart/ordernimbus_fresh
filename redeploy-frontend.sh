#!/bin/bash

################################################################################
# Smart Frontend Redeploy Script
# Always discovers and uses the actual deployed API URL
# No more hardcoded URLs that become stale!
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Configuration
AWS_REGION="${AWS_REGION:-us-west-1}"
STACK_NAME="ordernimbus-production"
ENVIRONMENT="${1:-production}"

echo "=========================================="
echo -e "${GREEN}Smart Frontend Redeploy${NC}"
echo "=========================================="
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo ""

# Step 1: Discover the actual API URL from deployed resources
print_status "Discovering deployed API Gateway URL..."

# Try CloudFormation outputs first
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "")

# If not in CloudFormation, look for API Gateway directly
if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
    print_status "Searching API Gateway..."
    API_ENDPOINT=$(aws apigatewayv2 get-apis \
        --region "$AWS_REGION" \
        --query "Items[?contains(Name, 'ordernimbus-$ENVIRONMENT')].ApiEndpoint" \
        --output text | head -1)
    
    if [ -n "$API_ENDPOINT" ]; then
        API_URL="${API_ENDPOINT}/$ENVIRONMENT"
    else
        print_error "Could not find deployed API Gateway!"
        print_status "Please ensure the stack is deployed first with: ./deploy-aws-simple.sh"
        exit 1
    fi
fi

print_success "Found API URL: $API_URL"

# Step 2: Get other stack outputs
print_status "Getting stack configuration..."

S3_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
    --output text 2>/dev/null || echo "ordernimbus-production-frontend-335021149718")

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

# Step 3: Update config.json with discovered values
print_status "Updating config.json..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python3 -c "
import json
config_file = '$SCRIPT_DIR/config.json'
try:
    with open(config_file, 'r') as f:
        config = json.load(f)
    config['environments']['aws']['API_URL'] = '$API_URL'
    config['environments']['aws']['SHOPIFY_REDIRECT_URI'] = '$API_URL/api/shopify/callback'
    config['environments']['aws']['S3_BUCKET'] = '$S3_BUCKET'
    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)
    print('✓ Config updated with discovered values')
except Exception as e:
    print(f'Warning: Could not update config.json: {e}')
"

# Step 4: Build frontend with discovered API URL
print_status "Building frontend with API URL: $API_URL"

# Navigate to frontend directory
if [ -d "app/frontend" ]; then
    cd app/frontend
elif [ -d "frontend" ]; then
    cd frontend
elif [ -f "package.json" ] && [ -f "src/App.tsx" ]; then
    # Already in frontend directory
    true
else
    print_error "Cannot find frontend directory"
    exit 1
fi

# Install dependencies
npm install --silent 2>/dev/null || npm install

# Build with discovered API URL
REACT_APP_API_URL="$API_URL" \
REACT_APP_ENVIRONMENT="$ENVIRONMENT" \
REACT_APP_REGION="$AWS_REGION" \
REACT_APP_USER_POOL_ID="$USER_POOL_ID" \
REACT_APP_CLIENT_ID="$USER_POOL_CLIENT_ID" \
npm run build

print_success "Frontend built successfully"

# Step 5: Deploy to S3
print_status "Deploying to S3 bucket: $S3_BUCKET"
aws s3 sync build/ "s3://$S3_BUCKET/" \
    --delete \
    --region "$AWS_REGION"

# Verify deployment
FILE_COUNT=$(aws s3 ls "s3://$S3_BUCKET/" --recursive --region "$AWS_REGION" 2>/dev/null | wc -l | tr -d ' ')
if [ "$FILE_COUNT" -gt 0 ]; then
    print_success "Deployed $FILE_COUNT files to S3"
else
    print_warning "No files found in S3 after deployment"
fi

# Step 6: Invalidate CloudFront cache if exists
print_status "Checking for CloudFront distribution..."
CLOUDFRONT_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Aliases.Items, 'app.ordernimbus.com') || contains(Origins.Items[].DomainName, '$S3_BUCKET')].Id" \
    --output text 2>/dev/null | head -1)

if [ -n "$CLOUDFRONT_ID" ]; then
    print_status "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_ID" \
        --paths "/*" \
        --output text >/dev/null 2>&1
    print_success "CloudFront cache invalidated"
else
    print_warning "No CloudFront distribution found"
fi

# Step 7: Show deployment summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ Frontend Redeployed Successfully!${NC}"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  API URL: $API_URL"
echo "  S3 Bucket: $S3_BUCKET"
echo "  Environment: $ENVIRONMENT"
echo "  Region: $AWS_REGION"
echo ""

# Check if the app is accessible
if [ -n "$CLOUDFRONT_ID" ]; then
    echo "Access your app at:"
    echo "  https://app.ordernimbus.com"
else
    # Get S3 website URL
    S3_WEBSITE_URL=$(aws s3api get-bucket-website \
        --bucket "$S3_BUCKET" \
        --region "$AWS_REGION" 2>/dev/null && echo "http://$S3_BUCKET.s3-website-$AWS_REGION.amazonaws.com" || echo "")
    
    if [ -n "$S3_WEBSITE_URL" ]; then
        echo "Access your app at:"
        echo "  $S3_WEBSITE_URL"
    fi
fi

echo ""
echo "The frontend is now using the correct API URL!"
echo "No more mismatched endpoints! 🎉"
echo "=========================================="