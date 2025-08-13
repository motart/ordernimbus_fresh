#!/bin/bash

################################################################################
# OrderNimbus Universal Destruction Script
# Safely removes all resources for specified environment
# Supports: local, staging, production
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
print_header() { echo -e "\n${RED}═══════════════════════════════════════${NC}\n${RED}$1${NC}\n${RED}═══════════════════════════════════════${NC}"; }
print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; exit 1; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Parse arguments
ENVIRONMENT="${1:-local}"
AWS_REGION="${2:-us-west-1}"
FORCE="${3:-false}"

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
STACK_PREFIX=$(jq -r ".environments.$CONFIG_KEY.STACK_PREFIX" "$CONFIG_FILE")
TABLE_NAME=$(jq -r ".environments.$CONFIG_KEY.TABLE_NAME" "$CONFIG_FILE")
S3_BUCKET=$(jq -r ".environments.$CONFIG_KEY.S3_BUCKET" "$CONFIG_FILE")
CLOUDFRONT_ENABLED=$(jq -r ".environments.$CONFIG_KEY.CLOUDFRONT_ENABLED" "$CONFIG_FILE")
COGNITO_POOL_NAME=$(jq -r ".environments.$CONFIG_KEY.COGNITO_POOL_NAME" "$CONFIG_FILE")

# AWS-specific configuration
if [ "$ENVIRONMENT" != "local" ]; then
    STACK_NAME="${STACK_PREFIX}-${ENVIRONMENT}"
fi

# Display destruction warning
print_header "⚠️  OrderNimbus Destruction Warning"
echo ""
echo -e "${RED}You are about to destroy:${NC}"
echo "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo "Region: ${YELLOW}$AWS_REGION${NC}"

if [ "$ENVIRONMENT" = "local" ]; then
    echo ""
    echo "This will remove:"
    echo "  • Local DynamoDB container (if running)"
    echo "  • Local test data"
    echo "  • Built frontend files"
else
    echo "Stack: ${YELLOW}$STACK_NAME${NC}"
    echo ""
    echo "This will permanently delete:"
    echo "  • CloudFormation stack: $STACK_NAME"
    echo "  • S3 bucket: $S3_BUCKET (and all files)"
    echo "  • DynamoDB table: $TABLE_NAME (and all data)"
    echo "  • Lambda functions"
    echo "  • API Gateway"
    echo "  • Cognito User Pool (if exists)"
    echo "  • CloudFront distribution (if enabled)"
    echo "  • All associated IAM roles and policies"
fi

echo ""
echo -e "${RED}⚠️  This action is IRREVERSIBLE!${NC}"
echo ""

# Require confirmation unless forced
if [ "$FORCE" != "true" ]; then
    if [ "$ENVIRONMENT" = "production" ]; then
        echo -e "${RED}PRODUCTION ENVIRONMENT DETECTED!${NC}"
        echo "Type 'DELETE PRODUCTION' to confirm: "
        read confirmation
        if [ "$confirmation" != "DELETE PRODUCTION" ]; then
            print_success "Destruction cancelled. No resources were deleted."
            exit 0
        fi
    else
        echo "Type 'DELETE' to confirm: "
        read confirmation
        if [ "$confirmation" != "DELETE" ]; then
            print_success "Destruction cancelled. No resources were deleted."
            exit 0
        fi
    fi
fi

################################################################################
# LOCAL DESTRUCTION
################################################################################
if [ "$ENVIRONMENT" = "local" ]; then
    print_header "Local Environment Cleanup"
    
    # Stop and remove Docker containers
    if command -v docker &> /dev/null; then
        print_status "Stopping Docker containers..."
        docker stop dynamodb-local 2>/dev/null || true
        docker rm dynamodb-local 2>/dev/null || true
        print_success "Docker containers removed"
    fi
    
    # Clean build directories
    print_status "Cleaning build artifacts..."
    rm -rf app/frontend/build
    rm -rf app/frontend/node_modules/.cache
    print_success "Build artifacts cleaned"
    
    # Clear local storage
    print_status "Clearing local data..."
    rm -rf .dynamodb 2>/dev/null || true
    rm -rf .aws-sam 2>/dev/null || true
    print_success "Local data cleared"
    
    print_header "✅ Local Environment Cleaned"
    echo ""
    echo "Local development environment has been reset."
    echo "Run ${GREEN}./deploy.sh local${NC} to set up again."
    exit 0
fi

################################################################################
# AWS DESTRUCTION (STAGING/PRODUCTION)
################################################################################
print_header "AWS Resource Destruction - $ENVIRONMENT"

