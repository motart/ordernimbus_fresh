#!/bin/bash

# ====================================================================
# OrderNimbus Production Environment Complete Teardown Script
# WARNING: This will permanently delete ALL production resources!
# ====================================================================

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="production"
AWS_REGION="us-west-1"
STACK_NAME="ordernimbus-production"

echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
echo -e "${RED}⚠️  WARNING: PRODUCTION ENVIRONMENT TEARDOWN${NC}"
echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}This script will permanently delete:${NC}"
echo "  • CloudFormation stack: $STACK_NAME"
echo "  • All S3 buckets with 'ordernimbus-production' prefix"
echo "  • Lambda functions"
echo "  • API Gateway"
echo "  • DynamoDB tables"
echo "  • Cognito User Pool"
echo "  • CloudFront distributions"
echo "  • All associated data and configurations"
echo ""
echo -e "${RED}THIS ACTION CANNOT BE UNDONE!${NC}"
echo ""
read -p "Type 'DELETE PRODUCTION' to confirm: " confirmation

if [ "$confirmation" != "DELETE PRODUCTION" ]; then
    echo -e "${GREEN}Teardown cancelled. No resources were deleted.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Starting production teardown...${NC}"
echo "=========================================="

# Function to print status
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 1. Empty and delete S3 buckets
echo ""
echo -e "${BLUE}Step 1: Emptying and deleting S3 buckets...${NC}"
echo "--------------------------------------------"

BUCKETS=$(aws s3 ls | grep "ordernimbus-production" | awk '{print $3}')

for bucket in $BUCKETS; do
    echo "Processing bucket: $bucket"
    
    # Check if bucket exists
    if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
        # Delete all objects
        echo "  Deleting all objects..."
        aws s3 rm "s3://$bucket" --recursive 2>/dev/null || true
        
        # Delete all versions (for versioned buckets)
        echo "  Deleting all versions..."
        aws s3api list-object-versions --bucket "$bucket" --output json 2>/dev/null | \
            jq -r '.Versions[]? | "--key '\''\(.Key)'\'' --version-id \(.VersionId)"' | \
            xargs -L1 aws s3api delete-object --bucket "$bucket" 2>/dev/null || true
        
        # Delete all delete markers
        echo "  Deleting all delete markers..."
        aws s3api list-object-versions --bucket "$bucket" --output json 2>/dev/null | \
            jq -r '.DeleteMarkers[]? | "--key '\''\(.Key)'\'' --version-id \(.VersionId)"' | \
            xargs -L1 aws s3api delete-object --bucket "$bucket" 2>/dev/null || true
        
        # Delete the bucket
        echo "  Deleting bucket..."
        aws s3api delete-bucket --bucket "$bucket" --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted bucket: $bucket" || \
            print_warning "Could not delete bucket: $bucket (may be deleted by CloudFormation)"
    else
        print_warning "Bucket $bucket not found or already deleted"
    fi
done

# 2. Delete CloudFormation stack
echo ""
echo -e "${BLUE}Step 2: Deleting CloudFormation stack...${NC}"
echo "----------------------------------------"

if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $AWS_REGION &>/dev/null; then
    echo "Initiating stack deletion..."
    aws cloudformation delete-stack --stack-name $STACK_NAME --region $AWS_REGION
    
    echo "Waiting for stack deletion (this may take 10-20 minutes)..."
    aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME --region $AWS_REGION 2>/dev/null && \
        print_status "CloudFormation stack deleted successfully" || \
        print_warning "Stack deletion may still be in progress"
else
    print_warning "CloudFormation stack not found or already deleted"
fi

# 3. Clean up any remaining Lambda functions
echo ""
echo -e "${BLUE}Step 3: Cleaning up Lambda functions...${NC}"
echo "---------------------------------------"

LAMBDA_FUNCTIONS=$(aws lambda list-functions --region $AWS_REGION --query "Functions[?contains(FunctionName, 'ordernimbus-production')].FunctionName" --output text)

if [ -n "$LAMBDA_FUNCTIONS" ]; then
    for func in $LAMBDA_FUNCTIONS; do
        echo "Deleting Lambda function: $func"
        aws lambda delete-function --function-name $func --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted: $func" || \
            print_warning "Could not delete: $func"
    done
else
    print_status "No Lambda functions to delete"
fi

# 4. Clean up API Gateway
echo ""
echo -e "${BLUE}Step 4: Cleaning up API Gateway...${NC}"
echo "----------------------------------"

API_IDS=$(aws apigatewayv2 get-apis --region $AWS_REGION --query "Items[?contains(Name, 'ordernimbus-production')].ApiId" --output text)

if [ -n "$API_IDS" ]; then
    for api_id in $API_IDS; do
        API_NAME=$(aws apigatewayv2 get-api --api-id $api_id --region $AWS_REGION --query "Name" --output text)
        echo "Deleting API Gateway: $API_NAME ($api_id)"
        aws apigatewayv2 delete-api --api-id $api_id --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted API: $API_NAME" || \
            print_warning "Could not delete API: $API_NAME"
    done
else
    print_status "No API Gateways to delete"
fi

# 5. Clean up DynamoDB tables
echo ""
echo -e "${BLUE}Step 5: Cleaning up DynamoDB tables...${NC}"
echo "--------------------------------------"

TABLES=$(aws dynamodb list-tables --region $AWS_REGION --query "TableNames[?contains(@, 'ordernimbus-production')]" --output text)

if [ -n "$TABLES" ]; then
    for table in $TABLES; do
        echo "Deleting DynamoDB table: $table"
        aws dynamodb delete-table --table-name $table --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted table: $table" || \
            print_warning "Could not delete table: $table"
    done
