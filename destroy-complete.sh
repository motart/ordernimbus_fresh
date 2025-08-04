#!/bin/bash

# Sales Forecasting Platform - Complete Multi-Region AWS Infrastructure Destruction Script
# WARNING: This script will permanently delete ALL resources across ALL regions
# Prerequisites: AWS CLI configured with appropriate permissions

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_ENV="staging"
STACK_PREFIX="ordernimbus"
MAX_WAIT_TIME=600  # 10 minutes max wait for any single operation
RETRY_ATTEMPTS=3

# AWS Regions to check (add more as needed)
REGIONS=("us-east-1" "us-west-1" "us-west-2" "eu-west-1")

# Parse command line arguments
ENVIRONMENT=${1:-$DEFAULT_ENV}
CONFIRM=${2:-false}
CHECK_ALL_REGIONS=${3:-true}

echo -e "${RED}🔥 COMPLETE INFRASTRUCTURE DESTRUCTION${NC}"
echo -e "${RED}This will permanently delete ALL AWS resources for environment: ${ENVIRONMENT}${NC}"
echo -e "${RED}Checking regions: ${REGIONS[@]}${NC}"
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

print_region() {
    echo -e "${MAGENTA}🌍 Region: $1${NC}"
}

# Function to check if AWS CLI is configured
check_aws_config() {
    echo "🔍 Checking AWS configuration..."
    
    if ! aws sts get-caller-identity &>/dev/null; then
        print_error "AWS CLI not configured or credentials invalid"
        exit 1
    fi
    
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    
    print_status "AWS Account ID: $ACCOUNT_ID"
    export ACCOUNT_ID
}

# Function to prompt for confirmation
confirm_destruction() {
    if [ "$CONFIRM" != "true" ]; then
        echo ""
        echo -e "${RED}⚠️  FINAL WARNING: This will permanently delete:${NC}"
        echo "   • ALL CloudFront distributions (global)"
        echo "   • ALL S3 buckets across ALL regions"
        echo "   • ALL CloudFormation stacks"
        echo "   • ALL RDS databases and clusters"
        echo "   • ALL ECS services and clusters"
        echo "   • ALL Load Balancers"
        echo "   • ALL SSM parameters"
        echo "   • ALL SNS topics"
        echo "   • ALL Cognito user pools"
        echo "   • Route53 records (if any)"
        echo ""
        echo -e "${RED}This includes PRODUCTION resources!${NC}"
        echo ""
        read -p "Type 'DELETE-ALL' to confirm complete destruction: " confirmation
        
        if [ "$confirmation" != "DELETE-ALL" ]; then
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

# Function to destroy CloudFront distributions (Global)
destroy_cloudfront_distributions() {
    echo "☁️  Destroying CloudFront distributions (Global)..."
    
    # CloudFront is global, only need to check us-east-1
    export AWS_DEFAULT_REGION=us-east-1
    
    # Find all distributions
    DISTRIBUTIONS=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Comment, '$ENVIRONMENT') || contains(Aliases.Items[0], '$STACK_PREFIX')].[Id,DomainName,Aliases.Items[0],Status,Enabled]" \
        --output text 2>/dev/null || true)
    
    if [ -z "$DISTRIBUTIONS" ]; then
        print_info "No CloudFront distributions found"
        return
    fi
    
    echo "$DISTRIBUTIONS" | while read -r dist_id domain_name alias status enabled; do
        if [ -n "$dist_id" ]; then
            print_info "Processing CloudFront distribution: $dist_id ($alias)"
            
            # Check if already disabled
            if [ "$enabled" = "true" ] || [ "$enabled" = "True" ]; then
                print_info "Disabling distribution: $dist_id"
                
                # Get current config and ETag
                ETAG=$(aws cloudfront get-distribution-config --id "$dist_id" --query "ETag" --output text)
                aws cloudfront get-distribution-config --id "$dist_id" --query "DistributionConfig" > /tmp/cf-config-$dist_id.json
                
                # Disable the distribution
                jq '.Enabled = false' /tmp/cf-config-$dist_id.json > /tmp/cf-config-disabled-$dist_id.json
                
                aws cloudfront update-distribution \
                    --id "$dist_id" \
                    --distribution-config file:///tmp/cf-config-disabled-$dist_id.json \
                    --if-match "$ETAG" >/dev/null 2>&1 || true
                
                print_status "Distribution disabled: $dist_id"
                
                # Wait for deployment
                print_info "Waiting for distribution to be deployed..."
                aws cloudfront wait distribution-deployed --id "$dist_id" 2>/dev/null || true
            fi
            
            # Now delete if deployed
            DIST_STATUS=$(aws cloudfront get-distribution --id "$dist_id" --query "Distribution.Status" --output text 2>/dev/null || echo "Unknown")
            
            if [ "$DIST_STATUS" = "Deployed" ]; then
                print_info "Deleting distribution: $dist_id"
                
                # Get latest ETag
                ETAG=$(aws cloudfront get-distribution --id "$dist_id" --query "ETag" --output text)
                
                retry_operation \
                    "aws cloudfront delete-distribution --id '$dist_id' --if-match '$ETAG' 2>/dev/null" \
                    "Delete CloudFront distribution $dist_id"
                
                print_status "Deleted CloudFront distribution: $dist_id"
            else
                print_warning "Distribution not ready for deletion (Status: $DIST_STATUS): $dist_id"
            fi
        fi
    done
    
    # Clean up temp files
    rm -f /tmp/cf-config*.json
}

