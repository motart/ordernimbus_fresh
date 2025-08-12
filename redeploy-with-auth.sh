#!/bin/bash

################################################################################
# OrderNimbus Re-deployment Script with Authentication Fix
# This updates the existing stack with proper auth implementation
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

print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

echo "=========================================="
echo -e "${GREEN}OrderNimbus Authentication Fix Deployment${NC}"
echo "=========================================="
echo "Region: $REGION"
echo "Stack: $STACK_NAME"
echo ""

# Check if stack exists
print_status "Checking existing stack..."
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" >/dev/null 2>&1; then
    print_success "Found existing stack"
else
    print_warning "Stack not found. Running initial deployment..."
    ./deploy-simple.sh "$REGION"
    exit 0
fi

# Update the stack with authentication fixes
print_status "Updating CloudFormation stack with authentication support..."
aws cloudformation update-stack \
    --stack-name "$STACK_NAME" \
    --template-body file://"$TEMPLATE_FILE" \
    --capabilities CAPABILITY_IAM \
    --region "$REGION" \
    --parameters ParameterKey=HostedZoneId,UsePreviousValue=true 2>/dev/null || {
    if [[ $? -eq 255 ]]; then
        print_warning "No updates needed for CloudFormation stack"
    else
        print_error "Failed to update stack"
        exit 1
    fi
}

# Wait for update to complete
print_status "Waiting for stack update to complete (this may take a few minutes)..."
aws cloudformation wait stack-update-complete --stack-name "$STACK_NAME" --region "$REGION" 2>/dev/null || {
    # Check if it's because there were no changes
    STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].StackStatus' --output text)
    if [[ "$STATUS" == "UPDATE_COMPLETE" ]] || [[ "$STATUS" == "CREATE_COMPLETE" ]]; then
        print_success "Stack is up to date"
    else
        print_error "Stack update failed with status: $STATUS"
        exit 1
    fi
}

# Get stack outputs
print_status "Getting stack outputs..."
API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)

# Rebuild frontend with Cognito configuration
print_status "Rebuilding frontend with authentication configuration..."
cd app/frontend

# Update aws-config.ts with the correct User Pool details
cat > src/aws-config.ts << EOF
export const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: '$USER_POOL_ID',
      userPoolClientId: '$USER_POOL_CLIENT_ID',
      signUpVerificationMethod: 'code' as const,
      loginWith: {
        email: true,
      },
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: false,
      },
    }
  }
};
EOF

print_status "Building frontend..."
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

# Test authentication endpoint
print_status "Testing authentication endpoints..."
echo ""
echo "Testing /api/auth/login endpoint..."
AUTH_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"test":"test"}' \
    --max-time 5 2>/dev/null | head -c 100)

if [[ "$AUTH_RESPONSE" == *"Email and password required"* ]] || [[ "$AUTH_RESPONSE" == *"success"* ]]; then
    print_success "Authentication endpoint is working!"
else
    print_warning "Authentication endpoint may need initialization"
    echo "Response: $AUTH_RESPONSE"
fi

# Create a test user
print_status "Would you like to create a test user? (y/n)"
read -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Enter email for test user:"
    read TEST_EMAIL
    echo "Enter password (min 8 chars, uppercase, lowercase, number):"
    read -s TEST_PASSWORD
    echo "Enter company name:"
    read TEST_COMPANY
    
    print_status "Creating test user..."
    REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"companyName\":\"$TEST_COMPANY\"}" \
        --max-time 10)
    
    if [[ "$REGISTER_RESPONSE" == *"success\":true"* ]]; then
        print_success "Test user created successfully!"
        echo "You can now login at http://app.ordernimbus.com"
    else
        print_warning "User creation response: $REGISTER_RESPONSE"
    fi
fi

# Summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ Authentication Fix Complete!${NC}"
echo "=========================================="
echo ""
echo -e "${BLUE}📍 Access Points:${NC}"
echo "  Frontend: http://app.ordernimbus.com"
echo "  API: $API_URL"
echo ""
echo -e "${BLUE}🔐 Authentication Configuration:${NC}"
echo "  User Pool ID: $USER_POOL_ID"
echo "  Client ID: $USER_POOL_CLIENT_ID"
echo "  Region: $REGION"
echo ""
echo -e "${BLUE}🧪 Test the authentication:${NC}"
echo "  1. Visit http://app.ordernimbus.com"
echo "  2. Click 'Sign Up' to create a new account"
echo "  3. Use your company email and a strong password"
echo "  4. Login with your credentials"
echo ""
echo -e "${YELLOW}Note: DNS and CloudFront may take a few minutes to propagate${NC}"
echo "=========================================="