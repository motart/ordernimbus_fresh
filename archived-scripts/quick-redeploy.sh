#!/bin/bash

################################################################################
# Quick Redeploy Script - Fixes stack issues and redeploys
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REGION="us-west-1"
STACK_NAME="ordernimbus-production"

echo -e "${YELLOW}🔧 Quick Stack Fix and Redeploy${NC}"
echo "=========================================="

# Check stack status
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")

if [[ "$STACK_STATUS" == *"ROLLBACK"* ]] || [[ "$STACK_STATUS" == *"FAILED"* ]]; then
    echo -e "${YELLOW}Stack is in $STACK_STATUS state. Deleting...${NC}"
    
    # Get S3 bucket name before deletion
    S3_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text 2>/dev/null || echo "")
    
    if [ -n "$S3_BUCKET" ]; then
        echo -e "${YELLOW}Emptying S3 bucket: $S3_BUCKET${NC}"
        aws s3 rm "s3://$S3_BUCKET" --recursive --region "$REGION" 2>/dev/null || true
    fi
    
    # Delete the stack
    aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"
    echo -e "${YELLOW}Waiting for stack deletion...${NC}"
    aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION" 2>/dev/null || true
    echo -e "${GREEN}✓ Stack deleted${NC}"
fi

echo ""
echo -e "${GREEN}Running deployment with all fixes...${NC}"
echo "=========================================="

# Run the deployment
./deploy-simple.sh "$REGION"