# Function to destroy resources in a specific region
destroy_region_resources() {
    local region=$1
    export AWS_DEFAULT_REGION=$region
    
    print_region "$region"
    
    # Check for CloudFormation stacks
    echo "  Checking CloudFormation stacks..."
    STACKS=$(aws cloudformation list-stacks \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ROLLBACK_COMPLETE CREATE_FAILED DELETE_FAILED \
        --query "StackSummaries[?contains(StackName, '$STACK_PREFIX')].[StackName]" \
        --output text --region $region 2>/dev/null || true)
    
    if [ -n "$STACKS" ]; then
        for stack in $STACKS; do
            print_info "  Deleting stack: $stack"
            aws cloudformation delete-stack --stack-name "$stack" --region $region 2>/dev/null || true
        done
    fi
    
    # Check for S3 buckets (they're global but created in regions)
    echo "  Checking S3 buckets..."
    BUCKETS=$(aws s3api list-buckets \
        --query "Buckets[?contains(Name, '$STACK_PREFIX')].[Name]" \
        --output text 2>/dev/null || true)
    
    for bucket in $BUCKETS; do
        # Check if bucket is in this region
        BUCKET_REGION=$(aws s3api get-bucket-location \
            --bucket "$bucket" \
            --query "LocationConstraint" \
            --output text 2>/dev/null || echo "us-east-1")
        
        # Handle null response for us-east-1
        if [ "$BUCKET_REGION" = "None" ] || [ "$BUCKET_REGION" = "null" ]; then
            BUCKET_REGION="us-east-1"
        fi
        
        if [ "$BUCKET_REGION" = "$region" ]; then
            print_info "  Deleting bucket: $bucket"
            
            # Empty the bucket
            aws s3 rm "s3://$bucket" --recursive --region $region >/dev/null 2>&1 || true
            
            # Delete bucket
            aws s3api delete-bucket --bucket "$bucket" --region $region 2>/dev/null || true
            print_status "  Deleted bucket: $bucket"
        fi
    done
    
    # Check for RDS clusters
    echo "  Checking RDS resources..."
    CLUSTERS=$(aws rds describe-db-clusters \
        --query "DBClusters[?contains(DBClusterIdentifier, '$STACK_PREFIX')].[DBClusterIdentifier]" \
        --output text --region $region 2>/dev/null || true)
    
    for cluster in $CLUSTERS; do
        print_info "  Processing RDS cluster: $cluster"
        
        # Delete instances first
        INSTANCES=$(aws rds describe-db-clusters \
            --db-cluster-identifier "$cluster" \
            --query 'DBClusters[0].DBClusterMembers[].DBInstanceIdentifier' \
            --output text --region $region 2>/dev/null || true)
        
        for instance in $INSTANCES; do
            aws rds delete-db-instance \
                --db-instance-identifier "$instance" \
                --skip-final-snapshot \
                --delete-automated-backups \
                --region $region 2>/dev/null || true
        done
        
        # Delete cluster
        aws rds delete-db-cluster \
            --db-cluster-identifier "$cluster" \
            --skip-final-snapshot \
            --delete-automated-backups \
            --region $region 2>/dev/null || true
    done
    
    # Check for ECS clusters
    echo "  Checking ECS clusters..."
    CLUSTERS=$(aws ecs list-clusters \
        --query "clusterArns[?contains(@, '$STACK_PREFIX')]" \
        --output text --region $region 2>/dev/null || true)
    
    for cluster in $CLUSTERS; do
        # Delete services first
        SERVICES=$(aws ecs list-services \
            --cluster "$cluster" \
            --query 'serviceArns[]' \
            --output text --region $region 2>/dev/null || true)
        
        for service in $SERVICES; do
            aws ecs delete-service \
                --cluster "$cluster" \
                --service "$service" \
                --force \
                --region $region >/dev/null 2>&1 || true
        done
        
        # Delete cluster
        aws ecs delete-cluster --cluster "$cluster" --region $region 2>/dev/null || true
    done
    
    # Check for Load Balancers
    echo "  Checking Load Balancers..."
    LOAD_BALANCERS=$(aws elbv2 describe-load-balancers \
        --query "LoadBalancers[?contains(LoadBalancerName, '$STACK_PREFIX')].LoadBalancerArn" \
        --output text --region $region 2>/dev/null || true)
    
    for lb in $LOAD_BALANCERS; do
        aws elbv2 delete-load-balancer --load-balancer-arn "$lb" --region $region 2>/dev/null || true
    done
    
    # Check for SSM Parameters
    echo "  Checking SSM parameters..."
    PARAMETERS=$(aws ssm describe-parameters \
        --query "Parameters[?starts_with(Name, '/$STACK_PREFIX')].Name" \
        --output text --region $region 2>/dev/null || true)
    
    for param in $PARAMETERS; do
        aws ssm delete-parameter --name "$param" --region $region 2>/dev/null || true
    done
    
    # Check for SNS topics
    echo "  Checking SNS topics..."
    TOPICS=$(aws sns list-topics \
        --query "Topics[?contains(TopicArn, '$STACK_PREFIX')].[TopicArn]" \
        --output text --region $region 2>/dev/null || true)
    
    for topic in $TOPICS; do
        aws sns delete-topic --topic-arn "$topic" --region $region 2>/dev/null || true
    done
    
    # Check for Cognito User Pools
    echo "  Checking Cognito user pools..."
    USER_POOLS=$(aws cognito-idp list-user-pools \
        --max-results 50 \
        --query "UserPools[?contains(Name, '$STACK_PREFIX')].Id" \
        --output text --region $region 2>/dev/null || true)
    
    for pool_id in $USER_POOLS; do
        aws cognito-idp delete-user-pool --user-pool-id "$pool_id" --region $region 2>/dev/null || true
    done
}

