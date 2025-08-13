#!/bin/bash

################################################################################
# OrderNimbus AWS Production Cleanup Script
# Safely destroys AWS resources for OrderNimbus production deployment
# CAUTION: This will delete ALL production data!
################################################################################

set -e

# Load AWS configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/scripts/config-helper.sh" aws

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Force confirmation for production
FORCE=${1:-false}

echo "🔥 OrderNimbus AWS Production Cleanup"
echo "====================================="
echo ""
echo -e "${RED}⚠️  WARNING: This will destroy ALL production resources!${NC}"
echo -e "${YELLOW}📊 Stack: $STACK_PREFIX${NC}"
echo -e "${YELLOW}🌍 Region: $AWS_REGION${NC}"
echo -e "${YELLOW}🪣 S3 Bucket: $S3_BUCKET${NC}"
echo -e "${YELLOW}🗄️ DynamoDB Table: $TABLE_NAME${NC}"
if [ "$CLOUDFRONT_ENABLED" = "true" ]; then
    echo -e "${YELLOW}☁️ CloudFront: $CLOUDFRONT_DISTRIBUTION_ID${NC}"
fi
echo ""

if [ "$FORCE" != "true" ]; then
    echo -e "${RED}This action is IRREVERSIBLE and will delete:${NC}"
    echo "• All customer data in DynamoDB"
    echo "• All uploaded files in S3"
    echo "• CloudFormation stack and all AWS resources"
    echo "• CloudFront distribution (if enabled)"
    echo ""
    read -p "Are you absolutely sure? Type 'DELETE' to confirm: " confirmation
    
    if [ "$confirmation" != "DELETE" ]; then
        echo -e "${GREEN}Aborted. No resources were deleted.${NC}"
        exit 0
    fi
fi

echo ""
echo -e "${BLUE}🧹 Starting AWS Resource Cleanup...${NC}"
echo "-----------------------------------"

# Function to print status
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate AWS environment
validate_environment aws

# Step 1: Empty and delete S3 bucket
print_status "Emptying S3 bucket: $S3_BUCKET..."
if aws s3 ls "s3://$S3_BUCKET" --region "$AWS_REGION" >/dev/null 2>&1; then
    aws s3 rm "s3://$S3_BUCKET" --recursive --region "$AWS_REGION" || print_warning "Some S3 objects may not have been deleted"
    print_success "S3 bucket emptied"
else
    print_warning "S3 bucket $S3_BUCKET not found or already deleted"
fi

# Step 2: Delete CloudFront distribution (if enabled)
if [ "$CLOUDFRONT_ENABLED" = "true" ]; then
    print_status "Checking CloudFront distribution..."
    
    if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
        DISTRIBUTION_STATUS=$(aws cloudfront get-distribution --id "$CLOUDFRONT_DISTRIBUTION_ID" --query 'Distribution.Status' --output text 2>/dev/null || echo "NotFound")
        
        if [ "$DISTRIBUTION_STATUS" != "NotFound" ]; then
            print_status "Disabling CloudFront distribution: $CLOUDFRONT_DISTRIBUTION_ID..."
            
            # Get current distribution config
            ETAG=$(aws cloudfront get-distribution-config --id "$CLOUDFRONT_DISTRIBUTION_ID" --query 'ETag' --output text 2>/dev/null)
            
            if [ -n "$ETAG" ] && [ "$ETAG" != "None" ]; then
                # Disable the distribution
                aws cloudfront get-distribution-config --id "$CLOUDFRONT_DISTRIBUTION_ID" --output json > /tmp/cf-config.json 2>/dev/null
                
                # Update enabled to false
                jq '.DistributionConfig.Enabled = false' /tmp/cf-config.json > /tmp/cf-config-disabled.json
                
                aws cloudfront update-distribution \
                    --id "$CLOUDFRONT_DISTRIBUTION_ID" \
                    --distribution-config file:///tmp/cf-config-disabled.json \
                    --if-match "$ETAG" \
                    --output text >/dev/null 2>&1 || print_warning "Could not disable CloudFront distribution"
                
                print_warning "CloudFront distribution disabled. It will be deleted automatically when the stack is destroyed."
                print_warning "Note: CloudFront deletion can take 15-20 minutes after disabling."
                
                # Cleanup temp files
                rm -f /tmp/cf-config.json /tmp/cf-config-disabled.json
            fi
        fi
    fi
fi

# Step 3: Delete Secrets Manager secrets
print_status "Deleting Secrets Manager secrets..."
SECRET_NAME="${STACK_PREFIX}/shopify"
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
    aws secretsmanager delete-secret \
        --secret-id "$SECRET_NAME" \
        --force-delete-without-recovery \
        --region "$AWS_REGION" >/dev/null 2>&1 || print_warning "Could not delete secret: $SECRET_NAME"
    print_success "Deleted Secrets Manager secret"
else
    print_warning "Secret $SECRET_NAME not found or already deleted"
fi

# Step 4: Delete DynamoDB tables
print_status "Deleting DynamoDB tables..."
TABLES=("$TABLE_NAME" "${STACK_PREFIX}-oauth-states")

for table in "${TABLES[@]}"; do
    if aws dynamodb describe-table --table-name "$table" --region "$AWS_REGION" >/dev/null 2>&1; then
        print_status "Deleting table: $table..."
        aws dynamodb delete-table --table-name "$table" --region "$AWS_REGION" >/dev/null 2>&1 || print_warning "Could not delete table: $table"
        print_success "Deleted table: $table"
    else
        print_warning "Table $table not found or already deleted"
    fi
done

