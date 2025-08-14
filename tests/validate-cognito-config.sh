#!/bin/bash

# Cognito Configuration Validation Test
# This script validates that Cognito configuration is correctly set up
# and matches between CloudFormation outputs and frontend environment files

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
echo "Cognito Configuration Validation Test"
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

# Check if stack exists
STACK_NAME="ordernimbus-${ENVIRONMENT}"
echo "Checking CloudFormation stack: $STACK_NAME"

STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "DOES_NOT_EXIST")

if [ "$STACK_STATUS" = "DOES_NOT_EXIST" ]; then
    print_error "Stack $STACK_NAME does not exist!"
    exit 1
fi

if [[ "$STACK_STATUS" != *"COMPLETE"* ]]; then
    print_warning "Stack status is $STACK_STATUS (not in COMPLETE state)"
fi

# Get Cognito values from CloudFormation
echo ""
echo "Fetching Cognito values from CloudFormation..."

CF_USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
    --output text 2>/dev/null || echo "")

CF_CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -z "$CF_USER_POOL_ID" ] || [ -z "$CF_CLIENT_ID" ]; then
    print_error "Failed to get Cognito values from CloudFormation!"
    echo "  USER_POOL_ID: ${CF_USER_POOL_ID:-'NOT FOUND'}"
    echo "  CLIENT_ID: ${CF_CLIENT_ID:-'NOT FOUND'}"
    exit 1
fi

print_success "CloudFormation Cognito values:"
echo "  USER_POOL_ID: $CF_USER_POOL_ID"
echo "  CLIENT_ID: $CF_CLIENT_ID"

# Check SSM Parameters (if they exist)
echo ""
echo "Checking SSM Parameter Store..."

SSM_USER_POOL_ID=$(aws ssm get-parameter \
    --name "/ordernimbus/${ENVIRONMENT}/cognito/user-pool-id" \
    --region "$AWS_REGION" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo "")

SSM_CLIENT_ID=$(aws ssm get-parameter \
    --name "/ordernimbus/${ENVIRONMENT}/cognito/client-id" \
    --region "$AWS_REGION" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo "")

if [ -n "$SSM_USER_POOL_ID" ] && [ -n "$SSM_CLIENT_ID" ]; then
    print_success "SSM Parameters found"
    
    # Validate they match CloudFormation
    if [ "$SSM_USER_POOL_ID" != "$CF_USER_POOL_ID" ]; then
        print_error "SSM USER_POOL_ID doesn't match CloudFormation!"
        echo "  SSM: $SSM_USER_POOL_ID"
        echo "  CF:  $CF_USER_POOL_ID"
    fi
    
    if [ "$SSM_CLIENT_ID" != "$CF_CLIENT_ID" ]; then
        print_error "SSM CLIENT_ID doesn't match CloudFormation!"
        echo "  SSM: $SSM_CLIENT_ID"
        echo "  CF:  $CF_CLIENT_ID"
    fi
else
    print_warning "SSM Parameters not found (will be created during deployment)"
fi

# Check frontend environment files
echo ""
echo "Checking frontend environment files..."

# Function to extract value from .env file
get_env_value() {
    local file=$1
    local key=$2
    if [ -f "$file" ]; then
        grep "^$key=" "$file" 2>/dev/null | cut -d'=' -f2 || echo ""
    else
        echo ""
    fi
}

# Check .env.production
FRONTEND_DIR="app/frontend"
if [ -f "$FRONTEND_DIR/.env.production" ]; then
    ENV_USER_POOL_ID=$(get_env_value "$FRONTEND_DIR/.env.production" "REACT_APP_USER_POOL_ID")
    ENV_CLIENT_ID=$(get_env_value "$FRONTEND_DIR/.env.production" "REACT_APP_CLIENT_ID")
    
    print_success "Found .env.production"
    
    if [ "$ENV_USER_POOL_ID" != "$CF_USER_POOL_ID" ]; then
        print_error ".env.production USER_POOL_ID doesn't match CloudFormation!"
        echo "  .env: $ENV_USER_POOL_ID"
        echo "  CF:   $CF_USER_POOL_ID"
        MISMATCH=true
    else
        print_success "USER_POOL_ID matches"
    fi
    
    if [ "$ENV_CLIENT_ID" != "$CF_CLIENT_ID" ]; then
        print_error ".env.production CLIENT_ID doesn't match CloudFormation!"
        echo "  .env: $ENV_CLIENT_ID"
        echo "  CF:   $CF_CLIENT_ID"
        MISMATCH=true
    else
        print_success "CLIENT_ID matches"
    fi
else
    print_warning ".env.production not found (will be created during deployment)"
fi

# Check .env.local
if [ -f "$FRONTEND_DIR/.env.local" ]; then
    LOCAL_USER_POOL_ID=$(get_env_value "$FRONTEND_DIR/.env.local" "REACT_APP_USER_POOL_ID")
    LOCAL_CLIENT_ID=$(get_env_value "$FRONTEND_DIR/.env.local" "REACT_APP_CLIENT_ID")
    
    echo ""
    print_success "Found .env.local"
    
    if [ "$LOCAL_USER_POOL_ID" != "$CF_USER_POOL_ID" ]; then
        print_warning ".env.local USER_POOL_ID doesn't match CloudFormation"
        echo "  .env.local: $LOCAL_USER_POOL_ID"
        echo "  CF:         $CF_USER_POOL_ID"
        echo "  (Will be updated during deployment)"
    fi
    
    if [ "$LOCAL_CLIENT_ID" != "$CF_CLIENT_ID" ]; then
        print_warning ".env.local CLIENT_ID doesn't match CloudFormation"
        echo "  .env.local: $LOCAL_CLIENT_ID"
        echo "  CF:         $CF_CLIENT_ID"
        echo "  (Will be updated during deployment)"
    fi
fi

# Test Cognito User Pool accessibility
echo ""
echo "Testing Cognito User Pool accessibility..."

POOL_DETAILS=$(aws cognito-idp describe-user-pool \
    --user-pool-id "$CF_USER_POOL_ID" \
    --region "$AWS_REGION" \
    --query 'UserPool.{Name:Name,Status:Status}' \
    --output json 2>/dev/null || echo "{}")

if [ "$POOL_DETAILS" != "{}" ]; then
    POOL_STATUS=$(echo "$POOL_DETAILS" | jq -r '.Status')
    POOL_NAME=$(echo "$POOL_DETAILS" | jq -r '.Name')
    
    if [ "$POOL_STATUS" = "Enabled" ]; then
        print_success "User Pool '$POOL_NAME' is active and accessible"
    else
        print_error "User Pool status is: $POOL_STATUS"
    fi
else
    print_error "Cannot access User Pool $CF_USER_POOL_ID"
fi

# Summary
echo ""
echo "======================================"
echo "VALIDATION SUMMARY"
echo "======================================"

if [ -n "$MISMATCH" ]; then
    print_error "Configuration mismatches detected!"
    echo ""
    echo "To fix this, run:"
    echo "  ./deploy.sh $ENVIRONMENT $AWS_REGION"
    echo ""
    echo "The deployment script will automatically update all configurations."
    exit 1
else
    print_success "All Cognito configurations are valid!"
    echo ""
    echo "CloudFormation values will be used during deployment:"
    echo "  USER_POOL_ID: $CF_USER_POOL_ID"
    echo "  CLIENT_ID: $CF_CLIENT_ID"
fi

exit 0