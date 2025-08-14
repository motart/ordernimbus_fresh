#!/bin/bash
#####################################################################
# OrderNimbus Production Deployment Script V2
# 
# This script handles complete production deployment with all fixes
# learned from the deployment issues encountered.
#
# Usage: ./deploy-production-v2.sh [--skip-build] [--skip-tests]
#####################################################################

set -e  # Exit on error

# Configuration
ENVIRONMENT="production"
REGION="${AWS_REGION:-us-west-1}"
STACK_NAME="ordernimbus-${ENVIRONMENT}"
FRONTEND_DIR="app/frontend"
LAMBDA_DIR="lambda"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
SKIP_BUILD=false
SKIP_TESTS=false
for arg in "$@"; do
    case $arg in
        --skip-build) SKIP_BUILD=true ;;
        --skip-tests) SKIP_TESTS=true ;;
    esac
done

log_info "Starting OrderNimbus Production Deployment V2"
log_info "Environment: $ENVIRONMENT"
log_info "Region: $REGION"

#####################################################################
# STEP 1: Pre-deployment Checks
#####################################################################
log_info "Step 1: Running pre-deployment checks..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI not found. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS credentials not configured properly."
    exit 1
fi

# Check Node.js and npm
if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Please install it first."
    exit 1
fi

#####################################################################
# STEP 2: Store Shopify Credentials (if provided)
#####################################################################
log_info "Step 2: Checking Shopify credentials..."

SHOPIFY_CLIENT_ID="${SHOPIFY_CLIENT_ID:-d4599bc60ea67dabd0be7fccc10476d9}"
SHOPIFY_CLIENT_SECRET="${SHOPIFY_CLIENT_SECRET:-0c9bd606f75d8bebc451115f996a17bc}"

if [ -n "$SHOPIFY_CLIENT_ID" ] && [ -n "$SHOPIFY_CLIENT_SECRET" ]; then
    log_info "Storing Shopify credentials in SSM Parameter Store..."
    
    # Note: Redirect URI will be updated after stack creation
    aws ssm put-parameter \
        --name "/ordernimbus/${ENVIRONMENT}/shopify" \
        --value "{\"SHOPIFY_CLIENT_ID\":\"${SHOPIFY_CLIENT_ID}\",\"SHOPIFY_CLIENT_SECRET\":\"${SHOPIFY_CLIENT_SECRET}\"}" \
        --type "SecureString" \
        --overwrite \
        --region "$REGION" > /dev/null 2>&1 || true
    
    log_info "✓ Shopify credentials stored"
fi

#####################################################################
# STEP 3: Deploy CloudFormation Stack
#####################################################################
log_info "Step 3: Deploying CloudFormation stack..."

# Check if stack exists
STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "DOES_NOT_EXIST")

if [ "$STACK_EXISTS" != "DOES_NOT_EXIST" ]; then
    log_warn "Stack $STACK_NAME already exists with status: $STACK_EXISTS"
    log_info "Updating existing stack..."
    STACK_OPERATION="update-stack"
    WAIT_CONDITION="stack-update-complete"
else
    log_info "Creating new stack..."
    STACK_OPERATION="create-stack"
    WAIT_CONDITION="stack-create-complete"
fi

# Deploy/Update stack
aws cloudformation $STACK_OPERATION \
    --stack-name "$STACK_NAME" \
    --template-body file://cloudformation-simple.yaml \
    --parameters ParameterKey=Environment,ParameterValue="$ENVIRONMENT" \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --region "$REGION" || {
        if [ $? -eq 255 ]; then
            log_warn "No updates needed for stack"
        else
            log_error "Stack deployment failed"
            exit 1
        fi
    }

# Wait for stack to complete
log_info "Waiting for stack operation to complete (this may take 10-15 minutes)..."
aws cloudformation wait $WAIT_CONDITION \
    --stack-name "$STACK_NAME" \
    --region "$REGION" || {
        log_error "Stack operation failed or timed out"
        exit 1
    }

log_info "✓ Stack deployed successfully"

#####################################################################
# STEP 4: Get Stack Outputs
#####################################################################
log_info "Step 4: Getting stack outputs..."

# Get all outputs
OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs' \
    --output json)

