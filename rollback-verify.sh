#!/bin/bash

# Sales Forecasting Platform - Rollback Verification Script
# Verifies that rollback was completed successfully and system is in clean state

set -e

# Configuration
ENVIRONMENT=${1:-staging}
AWS_REGION=${2:-us-east-1}
DEPLOYMENT_ID=${3:-""}
STACK_PREFIX="ordernimbus"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
VERIFICATION_PASSED=0
VERIFICATION_FAILED=0
CLEANUP_NEEDED=0

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
    ((VERIFICATION_PASSED++))
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((CLEANUP_NEEDED++))
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    ((VERIFICATION_FAILED++))
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

echo -e "${BLUE}🔍 Verifying rollback completion for environment: $ENVIRONMENT${NC}"
echo "=========================================="

# Load deployment state if available
DEPLOYMENT_STATE_FILE=""
if [ -n "$DEPLOYMENT_ID" ]; then
    DEPLOYMENT_STATE_FILE="/tmp/${DEPLOYMENT_ID}-state.json"
    if [ -f "$DEPLOYMENT_STATE_FILE" ]; then
        print_info "Found deployment state file: $DEPLOYMENT_STATE_FILE"
    else
        print_warning "Deployment state file not found: $DEPLOYMENT_STATE_FILE"
    fi
fi

# Verify CloudFormation stacks are rolled back or deleted
echo "📋 Verifying CloudFormation stacks..."
EXPECTED_STACKS=(
    "$STACK_PREFIX-$ENVIRONMENT-networking"
    "$STACK_PREFIX-$ENVIRONMENT-security"
    "$STACK_PREFIX-$ENVIRONMENT-database"
    "$STACK_PREFIX-$ENVIRONMENT-compute"
    "$STACK_PREFIX-$ENVIRONMENT-api"
    "$STACK_PREFIX-$ENVIRONMENT-frontend"
    "$STACK_PREFIX-$ENVIRONMENT-monitoring"
)

for stack in "${EXPECTED_STACKS[@]}"; do
    if aws cloudformation describe-stacks --stack-name "$stack" --region "$AWS_REGION" >/dev/null 2>&1; then
        STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$stack" --region "$AWS_REGION" --query 'Stacks[0].StackStatus' --output text)
        
        case "$STACK_STATUS" in
            "ROLLBACK_COMPLETE"|"UPDATE_ROLLBACK_COMPLETE")
                print_status "Stack $stack successfully rolled back (Status: $STACK_STATUS)"
                ;;
            "DELETE_COMPLETE")
                print_status "Stack $stack successfully deleted"
                ;;
            "DELETE_IN_PROGRESS")
                print_warning "Stack $stack deletion in progress"
                ;;
            "ROLLBACK_IN_PROGRESS"|"UPDATE_ROLLBACK_IN_PROGRESS")
                print_warning "Stack $stack rollback in progress"
                ;;
            *"FAILED"*)
                print_error "Stack $stack is in failed state: $STACK_STATUS"
                ;;
            *)
                print_warning "Stack $stack in unexpected state: $STACK_STATUS"
                ;;
        esac
    else
        print_status "Stack $stack does not exist (successfully removed or never created)"
    fi
done

# Verify S3 buckets are cleaned up
echo "🪣 Verifying S3 bucket cleanup..."
EXPECTED_BUCKETS=(
    "$STACK_PREFIX-$ENVIRONMENT-frontend-assets"
    "$STACK_PREFIX-$ENVIRONMENT-data-lake"
    "$STACK_PREFIX-$ENVIRONMENT-ml-artifacts"
    "$STACK_PREFIX-$ENVIRONMENT-backups"
    "$STACK_PREFIX-$ENVIRONMENT-logs"
)

for bucket in "${EXPECTED_BUCKETS[@]}"; do
    if aws s3api head-bucket --bucket "$bucket" --region "$AWS_REGION" 2>/dev/null; then
        # Check if bucket is empty
        OBJECT_COUNT=$(aws s3 ls "s3://$bucket" --recursive | wc -l)
        if [ "$OBJECT_COUNT" -eq 0 ]; then
            print_warning "Bucket $bucket exists but is empty (cleanup may be incomplete)"
        else
            print_error "Bucket $bucket still contains $OBJECT_COUNT objects"
        fi
    else
        print_status "Bucket $bucket successfully removed"
    fi
done

# Verify Parameter Store parameters are cleaned up
echo "⚙️  Verifying Parameter Store cleanup..."
EXPECTED_PARAMETERS=(
    "/ordernimbus/$ENVIRONMENT/database/master-username"
    "/ordernimbus/$ENVIRONMENT/database/name"
    "/ordernimbus/$ENVIRONMENT/api/cors-origins"
    "/ordernimbus/$ENVIRONMENT/auth/jwt-secret"
    "/ordernimbus/$ENVIRONMENT/testing/load-test-token"
)

