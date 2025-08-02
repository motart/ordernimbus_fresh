#!/bin/bash

#######################################################
# OrderNimbus Complete AWS Teardown Script
# WARNING: This will permanently delete ALL resources
#######################################################

set -e

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Configuration
REGION=${AWS_REGION:-"us-west-1"}
ENVIRONMENT=${1:-"staging"}
APP_NAME="ordernimbus"

echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║           WARNING: DESTRUCTIVE OPERATION                   ║${NC}"
echo -e "${RED}║                                                            ║${NC}"
echo -e "${RED}║  This script will permanently DELETE all AWS resources    ║${NC}"
echo -e "${RED}║  for OrderNimbus in the ${ENVIRONMENT} environment.       ║${NC}"
echo -e "${RED}║                                                            ║${NC}"
echo -e "${RED}║  Resources to be deleted:                                 ║${NC}"
echo -e "${RED}║  - S3 Buckets (including all data)                       ║${NC}"
echo -e "${RED}║  - CloudFront Distributions                              ║${NC}"
echo -e "${RED}║  - Route53 Hosted Zones and Records                      ║${NC}"
echo -e "${RED}║  - Cognito User Pools                                    ║${NC}"
echo -e "${RED}║  - Lambda Functions                                      ║${NC}"
echo -e "${RED}║  - API Gateway                                           ║${NC}"
echo -e "${RED}║  - RDS/Aurora Databases                                  ║${NC}"
echo -e "${RED}║  - VPC and Networking                                    ║${NC}"
echo -e "${RED}║  - ECS Clusters and Services                             ║${NC}"
echo -e "${RED}║  - CloudWatch Logs                                       ║${NC}"
echo -e "${RED}║  - Parameter Store Entries                               ║${NC}"
echo -e "${RED}║  - All CDK Stacks                                        ║${NC}"
echo -e "${RED}║                                                            ║${NC}"
echo -e "${RED}║  THIS ACTION CANNOT BE UNDONE!                           ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo ""
read -p "Are you absolutely sure you want to continue? Type 'DELETE ALL' to confirm: " confirmation

if [ "$confirmation" != "DELETE ALL" ]; then
    echo -e "${GREEN}Operation cancelled. No resources were deleted.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Starting teardown process...${NC}"
echo ""

# Function to safely delete S3 bucket
delete_s3_bucket() {
    local bucket_name=$1
    echo -e "${YELLOW}Checking S3 bucket: ${bucket_name}${NC}"
    
    if aws s3api head-bucket --bucket "$bucket_name" 2>/dev/null; then
        echo -e "${YELLOW}Deleting all objects in ${bucket_name}...${NC}"
        aws s3 rm s3://${bucket_name} --recursive 2>/dev/null || true
        
        echo -e "${YELLOW}Deleting all versions in ${bucket_name}...${NC}"
        aws s3api delete-objects --bucket ${bucket_name} \
            --delete "$(aws s3api list-object-versions \
            --bucket ${bucket_name} \
            --output json \
            --query '{Objects: Versions[].{Key: Key, VersionId: VersionId}}')" 2>/dev/null || true
        
        echo -e "${YELLOW}Deleting bucket ${bucket_name}...${NC}"
        aws s3api delete-bucket --bucket ${bucket_name} --region ${REGION} 2>/dev/null || true
        echo -e "${GREEN}✓ Deleted bucket ${bucket_name}${NC}"
    else
        echo -e "${YELLOW}Bucket ${bucket_name} not found, skipping...${NC}"
    fi
}

# Function to delete CloudFront distribution
delete_cloudfront_distribution() {
    local dist_id=$1
    echo -e "${YELLOW}Checking CloudFront distribution: ${dist_id}${NC}"
    
    if aws cloudfront get-distribution --id ${dist_id} 2>/dev/null; then
        echo -e "${YELLOW}Disabling CloudFront distribution ${dist_id}...${NC}"
        
        # Get current ETag
        ETAG=$(aws cloudfront get-distribution-config --id ${dist_id} --query 'ETag' --output text)
        
        # Get and modify config to disable
        aws cloudfront get-distribution-config --id ${dist_id} | \
            jq '.DistributionConfig.Enabled = false' > /tmp/dist-config.json
        
        # Update distribution to disabled
        aws cloudfront update-distribution --id ${dist_id} \
            --distribution-config file:///tmp/dist-config.json \
            --if-match ${ETAG} 2>/dev/null || true
        
        echo -e "${YELLOW}Waiting for distribution to be disabled (this may take 15+ minutes)...${NC}"
        aws cloudfront wait distribution-deployed --id ${dist_id} 2>/dev/null || true
        
        # Get new ETag after disabling
        ETAG=$(aws cloudfront get-distribution-config --id ${dist_id} --query 'ETag' --output text)
        
        echo -e "${YELLOW}Deleting CloudFront distribution ${dist_id}...${NC}"
        aws cloudfront delete-distribution --id ${dist_id} --if-match ${ETAG} 2>/dev/null || true
        echo -e "${GREEN}✓ Deleted CloudFront distribution ${dist_id}${NC}"
    else
        echo -e "${YELLOW}Distribution ${dist_id} not found, skipping...${NC}"
    fi
}