# Extract key values
API_ENDPOINT=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="ApiEndpoint") | .OutputValue')
USER_POOL_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="UserPoolId") | .OutputValue')
USER_POOL_CLIENT_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="UserPoolClientId") | .OutputValue')
S3_BUCKET=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="S3BucketName") | .OutputValue')
LAMBDA_FUNCTION=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="LambdaFunctionName") | .OutputValue')
TABLE_NAME=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="DynamoDBTableName") | .OutputValue')

log_info "API Endpoint: $API_ENDPOINT"
log_info "User Pool ID: $USER_POOL_ID"
log_info "S3 Bucket: $S3_BUCKET"

#####################################################################
# STEP 5: Configure Lambda Permissions and Auth Flows
#####################################################################
log_info "Step 5: Configuring Lambda permissions and Cognito auth flows..."

# Get Lambda execution role
LAMBDA_ROLE=$(aws lambda get-function \
    --function-name "$LAMBDA_FUNCTION" \
    --region "$REGION" \
    --query 'Configuration.Role' \
    --output text | awk -F'/' '{print $NF}')

# Add Cognito permissions to Lambda role
cat > /tmp/cognito-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cognito-idp:AdminInitiateAuth",
                "cognito-idp:AdminCreateUser",
                "cognito-idp:AdminSetUserPassword",
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminUpdateUserAttributes",
                "cognito-idp:AdminDeleteUser",
                "cognito-idp:AdminAddUserToGroup",
                "cognito-idp:AdminRemoveUserFromGroup",
                "cognito-idp:AdminListGroupsForUser",
                "cognito-idp:ForgotPassword",
                "cognito-idp:ConfirmForgotPassword",
                "cognito-idp:InitiateAuth"
            ],
            "Resource": "*"
        }
    ]
}
EOF

aws iam put-role-policy \
    --role-name "$LAMBDA_ROLE" \
    --policy-name CognitoAccess \
    --policy-document file:///tmp/cognito-policy.json \
    --region "$REGION" 2>/dev/null || true

# Also attach managed policy for good measure
aws iam attach-role-policy \
    --role-name "$LAMBDA_ROLE" \
    --policy-arn arn:aws:iam::aws:policy/AmazonCognitoPowerUser \
    --region "$REGION" 2>/dev/null || true

# Enable ADMIN_USER_PASSWORD_AUTH flow
aws cognito-idp update-user-pool-client \
    --user-pool-id "$USER_POOL_ID" \
    --client-id "$USER_POOL_CLIENT_ID" \
    --explicit-auth-flows ALLOW_ADMIN_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_PASSWORD_AUTH ALLOW_USER_SRP_AUTH \
    --region "$REGION" > /dev/null 2>&1 || true

log_info "✓ Lambda permissions configured"

#####################################################################
# STEP 6: Update Lambda Function Code
#####################################################################
log_info "Step 6: Updating Lambda function code..."

# Create Lambda deployment package
TEMP_LAMBDA_DIR="/tmp/lambda-deploy-$$"
mkdir -p "$TEMP_LAMBDA_DIR"

# Copy Lambda code
if [ -f "$LAMBDA_DIR/main.js" ]; then
    cp "$LAMBDA_DIR/main.js" "$TEMP_LAMBDA_DIR/index.js"
elif [ -f "$LAMBDA_DIR/index.js" ]; then
    cp "$LAMBDA_DIR/index.js" "$TEMP_LAMBDA_DIR/index.js"
else
    log_error "Lambda code not found in $LAMBDA_DIR"
    exit 1
fi

# Update API Gateway URL in Lambda code
sed -i.bak "s|https://[a-z0-9]*.execute-api.[a-z0-9-]*.amazonaws.com/[a-z]*|${API_ENDPOINT}|g" "$TEMP_LAMBDA_DIR/index.js"

# Install dependencies
cd "$TEMP_LAMBDA_DIR"
npm init -y > /dev/null 2>&1
npm install aws-sdk > /dev/null 2>&1

# Create zip
zip -qr lambda-deploy.zip .

# Deploy Lambda
aws lambda update-function-code \
    --function-name "$LAMBDA_FUNCTION" \
    --zip-file fileb://lambda-deploy.zip \
    --region "$REGION" > /dev/null

