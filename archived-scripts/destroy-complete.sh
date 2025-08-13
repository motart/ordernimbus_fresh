#!/bin/bash

################################################################################
# OrderNimbus Complete Destruction Script
# This script completely removes all OrderNimbus resources
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-staging}
REGION=${2:-us-west-1}
FORCE=${3:-false}
STACK_NAME="ordernimbus-${ENVIRONMENT}-complete"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to check if stack exists
stack_exists() {
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" &> /dev/null
}

# Function to get stack status
get_stack_status() {
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "DOES_NOT_EXIST"
}

# Function to empty S3 bucket
empty_s3_bucket() {
    local bucket_name=$1
    
    print_status "Emptying S3 bucket: $bucket_name"
    
    # Check if bucket exists
    if ! aws s3api head-bucket --bucket "$bucket_name" --region "$REGION" 2>/dev/null; then
        print_warning "Bucket $bucket_name does not exist or is not accessible"
        return 0
    fi
    
    # Delete all objects
    aws s3 rm "s3://$bucket_name" --recursive --region "$REGION" 2>/dev/null || true
    
    # Delete all object versions (if versioning is enabled)
    print_status "Removing object versions..."
    aws s3api list-object-versions \
        --bucket "$bucket_name" \
        --region "$REGION" \
        --query 'Versions[].{Key:Key,VersionId:VersionId}' \
        --output json 2>/dev/null | \
    jq -r '.[] | "--key '\''\(.Key)'\'' --version-id \(.VersionId)"' | \
    while read -r line; do
        if [ -n "$line" ]; then
            eval "aws s3api delete-object --bucket $bucket_name --region $REGION $line" 2>/dev/null || true
        fi
    done
    
    # Delete all delete markers
    print_status "Removing delete markers..."
    aws s3api list-object-versions \
        --bucket "$bucket_name" \
        --region "$REGION" \
        --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' \
        --output json 2>/dev/null | \
    jq -r '.[] | "--key '\''\(.Key)'\'' --version-id \(.VersionId)"' | \
    while read -r line; do
        if [ -n "$line" ]; then
            eval "aws s3api delete-object --bucket $bucket_name --region $REGION $line" 2>/dev/null || true
        fi
    done
    
    print_success "S3 bucket emptied: $bucket_name"
}

# Function to get S3 bucket from stack
get_s3_bucket() {
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
        --output text 2>/dev/null || echo ""
}

# Function to delete CloudFront distribution
delete_cloudfront_distribution() {
    print_status "Checking for CloudFront distributions..."
    
    # Get S3 bucket name first
    local s3_bucket=$(get_s3_bucket)
    
    if [ -z "$s3_bucket" ]; then
        print_warning "Could not determine S3 bucket from stack"
        return 0
    fi
    
    # Find CloudFront distribution
    local distribution_id=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Origins.Items[0].DomainName, '${s3_bucket}')].Id" \
        --output text 2>/dev/null)
    
    if [ -n "$distribution_id" ]; then
        print_status "Found CloudFront distribution: $distribution_id"
        
        # Get distribution config
        local etag=$(aws cloudfront get-distribution-config \
            --id "$distribution_id" \
            --query 'ETag' \
            --output text 2>/dev/null)
        
        if [ -n "$etag" ]; then
            # Disable the distribution first
            print_status "Disabling CloudFront distribution..."
            aws cloudfront get-distribution-config --id "$distribution_id" | \
            jq '.DistributionConfig.Enabled = false' | \
            jq -r '.DistributionConfig' > /tmp/disabled-config.json
            
            aws cloudfront update-distribution \
                --id "$distribution_id" \
                --distribution-config file:///tmp/disabled-config.json \
                --if-match "$etag" 2>/dev/null || true
            
            print_warning "CloudFront distribution disabled. It will be deleted with the stack."
        fi
    else
        print_status "No CloudFront distribution found"
    fi
}

