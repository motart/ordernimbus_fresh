#!/bin/bash

# Sales Forecasting Platform - Complete AWS Infrastructure Destruction Script
# WARNING: This script will permanently delete ALL resources for the specified environment
# Prerequisites: AWS CLI configured with appropriate permissions

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_REGION="us-east-1"
DEFAULT_ENV="staging"
STACK_PREFIX="ordernimbus"

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

# Function to empty and delete S3 buckets
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
        if aws s3api head-bucket --bucket "$bucket" --region $AWS_REGION 2>/dev/null; then
            # Disable versioning first
            aws s3api put-bucket-versioning \
                --bucket "$bucket" \
                --versioning-configuration Status=Suspended || true
            
            # Delete all object versions and delete markers
            echo "  Deleting all objects and versions..."
            aws s3api list-object-versions \
                --bucket "$bucket" \
                --output json \
                --query 'Versions[].{Key:Key,VersionId:VersionId}' | \
            jq -r '.[] | "\(.Key)\t\(.VersionId)"' | \
            while read -r key version_id; do
                if [ -n "$key" ] && [ -n "$version_id" ]; then
                    aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$version_id" || true
                fi
            done
            
            # Delete delete markers
            aws s3api list-object-versions \
                --bucket "$bucket" \
                --output json \
                --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' | \
            jq -r '.[] | "\(.Key)\t\(.VersionId)"' | \
            while read -r key version_id; do
                if [ -n "$key" ] && [ -n "$version_id" ]; then
                    aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$version_id" || true
                fi
            done
            
            # Delete remaining objects
            aws s3 rm s3://"$bucket" --recursive || true
            
            # Remove bucket policy if exists
            aws s3api delete-bucket-policy --bucket "$bucket" || true
            
            # Delete the bucket
            aws s3api delete-bucket --bucket "$bucket" --region $AWS_REGION || true
            
            print_status "Deleted bucket: $bucket"
        else
            print_warning "Bucket $bucket not found or already deleted"
        fi
    done
}

# Function to delete CloudFormation stacks in reverse order
destroy_cloudformation_stacks() {
    echo "☁️  Destroying CloudFormation stacks..."
    
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
        if aws cloudformation describe-stacks --stack-name "$stack" --region $AWS_REGION &>/dev/null; then
            echo "Deleting stack: $stack"
            
            # Handle special cases for certain stacks
            case $stack in
                *-database*)
                    # Disable deletion protection if enabled
                    echo "  Disabling deletion protection for database..."
                    aws cloudformation update-termination-protection \
                        --stack-name "$stack" \
                        --no-enable-termination-protection || true
                    
                    # Delete database snapshots first
                    DB_CLUSTER_ID="$STACK_PREFIX-$ENVIRONMENT-db-cluster"
                    aws rds delete-db-cluster \
                        --db-cluster-identifier "$DB_CLUSTER_ID" \
                        --skip-final-snapshot \
                        --delete-automated-backups || true
                    ;;
                *-compute*)
                    # Stop ECS services first
                    echo "  Stopping ECS services..."
                    CLUSTER_NAME="$ENVIRONMENT-forecasting-cluster"
                    SERVICES=$(aws ecs list-services \
                        --cluster "$CLUSTER_NAME" \
                        --query 'serviceArns[]' \
                        --output text || true)
                    
                    for service in $SERVICES; do
                        aws ecs update-service \
                            --cluster "$CLUSTER_NAME" \
                            --service "$service" \
                            --desired-count 0 || true
                    done
                    
                    # Wait for services to stop
                    sleep 30
                    ;;
            esac
            
            # Delete the stack
            aws cloudformation delete-stack \
                --stack-name "$stack" \
                --region $AWS_REGION
            
            # Wait for stack deletion to complete
            echo "  Waiting for stack deletion to complete..."
            aws cloudformation wait stack-delete-complete \
                --stack-name "$stack" \
                --region $AWS_REGION || true
            
            print_status "Deleted stack: $stack"
        else
            print_warning "Stack $stack not found or already deleted"
        fi
    done
}

# Function to delete SSM parameters
destroy_ssm_parameters() {
    echo "⚙️  Destroying SSM parameters..."
    
    # Get all parameters with our prefix
    PARAMETERS=$(aws ssm describe-parameters \
        --query "Parameters[?starts_with(Name, \`/ordernimbus/$ENVIRONMENT\`)].Name" \
        --output text || true)
    
    if [ -z "$PARAMETERS" ]; then
        print_warning "No SSM parameters found for environment $ENVIRONMENT"
        return
    fi
    
    for param in $PARAMETERS; do
        aws ssm delete-parameter --name "$param" || true
        print_status "Deleted parameter: $param"
    done
}

