#!/bin/bash

################################################################################
# OrderNimbus Domain Destruction Script
# Safely removes all resources including DNS records
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-production}
REGION=${2:-us-west-1}
FORCE=${3:-false}
STACK_NAME="ordernimbus-${ENVIRONMENT}-domain"
HOSTED_ZONE_ID="Z03623712FIVU7Z4CJ949"

print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Check if stack exists
stack_exists() {
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" &> /dev/null
}

# Get stack outputs before deletion
get_stack_info() {
    if stack_exists; then
        S3_BUCKET=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
            --output text 2>/dev/null || echo "")
        
        CF_DIST_ID=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
            --output text 2>/dev/null || echo "")
        
        DNS_RECORDS=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[?OutputKey==`DNSRecords`].OutputValue' \
            --output text 2>/dev/null || echo "")
    fi
}

# Empty S3 bucket
empty_s3_bucket() {
    if [ -n "$S3_BUCKET" ]; then
        print_status "Emptying S3 bucket: $S3_BUCKET"
        
        # Delete all objects
        aws s3 rm "s3://$S3_BUCKET" --recursive --region "$REGION" 2>/dev/null || true
        
        # Delete all versions if versioning is enabled
        aws s3api list-object-versions \
            --bucket "$S3_BUCKET" \
            --region "$REGION" \
            --query 'Versions[].{Key:Key,VersionId:VersionId}' \
            --output text 2>/dev/null | \
        while read key version; do
            if [ -n "$key" ] && [ "$key" != "None" ]; then
                aws s3api delete-object \
                    --bucket "$S3_BUCKET" \
                    --key "$key" \
                    --version-id "$version" \
                    --region "$REGION" 2>/dev/null || true
            fi
        done
        
        print_success "S3 bucket emptied"
    fi
}

# Disable CloudFront distribution
disable_cloudfront() {
    if [ -n "$CF_DIST_ID" ]; then
        print_status "Disabling CloudFront distribution..."
        
        # Get current config
        aws cloudfront get-distribution-config \
            --id "$CF_DIST_ID" \
            --output json > /tmp/cf-config.json 2>/dev/null || return
        
        # Extract ETag
        ETAG=$(jq -r '.ETag' /tmp/cf-config.json)
        
        # Disable distribution
        jq '.DistributionConfig.Enabled = false' /tmp/cf-config.json | \
        jq '.DistributionConfig' > /tmp/cf-config-disabled.json
        
        aws cloudfront update-distribution \
            --id "$CF_DIST_ID" \
            --distribution-config file:///tmp/cf-config-disabled.json \
            --if-match "$ETAG" 2>/dev/null || true
        
        print_warning "CloudFront distribution disabled (will be deleted with stack)"
    fi
}

# List DNS records that will be deleted
list_dns_records() {
    print_status "DNS records that will be removed:"
    
    if [ "$ENVIRONMENT" = "production" ]; then
        echo "  • app.ordernimbus.com (A record)"
        echo "  • www.app.ordernimbus.com (CNAME)"
        echo "  • api.ordernimbus.com (CNAME)"
    else
        echo "  • app-${ENVIRONMENT}.ordernimbus.com (A record)"
        echo "  • www.app-${ENVIRONMENT}.ordernimbus.com (CNAME)"
        echo "  • api-${ENVIRONMENT}.ordernimbus.com (CNAME)"
    fi
}

# Delete the stack
delete_stack() {
    print_status "Deleting CloudFormation stack..."
    
    aws cloudformation delete-stack \
        --stack-name "$STACK_NAME" \
        --region "$REGION"
    
    print_status "Waiting for stack deletion (this may take 15-20 minutes)..."
    if aws cloudformation wait stack-delete-complete \
        --stack-name "$STACK_NAME" \
        --region "$REGION" 2>/dev/null; then
        print_success "Stack deleted successfully"
    else
        print_error "Stack deletion failed or timed out"
        
        # Show what failed
        aws cloudformation describe-stack-events \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'StackEvents[?ResourceStatus==`DELETE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
            --output table | head -10
        
        exit 1
    fi
}

# Verify DNS cleanup
verify_dns_cleanup() {
    print_status "Verifying DNS cleanup..."
    
    local app_domain
    if [ "$ENVIRONMENT" = "production" ]; then
        app_domain="app.ordernimbus.com"
    else
        app_domain="app-${ENVIRONMENT}.ordernimbus.com"
    fi
    
    # Check if DNS records still exist
    if aws route53 list-resource-record-sets \
        --hosted-zone-id "$HOSTED_ZONE_ID" \
        --query "ResourceRecordSets[?Name=='${app_domain}.']" \
        --output json | jq -e '.[0]' &>/dev/null; then
        print_warning "Some DNS records may still exist (manual cleanup may be needed)"
    else
        print_success "DNS records cleaned up"
    fi
}

# Main destruction flow
main() {
    echo "=========================================="
    echo -e "${RED}OrderNimbus Domain Destruction${NC}"
    echo "=========================================="
    echo ""
    echo -e "${YELLOW}⚠️  WARNING: This will delete:${NC}"
    echo "  • CloudFormation stack: $STACK_NAME"
    echo "  • S3 bucket with all frontend files"
    echo "  • CloudFront distribution"
    echo "  • Lambda functions and API Gateway"
    echo "  • DynamoDB tables"
    list_dns_records
    echo ""
    
    # Confirm unless force flag is set
    if [ "$FORCE" != "true" ]; then
        read -p "Type 'yes' to confirm destruction: " confirmation
        if [ "$confirmation" != "yes" ]; then
            print_error "Destruction cancelled"
            exit 1
        fi
    fi
    
    # Check if stack exists
    if ! stack_exists; then
        print_warning "Stack does not exist: $STACK_NAME"
        exit 0
    fi
    
    # Get stack information
    get_stack_info
    
    # Pre-deletion cleanup
    empty_s3_bucket
    disable_cloudfront
    
    # Delete the stack
    delete_stack
    
    # Verify cleanup
    verify_dns_cleanup
    
    # Summary
    echo ""
    echo "=========================================="
    echo -e "${GREEN}✓ Destruction Complete${NC}"
    echo "=========================================="
    echo ""
    echo "Resources removed:"
    echo "  ✓ CloudFormation stack"
    echo "  ✓ S3 bucket (emptied and deleted)"
    echo "  ✓ CloudFront distribution"
    echo "  ✓ Lambda functions"
    echo "  ✓ API Gateway"
    echo "  ✓ DynamoDB tables"
    echo "  ✓ DNS records"
    echo ""
    echo -e "${YELLOW}Note:${NC} CloudFront may take up to 90 minutes to fully delete"
    echo "=========================================="
}

# Run
main