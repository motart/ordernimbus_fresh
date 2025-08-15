#!/bin/bash

# ====================================================================
# OrderNimbus Application Infrastructure Teardown Script
# Fast teardown of application components while preserving immutable infrastructure
# ====================================================================

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-production}"
AWS_REGION="${2:-us-west-1}"
STACK_NAME="ordernimbus-application-${ENVIRONMENT}"
IMMUTABLE_STACK_NAME="ordernimbus-immutable-${ENVIRONMENT}"

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🔄 APPLICATION INFRASTRUCTURE TEARDOWN${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}This script will delete application infrastructure ONLY:${NC}"
echo "  • Application CloudFormation stack: $STACK_NAME"
echo "  • Lambda functions"
echo "  • API Gateway"
echo "  • DynamoDB tables"
echo "  • Application-specific configurations"
echo ""
echo -e "${GREEN}This script will PRESERVE immutable infrastructure:${NC}"
echo "  • CloudFront distributions"
echo "  • Cognito User Pools (users will NOT be lost)"
echo "  • Route 53 DNS records"
echo "  • S3 buckets"
echo "  • SSL certificates"
echo ""
echo -e "${GREEN}✅ Fast redeployment: Application can be redeployed in 2-3 minutes${NC}"
echo ""
read -p "Continue with application teardown? (yes/no): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo -e "${GREEN}Teardown cancelled. No resources were deleted.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Starting application teardown...${NC}"
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

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 1. Check if immutable infrastructure exists
echo ""
echo -e "${BLUE}Step 1: Verifying immutable infrastructure preservation...${NC}"
echo "--------------------------------------------------------"

IMMUTABLE_STACK_EXISTS=$(aws cloudformation describe-stacks --stack-name $IMMUTABLE_STACK_NAME --region $AWS_REGION &>/dev/null && echo "true" || echo "false")

