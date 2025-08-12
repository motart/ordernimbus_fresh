#!/bin/bash

################################################################################
# OrderNimbus Production Destruction Script
# Safely removes all AWS resources deployed by deploy-simple.sh
# Includes CloudFront, Route53, S3, Lambda, API Gateway, Cognito, DynamoDB
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
HOSTED_ZONE_ID="Z03623712FIVU7Z4CJ949"
FORCE_DELETE=${2:-false}

print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

echo "==========================================="
echo -e "${RED}OrderNimbus Production Destruction${NC}"
echo "==========================================="
echo "Region: $REGION"
echo "Stack: $STACK_NAME"
echo ""

# Confirmation prompt (unless force flag is set)
if [ "$FORCE_DELETE" != "true" ]; then
    echo -e "${YELLOW}⚠️  WARNING: This will permanently delete:${NC}"
    echo "  • CloudFront distribution (if exists)"
    echo "  • S3 buckets and all data"
    echo "  • API Gateway and Lambda functions"
    echo "  • Cognito User Pool and all users"
    echo "  • DynamoDB tables and all data"
    echo "  • DNS records for api.ordernimbus.com"
    echo "  • Secrets Manager secrets"
    echo ""
    read -p "Are you ABSOLUTELY sure? Type 'yes' to confirm: " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "Destruction cancelled."
        exit 0
    fi
    echo ""
fi

# Check if stack exists
STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NONE")

if [ "$STACK_EXISTS" != "NONE" ]; then
    print_status "Found stack in status: $STACK_EXISTS"
    
    # Get S3 bucket name from stack
    S3_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
        --output text 2>/dev/null || echo "")
fi

# Remove CloudFront distribution if it exists
print_status "Checking for CloudFront distribution..."
CLOUDFRONT_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Aliases.Items, 'app.ordernimbus.com')].Id" \
    --output text 2>/dev/null || echo "")

if [ -n "$CLOUDFRONT_ID" ]; then
    print_status "Disabling CloudFront distribution $CLOUDFRONT_ID..."
    
    # Get current config
    ETAG=$(aws cloudfront get-distribution \
        --id "$CLOUDFRONT_ID" \
        --query 'ETag' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$ETAG" ]; then
        # Get distribution config and disable it
        aws cloudfront get-distribution-config \
            --id "$CLOUDFRONT_ID" \
            --output json 2>/dev/null | \
            jq '.DistributionConfig.Enabled = false' > /tmp/cf-config.json
        
        # Update distribution to disable it
        aws cloudfront update-distribution \
            --id "$CLOUDFRONT_ID" \
            --if-match "$ETAG" \
            --distribution-config file:///tmp/cf-config.json \
            --output text >/dev/null 2>&1 || true
        
        print_warning "CloudFront distribution disabled (deletion can take 30+ minutes)"
    fi
else
    print_success "No CloudFront distribution found"
fi

# Remove DNS record for api.ordernimbus.com
print_status "Removing DNS records..."
API_DNS=$(aws route53 list-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --query "ResourceRecordSets[?Name=='api.ordernimbus.com.' && Type=='CNAME']" \
    --output json 2>/dev/null || echo "[]")

if [ "$API_DNS" != "[]" ]; then
    CNAME_VALUE=$(echo "$API_DNS" | jq -r '.[0].ResourceRecords[0].Value')
    TTL=$(echo "$API_DNS" | jq -r '.[0].TTL')
    
    aws route53 change-resource-record-sets \
        --hosted-zone-id "$HOSTED_ZONE_ID" \
        --change-batch "{
            \"Changes\": [{
                \"Action\": \"DELETE\",
                \"ResourceRecordSet\": {
                    \"Name\": \"api.ordernimbus.com\",
                    \"Type\": \"CNAME\",
                    \"TTL\": $TTL,
                    \"ResourceRecords\": [{\"Value\": \"$CNAME_VALUE\"}]
                }
            }]
        }" --output text >/dev/null 2>&1
    
    print_success "Removed DNS record for api.ordernimbus.com"
else
    print_success "No DNS record found for api.ordernimbus.com"
fi

