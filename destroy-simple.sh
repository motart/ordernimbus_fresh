#!/bin/bash

################################################################################
# OrderNimbus Production Destruction Script
# Safely removes all production resources
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

print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

echo "=========================================="
echo -e "${RED}OrderNimbus Production Destruction${NC}"
echo "=========================================="
echo "Stack: $STACK_NAME"
echo "Region: $REGION"
echo ""

# Confirm destruction
echo -e "${RED}WARNING: This will delete all production resources!${NC}"
read -p "Are you sure you want to destroy the production stack? Type 'yes' to confirm: " confirm
if [ "$confirm" != "yes" ]; then
    echo "Destruction cancelled."
    exit 0
fi

echo ""
print_status "Destroying stack: $STACK_NAME in $REGION"

# Get S3 bucket name before deletion
BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text 2>/dev/null || echo "")

# Empty S3 bucket if it exists
if [ -n "$BUCKET" ]; then
    print_status "Emptying S3 bucket: $BUCKET"
    aws s3 rm "s3://$BUCKET" --recursive --region "$REGION" 2>/dev/null || true
fi

# Delete the stack
print_status "Deleting CloudFormation stack..."
aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"

print_status "Waiting for stack deletion..."
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION" 2>/dev/null || true

# Verify DNS records are removed
print_status "Checking DNS cleanup..."
app_record=$(aws route53 list-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --query "ResourceRecordSets[?Name=='app.ordernimbus.com.' && Type=='CNAME']" \
    --output json)

api_record=$(aws route53 list-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --query "ResourceRecordSets[?Name=='api.ordernimbus.com.' && Type=='CNAME']" \
    --output json)

if [ "$app_record" != "[]" ] || [ "$api_record" != "[]" ]; then
    print_warning "DNS records may still exist. They should be automatically removed with the stack."
else
    print_success "DNS records cleaned up"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Stack deleted successfully!${NC}"
echo "=========================================="