# Step 5: Wait for DynamoDB tables to be deleted
print_status "Waiting for DynamoDB tables to be fully deleted..."
for table in "${TABLES[@]}"; do
    while aws dynamodb describe-table --table-name "$table" --region "$AWS_REGION" >/dev/null 2>&1; do
        print_status "Waiting for $table to be deleted..."
        sleep 5
    done
done
print_success "All DynamoDB tables deleted"

# Step 6: Delete CloudFormation stack
print_status "Deleting CloudFormation stack: $STACK_PREFIX..."
if aws cloudformation describe-stacks --stack-name "$STACK_PREFIX" --region "$AWS_REGION" >/dev/null 2>&1; then
    aws cloudformation delete-stack --stack-name "$STACK_PREFIX" --region "$AWS_REGION"
    print_status "Waiting for CloudFormation stack deletion..."
    
    # Wait for stack deletion with timeout
    TIMEOUT=1200  # 20 minutes
    ELAPSED=0
    while aws cloudformation describe-stacks --stack-name "$STACK_PREFIX" --region "$AWS_REGION" >/dev/null 2>&1 && [ $ELAPSED -lt $TIMEOUT ]; do
        print_status "Stack deletion in progress... (${ELAPSED}s elapsed)"
        sleep 30
        ELAPSED=$((ELAPSED + 30))
    done
    
    if [ $ELAPSED -ge $TIMEOUT ]; then
        print_error "Stack deletion timed out after 20 minutes"
        print_warning "Check AWS Console for stack status"
    else
        print_success "CloudFormation stack deleted"
    fi
else
    print_warning "CloudFormation stack $STACK_PREFIX not found or already deleted"
fi

# Step 7: Clean up remaining resources (best effort)
print_status "Cleaning up any remaining resources..."

# Delete Lambda functions that might not be in the stack
LAMBDA_FUNCTIONS=$(aws lambda list-functions --region "$AWS_REGION" --query "Functions[?starts_with(FunctionName, '$STACK_PREFIX')].FunctionName" --output text 2>/dev/null || echo "")
if [ -n "$LAMBDA_FUNCTIONS" ]; then
    for func in $LAMBDA_FUNCTIONS; do
        print_status "Deleting Lambda function: $func"
        aws lambda delete-function --function-name "$func" --region "$AWS_REGION" >/dev/null 2>&1 || print_warning "Could not delete function: $func"
    done
fi

# Delete Cognito User Pools
USER_POOLS=$(aws cognito-idp list-user-pools --max-items 20 --region "$AWS_REGION" --query "UserPools[?contains(Name, '$COGNITO_POOL_NAME')].Id" --output text 2>/dev/null || echo "")
if [ -n "$USER_POOLS" ]; then
    for pool_id in $USER_POOLS; do
        print_status "Deleting Cognito User Pool: $pool_id"
        aws cognito-idp delete-user-pool --user-pool-id "$pool_id" --region "$AWS_REGION" >/dev/null 2>&1 || print_warning "Could not delete user pool: $pool_id"
    done
fi

# Delete API Gateway APIs
API_IDS=$(aws apigatewayv2 get-apis --region "$AWS_REGION" --query "Items[?contains(Name, '$STACK_PREFIX')].ApiId" --output text 2>/dev/null || echo "")
if [ -n "$API_IDS" ]; then
    for api_id in $API_IDS; do
        print_status "Deleting API Gateway: $api_id"
        aws apigatewayv2 delete-api --api-id "$api_id" --region "$AWS_REGION" >/dev/null 2>&1 || print_warning "Could not delete API: $api_id"
    done
fi

# Step 8: Verify cleanup
print_status "Verifying cleanup..."
REMAINING_RESOURCES=""

# Check S3
if aws s3 ls "s3://$S3_BUCKET" --region "$AWS_REGION" >/dev/null 2>&1; then
    REMAINING_RESOURCES="${REMAINING_RESOURCES}\n• S3 Bucket: $S3_BUCKET"
fi

# Check DynamoDB
for table in "${TABLES[@]}"; do
    if aws dynamodb describe-table --table-name "$table" --region "$AWS_REGION" >/dev/null 2>&1; then
        REMAINING_RESOURCES="${REMAINING_RESOURCES}\n• DynamoDB Table: $table"
    fi
done

# Check CloudFormation
if aws cloudformation describe-stacks --stack-name "$STACK_PREFIX" --region "$AWS_REGION" >/dev/null 2>&1; then
    REMAINING_RESOURCES="${REMAINING_RESOURCES}\n• CloudFormation Stack: $STACK_PREFIX"
fi

if [ -n "$REMAINING_RESOURCES" ]; then
    print_warning "Some resources may still exist:"
    echo -e "$REMAINING_RESOURCES"
    echo ""
    print_warning "These may be in the process of being deleted, or may need manual cleanup."
    print_warning "Check the AWS Console for details."
else
    print_success "All resources appear to have been successfully deleted!"
fi

echo ""
echo -e "${GREEN}✅ AWS Cleanup Complete!${NC}"
echo "======================="
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo "• S3 bucket emptied"
echo "• DynamoDB tables deleted"
echo "• CloudFormation stack deleted"
if [ "$CLOUDFRONT_ENABLED" = "true" ]; then
    echo "• CloudFront distribution disabled (deletion in progress)"
fi
echo "• Secrets Manager secrets deleted"
echo ""
echo -e "${YELLOW}💡 To deploy again:${NC}"
echo "   ./deploy-aws-simple.sh"
echo ""
echo -e "${YELLOW}📝 Note: CloudFront distributions take 15-20 minutes to fully delete.${NC}"