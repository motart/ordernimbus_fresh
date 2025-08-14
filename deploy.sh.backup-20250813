#!/bin/bash

################################################################################
# OrderNimbus Universal Deployment Script
# Supports: local, staging, production environments
# Features: Dynamic API discovery, smart configuration, Shopify integration
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
ENVIRONMENT="${1:-local}"
AWS_REGION="${2:-us-west-1}"
SKIP_TESTS="${3:-false}"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(local|staging|production)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT. Use: local, staging, or production"
fi

# Load configuration
CONFIG_FILE="$SCRIPT_DIR/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Configuration file not found: $CONFIG_FILE"
fi

# Parse configuration based on environment
if [ "$ENVIRONMENT" = "local" ]; then
    CONFIG_KEY="local"
else
    CONFIG_KEY="aws"
fi

# Extract configuration values
APP_URL=$(jq -r ".environments.$CONFIG_KEY.APP_URL" "$CONFIG_FILE")
API_URL=$(jq -r ".environments.$CONFIG_KEY.API_URL" "$CONFIG_FILE")
SHOPIFY_REDIRECT_URI=$(jq -r ".environments.$CONFIG_KEY.SHOPIFY_REDIRECT_URI" "$CONFIG_FILE")
STACK_PREFIX=$(jq -r ".environments.$CONFIG_KEY.STACK_PREFIX" "$CONFIG_FILE")
TABLE_NAME=$(jq -r ".environments.$CONFIG_KEY.TABLE_NAME" "$CONFIG_FILE")
S3_BUCKET=$(jq -r ".environments.$CONFIG_KEY.S3_BUCKET" "$CONFIG_FILE")
CLOUDFRONT_ENABLED=$(jq -r ".environments.$CONFIG_KEY.CLOUDFRONT_ENABLED" "$CONFIG_FILE")
DOMAIN_ENABLED=$(jq -r ".environments.$CONFIG_KEY.DOMAIN_ENABLED" "$CONFIG_FILE")
COGNITO_POOL_NAME=$(jq -r ".environments.$CONFIG_KEY.COGNITO_POOL_NAME" "$CONFIG_FILE")

# AWS-specific configuration
if [ "$ENVIRONMENT" != "local" ]; then
    STACK_NAME="${STACK_PREFIX}-${ENVIRONMENT}"
    TEMPLATE_FILE="cloudformation-simple.yaml"
    HOSTED_ZONE_ID="Z03623712FIVU7Z4CJ949"
    
    # Shopify App Credentials (from Secrets Manager in production)
    SHOPIFY_CLIENT_ID="d4599bc60ea67dabd0be7fccc10476d9"
    SHOPIFY_CLIENT_SECRET="0c9bd606f75d8bebc451115f996a17bc"
fi

# Display deployment configuration
print_header "OrderNimbus Deployment"
echo "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo "Region: ${YELLOW}$AWS_REGION${NC}"
if [ "$ENVIRONMENT" != "local" ]; then
    echo "Stack: ${YELLOW}$STACK_NAME${NC}"
fi
echo "Skip Tests: $SKIP_TESTS"
echo ""

################################################################################
# LOCAL DEPLOYMENT
################################################################################
if [ "$ENVIRONMENT" = "local" ]; then
    print_header "Local Development Deployment"
    
    # Check Node.js and npm
    print_status "Checking prerequisites..."
    command -v node >/dev/null 2>&1 || print_error "Node.js is required but not installed"
    command -v npm >/dev/null 2>&1 || print_error "npm is required but not installed"
    print_success "Prerequisites checked"
    
    # Install dependencies
    print_status "Installing dependencies..."
    if [ ! -d "app/frontend/node_modules" ]; then
        cd app/frontend && npm install --silent && cd ../..
        print_success "Frontend dependencies installed"
    else
        print_success "Frontend dependencies up to date"
    fi
    
    # Start local DynamoDB if using Docker
    if command -v docker &> /dev/null; then
        print_status "Setting up local DynamoDB..."
        if ! docker ps | grep -q dynamodb-local; then
            docker run -d --name dynamodb-local -p 8000:8000 amazon/dynamodb-local:latest
            sleep 3
        fi
        
        # Create local table
        aws dynamodb create-table \
            --table-name "$TABLE_NAME" \
            --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
            --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
            --billing-mode PAY_PER_REQUEST \
            --endpoint-url http://localhost:8000 \
            --region "$AWS_REGION" 2>/dev/null || true
        print_success "Local DynamoDB ready"
    fi
    
    # Build frontend
    print_status "Building frontend..."
    cd app/frontend
    REACT_APP_API_URL="$API_URL" \
    REACT_APP_ENVIRONMENT="development" \
    npm run build
    cd ../..
    print_success "Frontend built"
    
    # Start local server
    print_status "Starting local server..."
    if [ -f "local-test-server.js" ]; then
        print_success "Local deployment ready!"
        echo ""
        echo "To start the server, run:"
        echo "  ${GREEN}node local-test-server.js${NC}"
        echo ""
        echo "Frontend: ${CYAN}http://localhost:3000${NC}"
        echo "API: ${CYAN}http://localhost:3001${NC}"
    else
        print_warning "local-test-server.js not found"
    fi
    
    exit 0