# Function to check Route53 for related records
destroy_route53_records() {
    echo "🌐 Checking Route53 DNS records..."
    
    # Find hosted zones
    ZONES=$(aws route53 list-hosted-zones \
        --query "HostedZones[?contains(Name, 'ordernimbus')].[Id,Name]" \
        --output text 2>/dev/null || true)
    
    if [ -z "$ZONES" ]; then
        print_info "No Route53 hosted zones found"
        return
    fi
    
    echo "$ZONES" | while read -r zone_id zone_name; do
        if [ -n "$zone_id" ]; then
            print_info "Found hosted zone: $zone_name"
            
            # List all record sets
            RECORDS=$(aws route53 list-resource-record-sets \
                --hosted-zone-id "$zone_id" \
                --query "ResourceRecordSets[?Type != 'NS' && Type != 'SOA'].[Name,Type]" \
                --output text 2>/dev/null || true)
            
            if [ -n "$RECORDS" ]; then
                print_warning "Found DNS records in $zone_name - manual cleanup may be required"
                echo "$RECORDS" | while read -r name type; do
                    echo "    - $name ($type)"
                done
            fi
        fi
    done
}

# Function to check for ACM certificates
check_acm_certificates() {
    echo "🔒 Checking ACM certificates..."
    
    for region in "${REGIONS[@]}"; do
        CERTS=$(aws acm list-certificates \
            --query "CertificateSummaryList[?contains(DomainName, '$STACK_PREFIX')].[CertificateArn,DomainName]" \
            --output text --region $region 2>/dev/null || true)
        
        if [ -n "$CERTS" ]; then
            print_warning "Found ACM certificates in $region:"
            echo "$CERTS" | while read -r arn domain; do
                echo "    - $domain"
            done
        fi
    done
}

