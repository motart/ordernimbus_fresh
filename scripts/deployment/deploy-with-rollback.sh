#!/bin/bash

# Sales Forecasting Platform - Deployment with Automatic Rollback
# Tracks all changes and automatically rolls back on any failure

set -e  # Exit on any error
set -o pipefail  # Pipe failures should also exit

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_REGION="us-west-1"
DEFAULT_ENV="staging"
STACK_PREFIX="ordernimbus"
PROJECT_NAME="sales-forecasting-platform"

# Parse command line arguments
ENVIRONMENT=${1:-$DEFAULT_ENV}
AWS_REGION=${2:-$DEFAULT_REGION}
SKIP_TESTS=${3:-false}

# Deployment transaction tracking
DEPLOYMENT_ID="deploy-$(date +%Y%m%d-%H%M%S)-$$"
TRANSACTION_LOG="/tmp/${DEPLOYMENT_ID}-transaction.log"
ROLLBACK_LOG="/tmp/${DEPLOYMENT_ID}-rollback.log"
ERROR_REPORT="/tmp/${DEPLOYMENT_ID}-error-report.txt"
DEPLOYMENT_STATE_FILE="/tmp/${DEPLOYMENT_ID}-state.json"

# Track deployment state
DEPLOYED_STACKS=()
CREATED_PARAMETERS=()
CREATED_BUCKETS=()
UPLOADED_FILES=()
PREVIOUS_STACK_VERSIONS=()

echo -e "${BLUE}🚀 Starting deployment with automatic rollback support${NC}"
echo -e "${BLUE}Deployment ID: ${DEPLOYMENT_ID}${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Region: ${AWS_REGION}${NC}"
echo "=========================================="

# Function to print status
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - SUCCESS: $1" >> "$TRANSACTION_LOG"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - WARNING: $1" >> "$TRANSACTION_LOG"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: $1" >> "$TRANSACTION_LOG"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: $1" >> "$ERROR_REPORT"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - INFO: $1" >> "$TRANSACTION_LOG"
}

# Function to save deployment state
save_deployment_state() {
    cat > "$DEPLOYMENT_STATE_FILE" << EOF
{
  "deployment_id": "$DEPLOYMENT_ID",
  "environment": "$ENVIRONMENT",
  "region": "$AWS_REGION",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployed_stacks": $(printf '%s\n' "${DEPLOYED_STACKS[@]}" | jq -R . | jq -s .),
  "created_parameters": $(printf '%s\n' "${CREATED_PARAMETERS[@]}" | jq -R . | jq -s .),
  "created_buckets": $(printf '%s\n' "${CREATED_BUCKETS[@]}" | jq -R . | jq -s .),
  "uploaded_files": $(printf '%s\n' "${UPLOADED_FILES[@]}" | jq -R . | jq -s .)
}
EOF
}

# Function to capture error details
capture_error_details() {
    local error_context="$1"
    local error_code="$2"
    
    echo "=========================================" >> "$ERROR_REPORT"
    echo "Error Context: $error_context" >> "$ERROR_REPORT"
    echo "Error Code: $error_code" >> "$ERROR_REPORT"
    echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$ERROR_REPORT"
    echo "=========================================" >> "$ERROR_REPORT"
    
    # Capture CloudFormation events if stack deployment failed
    if [[ "$error_context" == *"stack"* ]]; then
        local stack_name=$(echo "$error_context" | grep -oP 'stack:\s*\K[^\s]+' || echo "unknown")
        if [ "$stack_name" != "unknown" ]; then
            echo "CloudFormation Events for $stack_name:" >> "$ERROR_REPORT"
            aws cloudformation describe-stack-events \
                --stack-name "$stack_name" \
                --region "$AWS_REGION" \
                --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].[Timestamp,ResourceType,LogicalResourceId,ResourceStatusReason]' \
                --output table >> "$ERROR_REPORT" 2>&1 || true
        fi
    fi
    
    # Capture recent CloudWatch logs
    echo "" >> "$ERROR_REPORT"
    echo "Recent CloudWatch Logs:" >> "$ERROR_REPORT"
    aws logs tail /aws/lambda/${STACK_PREFIX}-${ENVIRONMENT} --since 5m >> "$ERROR_REPORT" 2>&1 || true
    
    # Capture ECS task failures
    if [[ "$error_context" == *"ecs"* ]]; then
        echo "" >> "$ERROR_REPORT"
        echo "ECS Task Failures:" >> "$ERROR_REPORT"
        aws ecs describe-tasks \
            --cluster "${STACK_PREFIX}-${ENVIRONMENT}-cluster" \
            --tasks $(aws ecs list-tasks --cluster "${STACK_PREFIX}-${ENVIRONMENT}-cluster" --desired-status STOPPED --query 'taskArns' --output text) \
            --query 'failures[*].[arn,reason]' \
            --output table >> "$ERROR_REPORT" 2>&1 || true
    fi
}