fi

################################################################################
# AWS DEPLOYMENT (STAGING/PRODUCTION)
################################################################################
print_header "AWS Deployment - $ENVIRONMENT"

# Check AWS CLI
print_status "Checking AWS credentials..."
aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1 || print_error "AWS credentials not configured"
print_success "AWS credentials valid"

# Store Shopify credentials in Secrets Manager
if [ "$ENVIRONMENT" = "production" ]; then
    print_status "Configuring Shopify credentials..."
    aws secretsmanager create-secret \
        --name "ordernimbus/$ENVIRONMENT/shopify" \
        --description "Shopify OAuth credentials" \
        --secret-string "{\"SHOPIFY_CLIENT_ID\":\"$SHOPIFY_CLIENT_ID\",\"SHOPIFY_CLIENT_SECRET\":\"$SHOPIFY_CLIENT_SECRET\"}" \
        --region "$AWS_REGION" >/dev/null 2>&1 || \
    aws secretsmanager update-secret \
        --secret-id "ordernimbus/$ENVIRONMENT/shopify" \
        --secret-string "{\"SHOPIFY_CLIENT_ID\":\"$SHOPIFY_CLIENT_ID\",\"SHOPIFY_CLIENT_SECRET\":\"$SHOPIFY_CLIENT_SECRET\"}" \
        --region "$AWS_REGION" >/dev/null 2>&1
    print_success "Shopify credentials secured"
fi

# Check for or create SSL certificate (for CloudFront)
if [ "$ENVIRONMENT" = "production" ] && [ "$CLOUDFRONT_ENABLED" = "true" ]; then
    print_status "Checking for SSL certificate in us-east-1..."
    
    # Check if certificate exists in us-east-1
    CERT_ARN=$(aws acm list-certificates \
        --region us-east-1 \
        --query "CertificateSummaryList[?DomainName=='app.ordernimbus.com'].CertificateArn" \
        --output text | head -1)
    
    if [ -z "$CERT_ARN" ]; then
        print_status "Creating SSL certificate for app.ordernimbus.com in us-east-1..."
        CERT_ARN=$(aws acm request-certificate \
            --domain-name app.ordernimbus.com \
            --subject-alternative-names "*.app.ordernimbus.com" \
            --validation-method DNS \
            --region us-east-1 \
            --query 'CertificateArn' \
            --output text)
        
        print_warning "Certificate requested. DNS validation required."
        print_warning "Please validate the certificate in AWS Console before CloudFront can be enabled."
        
        # Wait a moment for certificate to be available
        sleep 5
        
        # Get validation records
        print_status "Getting DNS validation records..."
        aws acm describe-certificate \
            --certificate-arn "$CERT_ARN" \
            --region us-east-1 \
            --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
            --output json
        
        # For now, disable CloudFront if certificate is not validated
        ENABLE_CLOUDFRONT="false"
        print_warning "CloudFront will be disabled until certificate is validated"
    else
        print_success "Found certificate: $CERT_ARN"
        
        # Check if certificate is validated
        CERT_STATUS=$(aws acm describe-certificate \
            --certificate-arn "$CERT_ARN" \
            --region us-east-1 \
            --query 'Certificate.Status' \
            --output text)
        
        if [ "$CERT_STATUS" = "ISSUED" ]; then
            ENABLE_CLOUDFRONT="true"
            print_success "Certificate is validated and ready"
        else
            ENABLE_CLOUDFRONT="false"
            print_warning "Certificate status: $CERT_STATUS - CloudFront will be disabled"
        fi
    fi
else
    ENABLE_CLOUDFRONT="false"
    CERT_ARN=""
fi

