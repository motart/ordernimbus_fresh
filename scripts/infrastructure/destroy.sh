#!/bin/bash

# Sales Forecasting Platform - Improved AWS Infrastructure Destruction Script
# WARNING: This script will permanently delete ALL resources for the specified environment
# Prerequisites: AWS CLI configured with appropriate permissions

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_REGION="us-west-1"
DEFAULT_ENV="staging"
STACK_PREFIX="ordernimbus"
MAX_WAIT_TIME=600  # 10 minutes max wait for any single operation
RETRY_ATTEMPTS=3

# Parse command line arguments
ENVIRONMENT=${1:-$DEFAULT_ENV}
AWS_REGION=${2:-$DEFAULT_REGION}
CONFIRM=${3:-false}

echo -e "${RED}🔥 WARNING: DESTRUCTIVE OPERATION${NC}"
echo -e "${RED}This will permanently delete ALL AWS resources for environment: ${ENVIRONMENT}${NC}"
echo -e "${RED}Region: ${AWS_REGION}${NC}"
echo "=========================================="

# Function to print status
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

# Function to check if AWS CLI is configured
check_aws_config() {
    echo "🔍 Checking AWS configuration..."
    
    if ! aws sts get-caller-identity &>/dev/null; then
        print_error "AWS CLI not configured or credentials invalid"
        exit 1
    fi
    
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    CURRENT_REGION=$(aws configure get region)
    
    print_status "AWS Account ID: $ACCOUNT_ID"
    print_status "Current Region: ${CURRENT_REGION:-$AWS_REGION}"
    
    # Export for use in other functions
    export ACCOUNT_ID
    export AWS_DEFAULT_REGION=$AWS_REGION
}

# Function to prompt for confirmation
confirm_destruction() {
    if [ "$CONFIRM" != "true" ]; then
        echo ""
        echo -e "${RED}⚠️  FINAL WARNING: This will permanently delete:${NC}"
        echo "   • All CloudFormation stacks for $ENVIRONMENT"
        echo "   • All S3 buckets and their contents"
        echo "   • All SSM parameters"
        echo "   • All SNS topics and subscriptions"
        echo "   • Database instances and backups"
        echo "   • ECS services and task definitions"
        echo "   • Load balancers and target groups"
        echo "   • VPC and networking components"
        echo ""
        read -p "Type 'DELETE' to confirm destruction: " confirmation
        
        if [ "$confirmation" != "DELETE" ]; then
            echo "Operation cancelled."
            exit 0
        fi
    fi
}

# Function to wait for resource deletion with timeout
wait_for_deletion() {
    local resource_type=$1
    local resource_id=$2
    local check_command=$3
    local timeout=${4:-$MAX_WAIT_TIME}
    
    local elapsed=0
    local interval=10
    
    echo -n "  Waiting for $resource_type deletion"
    while [ $elapsed -lt $timeout ]; do
        if ! eval "$check_command" &>/dev/null; then
            echo ""
            print_status "$resource_type deleted: $resource_id"
            return 0
        fi
        echo -n "."
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    echo ""
    print_warning "Timeout waiting for $resource_type deletion: $resource_id"
    return 1
}

# Function to retry operations
retry_operation() {
    local operation=$1
    local description=$2
    local attempts=0
    
    while [ $attempts -lt $RETRY_ATTEMPTS ]; do
        if eval "$operation"; then
            return 0
        fi
        
        attempts=$((attempts + 1))
        if [ $attempts -lt $RETRY_ATTEMPTS ]; then
            print_warning "Operation failed, retrying ($attempts/$RETRY_ATTEMPTS): $description"
            sleep 5
        else
            print_error "Failed after $RETRY_ATTEMPTS attempts: $description"
            return 1
        fi
    done
}