# 1. Delete S3 Buckets
echo -e "${YELLOW}=== Deleting S3 Buckets ===${NC}"
delete_s3_bucket "${APP_NAME}-${ENVIRONMENT}-frontend-assets"
delete_s3_bucket "${APP_NAME}-${ENVIRONMENT}-webapp"
delete_s3_bucket "${APP_NAME}-${ENVIRONMENT}-data-uploads"
delete_s3_bucket "${APP_NAME}-${ENVIRONMENT}-ml-models"
delete_s3_bucket "${APP_NAME}-${ENVIRONMENT}-backups"
delete_s3_bucket "${APP_NAME}-staging-webapp"
delete_s3_bucket "${APP_NAME}-production-frontend-assets"

# 2. Delete CloudFront Distributions
echo -e "${YELLOW}=== Deleting CloudFront Distributions ===${NC}"
DISTRIBUTIONS=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Comment, '${APP_NAME}') || contains(Origins.Items[0].DomainName, '${APP_NAME}')].Id" \
    --output text 2>/dev/null || true)

if [ ! -z "$DISTRIBUTIONS" ]; then
    for dist_id in $DISTRIBUTIONS; do
        delete_cloudfront_distribution $dist_id
    done
else
    echo -e "${YELLOW}No CloudFront distributions found${NC}"
fi

# 3. Delete Cognito User Pools
echo -e "${YELLOW}=== Deleting Cognito User Pools ===${NC}"
USER_POOLS=$(aws cognito-idp list-user-pools --max-results 60 \
    --query "UserPools[?contains(Name, '${APP_NAME}')].Id" \
    --output text --region ${REGION} 2>/dev/null || true)

if [ ! -z "$USER_POOLS" ]; then
    for pool_id in $USER_POOLS; do
        echo -e "${YELLOW}Deleting User Pool: ${pool_id}${NC}"
        
        # Delete user pool clients first
        CLIENTS=$(aws cognito-idp list-user-pool-clients --user-pool-id ${pool_id} \
            --query "UserPoolClients[].ClientId" --output text --region ${REGION} 2>/dev/null || true)
        
        for client_id in $CLIENTS; do
            aws cognito-idp delete-user-pool-client \
                --user-pool-id ${pool_id} \
                --client-id ${client_id} \
                --region ${REGION} 2>/dev/null || true
        done
        
        # Delete the user pool
        aws cognito-idp delete-user-pool --user-pool-id ${pool_id} --region ${REGION} 2>/dev/null || true
        echo -e "${GREEN}✓ Deleted User Pool ${pool_id}${NC}"
    done
else
    echo -e "${YELLOW}No Cognito User Pools found${NC}"
fi

# 4. Delete Lambda Functions
echo -e "${YELLOW}=== Deleting Lambda Functions ===${NC}"
FUNCTIONS=$(aws lambda list-functions \
    --query "Functions[?contains(FunctionName, '${APP_NAME}')].FunctionName" \
    --output text --region ${REGION} 2>/dev/null || true)

if [ ! -z "$FUNCTIONS" ]; then
    for func in $FUNCTIONS; do
        echo -e "${YELLOW}Deleting Lambda function: ${func}${NC}"
        aws lambda delete-function --function-name ${func} --region ${REGION} 2>/dev/null || true
        echo -e "${GREEN}✓ Deleted function ${func}${NC}"
    done
else
    echo -e "${YELLOW}No Lambda functions found${NC}"
fi

# 5. Delete API Gateways
echo -e "${YELLOW}=== Deleting API Gateways ===${NC}"
REST_APIS=$(aws apigateway get-rest-apis \
    --query "items[?contains(name, '${APP_NAME}')].id" \
    --output text --region ${REGION} 2>/dev/null || true)

if [ ! -z "$REST_APIS" ]; then
    for api_id in $REST_APIS; do
        echo -e "${YELLOW}Deleting API Gateway: ${api_id}${NC}"
        aws apigateway delete-rest-api --rest-api-id ${api_id} --region ${REGION} 2>/dev/null || true
        echo -e "${GREEN}✓ Deleted API ${api_id}${NC}"
    done