# Function to delete stack
delete_stack() {
    local stack_status=$(get_stack_status)
    
    if [ "$stack_status" = "DOES_NOT_EXIST" ]; then
        print_warning "Stack $STACK_NAME does not exist in region $REGION"
        return 0
    fi
    
    print_status "Current stack status: $stack_status"
    
    # Handle different stack states
    case "$stack_status" in
        "DELETE_IN_PROGRESS")
            print_warning "Stack deletion already in progress"
            print_status "Waiting for deletion to complete..."
            aws cloudformation wait stack-delete-complete \
                --stack-name "$STACK_NAME" \
                --region "$REGION" 2>/dev/null || true
            ;;
            
        "DELETE_COMPLETE")
            print_success "Stack already deleted"
            ;;
            
        "DELETE_FAILED")
            print_error "Previous deletion failed. Retrying..."
            # Get S3 bucket and empty it
            local s3_bucket=$(get_s3_bucket)
            if [ -n "$s3_bucket" ]; then
                empty_s3_bucket "$s3_bucket"
            fi
            
            # Retry deletion
            aws cloudformation delete-stack \
                --stack-name "$STACK_NAME" \
                --region "$REGION"
            
            print_status "Waiting for stack deletion..."
            aws cloudformation wait stack-delete-complete \
                --stack-name "$STACK_NAME" \
                --region "$REGION" 2>/dev/null || {
                print_error "Stack deletion failed again. Manual intervention may be required."
                show_remaining_resources
                exit 1
            }
            ;;
            
        *)
            # Get S3 bucket and empty it before deletion
            local s3_bucket=$(get_s3_bucket)
            if [ -n "$s3_bucket" ]; then
                empty_s3_bucket "$s3_bucket"
            fi
            
            # Delete the stack
            print_status "Deleting CloudFormation stack..."
            aws cloudformation delete-stack \
                --stack-name "$STACK_NAME" \
                --region "$REGION"
            
            print_status "Waiting for stack deletion (this may take 5-10 minutes)..."
            aws cloudformation wait stack-delete-complete \
                --stack-name "$STACK_NAME" \
                --region "$REGION" 2>/dev/null || {
                print_error "Stack deletion failed or timed out"
                show_remaining_resources
                exit 1
            }
            ;;
    esac
    
    print_success "Stack deleted successfully"
}

# Function to show remaining resources
show_remaining_resources() {
    print_warning "Checking for remaining resources..."
    
    # Check stack events for failures
    print_status "Recent deletion failures:"
    aws cloudformation describe-stack-events \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'StackEvents[?ResourceStatus==`DELETE_FAILED`] | [0:5].[LogicalResourceId,ResourceStatusReason]' \
        --output table 2>/dev/null || true
    
    # List stack resources still remaining
    print_status "Resources still in stack:"
    aws cloudformation list-stack-resources \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'StackResourceSummaries[?ResourceStatus!=`DELETE_COMPLETE`].[LogicalResourceId,ResourceType,ResourceStatus]' \
        --output table 2>/dev/null || true
}

# Function to clean up orphaned resources
cleanup_orphaned_resources() {
    print_status "Checking for orphaned resources..."
    
    # Check for orphaned Lambda functions
    local lambda_functions=$(aws lambda list-functions \
        --region "$REGION" \
        --query "Functions[?contains(FunctionName, 'ordernimbus-${ENVIRONMENT}')].FunctionName" \
        --output json 2>/dev/null)
    
    if [ "$lambda_functions" != "[]" ] && [ -n "$lambda_functions" ]; then
        print_warning "Found orphaned Lambda functions"
        if [ "$FORCE" = "true" ] || confirm_action "Delete orphaned Lambda functions?"; then
            echo "$lambda_functions" | jq -r '.[]' | while read -r func; do
                print_status "Deleting Lambda function: $func"
                aws lambda delete-function --function-name "$func" --region "$REGION" 2>/dev/null || true
            done
        fi
    fi
    
    # Check for orphaned DynamoDB tables
    local dynamodb_tables=$(aws dynamodb list-tables \
        --region "$REGION" \
        --query "TableNames[?contains(@, 'ordernimbus-${ENVIRONMENT}')]" \
        --output json 2>/dev/null)
    
    if [ "$dynamodb_tables" != "[]" ] && [ -n "$dynamodb_tables" ]; then
        print_warning "Found orphaned DynamoDB tables"
        if [ "$FORCE" = "true" ] || confirm_action "Delete orphaned DynamoDB tables?"; then
            echo "$dynamodb_tables" | jq -r '.[]' | while read -r table; do
                print_status "Deleting DynamoDB table: $table"
                aws dynamodb delete-table --table-name "$table" --region "$REGION" 2>/dev/null || true
            done
        fi
    fi
    
    # Check for orphaned S3 buckets
    local s3_buckets=$(aws s3api list-buckets \
        --query "Buckets[?contains(Name, 'ordernimbus-${ENVIRONMENT}')].Name" \
        --output json 2>/dev/null)
    
    if [ "$s3_buckets" != "[]" ] && [ -n "$s3_buckets" ]; then
        print_warning "Found orphaned S3 buckets"
        if [ "$FORCE" = "true" ] || confirm_action "Delete orphaned S3 buckets?"; then
            echo "$s3_buckets" | jq -r '.[]' | while read -r bucket; do
                empty_s3_bucket "$bucket"
                print_status "Deleting S3 bucket: $bucket"
                aws s3api delete-bucket --bucket "$bucket" --region "$REGION" 2>/dev/null || true
            done
        fi
    fi
    
    print_success "Orphaned resource cleanup completed"
}