# Function to delete database instances and clusters properly
destroy_rds_resources() {
    echo "🗄️  Destroying RDS resources..."
    
    # First, find all DB clusters
    CLUSTERS=$(aws rds describe-db-clusters \
        --query "DBClusters[?contains(DBClusterIdentifier, '$ENVIRONMENT')].[DBClusterIdentifier]" \
        --output text --region $AWS_REGION || true)
    
    if [ -z "$CLUSTERS" ]; then
        print_info "No RDS clusters found"
        return
    fi
    
    for cluster in $CLUSTERS; do
        print_info "Processing RDS cluster: $cluster"
        
        # Get all instances in this cluster
        INSTANCES=$(aws rds describe-db-clusters \
            --db-cluster-identifier "$cluster" \
            --query 'DBClusters[0].DBClusterMembers[].DBInstanceIdentifier' \
            --output text --region $AWS_REGION || true)
        
        # Delete all instances first
        for instance in $INSTANCES; do
            print_info "Deleting DB instance: $instance"
            
            # Check if instance is already being deleted
            INSTANCE_STATUS=$(aws rds describe-db-instances \
                --db-instance-identifier "$instance" \
                --query 'DBInstances[0].DBInstanceStatus' \
                --output text --region $AWS_REGION 2>/dev/null || echo "not-found")
            
            if [ "$INSTANCE_STATUS" = "deleting" ]; then
                print_info "Instance already being deleted: $instance"
            elif [ "$INSTANCE_STATUS" != "not-found" ]; then
                retry_operation \
                    "aws rds delete-db-instance \
                        --db-instance-identifier '$instance' \
                        --skip-final-snapshot \
                        --delete-automated-backups \
                        --region $AWS_REGION 2>/dev/null" \
                    "Delete DB instance $instance"
            fi
            
            # Wait for instance deletion
            wait_for_deletion "DB instance" "$instance" \
                "aws rds describe-db-instances --db-instance-identifier '$instance' --region $AWS_REGION 2>/dev/null"
        done
        
        # Now delete the cluster
        print_info "Deleting DB cluster: $cluster"
        
        # Check cluster status
        CLUSTER_STATUS=$(aws rds describe-db-clusters \
            --db-cluster-identifier "$cluster" \
            --query 'DBClusters[0].Status' \
            --output text --region $AWS_REGION 2>/dev/null || echo "not-found")
        
        if [ "$CLUSTER_STATUS" != "not-found" ] && [ "$CLUSTER_STATUS" != "deleting" ]; then
            retry_operation \
                "aws rds delete-db-cluster \
                    --db-cluster-identifier '$cluster' \
                    --skip-final-snapshot \
                    --delete-automated-backups \
                    --region $AWS_REGION 2>/dev/null" \
                "Delete DB cluster $cluster"
        fi
        
        # Wait for cluster deletion
        wait_for_deletion "DB cluster" "$cluster" \
            "aws rds describe-db-clusters --db-cluster-identifier '$cluster' --region $AWS_REGION 2>/dev/null"
    done
}