for param in "${EXPECTED_PARAMETERS[@]}"; do
    if aws ssm get-parameter --name "$param" --region "$AWS_REGION" >/dev/null 2>&1; then
        print_error "Parameter $param still exists (cleanup incomplete)"
    else
        print_status "Parameter $param successfully removed"
    fi
done

# Verify ECS resources are cleaned up
echo "🐳 Verifying ECS resource cleanup..."
CLUSTER_NAME="$STACK_PREFIX-$ENVIRONMENT-cluster"

if aws ecs describe-clusters --clusters "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
    CLUSTER_STATUS=$(aws ecs describe-clusters --clusters "$CLUSTER_NAME" --region "$AWS_REGION" --query 'clusters[0].status' --output text)
    
    if [ "$CLUSTER_STATUS" = "INACTIVE" ]; then
        print_status "ECS cluster $CLUSTER_NAME is inactive (cleanup successful)"
    else
        # Check for running tasks
        RUNNING_TASKS=$(aws ecs list-tasks --cluster "$CLUSTER_NAME" --region "$AWS_REGION" --query 'taskArns | length(@)' --output text)
        if [ "$RUNNING_TASKS" -gt 0 ]; then
            print_error "ECS cluster $CLUSTER_NAME still has $RUNNING_TASKS running tasks"
        else
            print_warning "ECS cluster $CLUSTER_NAME exists but has no running tasks"
        fi
    fi
else
    print_status "ECS cluster $CLUSTER_NAME successfully removed"
fi

# Verify RDS resources are cleaned up
echo "🗄️  Verifying RDS resource cleanup..."
DB_CLUSTER_ID="$STACK_PREFIX-$ENVIRONMENT-db-cluster"

if aws rds describe-db-clusters --db-cluster-identifier "$DB_CLUSTER_ID" --region "$AWS_REGION" >/dev/null 2>&1; then
    DB_STATUS=$(aws rds describe-db-clusters --db-cluster-identifier "$DB_CLUSTER_ID" --region "$AWS_REGION" --query 'DBClusters[0].Status' --output text)
    
    case "$DB_STATUS" in
        "deleting")
            print_warning "RDS cluster $DB_CLUSTER_ID deletion in progress"
            ;;
        "available")
            print_error "RDS cluster $DB_CLUSTER_ID is still available (cleanup failed)"
            ;;
        *)
            print_warning "RDS cluster $DB_CLUSTER_ID in state: $DB_STATUS"
            ;;
    esac
else
    print_status "RDS cluster $DB_CLUSTER_ID successfully removed"
fi

# Verify API Gateway resources are cleaned up
echo "🔗 Verifying API Gateway cleanup..."
API_NAME="$STACK_PREFIX-$ENVIRONMENT-api"

# List all REST APIs and check for our API
API_ID=$(aws apigateway get-rest-apis --region "$AWS_REGION" --query "items[?name=='$API_NAME'].id" --output text)

if [ -n "$API_ID" ] && [ "$API_ID" != "None" ]; then
    print_error "API Gateway $API_NAME (ID: $API_ID) still exists"
else
    print_status "API Gateway $API_NAME successfully removed"
fi

# Verify CloudFront distributions are cleaned up
echo "🌐 Verifying CloudFront cleanup..."
DISTRIBUTION_COMMENT="$STACK_PREFIX-$ENVIRONMENT-frontend"

# Note: CloudFront distributions can't be deleted immediately, they go to "Disabled" state first
DISTRIBUTIONS=$(aws cloudfront list-distributions --region "$AWS_REGION" --query "DistributionList.Items[?Comment=='$DISTRIBUTION_COMMENT'].{Id:Id,Status:Status}" --output json 2>/dev/null || echo "[]")

if [ "$DISTRIBUTIONS" != "[]" ]; then
    echo "$DISTRIBUTIONS" | jq -r '.[] | "Distribution " + .Id + " is in state: " + .Status' | while read line; do
        if [[ "$line" == *"Disabled"* ]]; then
            print_warning "$line (will be deleted automatically)"
        else
            print_error "$line (cleanup may be incomplete)"
        fi
    done
else
    print_status "No CloudFront distributions found for $DISTRIBUTION_COMMENT"
fi

# Verify CloudWatch alarms are cleaned up
echo "🚨 Verifying CloudWatch alarm cleanup..."
ALARM_COUNT=$(aws cloudwatch describe-alarms --region "$AWS_REGION" --query "MetricAlarms[?contains(AlarmName, '$ENVIRONMENT')] | length(@)" --output text)

if [ "$ALARM_COUNT" -gt 0 ]; then
    print_warning "$ALARM_COUNT CloudWatch alarms still exist for environment $ENVIRONMENT"
    
    # List the remaining alarms
    REMAINING_ALARMS=$(aws cloudwatch describe-alarms --region "$AWS_REGION" --query "MetricAlarms[?contains(AlarmName, '$ENVIRONMENT')].AlarmName" --output text)
    print_info "Remaining alarms: $REMAINING_ALARMS"
else
    print_status "All CloudWatch alarms for environment $ENVIRONMENT have been removed"