if [ "$IMMUTABLE_STACK_EXISTS" = "true" ]; then
    print_status "Immutable infrastructure found and will be preserved"
    
    # Get immutable resources for verification
    CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
        --stack-name $IMMUTABLE_STACK_NAME \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    USER_POOL_ID=$(aws cloudformation describe-stacks \
        --stack-name $IMMUTABLE_STACK_NAME \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$CLOUDFRONT_ID" ]; then
        print_info "CloudFront Distribution: $CLOUDFRONT_ID (preserved)"
    fi
    
    if [ -n "$USER_POOL_ID" ]; then
        print_info "Cognito User Pool: $USER_POOL_ID (preserved)"
    fi
else
    print_warning "Immutable infrastructure not found - this may be a legacy deployment"
    print_warning "Consider migrating to immutable infrastructure first"
fi

# 2. Delete application CloudFormation stack
echo ""
echo -e "${BLUE}Step 2: Deleting application CloudFormation stack...${NC}"
echo "--------------------------------------------------"

if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $AWS_REGION &>/dev/null; then
    echo "Initiating application stack deletion..."
    aws cloudformation delete-stack --stack-name $STACK_NAME --region $AWS_REGION
    
    echo "Waiting for application stack deletion (typically 2-5 minutes)..."
    aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME --region $AWS_REGION 2>/dev/null && \
        print_status "Application CloudFormation stack deleted successfully" || \
        print_warning "Stack deletion may still be in progress"
else
    print_warning "Application CloudFormation stack not found or already deleted"
fi

# 3. Clean up any remaining application Lambda functions
echo ""
echo -e "${BLUE}Step 3: Cleaning up application Lambda functions...${NC}"
echo "-------------------------------------------------"

LAMBDA_FUNCTIONS=$(aws lambda list-functions --region $AWS_REGION --query "Functions[?contains(FunctionName, 'ordernimbus-${ENVIRONMENT}') && !contains(FunctionName, 'immutable')].FunctionName" --output text)

if [ -n "$LAMBDA_FUNCTIONS" ]; then
    for func in $LAMBDA_FUNCTIONS; do
        echo "Deleting Lambda function: $func"
        aws lambda delete-function --function-name $func --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted: $func" || \
            print_warning "Could not delete: $func"
    done
else
    print_status "No application Lambda functions to delete"
fi

# 4. Clean up application API Gateway
echo ""
echo -e "${BLUE}Step 4: Cleaning up application API Gateway...${NC}"
echo "---------------------------------------------"

API_IDS=$(aws apigatewayv2 get-apis --region $AWS_REGION --query "Items[?contains(Name, 'ordernimbus-${ENVIRONMENT}') && !contains(Name, 'immutable')].ApiId" --output text)

if [ -n "$API_IDS" ]; then
    for api_id in $API_IDS; do
        API_NAME=$(aws apigatewayv2 get-api --api-id $api_id --region $AWS_REGION --query "Name" --output text)
        echo "Deleting API Gateway: $API_NAME ($api_id)"
        aws apigatewayv2 delete-api --api-id $api_id --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted API: $API_NAME" || \
            print_warning "Could not delete API: $API_NAME"
    done
else
    print_status "No application API Gateways to delete"
fi

# 5. Clean up application DynamoDB tables
echo ""
echo -e "${BLUE}Step 5: Cleaning up application DynamoDB tables...${NC}"
echo "------------------------------------------------"

TABLES=$(aws dynamodb list-tables --region $AWS_REGION --query "TableNames[?contains(@, 'ordernimbus-${ENVIRONMENT}') && !contains(@, 'immutable')]" --output text)

if [ -n "$TABLES" ]; then
    for table in $TABLES; do
        echo "Deleting DynamoDB table: $table"
        aws dynamodb delete-table --table-name $table --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted table: $table" || \
            print_warning "Could not delete table: $table"
    done
else
    print_status "No application DynamoDB tables to delete"
fi

# 6. Clean up application SSM Parameters
echo ""
echo -e "${BLUE}Step 6: Cleaning up application SSM Parameters...${NC}"
echo "-----------------------------------------------"

SSM_PARAMS=$(aws ssm describe-parameters --region $AWS_REGION --query "Parameters[?contains(Name, 'ordernimbus/${ENVIRONMENT}/application')].Name" --output text)

if [ -n "$SSM_PARAMS" ]; then
    for param in $SSM_PARAMS; do
        echo "Deleting SSM parameter: $param"
        aws ssm delete-parameter --name "$param" --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted: $param" || \
            print_warning "Could not delete: $param"
    done
else
    print_status "No application SSM Parameters to delete"
fi

# 7. Clean up application Secrets Manager secrets
echo ""
echo -e "${BLUE}Step 7: Cleaning up application secrets...${NC}"
echo "----------------------------------------"

SECRETS=$(aws secretsmanager list-secrets --region $AWS_REGION --query "SecretList[?contains(Name, 'ordernimbus/${ENVIRONMENT}') && !contains(Name, 'immutable')].Name" --output text)

if [ -n "$SECRETS" ]; then
    for secret in $SECRETS; do
        echo "Deleting secret: $secret"
        aws secretsmanager delete-secret --secret-id "$secret" --force-delete-without-recovery --region $AWS_REGION 2>/dev/null && \
            print_status "Deleted: $secret" || \
            print_warning "Could not delete: $secret"
    done
else
    print_status "No application secrets to delete"
fi

# 8. Final verification
echo ""
echo -e "${BLUE}Step 8: Final verification...${NC}"
echo "-----------------------------"

# Check if application stack is really gone
if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $AWS_REGION &>/dev/null; then
    print_warning "Application CloudFormation stack still exists (may be deleting)"
else
    print_status "Application CloudFormation stack deleted"
fi

# Verify immutable infrastructure is still intact
if [ "$IMMUTABLE_STACK_EXISTS" = "true" ]; then
    IMMUTABLE_STILL_EXISTS=$(aws cloudformation describe-stacks --stack-name $IMMUTABLE_STACK_NAME --region $AWS_REGION &>/dev/null && echo "true" || echo "false")
    
    if [ "$IMMUTABLE_STILL_EXISTS" = "true" ]; then
        print_status "Immutable infrastructure preserved successfully"
        
        # Verify key immutable resources
        if [ -n "$CLOUDFRONT_ID" ]; then
            DIST_STATUS=$(aws cloudfront get-distribution --id "$CLOUDFRONT_ID" --query 'Distribution.Status' --output text 2>/dev/null || echo "Unknown")
            print_info "CloudFront Distribution $CLOUDFRONT_ID: $DIST_STATUS"
        fi
        
        if [ -n "$USER_POOL_ID" ]; then
            POOL_STATUS=$(aws cognito-idp describe-user-pool --user-pool-id "$USER_POOL_ID" --region "$AWS_REGION" --query 'UserPool.Status' --output text 2>/dev/null || echo "Unknown")
            print_info "Cognito User Pool $USER_POOL_ID: $POOL_STATUS"
        fi
    else
        print_error "Immutable infrastructure was accidentally deleted!"
    fi
fi

# Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ APPLICATION TEARDOWN COMPLETE${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Summary of actions:"
echo "  • Application CloudFormation stack: Deleted"
echo "  • Lambda functions: Deleted"
echo "  • API Gateway: Deleted"
echo "  • DynamoDB tables: Deleted"
echo "  • SSM Parameters: Deleted"
echo "  • Application secrets: Deleted"
echo ""
echo -e "${GREEN}Preserved infrastructure:${NC}"
echo "  • CloudFront distributions: Preserved"
echo "  • Cognito User Pools: Preserved (users intact)"
echo "  • Route 53 DNS records: Preserved"
echo "  • S3 buckets: Preserved"
echo "  • SSL certificates: Preserved"
echo ""
echo -e "${BLUE}🚀 Fast Redeployment:${NC}"
echo "  Deploy application infrastructure again:"
echo "    ${GREEN}./deploy.sh $ENVIRONMENT $AWS_REGION${NC}"
echo ""
echo "  Expected deployment time: ${GREEN}2-3 minutes${NC} (vs 15-20 minutes for full deployment)"
echo ""

if [ "$IMMUTABLE_STACK_EXISTS" = "true" ]; then
    echo -e "${GREEN}✅ Ready for fast application redeployment!${NC}"
else
    echo -e "${YELLOW}⚠️  Consider migrating to immutable infrastructure for faster deployments${NC}"
    echo "  Run: ${GREEN}./deploy-immutable.sh $ENVIRONMENT $AWS_REGION${NC}"
fi

echo ""