# Function to empty and delete S3 buckets with better error handling
destroy_s3_buckets() {
    echo "🪣 Destroying S3 buckets..."
    
    # List all buckets with our prefix
    BUCKETS=$(aws s3 ls | grep "$STACK_PREFIX-$ENVIRONMENT" | awk '{print $3}' || true)
    
    if [ -z "$BUCKETS" ]; then
        print_warning "No S3 buckets found with prefix $STACK_PREFIX-$ENVIRONMENT"
        return
    fi
    
    for bucket in $BUCKETS; do
        echo "Processing bucket: $bucket"
        
        # Check if bucket exists
        if ! aws s3api head-bucket --bucket "$bucket" --region $AWS_REGION 2>/dev/null; then
            print_warning "Bucket $bucket not found or already deleted"
            continue
        fi
        
        # Disable versioning first
        aws s3api put-bucket-versioning \
            --bucket "$bucket" \
            --versioning-configuration Status=Suspended \
            --region $AWS_REGION || true
        
        # Delete all versions in batches
        print_info "Deleting all object versions..."
        
        # Create delete batch function
        delete_batch() {
            local delete_list=$1
            if [ -n "$delete_list" ] && [ "$delete_list" != "[]" ]; then
                aws s3api delete-objects \
                    --bucket "$bucket" \
                    --delete "$delete_list" \
                    --region $AWS_REGION >/dev/null 2>&1 || true
            fi
        }
        
        # Delete object versions
        while true; do
            # Get batch of versions
            VERSIONS=$(aws s3api list-object-versions \
                --bucket "$bucket" \
                --max-keys 100 \
                --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
                --region $AWS_REGION 2>/dev/null || echo '{"Objects": []}')
            
            if [ "$VERSIONS" = '{"Objects": []}' ] || [ "$VERSIONS" = '{"Objects": null}' ]; then
                break
            fi
            
            delete_batch "$VERSIONS"
        done
        
        # Delete delete markers
        while true; do
            MARKERS=$(aws s3api list-object-versions \
                --bucket "$bucket" \
                --max-keys 100 \
                --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' \
                --region $AWS_REGION 2>/dev/null || echo '{"Objects": []}')
            
            if [ "$MARKERS" = '{"Objects": []}' ] || [ "$MARKERS" = '{"Objects": null}' ]; then
                break
            fi
            
            delete_batch "$MARKERS"
        done
        
        # Delete remaining objects
        aws s3 rm "s3://$bucket" --recursive --region $AWS_REGION >/dev/null 2>&1 || true
        
        # Remove bucket policy if exists
        aws s3api delete-bucket-policy --bucket "$bucket" --region $AWS_REGION 2>/dev/null || true
        
        # Delete the bucket
        retry_operation \
            "aws s3api delete-bucket --bucket '$bucket' --region $AWS_REGION 2>/dev/null" \
            "Delete bucket $bucket"
        
        print_status "Deleted bucket: $bucket"
    done
}

# Function to delete CloudFormation stacks with better handling
destroy_cloudformation_stacks() {
    echo "☁️  Destroying CloudFormation stacks..."
    
    # First, delete any stacks in ROLLBACK_COMPLETE state
    print_info "Checking for failed stacks..."
    FAILED_STACKS=$(aws cloudformation list-stacks \
        --stack-status-filter ROLLBACK_COMPLETE CREATE_FAILED DELETE_FAILED UPDATE_ROLLBACK_COMPLETE \
        --query "StackSummaries[?contains(StackName, '$STACK_PREFIX-$ENVIRONMENT')].[StackName]" \
        --output text --region $AWS_REGION || true)
    
    for stack in $FAILED_STACKS; do
        print_info "Cleaning up failed stack: $stack"
        aws cloudformation delete-stack --stack-name "$stack" --region $AWS_REGION || true
    done
    
    # Wait a bit for failed stack cleanup
    if [ -n "$FAILED_STACKS" ]; then
        sleep 10
    fi
    
    # Stacks to delete in reverse order (reverse of deployment order)
    STACKS=(
        "$STACK_PREFIX-$ENVIRONMENT-monitoring"
        "$STACK_PREFIX-$ENVIRONMENT-ml-pipeline"
        "$STACK_PREFIX-$ENVIRONMENT-frontend"
        "$STACK_PREFIX-$ENVIRONMENT-api"
        "$STACK_PREFIX-$ENVIRONMENT-compute"
        "$STACK_PREFIX-$ENVIRONMENT-database"
        "$STACK_PREFIX-$ENVIRONMENT-security"
        "$STACK_PREFIX-$ENVIRONMENT-networking"
    )
    
    for stack in "${STACKS[@]}"; do
        # Check if stack exists
        STACK_STATUS=$(aws cloudformation describe-stacks \
            --stack-name "$stack" \
            --query 'Stacks[0].StackStatus' \
            --output text \
            --region $AWS_REGION 2>/dev/null || echo "NOT_FOUND")
        
        if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
            print_info "Stack $stack not found or already deleted"
            continue
        fi
        
        if [ "$STACK_STATUS" = "DELETE_IN_PROGRESS" ]; then
            print_info "Stack $stack already being deleted, waiting..."
            wait_for_deletion "CloudFormation stack" "$stack" \
                "aws cloudformation describe-stacks --stack-name '$stack' --region $AWS_REGION 2>/dev/null"
            continue
        fi
        
        echo "Deleting stack: $stack"
        
        # Handle special cases for certain stacks
        case $stack in
            *-database*)
                # Delete RDS resources first
                destroy_rds_resources
                
                # Disable deletion protection if enabled
                print_info "Disabling deletion protection for database stack..."
                aws cloudformation update-termination-protection \
                    --stack-name "$stack" \
                    --no-enable-termination-protection \
                    --region $AWS_REGION 2>/dev/null || true
                ;;
            *-compute*)
                # Stop ECS services first
                print_info "Stopping ECS services..."
                CLUSTER_NAME="$ENVIRONMENT-forecasting-cluster"
                
                # Check if cluster exists
                if aws ecs describe-clusters --clusters "$CLUSTER_NAME" --region $AWS_REGION &>/dev/null; then
                    SERVICES=$(aws ecs list-services \
                        --cluster "$CLUSTER_NAME" \
                        --query 'serviceArns[]' \
                        --output text \
                        --region $AWS_REGION || true)
                    
                    for service in $SERVICES; do
                        print_info "Stopping service: $service"
                        aws ecs update-service \
                            --cluster "$CLUSTER_NAME" \
                            --service "$service" \
                            --desired-count 0 \
                            --region $AWS_REGION >/dev/null 2>&1 || true
                        
                        # Delete the service
                        aws ecs delete-service \
                            --cluster "$CLUSTER_NAME" \
                            --service "$service" \
                            --force \
                            --region $AWS_REGION >/dev/null 2>&1 || true
                    done
                fi
                ;;
        esac
        
        # Delete the stack
        retry_operation \
            "aws cloudformation delete-stack --stack-name '$stack' --region $AWS_REGION" \
            "Delete CloudFormation stack $stack"
        
        # Wait for stack deletion with timeout
        wait_for_deletion "CloudFormation stack" "$stack" \
            "aws cloudformation describe-stacks --stack-name '$stack' --region $AWS_REGION 2>/dev/null" \
            $MAX_WAIT_TIME
    done
}