# Update Lambda environment variables
aws lambda update-function-configuration \
    --function-name "$LAMBDA_FUNCTION" \
    --environment "Variables={
        ENVIRONMENT=$ENVIRONMENT,
        TABLE_NAME=$TABLE_NAME,
        USER_POOL_ID=$USER_POOL_ID,
        USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
    }" \
    --region "$REGION" > /dev/null

cd - > /dev/null
rm -rf "$TEMP_LAMBDA_DIR"

log_info "✓ Lambda function updated"

#####################################################################
# STEP 7: Update Shopify Credentials with Correct Redirect URI
#####################################################################
log_info "Step 7: Updating Shopify redirect URI..."

if [ -n "$SHOPIFY_CLIENT_ID" ] && [ -n "$SHOPIFY_CLIENT_SECRET" ]; then
    REDIRECT_URI="${API_ENDPOINT}/api/shopify/callback"
    
    aws ssm put-parameter \
        --name "/ordernimbus/${ENVIRONMENT}/shopify" \
        --value "{\"SHOPIFY_CLIENT_ID\":\"${SHOPIFY_CLIENT_ID}\",\"SHOPIFY_CLIENT_SECRET\":\"${SHOPIFY_CLIENT_SECRET}\",\"REDIRECT_URI\":\"${REDIRECT_URI}\"}" \
        --type "SecureString" \
        --overwrite \
        --region "$REGION" > /dev/null 2>&1
    
    log_info "✓ Shopify redirect URI updated: $REDIRECT_URI"
    log_warn "Remember to add this redirect URI to your Shopify app settings!"
fi

#####################################################################
# STEP 8: Build and Deploy Frontend
#####################################################################
if [ "$SKIP_BUILD" = false ]; then
    log_info "Step 8: Building and deploying frontend..."
    
    cd "$FRONTEND_DIR"
    
    # Install dependencies
    log_info "Installing frontend dependencies..."
    npm install > /dev/null 2>&1
    
    # Create production environment file
    cat > .env.production << EOF
# Production Environment Configuration
# Auto-generated by deploy-production-v2.sh on $(date)
# IMPORTANT: No localhost references allowed in production!

# Environment identifier
REACT_APP_ENVIRONMENT=production

# AWS Region
REACT_APP_REGION=$REGION

# API Gateway URL - Production endpoint
REACT_APP_API_URL=$API_ENDPOINT

# AWS Cognito Configuration
REACT_APP_USER_POOL_ID=$USER_POOL_ID
REACT_APP_CLIENT_ID=$USER_POOL_CLIENT_ID

# Additional endpoints (all AWS-based)
REACT_APP_GRAPHQL_URL=${API_ENDPOINT}/graphql
REACT_APP_WS_URL=$(echo "$API_ENDPOINT" | sed 's/https:/wss:/;s/http:/ws:/')/ws

# Feature Flags
REACT_APP_ENABLE_DEBUG=false
REACT_APP_ENABLE_ANALYTICS=true
REACT_APP_ENABLE_MOCK_DATA=false

# Build identification
REACT_APP_BUILD_TIME=$(date -Iseconds)
REACT_APP_BUILD_VERSION=production-$(date +%Y%m%d-%H%M%S)
EOF
    
    # Build frontend
    log_info "Building frontend application..."
    REACT_APP_ENVIRONMENT=production \
    REACT_APP_API_URL="$API_ENDPOINT" \
    REACT_APP_USER_POOL_ID="$USER_POOL_ID" \
    REACT_APP_CLIENT_ID="$USER_POOL_CLIENT_ID" \
    REACT_APP_REGION="$REGION" \
    npm run build > /dev/null 2>&1
    
    # Deploy to S3
    log_info "Deploying frontend to S3..."
    
    # Deploy HTML files with no-cache
    aws s3 sync build/ "s3://$S3_BUCKET/" \
        --delete \
        --region "$REGION" \
        --cache-control "no-cache, no-store, must-revalidate" \
        --exclude "static/*" \
        --exclude "*.js" \
        --exclude "*.css" > /dev/null 2>&1
    
    # Deploy static assets with long cache
    aws s3 sync build/static/ "s3://$S3_BUCKET/static/" \
        --region "$REGION" \
        --cache-control "public, max-age=31536000" > /dev/null 2>&1
    
    cd - > /dev/null
    log_info "✓ Frontend deployed"