# Function to confirm action
confirm_action() {
    local message=$1
    if [ "$FORCE" = "true" ]; then
        return 0
    fi
    
    read -p "$message (y/n): " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# Function to display summary
display_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🧹 OrderNimbus Destruction Complete!${NC}"
    echo "=========================================="
    echo ""
    echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
    echo -e "${BLUE}Region:${NC} $REGION"
    echo -e "${BLUE}Stack Name:${NC} $STACK_NAME"
    echo ""
    echo -e "${GREEN}✓ Resources Removed:${NC}"
    echo "  • CloudFormation stack"
    echo "  • All Lambda functions"
    echo "  • All DynamoDB tables"
    echo "  • S3 bucket (emptied and deleted)"
    echo "  • API Gateway"
    echo "  • Cognito User Pool"
    echo "  • CloudFront distribution"
    echo "  • IAM roles and policies"
    echo ""
    echo -e "${YELLOW}💡 Note:${NC}"
    echo "  CloudFront distributions may take up to 90 minutes to fully delete."
    echo "  Some CloudWatch logs may be retained for the configured retention period."
    echo ""
    echo "=========================================="
}

# Main destruction flow
main() {
    echo "=========================================="
    echo -e "${RED}OrderNimbus Complete Destruction${NC}"
    echo "=========================================="
    echo ""
    echo -e "${YELLOW}⚠️  WARNING: This will permanently delete all resources!${NC}"
    echo -e "Environment: ${RED}$ENVIRONMENT${NC}"
    echo -e "Region: ${RED}$REGION${NC}"
    echo -e "Stack: ${RED}$STACK_NAME${NC}"
    echo ""
    
    # Confirm destruction unless force flag is set
    if [ "$FORCE" != "true" ]; then
        read -p "Are you sure you want to destroy all resources? Type 'yes' to confirm: " confirmation
        if [ "$confirmation" != "yes" ]; then
            print_error "Destruction cancelled"
            exit 1
        fi
    else
        print_warning "Force mode enabled - skipping confirmation"
    fi
    
    # Check if stack exists
    if ! stack_exists; then
        print_warning "Stack $STACK_NAME does not exist in region $REGION"
        
        # Still check for orphaned resources
        if confirm_action "Check for orphaned resources?"; then
            cleanup_orphaned_resources
        fi
    else
        # Delete CloudFront distribution config
        delete_cloudfront_distribution
        
        # Delete the stack
        delete_stack
        
        # Clean up any orphaned resources
        cleanup_orphaned_resources
    fi
    
    # Verify deletion
    print_status "Verifying resource deletion..."
    
    local remaining_resources=false
    
    # Check if stack still exists
    if stack_exists; then
        print_error "Stack still exists!"
        remaining_resources=true
    fi
    
    # Check for Lambda functions
    local lambda_count=$(aws lambda list-functions \
        --region "$REGION" \
        --query "length(Functions[?contains(FunctionName, 'ordernimbus-${ENVIRONMENT}')])" \
        --output text 2>/dev/null || echo "0")
    
    if [ "$lambda_count" -gt 0 ]; then
        print_warning "$lambda_count Lambda function(s) still exist"
        remaining_resources=true
    fi
    
    # Check for DynamoDB tables
    local table_count=$(aws dynamodb list-tables \
        --region "$REGION" \
        --query "length(TableNames[?contains(@, 'ordernimbus-${ENVIRONMENT}')])" \
        --output text 2>/dev/null || echo "0")
    
    if [ "$table_count" -gt 0 ]; then
        print_warning "$table_count DynamoDB table(s) still exist"
        remaining_resources=true
    fi
    
    # Check for S3 buckets
    local bucket_count=$(aws s3api list-buckets \
        --query "length(Buckets[?contains(Name, 'ordernimbus-${ENVIRONMENT}')])" \
        --output text 2>/dev/null || echo "0")
    
    if [ "$bucket_count" -gt 0 ]; then
        print_warning "$bucket_count S3 bucket(s) still exist"
        remaining_resources=true
    fi
    
    if [ "$remaining_resources" = true ]; then
        print_error "Some resources were not deleted. Manual cleanup may be required."
        print_warning "You can run this script with 'force' as the third parameter to force cleanup:"
        echo "./destroy-complete.sh $ENVIRONMENT $REGION force"
        exit 1
    else
        print_success "All resources successfully deleted"
    fi
    
    # Display summary
    display_summary
}

# Handle script errors
error_handler() {
    local line_no=$1
    local exit_code=$2
    print_error "Destruction script failed at line $line_no with exit code $exit_code"
    print_error "Some resources may not have been deleted"
    print_warning "Check AWS Console for remaining resources"
    exit $exit_code
}

# Set error trap
trap 'error_handler $LINENO $?' ERR

# Run main function
main