# Function to delete SSM parameters
destroy_ssm_parameters() {
    echo "⚙️  Destroying SSM parameters..."
    
    # Get all parameters with our prefix
    PARAMETERS=$(aws ssm describe-parameters \
        --query "Parameters[?starts_with(Name, \`/ordernimbus/$ENVIRONMENT\`)].Name" \
        --output text \
        --region $AWS_REGION || true)
    
    if [ -z "$PARAMETERS" ]; then
        print_warning "No SSM parameters found for environment $ENVIRONMENT"
        return
    fi
    
    for param in $PARAMETERS; do
        retry_operation \
            "aws ssm delete-parameter --name '$param' --region $AWS_REGION 2>/dev/null" \
            "Delete parameter $param"
        print_status "Deleted parameter: $param"
    done
}

# Function to delete SNS topics
destroy_sns_topics() {
    echo "📢 Destroying SNS topics..."
    
    # Find all topics with our naming pattern
    TOPICS=$(aws sns list-topics \
        --query "Topics[?contains(TopicArn, '$ENVIRONMENT')].[TopicArn]" \
        --output text \
        --region $AWS_REGION || true)
    
    if [ -z "$TOPICS" ]; then
        print_info "No SNS topics found"
        return
    fi
    
    for topic_arn in $TOPICS; do
        print_info "Processing SNS topic: $topic_arn"
        
        # Delete all subscriptions first
        SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic \
            --topic-arn "$topic_arn" \
            --query 'Subscriptions[].SubscriptionArn' \
            --output text \
            --region $AWS_REGION || true)
        
        for sub in $SUBSCRIPTIONS; do
            if [ "$sub" != "PendingConfirmation" ]; then
                aws sns unsubscribe --subscription-arn "$sub" --region $AWS_REGION || true
            fi
        done
        
        # Delete the topic
        retry_operation \
            "aws sns delete-topic --topic-arn '$topic_arn' --region $AWS_REGION" \
            "Delete SNS topic"
        
        print_status "Deleted SNS topic: $topic_arn"
    done
}