# Function to delete SNS topics
destroy_sns_topics() {
    echo "📢 Destroying SNS topics..."
    
    TOPIC_NAME="ordernimbus-$ENVIRONMENT-alerts"
    TOPIC_ARN="arn:aws:sns:$AWS_REGION:$ACCOUNT_ID:$TOPIC_NAME"
    
    # Check if topic exists
    if aws sns get-topic-attributes --topic-arn "$TOPIC_ARN" &>/dev/null; then
        # Delete all subscriptions first
        SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic \
            --topic-arn "$TOPIC_ARN" \
            --query 'Subscriptions[].SubscriptionArn' \
            --output text || true)
        
        for sub in $SUBSCRIPTIONS; do
            aws sns unsubscribe --subscription-arn "$sub" || true
        done
        
        # Delete the topic
        aws sns delete-topic --topic-arn "$TOPIC_ARN"
        print_status "Deleted SNS topic: $TOPIC_NAME"
    else
        print_warning "SNS topic $TOPIC_NAME not found"
    fi
}

# Function to clean up Cognito User Pools
destroy_cognito_resources() {
    echo "👤 Destroying Cognito resources..."
    
    # Find user pools with our naming pattern
    USER_POOLS=$(aws cognito-idp list-user-pools --max-items 50 \
        --query "UserPools[?contains(Name, '$ENVIRONMENT')].Id" \
        --output text || true)
    
    for pool_id in $USER_POOLS; do
        # Delete all users first
        USERS=$(aws cognito-idp list-users --user-pool-id "$pool_id" \
            --query 'Users[].Username' --output text || true)
        
        for username in $USERS; do
            aws cognito-idp admin-delete-user \
                --user-pool-id "$pool_id" \
                --username "$username" || true
        done
        
        # Delete user pool
        aws cognito-idp delete-user-pool --user-pool-id "$pool_id" || true
        print_status "Deleted user pool: $pool_id"
    done
}

# Function to clean up any remaining resources
cleanup_remaining_resources() {
    echo "🧹 Cleaning up remaining resources..."
    
    # Delete any remaining ECS clusters
    CLUSTERS=$(aws ecs list-clusters \
        --query "clusterArns[?contains(@, '$ENVIRONMENT')]" \
        --output text || true)
    
    for cluster in $CLUSTERS; do
        # Delete cluster
        aws ecs delete-cluster --cluster "$cluster" || true
        print_status "Deleted ECS cluster: $cluster"
    done
    
    # Delete any remaining load balancers
    LOAD_BALANCERS=$(aws elbv2 describe-load-balancers \
        --query "LoadBalancers[?contains(LoadBalancerName, '$ENVIRONMENT')].LoadBalancerArn" \
        --output text || true)
    
    for lb in $LOAD_BALANCERS; do
        aws elbv2 delete-load-balancer --load-balancer-arn "$lb" || true
        print_status "Deleted load balancer: $lb"
    done
    
    # Delete any remaining security groups (except default)
    VPC_ID=$(aws ec2 describe-vpcs \
        --filters "Name=tag:Name,Values=*$ENVIRONMENT*" \
        --query 'Vpcs[0].VpcId' --output text || true)
    
    if [ "$VPC_ID" != "None" ] && [ -n "$VPC_ID" ]; then
        SECURITY_GROUPS=$(aws ec2 describe-security-groups \
            --filters "Name=vpc-id,Values=$VPC_ID" \
            --query 'SecurityGroups[?GroupName!=`default`].GroupId' \
            --output text || true)
        
        for sg in $SECURITY_GROUPS; do
            aws ec2 delete-security-group --group-id "$sg" || true
            print_status "Deleted security group: $sg"
        done
    fi
}

# Function to output destruction summary
destruction_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎯 Destruction completed!${NC}"
    echo "=========================================="
    echo ""
    echo "📋 Resources destroyed for environment: $ENVIRONMENT"
    echo "🌍 Region: $AWS_REGION"
    echo ""
    echo "⚠️  Note: Some resources may take additional time to fully delete."
    echo "🔍 Check the AWS Console to verify all resources are removed."
    echo ""
    echo "📁 Log file: destruction-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).log"
    echo ""
}

# Function to handle destruction failures
cleanup_on_failure() {
    print_error "Destruction script failed. Some resources may still exist."
    echo "Manual cleanup may be required. Check AWS Console for remaining resources."
    exit 1
}

# Set up error handling
trap cleanup_on_failure ERR

# Main destruction flow
main() {
    echo "Starting destruction at $(date)"
    
    # Pre-destruction checks
    check_aws_config
    
    # Confirmation
    confirm_destruction
    
    echo ""
    echo -e "${RED}🔥 Beginning destruction process...${NC}"
    
    # Clean up resources in reverse order of creation
    destroy_cloudformation_stacks
    destroy_s3_buckets
    destroy_ssm_parameters
    destroy_sns_topics
    destroy_cognito_resources
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