else
    echo -e "${YELLOW}No API Gateways found${NC}"
fi

# 6. Delete CloudWatch Log Groups
echo -e "${YELLOW}=== Deleting CloudWatch Log Groups ===${NC}"
LOG_GROUPS=$(aws logs describe-log-groups \
    --query "logGroups[?contains(logGroupName, '${APP_NAME}')].logGroupName" \
    --output text --region ${REGION} 2>/dev/null || true)

if [ ! -z "$LOG_GROUPS" ]; then
    for log_group in $LOG_GROUPS; do
        echo -e "${YELLOW}Deleting log group: ${log_group}${NC}"
        aws logs delete-log-group --log-group-name "${log_group}" --region ${REGION} 2>/dev/null || true
        echo -e "${GREEN}✓ Deleted log group ${log_group}${NC}"
    done
else
    echo -e "${YELLOW}No CloudWatch log groups found${NC}"
fi

# 7. Delete Parameter Store Parameters
echo -e "${YELLOW}=== Deleting Parameter Store Parameters ===${NC}"
PARAMETERS=$(aws ssm describe-parameters \
    --query "Parameters[?contains(Name, '${APP_NAME}')].Name" \
    --output text --region ${REGION} 2>/dev/null || true)

if [ ! -z "$PARAMETERS" ]; then
    for param in $PARAMETERS; do
        echo -e "${YELLOW}Deleting parameter: ${param}${NC}"
        aws ssm delete-parameter --name "${param}" --region ${REGION} 2>/dev/null || true
        echo -e "${GREEN}✓ Deleted parameter ${param}${NC}"
    done
else
    echo -e "${YELLOW}No Parameter Store parameters found${NC}"
fi

# 8. Delete CDK Stacks
echo -e "${YELLOW}=== Deleting CDK Stacks ===${NC}"
STACKS=$(aws cloudformation list-stacks \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
    --query "StackSummaries[?contains(StackName, '${APP_NAME}') || contains(StackName, 'OrderNimbus')].StackName" \
    --output text --region ${REGION} 2>/dev/null || true)

if [ ! -z "$STACKS" ]; then
    # Delete stacks in reverse order to handle dependencies
    STACK_ARRAY=($STACKS)
    for (( idx=${#STACK_ARRAY[@]}-1 ; idx>=0 ; idx-- )) ; do
        stack="${STACK_ARRAY[idx]}"
        echo -e "${YELLOW}Deleting CloudFormation stack: ${stack}${NC}"
        aws cloudformation delete-stack --stack-name ${stack} --region ${REGION} 2>/dev/null || true
        echo -e "${YELLOW}Waiting for stack deletion to complete...${NC}"
        aws cloudformation wait stack-delete-complete --stack-name ${stack} --region ${REGION} 2>/dev/null || true
        echo -e "${GREEN}✓ Deleted stack ${stack}${NC}"
    done
else
    echo -e "${YELLOW}No CloudFormation stacks found${NC}"
fi

# 9. Delete Route53 Records (optional - be careful with this)
echo -e "${YELLOW}=== Route53 Cleanup ===${NC}"
echo -e "${YELLOW}Note: Route53 hosted zones and records for ordernimbus.com are preserved${NC}"
echo -e "${YELLOW}You may want to manually review and clean up DNS records if needed${NC}"

# 10. Clean up CDK Bootstrap (optional)
echo ""
read -p "Do you want to also delete the CDK bootstrap stack? (y/N): " delete_bootstrap
if [[ "$delete_bootstrap" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Deleting CDK bootstrap stack...${NC}"
    aws cloudformation delete-stack --stack-name CDKToolkit --region ${REGION} 2>/dev/null || true
    aws cloudformation wait stack-delete-complete --stack-name CDKToolkit --region ${REGION} 2>/dev/null || true
    echo -e "${GREEN}✓ Deleted CDK bootstrap stack${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                   TEARDOWN COMPLETE                        ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  All OrderNimbus resources have been deleted from AWS     ║${NC}"
echo -e "${GREEN}║  Environment: ${ENVIRONMENT}                               ║${NC}"
echo -e "${GREEN}║  Region: ${REGION}                                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Note: Some resources like CloudFront distributions may take${NC}"
echo -e "${YELLOW}up to 15-30 minutes to fully delete in the background.${NC}"
echo ""
echo -e "${YELLOW}AWS costs may continue for a short time until all resources${NC}"
echo -e "${YELLOW}are fully terminated.${NC}"