# Function to clean up Cognito User Pools
destroy_cognito_resources() {
    echo "👤 Destroying Cognito resources..."
    
    # Find user pools with our naming pattern
    USER_POOLS=$(aws cognito-idp list-user-pools \
        --max-results 50 \
        --query "UserPools[?contains(Name, '$ENVIRONMENT')].Id" \
        --output text \
        --region $AWS_REGION || true)
    
    if [ -z "$USER_POOLS" ]; then
        print_info "No Cognito user pools found"
        return
    fi
    
    for pool_id in $USER_POOLS; do
        print_info "Deleting user pool: $pool_id"
        
        # Delete all users first
        USERS=$(aws cognito-idp list-users \
            --user-pool-id "$pool_id" \
            --query 'Users[].Username' \
            --output text \
            --region $AWS_REGION || true)
        
        for username in $USERS; do
            aws cognito-idp admin-delete-user \
                --user-pool-id "$pool_id" \
                --username "$username" \
                --region $AWS_REGION || true
        done
        
        # Delete user pool
        retry_operation \
            "aws cognito-idp delete-user-pool --user-pool-id '$pool_id' --region $AWS_REGION" \
            "Delete user pool $pool_id"
        
        print_status "Deleted user pool: $pool_id"
    done
}

# Function to clean up any remaining resources
cleanup_remaining_resources() {
    echo "🧹 Cleaning up remaining resources..."
    
    # Delete any remaining ECS clusters
    CLUSTERS=$(aws ecs list-clusters \
        --query "clusterArns[?contains(@, '$ENVIRONMENT')]" \
        --output text \
        --region $AWS_REGION || true)
    
    for cluster in $CLUSTERS; do
        print_info "Deleting ECS cluster: $cluster"
        retry_operation \
            "aws ecs delete-cluster --cluster '$cluster' --region $AWS_REGION" \
            "Delete ECS cluster"
        print_status "Deleted ECS cluster: $cluster"
    done
    
    # Delete any remaining load balancers
    LOAD_BALANCERS=$(aws elbv2 describe-load-balancers \
        --query "LoadBalancers[?contains(LoadBalancerName, '$ENVIRONMENT')].LoadBalancerArn" \
        --output text \
        --region $AWS_REGION || true)
    
    for lb in $LOAD_BALANCERS; do
        print_info "Deleting load balancer: $lb"
        retry_operation \
            "aws elbv2 delete-load-balancer --load-balancer-arn '$lb' --region $AWS_REGION" \
            "Delete load balancer"
        print_status "Deleted load balancer: $lb"
    done
}