# Check AWS CLI
print_status "Verifying AWS credentials..."
aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1 || print_error "AWS credentials not configured"
print_success "AWS credentials valid"

# Check if stack exists
print_status "Checking CloudFormation stack..."
STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" 2>/dev/null | jq -r '.Stacks[0].StackStatus' || echo "")

if [ -z "$STACK_EXISTS" ]; then
    print_warning "Stack $STACK_NAME does not exist in $AWS_REGION"
    echo "Nothing to destroy."
    exit 0
fi

print_success "Found stack: $STACK_NAME (Status: $STACK_EXISTS)"

# Get stack resources before deletion
print_status "Identifying resources to delete..."
RESOURCES=$(aws cloudformation list-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'StackResourceSummaries[].{Type:ResourceType,Id:PhysicalResourceId}' \
    --output json 2>/dev/null || echo "[]")

# Empty S3 bucket if it exists
print_status "Checking for S3 bucket..."
BUCKET_EXISTS=$(aws s3api head-bucket --bucket "$S3_BUCKET" 2>&1 || echo "not found")
if [[ ! "$BUCKET_EXISTS" =~ "not found" ]]; then
    print_status "Emptying S3 bucket: $S3_BUCKET..."
    
    # Delete all objects
    aws s3 rm "s3://$S3_BUCKET" --recursive --region "$AWS_REGION" 2>/dev/null || true
    
    # Delete all versions if versioning is enabled
    VERSIONS=$(aws s3api list-object-versions \
        --bucket "$S3_BUCKET" \
        --region "$AWS_REGION" \
        --query 'Versions[].{Key:Key,VersionId:VersionId}' \
        --output json 2>/dev/null || echo "[]")
    
    if [ "$VERSIONS" != "[]" ] && [ -n "$VERSIONS" ]; then
        print_status "Removing versioned objects..."
        echo "$VERSIONS" | jq -c '.[]' | while read -r obj; do
            KEY=$(echo "$obj" | jq -r '.Key')
            VERSION=$(echo "$obj" | jq -r '.VersionId')
            aws s3api delete-object \
                --bucket "$S3_BUCKET" \
                --key "$KEY" \
                --version-id "$VERSION" \
                --region "$AWS_REGION" 2>/dev/null || true
        done
    fi
    
    # Delete all delete markers
    DELETE_MARKERS=$(aws s3api list-object-versions \
        --bucket "$S3_BUCKET" \
        --region "$AWS_REGION" \
        --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' \
        --output json 2>/dev/null || echo "[]")
    
    if [ "$DELETE_MARKERS" != "[]" ] && [ -n "$DELETE_MARKERS" ]; then
        print_status "Removing delete markers..."
        echo "$DELETE_MARKERS" | jq -c '.[]' | while read -r marker; do
            KEY=$(echo "$marker" | jq -r '.Key')
            VERSION=$(echo "$marker" | jq -r '.VersionId')
            aws s3api delete-object \
                --bucket "$S3_BUCKET" \
                --key "$KEY" \
                --version-id "$VERSION" \
                --region "$AWS_REGION" 2>/dev/null || true
        done
    fi
    
    print_success "S3 bucket emptied"
fi

# Disable and delete CloudFront distribution if exists
if [ "$CLOUDFRONT_ENABLED" = "true" ]; then
    print_status "Checking for CloudFront distribution..."
    DISTRIBUTION_ID=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Origins.Items[].DomainName, '$S3_BUCKET')].Id" \
        --output text --region "$AWS_REGION" 2>/dev/null | head -1)
    
    if [ -n "$DISTRIBUTION_ID" ]; then
        print_status "Disabling CloudFront distribution: $DISTRIBUTION_ID..."
        
        # Get distribution config
        aws cloudfront get-distribution-config --id "$DISTRIBUTION_ID" > /tmp/dist-config.json 2>/dev/null
        
        # Extract ETag
        ETAG=$(jq -r '.ETag' /tmp/dist-config.json)
        
        # Disable distribution
        jq '.DistributionConfig.Enabled = false' /tmp/dist-config.json | \
            jq '.DistributionConfig' > /tmp/dist-config-disabled.json
        
        aws cloudfront update-distribution \
            --id "$DISTRIBUTION_ID" \
            --distribution-config file:///tmp/dist-config-disabled.json \
            --if-match "$ETAG" >/dev/null 2>&1
        
        print_warning "CloudFront distribution disabled. It will be deleted with the stack."
        rm -f /tmp/dist-config*.json
    fi
fi

# Delete Cognito domain if exists (prevents stack deletion failure)
print_status "Checking for Cognito User Pool domain..."
USER_POOL_ID=$(aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'StackResources[?ResourceType==`AWS::Cognito::UserPool`].PhysicalResourceId' \
    --output text 2>/dev/null || echo "")