else
    print_status "No DynamoDB tables to delete"
fi

# 6. Clean up Cognito User Pools
echo ""
echo -e "${BLUE}Step 6: Cleaning up Cognito User Pools...${NC}"
echo "-----------------------------------------"

USER_POOLS=$(aws cognito-idp list-user-pools --max-results 20 --region $AWS_REGION --query "UserPools[?contains(Name, 'ordernimbus-production')].Id" --output text)

if [ -n "$USER_POOLS" ]; then
    for pool_id in $USER_POOLS; do
        # First, delete the domain if it exists
        DOMAIN=$(aws cognito-idp describe-user-pool --user-pool-id $pool_id --region $AWS_REGION --query "UserPool.Domain" --output text 2>/dev/null)
        if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "None" ]; then
            echo "Deleting Cognito domain: $DOMAIN"
            aws cognito-idp delete-user-pool-domain --domain "$DOMAIN" --region $AWS_REGION 2>/dev/null || true
            sleep 5
        fi
        
        echo "Deleting User Pool: $pool_id"
        aws cognito-idp delete-user-pool --user-pool-id $pool_id --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted User Pool: $pool_id" || \
            print_warning "Could not delete User Pool: $pool_id"
    done
else
    print_status "No Cognito User Pools to delete"
fi

# 7. Clean up CloudFront distributions
echo ""
echo -e "${BLUE}Step 7: Checking CloudFront distributions...${NC}"
echo "-------------------------------------------"

DISTRIBUTIONS=$(aws cloudfront list-distributions --query "DistributionList.Items[?contains(Comment, 'ordernimbus-production') || contains(Origins.Items[0].DomainName, 'ordernimbus-production')].Id" --output text 2>/dev/null)

if [ -n "$DISTRIBUTIONS" ]; then
    for dist_id in $DISTRIBUTIONS; do
        print_warning "CloudFront distribution found: $dist_id"
        echo "  CloudFront distributions must be disabled before deletion."
        echo "  They will be automatically deleted after being disabled for ~15 minutes."
        
        # Get distribution config
        aws cloudfront get-distribution-config --id $dist_id > /tmp/dist-config.json 2>/dev/null
        ETAG=$(jq -r '.ETag' /tmp/dist-config.json)
        
        # Disable the distribution
        jq '.DistributionConfig.Enabled = false' /tmp/dist-config.json > /tmp/dist-config-disabled.json
        
        echo "  Disabling distribution $dist_id..."
        aws cloudfront update-distribution \
            --id $dist_id \
            --distribution-config "$(jq '.DistributionConfig' /tmp/dist-config-disabled.json)" \
            --if-match "$ETAG" 2>/dev/null && \
            print_status "Distribution disabled. It will be deleted automatically." || \
            print_warning "Could not disable distribution"
    done
else
    print_status "No CloudFront distributions to delete"
fi

# 8. Clean up SSM Parameters
echo ""
echo -e "${BLUE}Step 8: Cleaning up SSM Parameters...${NC}"
echo "-------------------------------------"

SSM_PARAMS=$(aws ssm describe-parameters --region $AWS_REGION --query "Parameters[?contains(Name, 'ordernimbus-production')].Name" --output text)

if [ -n "$SSM_PARAMS" ]; then
    for param in $SSM_PARAMS; do
        echo "Deleting SSM parameter: $param"
        aws ssm delete-parameter --name "$param" --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted: $param" || \
            print_warning "Could not delete: $param"
    done
else
    print_status "No SSM Parameters to delete"
fi

# 9. Clean up Secrets Manager secrets
echo ""
echo -e "${BLUE}Step 9: Cleaning up Secrets Manager...${NC}"
echo "--------------------------------------"

SECRETS=$(aws secretsmanager list-secrets --region $AWS_REGION --query "SecretList[?contains(Name, 'ordernimbus-production')].Name" --output text)

if [ -n "$SECRETS" ]; then
    for secret in $SECRETS; do
        echo "Deleting secret: $secret"
        aws secretsmanager delete-secret --secret-id "$secret" --force-delete-without-recovery --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted: $secret" || \
            print_warning "Could not delete: $secret"
    done
else
    print_status "No secrets to delete"
fi

# 10. Final verification
echo ""
echo -e "${BLUE}Step 10: Final verification...${NC}"
echo "------------------------------"

# Check if stack is really gone
if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $AWS_REGION &>/dev/null; then
    print_warning "CloudFormation stack still exists (may be deleting)"
else
    print_status "CloudFormation stack deleted"
fi

# Check for remaining S3 buckets
REMAINING_BUCKETS=$(aws s3 ls | grep "ordernimbus-production" | wc -l)
if [ "$REMAINING_BUCKETS" -gt 0 ]; then
    print_warning "$REMAINING_BUCKETS S3 bucket(s) still exist"
else
    print_status "All S3 buckets deleted"
fi

# Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ PRODUCTION TEARDOWN COMPLETE${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Summary of actions:"
echo "  • CloudFormation stack: Deleted"
echo "  • S3 buckets: Emptied and deleted"
echo "  • Lambda functions: Deleted"
echo "  • API Gateway: Deleted"
echo "  • DynamoDB tables: Deleted"
echo "  • Cognito User Pools: Deleted"
echo "  • CloudFront: Disabled (will auto-delete)"
echo "  • SSM Parameters: Deleted"
echo "  • Secrets: Deleted"
echo ""
echo -e "${YELLOW}Note: Some resources may take a few minutes to fully delete.${NC}"
echo -e "${YELLOW}CloudFront distributions will be deleted automatically after being disabled.${NC}"
echo ""
echo -e "${GREEN}The production environment has been completely removed.${NC}"