# Function to generate destruction report
generate_destruction_report() {
    echo ""
    echo "=========================================="
    echo "📊 Generating Destruction Verification Report..."
    echo "=========================================="
    
    local all_clear=true
    
    # Check CloudFormation stacks
    echo -n "CloudFormation Stacks: "
    REMAINING_STACKS=$(aws cloudformation list-stacks \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
        --query "StackSummaries[?contains(StackName, '$STACK_PREFIX-$ENVIRONMENT')].[StackName]" \
        --output text \
        --region $AWS_REGION || true)
    
    if [ -z "$REMAINING_STACKS" ]; then
        echo -e "${GREEN}✓ Clean${NC}"
    else
        echo -e "${RED}✗ Remaining: $REMAINING_STACKS${NC}"
        all_clear=false
    fi
    
    # Check S3 buckets
    echo -n "S3 Buckets: "
    REMAINING_BUCKETS=$(aws s3 ls | grep "$STACK_PREFIX-$ENVIRONMENT" | wc -l | tr -d ' ' || echo "0")
    if [ "$REMAINING_BUCKETS" = "0" ] || [ "$REMAINING_BUCKETS" = "" ]; then
        echo -e "${GREEN}✓ Clean${NC}"
    else
        echo -e "${RED}✗ $REMAINING_BUCKETS buckets remaining${NC}"
        all_clear=false
    fi
    
    # Check RDS
    echo -n "RDS Clusters: "
    REMAINING_RDS=$(aws rds describe-db-clusters \
        --query "DBClusters[?contains(DBClusterIdentifier, '$ENVIRONMENT')].[DBClusterIdentifier]" \
        --output text \
        --region $AWS_REGION || true)
    
    if [ -z "$REMAINING_RDS" ]; then
        echo -e "${GREEN}✓ Clean${NC}"
    else
        echo -e "${RED}✗ Remaining: $REMAINING_RDS${NC}"
        all_clear=false
    fi
    
    # Check SSM Parameters
    echo -n "SSM Parameters: "
    REMAINING_PARAMS=$(aws ssm describe-parameters \
        --query "Parameters[?starts_with(Name, \`/ordernimbus/$ENVIRONMENT\`)].Name" \
        --output text \
        --region $AWS_REGION 2>/dev/null | wc -w | tr -d ' ' || echo "0")
    
    if [ "$REMAINING_PARAMS" = "0" ] || [ "$REMAINING_PARAMS" = "" ]; then
        echo -e "${GREEN}✓ Clean${NC}"
    else
        echo -e "${RED}✗ $REMAINING_PARAMS parameters remaining${NC}"
        all_clear=false
    fi
    
    echo ""
    if [ "$all_clear" = true ]; then
        echo -e "${GREEN}✅ All resources successfully destroyed!${NC}"
    else
        echo -e "${YELLOW}⚠️  Some resources may still exist. Manual cleanup may be required.${NC}"
    fi
}

# Function to output destruction summary
destruction_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎯 Destruction process completed!${NC}"
    echo "=========================================="
    echo ""
    echo "📋 Environment destroyed: $ENVIRONMENT"
    echo "🌍 Region: $AWS_REGION"
    echo "⏱️  Duration: $((SECONDS/60)) minutes $((SECONDS%60)) seconds"
    echo ""
    
    generate_destruction_report
    
    echo ""
    echo "📁 Log file: destruction-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).log"
    echo ""
    echo "🔍 Verify in AWS Console: https://console.aws.amazon.com/console/home?region=$AWS_REGION"
    echo ""
}

# Function to handle destruction failures
cleanup_on_failure() {
    print_error "Destruction script encountered an error."
    echo "Attempting to continue with remaining cleanup tasks..."
    # Don't exit on failure, continue with other cleanup tasks
}

# Set up error handling (non-fatal)
trap cleanup_on_failure ERR

# Main destruction flow
main() {
    SECONDS=0  # Start timer
    echo "Starting destruction at $(date)"
    
    # Pre-destruction checks
    check_aws_config
    
    # Confirmation
    confirm_destruction
    
    echo ""
    echo -e "${RED}🔥 Beginning destruction process...${NC}"
    echo ""
    
    # Clean up resources in order of dependency
    # 1. First, handle database resources separately (before stack deletion)
    destroy_rds_resources
    
    # 2. Delete CloudFormation stacks
    destroy_cloudformation_stacks
    
    # 3. Clean up resources not managed by CloudFormation
    destroy_s3_buckets
    destroy_ssm_parameters
    destroy_sns_topics
    destroy_cognito_resources
    
    # 4. Final cleanup of any remaining resources
    cleanup_remaining_resources
    
    # Summary
    destruction_summary
    
    echo "Destruction completed at $(date)"
}

# Create destruction log
LOG_FILE="destruction-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a $LOG_FILE)
exec 2>&1

# Run main destruction
main "$@"