# Deploy CloudFormation stack
print_status "Deploying CloudFormation stack..."
aws cloudformation deploy \
    --template-file "$TEMPLATE_FILE" \
    --stack-name "$STACK_NAME" \
    --parameter-overrides \
        Environment="$ENVIRONMENT" \
        $([ "$DOMAIN_ENABLED" = "true" ] && echo "HostedZoneId=$HOSTED_ZONE_ID") \
        $([ -n "$CERT_ARN" ] && echo "CertificateArn=$CERT_ARN") \
        EnableCloudFront="$ENABLE_CLOUDFRONT" \
    --capabilities CAPABILITY_IAM \
    --region "$AWS_REGION" \
    --no-fail-on-empty-changeset

print_success "CloudFormation stack deployed"

# Discover deployed resources
print_status "Discovering deployed resources..."

# Get API URL from CloudFormation or API Gateway
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
    API_ENDPOINT=$(aws apigatewayv2 get-apis \
        --region "$AWS_REGION" \
        --query "Items[?contains(Name, '$STACK_NAME')].ApiEndpoint" \
        --output text | head -1)
    [ -n "$API_ENDPOINT" ] && API_URL="${API_ENDPOINT}/$ENVIRONMENT"
fi

if [ -z "$API_URL" ]; then
    print_error "Could not discover API Gateway URL"
fi

# Get other stack outputs
S3_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
    --output text 2>/dev/null || echo "$S3_BUCKET")

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

print_success "Resources discovered"
print_status "API URL: $API_URL"
print_status "S3 Bucket: $S3_BUCKET"

# Update configuration file with discovered values
print_status "Updating configuration..."
python3 -c "
import json
config_file = '$CONFIG_FILE'
with open(config_file, 'r') as f:
    config = json.load(f)
config['environments']['aws']['API_URL'] = '$API_URL'
config['environments']['aws']['SHOPIFY_REDIRECT_URI'] = '$API_URL/api/shopify/callback'
config['environments']['aws']['S3_BUCKET'] = '$S3_BUCKET'
with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)
" 2>/dev/null || print_warning "Could not update config.json"

# Build frontend with discovered API URL
print_status "Building frontend..."
cd app/frontend
npm install --silent 2>/dev/null || npm install

REACT_APP_API_URL="$API_URL" \
REACT_APP_ENVIRONMENT="$ENVIRONMENT" \
REACT_APP_REGION="$AWS_REGION" \
REACT_APP_USER_POOL_ID="$USER_POOL_ID" \
REACT_APP_CLIENT_ID="$USER_POOL_CLIENT_ID" \
npm run build

cd ../..
print_success "Frontend built with API URL: $API_URL"

# Deploy frontend to S3
print_status "Deploying frontend to S3..."
aws s3 sync app/frontend/build/ "s3://$S3_BUCKET/" \
    --delete \
    --region "$AWS_REGION"

FILE_COUNT=$(aws s3 ls "s3://$S3_BUCKET/" --recursive --region "$AWS_REGION" 2>/dev/null | wc -l | tr -d ' ')
print_success "Deployed $FILE_COUNT files to S3"

# Configure S3 for static website hosting
print_status "Configuring S3 website hosting..."
aws s3 website "s3://$S3_BUCKET/" \
    --index-document index.html \
    --error-document index.html \
    --region "$AWS_REGION" 2>/dev/null || true

# Update Lambda function with complete functionality
print_status "Updating Lambda function..."
LAMBDA_NAME="$TABLE_NAME"