# Function to generate comprehensive destruction report
generate_final_report() {
    echo ""
    echo "=========================================="
    echo "📊 Final Destruction Verification Report"
    echo "=========================================="
    
    local all_clear=true
    
    for region in "${REGIONS[@]}"; do
        echo ""
        print_region "$region"
        export AWS_DEFAULT_REGION=$region
        
        # Check CloudFormation
        echo -n "  CloudFormation Stacks: "
        STACKS=$(aws cloudformation list-stacks \
            --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
            --query "StackSummaries[?contains(StackName, '$STACK_PREFIX')]" \
            --output text --region $region 2>/dev/null || true)
        
        if [ -z "$STACKS" ]; then
            echo -e "${GREEN}✓ Clean${NC}"
        else
            echo -e "${RED}✗ Stacks remaining${NC}"
            all_clear=false
        fi
        
        # Check S3 (only in primary regions)
        if [ "$region" = "us-east-1" ] || [ "$region" = "us-west-1" ]; then
            echo -n "  S3 Buckets: "
            BUCKETS=$(aws s3 ls 2>/dev/null | grep "$STACK_PREFIX" | wc -l | tr -d ' ' || echo "0")
            if [ "$BUCKETS" = "0" ]; then
                echo -e "${GREEN}✓ Clean${NC}"
            else
                echo -e "${RED}✗ $BUCKETS buckets remaining${NC}"
                all_clear=false
            fi
        fi
        
        # Check RDS
        echo -n "  RDS Clusters: "
        RDS=$(aws rds describe-db-clusters \
            --query "DBClusters[?contains(DBClusterIdentifier, '$STACK_PREFIX')]" \
            --output text --region $region 2>/dev/null || true)
        
        if [ -z "$RDS" ]; then
            echo -e "${GREEN}✓ Clean${NC}"
        else
            echo -e "${RED}✗ Clusters remaining${NC}"
            all_clear=false
        fi
    done
    
    # Check CloudFront (global)
    echo ""
    echo -n "CloudFront Distributions (Global): "
    export AWS_DEFAULT_REGION=us-east-1
    DISTRIBUTIONS=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Comment, '$ENVIRONMENT') || contains(Aliases.Items[0], '$STACK_PREFIX')]" \
        --output text 2>/dev/null || true)
    
    if [ -z "$DISTRIBUTIONS" ]; then
        echo -e "${GREEN}✓ Clean${NC}"
    else
        echo -e "${RED}✗ Distributions remaining${NC}"
        all_clear=false
    fi
    
    echo ""
    if [ "$all_clear" = true ]; then
        echo -e "${GREEN}✅ All resources successfully destroyed across all regions!${NC}"
    else
        echo -e "${YELLOW}⚠️  Some resources may still exist. Manual cleanup required.${NC}"
    fi
}

# Main destruction flow
main() {
    SECONDS=0  # Start timer
    echo "Starting complete destruction at $(date)"
    
    # Pre-destruction checks
    check_aws_config
    
    # Confirmation
    confirm_destruction
    
    echo ""
    echo -e "${RED}🔥 Beginning complete multi-region destruction...${NC}"
    echo ""
    
    # 1. First, handle global resources
    destroy_cloudfront_distributions
    
    # 2. Destroy resources in each region
    for region in "${REGIONS[@]}"; do
        destroy_region_resources "$region"
    done
    
    # 3. Check Route53
    destroy_route53_records
    
    # 4. Check ACM certificates
    check_acm_certificates
    
    # 5. Generate final report
    generate_final_report
    
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎯 Complete destruction process finished!${NC}"
    echo "=========================================="
    echo ""
    echo "📋 Environments checked: $ENVIRONMENT, production"
    echo "🌍 Regions checked: ${REGIONS[@]}"
    echo "⏱️  Duration: $((SECONDS/60)) minutes $((SECONDS%60)) seconds"
    echo ""
    echo "📁 Log file: complete-destruction-$(date +%Y%m%d-%H%M%S).log"
    echo ""
    echo "🔍 Verify in AWS Console:"
    for region in "${REGIONS[@]}"; do
        echo "  - https://console.aws.amazon.com/console/home?region=$region"
    done
    echo ""
    echo "⚠️  Note: DNS records and domain names may take time to propagate changes."
    echo ""
    
    echo "Destruction completed at $(date)"
}

# Create destruction log
LOG_FILE="complete-destruction-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a $LOG_FILE)
exec 2>&1

# Run main destruction
main "$@"