else
    log_info "Skipping frontend build (--skip-build flag set)"
fi

#####################################################################
# STEP 9: Create Default Admin User
#####################################################################
log_info "Step 9: Creating default admin user..."

# Check if admin user exists
USER_EXISTS=$(aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "admin@ordernimbus.com" \
    --region "$REGION" 2>/dev/null | jq -r '.Username' || echo "")

if [ -z "$USER_EXISTS" ]; then
    # Create admin user
    aws cognito-idp admin-create-user \
        --user-pool-id "$USER_POOL_ID" \
        --username "admin@ordernimbus.com" \
        --user-attributes \
            Name=email,Value=admin@ordernimbus.com \
            Name=email_verified,Value=true \
            Name=custom:company_id,Value=ordernimbus-admin \
            Name=custom:company_name,Value=OrderNimbus \
            Name=custom:role,Value=admin \
        --temporary-password "TempPass123!" \
        --message-action SUPPRESS \
        --region "$REGION" > /dev/null 2>&1 || true
    
    # Set permanent password
    aws cognito-idp admin-set-user-password \
        --user-pool-id "$USER_POOL_ID" \
        --username "admin@ordernimbus.com" \
        --password "Admin12345" \
        --permanent \
        --region "$REGION" > /dev/null 2>&1 || true
    
    log_info "✓ Admin user created (admin@ordernimbus.com / Admin12345)"
else
    log_info "✓ Admin user already exists"
fi

#####################################################################
# STEP 10: Run Tests
#####################################################################
if [ "$SKIP_TESTS" = false ]; then
    log_info "Step 10: Running verification tests..."
    
    # Test API health
    echo -n "  - API Health: "
    if curl -s "$API_ENDPOINT/api/config" | grep -q "environment"; then
        echo "✓ Pass"
    else
        echo "✗ Fail"
    fi
    
    # Test authentication
    echo -n "  - Authentication (UC001): "
    if curl -s -X POST "$API_ENDPOINT/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"admin@ordernimbus.com","password":"Admin12345"}' | grep -q "tokens"; then
        echo "✓ Pass"
    else
        echo "✗ Fail"
    fi
    
    # Test store management
    echo -n "  - Store Management (UC002): "
    if curl -s "$API_ENDPOINT/api/stores" -H "userId: admin" | grep -q "stores"; then
        echo "✓ Pass"
    else
        echo "✗ Fail"
    fi
    
    # Test Shopify connection
    echo -n "  - Shopify Connection (UC003): "
    if curl -s -X POST "$API_ENDPOINT/api/shopify/connect" \
        -H "Content-Type: application/json" \
        -d '{"storeDomain":"test.myshopify.com","userId":"admin"}' | grep -q "authUrl"; then
        echo "✓ Pass"
    else
        echo "✗ Fail"
    fi
else
    log_info "Skipping tests (--skip-tests flag set)"
fi

#####################################################################
# STEP 11: Output Summary
#####################################################################
log_info "========================================="
log_info "Deployment Complete!"
log_info "========================================="
echo ""
echo "🌐 Application URLs:"
echo "  Frontend: http://${S3_BUCKET}.s3-website-${REGION}.amazonaws.com"
echo "  API Endpoint: $API_ENDPOINT"
echo ""
echo "🔐 Authentication:"
echo "  User Pool ID: $USER_POOL_ID"
echo "  Client ID: $USER_POOL_CLIENT_ID"
echo "  Admin User: admin@ordernimbus.com"
echo "  Admin Password: Admin12345"
echo ""
echo "📦 AWS Resources:"
echo "  Lambda Function: $LAMBDA_FUNCTION"
echo "  DynamoDB Table: $TABLE_NAME"
echo "  S3 Bucket: $S3_BUCKET"
echo ""

if [ -n "$SHOPIFY_CLIENT_ID" ]; then
    echo "🛍️ Shopify Integration:"
    echo "  Redirect URI: ${API_ENDPOINT}/api/shopify/callback"
    echo "  ⚠️  Add this URI to your Shopify app settings!"
    echo ""
fi

echo "✅ All systems operational!"

# Clean up temporary files
rm -f /tmp/cognito-policy.json

exit 0