fi

# Check for orphaned resources that might incur costs
echo "💰 Checking for cost-incurring orphaned resources..."

# Check for orphaned EBS volumes
ORPHANED_VOLUMES=$(aws ec2 describe-volumes --region "$AWS_REGION" --filters "Name=tag:Environment,Values=$ENVIRONMENT" "Name=status,Values=available" --query 'Volumes[*].VolumeId' --output text)
if [ -n "$ORPHANED_VOLUMES" ] && [ "$ORPHANED_VOLUMES" != "None" ]; then
    print_warning "Found orphaned EBS volumes: $ORPHANED_VOLUMES"
else
    print_status "No orphaned EBS volumes found"
fi

# Check for orphaned Elastic IPs
ORPHANED_EIPS=$(aws ec2 describe-addresses --region "$AWS_REGION" --filters "Name=tag:Environment,Values=$ENVIRONMENT" --query 'Addresses[?!InstanceId].AllocationId' --output text)
if [ -n "$ORPHANED_EIPS" ] && [ "$ORPHANED_EIPS" != "None" ]; then
    print_warning "Found orphaned Elastic IPs: $ORPHANED_EIPS"
else
    print_status "No orphaned Elastic IPs found"
fi

# Check for orphaned Load Balancers
ORPHANED_ALBS=$(aws elbv2 describe-load-balancers --region "$AWS_REGION" --query "LoadBalancers[?contains(LoadBalancerName, '$ENVIRONMENT')].LoadBalancerArn" --output text)
if [ -n "$ORPHANED_ALBS" ] && [ "$ORPHANED_ALBS" != "None" ]; then
    print_warning "Found orphaned Application Load Balancers: $ORPHANED_ALBS"
else
    print_status "No orphaned Application Load Balancers found"
fi

# Verify deployment state consistency
if [ -f "$DEPLOYMENT_STATE_FILE" ]; then
    echo "📊 Verifying deployment state consistency..."
    
    # Extract information from deployment state
    DEPLOYED_STACKS_COUNT=$(jq -r '.deployed_stacks | length' "$DEPLOYMENT_STATE_FILE" 2>/dev/null || echo "0")
    CREATED_BUCKETS_COUNT=$(jq -r '.created_buckets | length' "$DEPLOYMENT_STATE_FILE" 2>/dev/null || echo "0")
    CREATED_PARAMETERS_COUNT=$(jq -r '.created_parameters | length' "$DEPLOYMENT_STATE_FILE" 2>/dev/null || echo "0")
    
    print_info "Deployment state shows:"
    print_info "  - $DEPLOYED_STACKS_COUNT stacks were deployed"
    print_info "  - $CREATED_BUCKETS_COUNT buckets were created"
    print_info "  - $CREATED_PARAMETERS_COUNT parameters were created"
fi

# Generate cleanup recommendations
echo ""
echo "=========================================="
echo -e "${BLUE}🧹 Cleanup Recommendations${NC}"
echo "=========================================="

if [ $CLEANUP_NEEDED -gt 0 ]; then
    echo -e "${YELLOW}Manual cleanup may be required for the following:${NC}"
    echo ""
    
    # Provide specific cleanup commands
    echo "# Clean up remaining S3 buckets (if any):"
    for bucket in "${EXPECTED_BUCKETS[@]}"; do
        echo "aws s3 rm s3://$bucket --recursive && aws s3api delete-bucket --bucket $bucket --region $AWS_REGION"
    done
    echo ""
    
    echo "# Clean up remaining parameters (if any):"
    for param in "${EXPECTED_PARAMETERS[@]}"; do
        echo "aws ssm delete-parameter --name '$param' --region $AWS_REGION"
    done
    echo ""
    
    echo "# Force delete CloudFormation stacks (if stuck):"
    for stack in "${EXPECTED_STACKS[@]}"; do
        echo "aws cloudformation delete-stack --stack-name $stack --region $AWS_REGION"
    done
else
    echo -e "${GREEN}No manual cleanup required. Rollback appears complete.${NC}"
fi

# Summary
echo ""
echo "=========================================="
echo -e "${BLUE}📊 Rollback Verification Summary${NC}"
echo "=========================================="
echo -e "${GREEN}Verifications Passed: $VERIFICATION_PASSED${NC}"
echo -e "${YELLOW}Items Needing Cleanup: $CLEANUP_NEEDED${NC}"
echo -e "${RED}Verification Failures: $VERIFICATION_FAILED${NC}"
echo ""

# Determine exit code
if [ $VERIFICATION_FAILED -eq 0 ] && [ $CLEANUP_NEEDED -eq 0 ]; then
    echo -e "${GREEN}🎉 Rollback verification passed! System is in clean state.${NC}"
    exit 0
elif [ $VERIFICATION_FAILED -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Rollback mostly successful, but some manual cleanup is recommended.${NC}"
    exit 1
else
    echo -e "${RED}❌ Rollback verification failed. Manual intervention required.${NC}"
    exit 2
fi