if [ -n "$USER_POOL_ID" ]; then
    DOMAIN=$(aws cognito-idp describe-user-pool \
        --user-pool-id "$USER_POOL_ID" \
        --region "$AWS_REGION" \
        --query 'UserPool.Domain' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "None" ]; then
        print_status "Deleting Cognito domain: $DOMAIN..."
        aws cognito-idp delete-user-pool-domain \
            --domain "$DOMAIN" \
            --user-pool-id "$USER_POOL_ID" \
            --region "$AWS_REGION" 2>/dev/null || true
        sleep 5
        print_success "Cognito domain deleted"
    fi
fi

# Delete Secrets Manager secrets
if [ "$ENVIRONMENT" = "production" ]; then
    print_status "Checking for Secrets Manager secrets..."
    SECRET_EXISTS=$(aws secretsmanager describe-secret \
        --secret-id "ordernimbus/$ENVIRONMENT/shopify" \
        --region "$AWS_REGION" 2>/dev/null || echo "")
    
    if [ -n "$SECRET_EXISTS" ]; then
        print_status "Deleting Shopify credentials..."
        aws secretsmanager delete-secret \
            --secret-id "ordernimbus/$ENVIRONMENT/shopify" \
            --force-delete-without-recovery \
            --region "$AWS_REGION" 2>/dev/null || true
        print_success "Secrets deleted"
    fi
fi

# Delete CloudFormation stack
print_status "Deleting CloudFormation stack: $STACK_NAME..."
aws cloudformation delete-stack \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION"

# Wait for stack deletion
print_status "Waiting for stack deletion (this may take 5-10 minutes)..."
WAIT_COUNT=0
MAX_WAIT=60  # 10 minutes

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    STATUS=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" 2>/dev/null | jq -r '.Stacks[0].StackStatus' || echo "DELETED")
    
    if [ "$STATUS" = "DELETED" ] || [ "$STATUS" = "DELETE_COMPLETE" ]; then
        print_success "Stack deleted successfully"
        break
    elif [ "$STATUS" = "DELETE_FAILED" ]; then
        print_error "Stack deletion failed. Manual intervention required."
    fi
    
    echo -n "."
    sleep 10
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
    print_warning "Stack deletion is taking longer than expected. Check AWS Console."
fi

# Clean up any orphaned resources
print_status "Checking for orphaned resources..."

# Check for orphaned Lambda functions
LAMBDA_FUNCTIONS=$(aws lambda list-functions \
    --region "$AWS_REGION" \
    --query "Functions[?contains(FunctionName, '$STACK_PREFIX')].FunctionName" \
    --output text 2>/dev/null || echo "")

if [ -n "$LAMBDA_FUNCTIONS" ]; then
    print_status "Cleaning up orphaned Lambda functions..."
    for func in $LAMBDA_FUNCTIONS; do
        aws lambda delete-function --function-name "$func" --region "$AWS_REGION" 2>/dev/null || true
    done
    print_success "Lambda functions cleaned"
fi

# Check for orphaned API Gateways
API_IDS=$(aws apigatewayv2 get-apis \
    --region "$AWS_REGION" \
    --query "Items[?contains(Name, '$STACK_PREFIX')].ApiId" \
    --output text 2>/dev/null || echo "")

if [ -n "$API_IDS" ]; then
    print_status "Cleaning up orphaned API Gateways..."
    for api_id in $API_IDS; do
        aws apigatewayv2 delete-api --api-id "$api_id" --region "$AWS_REGION" 2>/dev/null || true
    done
    print_success "API Gateways cleaned"
fi

################################################################################
# DESTRUCTION SUMMARY
################################################################################
print_header "✅ Destruction Complete"

echo ""
echo "Environment ${YELLOW}$ENVIRONMENT${NC} has been completely removed from ${YELLOW}$AWS_REGION${NC}"
echo ""
echo "Deleted resources:"
echo "  ✓ CloudFormation stack: $STACK_NAME"
echo "  ✓ S3 bucket and all contents"
echo "  ✓ DynamoDB table and all data"
echo "  ✓ Lambda functions"
echo "  ✓ API Gateway"
if [ -n "$USER_POOL_ID" ]; then
    echo "  ✓ Cognito User Pool"
fi
if [ "$CLOUDFRONT_ENABLED" = "true" ]; then
    echo "  ✓ CloudFront distribution"
fi
echo ""
echo "To redeploy, run: ${GREEN}./deploy.sh $ENVIRONMENT${NC}"
echo ""