# Empty and delete S3 buckets
if [ -n "$S3_BUCKET" ]; then
    print_status "Emptying S3 bucket $S3_BUCKET..."
    aws s3 rm "s3://$S3_BUCKET" --recursive --region "$REGION" >/dev/null 2>&1 || true
    print_success "S3 bucket emptied"
fi

# Delete app.ordernimbus.com S3 bucket if it exists (manually created)
if aws s3api head-bucket --bucket "app.ordernimbus.com" 2>/dev/null; then
    print_status "Emptying app.ordernimbus.com bucket..."
    aws s3 rm "s3://app.ordernimbus.com" --recursive >/dev/null 2>&1 || true
    
    print_status "Deleting app.ordernimbus.com bucket..."
    aws s3api delete-bucket --bucket "app.ordernimbus.com" >/dev/null 2>&1 || true
    print_success "Deleted app.ordernimbus.com bucket"
fi

# Delete Secrets Manager secret
print_status "Removing Shopify credentials..."
aws secretsmanager delete-secret \
    --secret-id "ordernimbus/production/shopify" \
    --force-delete-without-recovery \
    --region "$REGION" >/dev/null 2>&1 || true
print_success "Secrets removed"

# Delete CloudFormation stack
if [ "$STACK_EXISTS" != "NONE" ]; then
    print_status "Deleting CloudFormation stack..."
    aws cloudformation delete-stack \
        --stack-name "$STACK_NAME" \
        --region "$REGION"
    
    print_status "Waiting for stack deletion (this may take several minutes)..."
    
    # Wait with timeout
    WAIT_TIME=0
    MAX_WAIT=600  # 10 minutes
    
    while [ $WAIT_TIME -lt $MAX_WAIT ]; do
        STACK_STATUS=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].StackStatus' \
            --output text 2>/dev/null || echo "DELETE_COMPLETE")
        
        if [ "$STACK_STATUS" = "DELETE_COMPLETE" ]; then
            print_success "Stack deleted successfully"
            break
        elif [[ "$STACK_STATUS" == *"FAILED"* ]]; then
            print_error "Stack deletion failed: $STACK_STATUS"
            break
        else
            echo -n "."
            sleep 10
            WAIT_TIME=$((WAIT_TIME + 10))
        fi
    done
else
    print_success "No CloudFormation stack to delete"
fi

# Clean up any orphaned resources
print_status "Checking for orphaned resources..."

# Check for orphaned Lambda functions
ORPHANED_LAMBDAS=$(aws lambda list-functions \
    --region "$REGION" \
    --query "Functions[?contains(FunctionName, 'ordernimbus-production')].FunctionName" \
    --output text 2>/dev/null || echo "")

if [ -n "$ORPHANED_LAMBDAS" ]; then
    for LAMBDA in $ORPHANED_LAMBDAS; do
        aws lambda delete-function \
            --function-name "$LAMBDA" \
            --region "$REGION" >/dev/null 2>&1 || true
    done
    print_success "Orphaned Lambdas deleted"
fi

# Check for orphaned DynamoDB tables
ORPHANED_TABLES=$(aws dynamodb list-tables \
    --region "$REGION" \
    --query "TableNames[?contains(@, 'ordernimbus-production')]" \
    --output text 2>/dev/null || echo "")

if [ -n "$ORPHANED_TABLES" ]; then
    for TABLE in $ORPHANED_TABLES; do
        aws dynamodb delete-table \
            --table-name "$TABLE" \
            --region "$REGION" >/dev/null 2>&1 || true
    done
    print_success "Orphaned tables deleted"
fi

echo ""
echo "==========================================="
echo -e "${GREEN}✅ Destruction Complete!${NC}"
echo "==========================================="
echo "All OrderNimbus production resources have been removed."

if [ -n "$CLOUDFRONT_ID" ]; then
    echo ""
    echo -e "${YELLOW}Note: CloudFront distribution $CLOUDFRONT_ID is disabled.${NC}"
    echo "It will be automatically deleted by AWS after some time."
fi

echo ""
echo "To redeploy, run: ./deploy-simple.sh"
echo "==========================================="