# Function to perform rollback
perform_rollback() {
    echo ""
    echo -e "${MAGENTA}🔄 INITIATING AUTOMATIC ROLLBACK${NC}"
    echo "========================================="
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting rollback procedure" >> "$ROLLBACK_LOG"
    
    local rollback_success=true
    
    # 1. Rollback CloudFormation stacks
    if [ ${#DEPLOYED_STACKS[@]} -gt 0 ]; then
        echo -e "${YELLOW}Rolling back CloudFormation stacks...${NC}"
        # Reverse the order for rollback
        for ((i=${#DEPLOYED_STACKS[@]}-1; i>=0; i--)); do
            local stack="${DEPLOYED_STACKS[$i]}"
            echo "Rolling back stack: $stack"
            
            # Check if stack has a previous version to rollback to
            local stack_status=$(aws cloudformation describe-stacks \
                --stack-name "$stack" \
                --region "$AWS_REGION" \
                --query 'Stacks[0].StackStatus' \
                --output text 2>/dev/null || echo "DOES_NOT_EXIST")
            
            if [[ "$stack_status" == *"ROLLBACK"* ]]; then
                echo "Stack $stack is already in rollback state" >> "$ROLLBACK_LOG"
            elif [[ "$stack_status" == "CREATE_COMPLETE" ]]; then
                # Stack was newly created, delete it
                echo "Deleting newly created stack: $stack" >> "$ROLLBACK_LOG"
                aws cloudformation delete-stack \
                    --stack-name "$stack" \
                    --region "$AWS_REGION" || {
                        echo "Failed to delete stack: $stack" >> "$ROLLBACK_LOG"
                        rollback_success=false
                    }
                
                # Wait for deletion
                echo "Waiting for stack deletion..."
                aws cloudformation wait stack-delete-complete \
                    --stack-name "$stack" \
                    --region "$AWS_REGION" \
                    --no-cli-pager 2>/dev/null || true
            elif [[ "$stack_status" == "UPDATE_COMPLETE" ]] || [[ "$stack_status" == "UPDATE_ROLLBACK_COMPLETE" ]]; then
                # Stack was updated, trigger rollback
                echo "Rolling back stack update: $stack" >> "$ROLLBACK_LOG"
                aws cloudformation cancel-update-stack \
                    --stack-name "$stack" \
                    --region "$AWS_REGION" 2>/dev/null || true
                
                # Continue rollback if needed
                aws cloudformation continue-update-rollback \
                    --stack-name "$stack" \
                    --region "$AWS_REGION" 2>/dev/null || true
            fi
        done
    fi
    
    # 2. Delete created S3 objects
    if [ ${#UPLOADED_FILES[@]} -gt 0 ]; then
        echo -e "${YELLOW}Removing uploaded S3 objects...${NC}"
        for file_info in "${UPLOADED_FILES[@]}"; do
            IFS=':' read -r bucket key <<< "$file_info"
            echo "Deleting s3://$bucket/$key" >> "$ROLLBACK_LOG"
            aws s3 rm "s3://$bucket/$key" 2>/dev/null || {
                echo "Failed to delete s3://$bucket/$key" >> "$ROLLBACK_LOG"
                rollback_success=false
            }
        done
    fi
    
    # 3. Delete created S3 buckets
    if [ ${#CREATED_BUCKETS[@]} -gt 0 ]; then
        echo -e "${YELLOW}Deleting created S3 buckets...${NC}"
        for bucket in "${CREATED_BUCKETS[@]}"; do
            echo "Deleting bucket: $bucket" >> "$ROLLBACK_LOG"
            # First empty the bucket
            aws s3 rm "s3://$bucket" --recursive 2>/dev/null || true
            # Then delete the bucket
            aws s3api delete-bucket --bucket "$bucket" --region "$AWS_REGION" 2>/dev/null || {
                echo "Failed to delete bucket: $bucket" >> "$ROLLBACK_LOG"
                rollback_success=false
            }
        done
    fi
    
    # 4. Delete created Parameter Store parameters
    if [ ${#CREATED_PARAMETERS[@]} -gt 0 ]; then
        echo -e "${YELLOW}Deleting created parameters...${NC}"
        for param in "${CREATED_PARAMETERS[@]}"; do
            echo "Deleting parameter: $param" >> "$ROLLBACK_LOG"
            aws ssm delete-parameter --name "$param" --region "$AWS_REGION" 2>/dev/null || {
                echo "Failed to delete parameter: $param" >> "$ROLLBACK_LOG"
                rollback_success=false
            }
        done
    fi
    
    # 5. Invalidate CloudFront cache if distribution was updated
    local distribution_id=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-frontend'".CloudFrontDistributionId' cdk-outputs-$ENVIRONMENT.json 2>/dev/null || echo "")
    if [ -n "$distribution_id" ] && [ "$distribution_id" != "null" ]; then
        echo -e "${YELLOW}Invalidating CloudFront cache...${NC}"
        aws cloudfront create-invalidation \
            --distribution-id "$distribution_id" \
            --paths "/*" \
            --query 'Invalidation.Id' \
            --output text 2>/dev/null || true
    fi
    
    # 6. Generate rollback summary
    echo "" >> "$ROLLBACK_LOG"
    echo "=========================================" >> "$ROLLBACK_LOG"
    echo "Rollback Summary" >> "$ROLLBACK_LOG"
    echo "=========================================" >> "$ROLLBACK_LOG"
    echo "Rollback Success: $rollback_success" >> "$ROLLBACK_LOG"
    echo "Rolled back ${#DEPLOYED_STACKS[@]} stacks" >> "$ROLLBACK_LOG"
    echo "Deleted ${#CREATED_BUCKETS[@]} buckets" >> "$ROLLBACK_LOG"
    echo "Deleted ${#CREATED_PARAMETERS[@]} parameters" >> "$ROLLBACK_LOG"
    echo "Removed ${#UPLOADED_FILES[@]} uploaded files" >> "$ROLLBACK_LOG"
    
    if [ "$rollback_success" = true ]; then
        echo -e "${GREEN}✅ Rollback completed successfully${NC}"
    else
        echo -e "${RED}⚠️  Rollback completed with some failures (check $ROLLBACK_LOG)${NC}"
    fi
    
    return 0
}

# Function to generate error report
generate_error_report() {
    echo ""
    echo -e "${MAGENTA}📋 ERROR REPORT${NC}"
    echo "========================================="
    
    if [ -f "$ERROR_REPORT" ]; then
        cat "$ERROR_REPORT"
    fi
    
    echo ""
    echo -e "${YELLOW}Detailed logs available at:${NC}"
    echo "  - Transaction log: $TRANSACTION_LOG"
    echo "  - Rollback log: $ROLLBACK_LOG"
    echo "  - Error report: $ERROR_REPORT"
    echo "  - Deployment state: $DEPLOYMENT_STATE_FILE"
    
    # Upload logs to S3 for persistent storage
    local log_bucket="${STACK_PREFIX}-${ENVIRONMENT}-logs"
    if aws s3api head-bucket --bucket "$log_bucket" 2>/dev/null; then
        echo ""
        echo -e "${BLUE}Uploading logs to S3...${NC}"
        aws s3 cp "$TRANSACTION_LOG" "s3://$log_bucket/deployments/${DEPLOYMENT_ID}/transaction.log" 2>/dev/null || true
        aws s3 cp "$ROLLBACK_LOG" "s3://$log_bucket/deployments/${DEPLOYMENT_ID}/rollback.log" 2>/dev/null || true
        aws s3 cp "$ERROR_REPORT" "s3://$log_bucket/deployments/${DEPLOYMENT_ID}/error-report.txt" 2>/dev/null || true
        aws s3 cp "$DEPLOYMENT_STATE_FILE" "s3://$log_bucket/deployments/${DEPLOYMENT_ID}/state.json" 2>/dev/null || true
        echo -e "${GREEN}Logs uploaded to s3://$log_bucket/deployments/${DEPLOYMENT_ID}/${NC}"
    fi
}

# Enhanced error handler with automatic rollback
handle_deployment_error() {
    local exit_code=$?
    local error_line=$1
    local error_context="${2:-Unknown context}"
    
    print_error "Deployment failed at line $error_line with exit code $exit_code"
    print_error "Context: $error_context"
    
    # Capture detailed error information
    capture_error_details "$error_context" "$exit_code"
    
    # Save current deployment state
    save_deployment_state
    
    # Perform automatic rollback
    perform_rollback
    
    # Generate and display error report
    generate_error_report
    
    exit $exit_code
}

# Set up enhanced error handling
trap 'handle_deployment_error $LINENO "Command execution failed"' ERR

# Function to check AWS configuration
check_aws_config() {
    print_info "Checking AWS configuration..."
    
    if ! aws sts get-caller-identity &>/dev/null; then
        capture_error_details "AWS CLI not configured or credentials invalid" "1"
        print_error "AWS CLI not configured or credentials invalid"
        exit 1
    fi
    
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    CURRENT_REGION=$(aws configure get region)
    
    print_status "AWS Account ID: $ACCOUNT_ID"
    print_status "Current Region: ${CURRENT_REGION:-$AWS_REGION}"
}

# Function to deploy CDK stack with rollback support
deploy_cdk_stack_with_rollback() {
    local stack_name="$1"
    local context_params="$2"
    
    print_info "Deploying stack: $stack_name"
    
    # Check if stack exists and capture current state
    local stack_exists=false
    local previous_template=""
    
    if aws cloudformation describe-stacks --stack-name "$stack_name" --region "$AWS_REGION" &>/dev/null; then
        stack_exists=true
        # Capture current template for potential rollback
        previous_template=$(aws cloudformation get-template --stack-name "$stack_name" --region "$AWS_REGION" --query 'TemplateBody' 2>/dev/null || echo "")
        PREVIOUS_STACK_VERSIONS+=("$stack_name:$previous_template")
        print_info "Stack $stack_name exists, will update"
    else
        print_info "Stack $stack_name does not exist, will create"
    fi
    
    # Deploy with rollback configuration
    npx cdk deploy "$stack_name" \
        --require-approval never \
        --region "$AWS_REGION" \
        --context environment="$ENVIRONMENT" \
        --rollback true \
        --notification-arns "arn:aws:sns:${AWS_REGION}:${ACCOUNT_ID}:${STACK_PREFIX}-deployment-notifications" \
        --outputs-file "cdk-outputs-${ENVIRONMENT}.json" \
        $context_params || {
            capture_error_details "CDK deployment failed for stack: $stack_name" "$?"
            return 1
        }
    
    # Verify stack deployment succeeded
    local stack_status=$(aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].StackStatus' \
        --output text)
    
    if [[ "$stack_status" == "CREATE_COMPLETE" ]] || [[ "$stack_status" == "UPDATE_COMPLETE" ]]; then
        print_status "Stack $stack_name deployed successfully (Status: $stack_status)"
        DEPLOYED_STACKS+=("$stack_name")
        save_deployment_state
    else
        capture_error_details "Stack deployment ended in unexpected state: $stack_status for stack: $stack_name" "1"
        return 1
    fi
}

# Function to setup parameters with tracking
setup_parameters_with_tracking() {
    print_info "Setting up Parameter Store values..."
    
    local parameters=(
        "/ordernimbus/$ENVIRONMENT/database/master-username:ordernimbus_admin"
        "/ordernimbus/$ENVIRONMENT/database/name:forecasting_db"
        "/ordernimbus/$ENVIRONMENT/api/cors-origins:https://$ENVIRONMENT.ordernimbus.com"
    )
    
    for param in "${parameters[@]}"; do
        IFS=':' read -r name value <<< "$param"
        
        if aws ssm get-parameter --name "$name" --region "$AWS_REGION" &>/dev/null; then
            print_warning "Parameter $name already exists, skipping"
        else
            aws ssm put-parameter \
                --name "$name" \
                --value "$value" \
                --type "String" \
                --region "$AWS_REGION" \
                --description "Auto-created by deployment script" || {
                    capture_error_details "Failed to create parameter: $name" "$?"
                    return 1
                }
            print_status "Created parameter: $name"
            CREATED_PARAMETERS+=("$name")
            save_deployment_state
        fi
    done
}

# Function to create S3 bucket with tracking
create_s3_bucket_with_tracking() {
    local bucket_name="$1"
    local bucket_type="$2"
    
    if aws s3api head-bucket --bucket "$bucket_name" --region "$AWS_REGION" 2>/dev/null; then
        print_warning "Bucket $bucket_name already exists, skipping"
        return 0
    fi
    
    # Create bucket with proper region handling
    if [ "$AWS_REGION" = "us-east-1" ]; then
        # For us-east-1, don't specify location constraint
        aws s3api create-bucket \
            --bucket "$bucket_name" \
            --region "$AWS_REGION" || {
                capture_error_details "Failed to create bucket: $bucket_name" "$?"
                return 1
            }
    else
        # For other regions, specify location constraint
        aws s3api create-bucket \
            --bucket "$bucket_name" \
            --region "$AWS_REGION" \
            --create-bucket-configuration LocationConstraint="$AWS_REGION" || {
                capture_error_details "Failed to create bucket: $bucket_name" "$?"
                return 1
            }
    fi
    
    print_status "Created bucket: $bucket_name"
    CREATED_BUCKETS+=("$bucket_name")
    save_deployment_state
    
    # Configure bucket
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket "$bucket_name" \
        --versioning-configuration Status=Enabled || {
            capture_error_details "Failed to enable versioning for bucket: $bucket_name" "$?"
            return 1
        }
    
    # Enable encryption
    aws s3api put-bucket-encryption \
        --bucket "$bucket_name" \
        --server-side-encryption-configuration '{
            "Rules": [{
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                }
            }]
        }' || {
            capture_error_details "Failed to enable encryption for bucket: $bucket_name" "$?"
            return 1
        }
    
    print_status "Configured bucket: $bucket_name"
}

# Main deployment function with transaction support
main_with_rollback() {
    echo "Starting deployment at $(date)"
    echo "Deployment ID: $DEPLOYMENT_ID"
    
    # Initialize transaction log
    echo "Deployment Transaction Log - $DEPLOYMENT_ID" > "$TRANSACTION_LOG"
    echo "Started: $(date)" >> "$TRANSACTION_LOG"
    echo "" > "$ERROR_REPORT"
    
    # Pre-deployment checks
    check_aws_config
    
    # Setup SNS topic for deployment notifications
    print_info "Setting up deployment notifications..."
    aws sns create-topic \
        --name "${STACK_PREFIX}-deployment-notifications" \
        --region "$AWS_REGION" 2>/dev/null || true
    
    # Setup parameters
    setup_parameters_with_tracking || handle_deployment_error $LINENO "Parameter setup failed"
    
    # S3 buckets will be created by CDK stacks, no need to pre-create them
    print_info "S3 buckets will be created by CDK stacks..."
    
    # Deploy CDK stacks with proper ordering
    print_info "Deploying CDK stacks..."
    local stacks=(
        "$STACK_PREFIX-$ENVIRONMENT-networking"
        "$STACK_PREFIX-$ENVIRONMENT-security"
        "$STACK_PREFIX-$ENVIRONMENT-database"
        "$STACK_PREFIX-$ENVIRONMENT-compute"
        "$STACK_PREFIX-$ENVIRONMENT-api"
        "$STACK_PREFIX-$ENVIRONMENT-frontend"
        "$STACK_PREFIX-$ENVIRONMENT-monitoring"
    )
    
    for stack in "${stacks[@]}"; do
        deploy_cdk_stack_with_rollback "$stack" "" || handle_deployment_error $LINENO "Stack deployment failed: $stack"
    done
    
    # Post-deployment validation
    if [ "$SKIP_TESTS" != "true" ]; then
        print_info "Running post-deployment validation..."
        ./validate-deployment.sh "$ENVIRONMENT" "$AWS_REGION" || {
            print_error "Post-deployment validation failed"
            capture_error_details "Validation tests failed" "$?"
            perform_rollback
            generate_error_report
            exit 1
        }
    fi
    
    # Success - save final state
    save_deployment_state
    
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
    echo "=========================================="
    echo "Deployment ID: $DEPLOYMENT_ID"
    echo "Environment: $ENVIRONMENT"
    echo "Region: $AWS_REGION"
    echo ""
    echo "Transaction log: $TRANSACTION_LOG"
    echo "Deployment state: $DEPLOYMENT_STATE_FILE"
    
    # Clean up temp files on success
    rm -f "$ERROR_REPORT" 2>/dev/null || true
}

# Create deployment log
LOG_FILE="deployment-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE")
exec 2>&1

# Run main deployment with rollback support
main_with_rollback "$@"