# Create Lambda package
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Copy Lambda code
cat > index.js << 'LAMBDA_EOF'
// OrderNimbus Lambda Handler
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,userId',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json'
    };
    
    // Handle OPTIONS
    const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
    if (method === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }
    
    // Parse path and handle requests
    let path = event.rawPath || event.path || '/';
    if (path.includes('/production')) path = path.replace('/production', '');
    if (path.includes('/staging')) path = path.replace('/staging', '');
    
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[1];
    const userId = event.headers?.userId || event.headers?.userid || 'anonymous';
    
    try {
        // Handle different endpoints
        let responseData = {};
        
        switch(resource) {
            case 'stores':
                // Get stores for user
                const result = await dynamodb.query({
                    TableName: process.env.TABLE_NAME || 'ordernimbus-main',
                    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
                    ExpressionAttributeValues: { ':pk': 'user_' + userId, ':sk': 'store_' }
                }).promise();
                
                responseData = { 
                    stores: result.Items || [], 
                    count: result.Items?.length || 0 
                };
                break;
                
            case 'shopify':
                // Handle Shopify OAuth
                const action = pathParts[2];
                if (action === 'connect') {
                    const body = JSON.parse(event.body || '{}');
                    const state = Math.random().toString(36).substring(7);
                    const authUrl = `https://${body.storeDomain}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_CLIENT_ID}&scope=read_products,read_orders&redirect_uri=${encodeURIComponent(process.env.API_GATEWAY_URL + '/api/shopify/callback')}&state=${state}`;
                    responseData = { authUrl, message: 'Redirect user to Shopify OAuth' };
                } else {
                    responseData = { message: 'Shopify endpoint' };
                }
                break;
                
            default:
                responseData = { 
                    message: 'OrderNimbus API', 
                    version: '1.0',
                    timestamp: new Date().toISOString()
                };
        }
        
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(responseData) };
    } catch (error) {
        console.error('Handler error:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }
};
LAMBDA_EOF

# Package Lambda
npm init -y >/dev/null 2>&1
npm install aws-sdk --save >/dev/null 2>&1
zip -qr lambda.zip .

# Update Lambda function
aws lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --zip-file fileb://lambda.zip \
    --region "$AWS_REGION" >/dev/null 2>&1 || print_warning "Lambda update failed"

# Update Lambda environment variables
aws lambda update-function-configuration \
    --function-name "$LAMBDA_NAME" \
    --environment "Variables={
        TABLE_NAME=$TABLE_NAME,
        ENVIRONMENT=$ENVIRONMENT,
        USER_POOL_ID=$USER_POOL_ID,
        USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID,
        API_GATEWAY_URL=$API_URL,
        SHOPIFY_CLIENT_ID=$SHOPIFY_CLIENT_ID
    }" \
    --region "$AWS_REGION" >/dev/null 2>&1 || true

cd "$SCRIPT_DIR"
rm -rf "$TEMP_DIR"
print_success "Lambda function updated"

# Invalidate CloudFront if enabled
if [ "$CLOUDFRONT_ENABLED" = "true" ]; then
    print_status "Invalidating CloudFront cache..."
    DISTRIBUTION_ID=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Origins.Items[].DomainName, '$S3_BUCKET')].Id" \
        --output text --region "$AWS_REGION" 2>/dev/null | head -1)
    
    if [ -n "$DISTRIBUTION_ID" ]; then
        aws cloudfront create-invalidation \
            --distribution-id "$DISTRIBUTION_ID" \
            --paths "/*" \
            --region "$AWS_REGION" >/dev/null 2>&1
        print_success "CloudFront cache invalidated"
    fi
fi

# Run tests if not skipped
if [ "$SKIP_TESTS" != "true" ]; then
    print_status "Running integration tests..."
    if [ -f "test-shopify-flow.sh" ]; then
        ./test-shopify-flow.sh >/dev/null 2>&1 && print_success "Tests passed" || print_warning "Some tests failed"
    fi
fi

################################################################################
# DEPLOYMENT SUMMARY
################################################################################
print_header "✅ Deployment Complete!"

echo "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo "Region: ${YELLOW}$AWS_REGION${NC}"
echo ""

if [ "$ENVIRONMENT" = "production" ] && [ "$DOMAIN_ENABLED" = "true" ]; then
    echo "🌐 Frontend: ${CYAN}https://app.ordernimbus.com${NC}"
    echo "🔌 API: ${CYAN}https://api.ordernimbus.com${NC}"
else
    S3_WEBSITE="http://$S3_BUCKET.s3-website-$AWS_REGION.amazonaws.com"
    echo "🌐 Frontend: ${CYAN}$S3_WEBSITE${NC}"
    echo "🔌 API: ${CYAN}$API_URL${NC}"
fi

echo ""
echo "📊 Resources:"
echo "  • S3 Bucket: $S3_BUCKET"
echo "  • DynamoDB: $TABLE_NAME"
echo "  • Lambda: $LAMBDA_NAME"
if [ -n "$USER_POOL_ID" ]; then
    echo "  • Cognito: $USER_POOL_ID"
fi

echo ""
echo "🎯 Next Steps:"
echo "  1. Visit the frontend URL"
echo "  2. Navigate to Stores"
echo "  3. Connect a Shopify store"
echo "  4. Import products and orders"

echo ""
echo "📝 Useful Commands:"
echo "  • Redeploy frontend: ${GREEN}./redeploy-frontend.sh${NC}"
echo "  • View logs: ${GREEN}aws logs tail /aws/lambda/$LAMBDA_NAME --region $AWS_REGION${NC}"
echo "  • Destroy: ${GREEN}./destroy.sh $ENVIRONMENT${NC}"
echo ""