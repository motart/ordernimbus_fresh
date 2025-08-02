#!/bin/bash

# Enhanced Sales Forecasting Platform - AWS Deployment Script
# This script addresses previous deployment failures with improved error handling,
# timeout management, and health check optimization

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
PROJECT_NAME="sales-forecasting-platform"

# Enhanced timeout configuration
CDK_TIMEOUT=3600  # 1 hour for CDK operations
ECS_STABILIZATION_TIMEOUT=900  # 15 minutes for ECS stabilization
HEALTH_CHECK_TIMEOUT=600  # 10 minutes for health checks

# Parse command line arguments
ENVIRONMENT=${1:-$DEFAULT_ENV}
AWS_REGION=${2:-$DEFAULT_REGION}
SKIP_TESTS=${3:-false}
FORCE_REDEPLOY=${4:-false}

echo -e "${BLUE}🚀 Enhanced deployment of Sales Forecasting Platform${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Region: ${AWS_REGION}${NC}"
echo -e "${BLUE}Force Redeploy: ${FORCE_REDEPLOY}${NC}"
echo "=========================================="

# Enhanced logging setup
LOG_DIR="logs"
mkdir -p $LOG_DIR
LOG_FILE="$LOG_DIR/enhanced-deployment-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).log"
ERROR_LOG="$LOG_DIR/deployment-errors-$ENVIRONMENT.log"

# Function to print status with timestamps
print_status() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}✅ [$timestamp] $1${NC}" | tee -a $LOG_FILE
}

print_warning() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}⚠️  [$timestamp] $1${NC}" | tee -a $LOG_FILE
}

print_error() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${RED}❌ [$timestamp] $1${NC}" | tee -a $ERROR_LOG
}

print_info() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}ℹ️  [$timestamp] $1${NC}" | tee -a $LOG_FILE
}

# Enhanced error handling
handle_deployment_error() {
    local error_msg="$1"
    local stack_name="$2"
    
    print_error "Deployment failed: $error_msg"
    
    if [ -n "$stack_name" ]; then
        print_info "Checking CloudFormation events for stack: $stack_name"
        
        # Get recent CloudFormation events
        aws cloudformation describe-stack-events \
            --stack-name "$stack_name" \
            --region $AWS_REGION \
            --max-items 20 \
            --query 'StackEvents[?contains(ResourceStatusReason, `fail`) || contains(ResourceStatusReason, `error`)].{Timestamp:Timestamp,LogicalResourceId:LogicalResourceId,ResourceStatus:ResourceStatus,ResourceStatusReason:ResourceStatusReason}' \
            --output table 2>/dev/null || true
            
        # Check ECS service events if it's a compute stack
        if [[ "$stack_name" == *"compute"* ]]; then
            print_info "Checking ECS service events..."
            local service_name="ordernimbus-$ENVIRONMENT-api"
            aws ecs describe-services \
                --cluster "ordernimbus-$ENVIRONMENT-cluster" \
                --services "$service_name" \
                --region $AWS_REGION \
                --query 'services[0].events[0:5]' \
                --output table 2>/dev/null || true
        fi
    fi
    
    print_error "Check $ERROR_LOG for detailed error information"
    exit 1
}

# Function to check AWS configuration with enhanced validation
check_aws_config() {
    print_info "Checking AWS configuration..."
    
    if ! aws sts get-caller-identity &>/dev/null; then
        handle_deployment_error "AWS CLI not configured or credentials invalid"
    fi
    
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    CURRENT_REGION=$(aws configure get region || echo $AWS_REGION)
    
    # Validate region
    if ! aws ec2 describe-regions --region-names $AWS_REGION &>/dev/null; then
        handle_deployment_error "Invalid AWS region: $AWS_REGION"
    fi
    
    print_status "AWS Account ID: $ACCOUNT_ID"
    print_status "Current Region: $CURRENT_REGION"
    print_status "Target Region: $AWS_REGION"
}

# Function to validate prerequisites
validate_prerequisites() {
    print_info "Validating deployment prerequisites..."
    
    # Check CDK CLI
    if ! command -v cdk &> /dev/null; then
        handle_deployment_error "CDK CLI not found. Please install: npm install -g aws-cdk"
    fi
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        handle_deployment_error "Node.js not found. Please install Node.js"
    fi
    
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        handle_deployment_error "Node.js version 18+ required. Current: $(node --version)"
    fi
    
    # Check jq for JSON parsing
    if ! command -v jq &> /dev/null; then
        print_warning "jq not found. Installing..."
        if command -v brew &> /dev/null; then
            brew install jq
        elif command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y jq
        else
            handle_deployment_error "Please install jq manually: https://stedolan.github.io/jq/download/"
        fi
    fi
    
    print_status "All prerequisites validated"
}

# Enhanced CDK bootstrap with validation
bootstrap_cdk() {
    print_info "Bootstrapping CDK..."
    
    # Check if CDK is already bootstrapped
    if aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION &>/dev/null; then
        print_warning "CDK already bootstrapped in $AWS_REGION"
        
        # Validate bootstrap stack is healthy
        local stack_status=$(aws cloudformation describe-stacks \
            --stack-name CDKToolkit \
            --region $AWS_REGION \
            --query 'Stacks[0].StackStatus' \
            --output text)
            
        if [ "$stack_status" != "CREATE_COMPLETE" ] && [ "$stack_status" != "UPDATE_COMPLETE" ]; then
            print_warning "CDK bootstrap stack status: $stack_status. Re-bootstrapping..."
            timeout $CDK_TIMEOUT npx cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION || \
                handle_deployment_error "CDK bootstrap failed"
        fi
    else
        print_status "Bootstrapping CDK in $AWS_REGION"
        npx cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION || \
            handle_deployment_error "CDK bootstrap failed"
    fi
    
    print_status "CDK bootstrap completed"
}

# Enhanced parameter setup with validation
setup_parameters() {
    print_info "Setting up Parameter Store values..."
    
    PARAMETERS=(
        "/ordernimbus/$ENVIRONMENT/database/master-username:ordernimbus_admin"
        "/ordernimbus/$ENVIRONMENT/database/name:forecasting_db"
        "/ordernimbus/$ENVIRONMENT/api/cors-origins:https://$ENVIRONMENT.ordernimbus.com"
        "/ordernimbus/$ENVIRONMENT/monitoring/alert-email:alerts@ordernimbus.com"
        "/ordernimbus/$ENVIRONMENT/cache/redis-node-type:cache.r6g.large"
        "/ordernimbus/$ENVIRONMENT/compute/ecs-cpu:1024"
        "/ordernimbus/$ENVIRONMENT/compute/ecs-memory:2048"
        "/ordernimbus/$ENVIRONMENT/scaling/min-capacity:1"
        "/ordernimbus/$ENVIRONMENT/scaling/max-capacity:10"
    )
    
    for param in "${PARAMETERS[@]}"; do
        IFS=':' read -r name value <<< "$param"
        
        if aws ssm get-parameter --name "$name" --region $AWS_REGION &>/dev/null; then
            if [ "$FORCE_REDEPLOY" = "true" ]; then
                print_info "Force redeploy: Updating parameter $name"
                aws ssm put-parameter \
                    --name "$name" \
                    --value "$value" \
                    --type "String" \
                    --region $AWS_REGION \
                    --overwrite \
                    --description "Updated by enhanced deployment script" || \
                    print_warning "Failed to update parameter: $name"
            else
                print_warning "Parameter $name already exists, skipping"
            fi
        else
            aws ssm put-parameter \
                --name "$name" \
                --value "$value" \
                --type "String" \
                --region $AWS_REGION \
                --description "Auto-created by enhanced deployment script" || \
                print_warning "Failed to create parameter: $name"
            print_status "Created parameter: $name"
        fi
    done
}

# Enhanced secure parameter setup
setup_secure_parameters() {
    print_info "Setting up secure parameters..."
    
    # Generate stronger JWT secret
    JWT_SECRET=$(openssl rand -base64 96 | tr -d "=+/\n" | cut -c1-64)
    
    # Generate API key for load testing
    LOAD_TEST_TOKEN=$(openssl rand -hex 32)
    
    SECURE_PARAMETERS=(
        "/ordernimbus/$ENVIRONMENT/auth/jwt-secret:$JWT_SECRET" 
        "/ordernimbus/$ENVIRONMENT/testing/load-test-token:$LOAD_TEST_TOKEN"
    )
    
    for param in "${SECURE_PARAMETERS[@]}"; do
        IFS=':' read -r name value <<< "$param"
        
        if aws ssm get-parameter --name "$name" --region $AWS_REGION &>/dev/null; then
            if [ "$FORCE_REDEPLOY" = "true" ]; then
                print_info "Force redeploy: Updating secure parameter $name"
                aws ssm put-parameter \
                    --name "$name" \
                    --value "$value" \
                    --type "SecureString" \
                    --region $AWS_REGION \
                    --overwrite \
                    --description "Updated secure parameter" || \
                    print_warning "Failed to update secure parameter: $name"
            else
                print_warning "Secure parameter $name already exists, skipping"
            fi
        else
            aws ssm put-parameter \
                --name "$name" \
                --value "$value" \
                --type "SecureString" \
                --region $AWS_REGION \
                --description "Auto-generated secure parameter" || \
                print_warning "Failed to create secure parameter: $name"
            print_status "Created secure parameter: $name"
        fi
    done
}

# Enhanced CDK deployment with proper error handling
deploy_cdk_stacks() {
    print_info "Deploying CDK stacks with enhanced monitoring..."
    
    # Ensure CDK dependencies are installed
    if [ ! -d "node_modules" ]; then
        print_status "Installing CDK dependencies..."
        npm install || handle_deployment_error "npm install failed"
    fi
    
    # Set environment variables for CDK
    export CDK_DEFAULT_ACCOUNT=$ACCOUNT_ID
    export CDK_DEFAULT_REGION=$AWS_REGION
    export ENVIRONMENT=$ENVIRONMENT
    
    # Deploy stacks in order with proper error handling
    STACKS=(
        "$STACK_PREFIX-$ENVIRONMENT-networking"
        "$STACK_PREFIX-$ENVIRONMENT-security"
        "$STACK_PREFIX-$ENVIRONMENT-database"
        "$STACK_PREFIX-$ENVIRONMENT-compute"
        "$STACK_PREFIX-$ENVIRONMENT-api"
        "$STACK_PREFIX-$ENVIRONMENT-frontend"
        "$STACK_PREFIX-$ENVIRONMENT-monitoring"
    )
    
    for stack in "${STACKS[@]}"; do
        print_info "Deploying stack: $stack"
        
        # Check if stack exists and its current status
        local stack_status=""
        if aws cloudformation describe-stacks --stack-name "$stack" --region $AWS_REGION &>/dev/null; then
            stack_status=$(aws cloudformation describe-stacks \
                --stack-name "$stack" \
                --region $AWS_REGION \
                --query 'Stacks[0].StackStatus' \
                --output text)
            print_info "Current stack status: $stack_status"
            
            # If stack is in a failed state and force redeploy is enabled, delete it first
            if [[ "$stack_status" == *"FAILED"* ]] && [ "$FORCE_REDEPLOY" = "true" ]; then
                print_warning "Stack is in failed state. Deleting and recreating..."
                aws cloudformation delete-stack --stack-name "$stack" --region $AWS_REGION
                
                # Wait for deletion to complete
                print_info "Waiting for stack deletion to complete..."
                aws cloudformation wait stack-delete-complete \
                    --stack-name "$stack" \
                    --region $AWS_REGION || true
            fi
        fi
        
        # Deploy the stack
        print_info "Starting deployment of $stack..."
        
        if npx cdk deploy $stack \
            --require-approval never \
            --region $AWS_REGION \
            --context environment=$ENVIRONMENT \
            --outputs-file "cdk-outputs-$ENVIRONMENT.json" \
            --verbose 2>&1 | tee -a $LOG_FILE; then
            
            print_status "Successfully deployed: $stack"
            
            # Special handling for compute stack - wait for ECS service to stabilize
            if [[ "$stack" == *"compute"* ]]; then
                wait_for_ecs_service_stable
            fi
            
        else
            handle_deployment_error "Failed to deploy stack: $stack" "$stack"
        fi
    done
    
    print_status "All CDK stacks deployed successfully"
}

# Function to wait for ECS service to stabilize
wait_for_ecs_service_stable() {
    print_info "Waiting for ECS service to stabilize..."
    
    local cluster_name="ordernimbus-$ENVIRONMENT-cluster"
    local service_name="ordernimbus-$ENVIRONMENT-api"
    local max_wait_time=$ECS_STABILIZATION_TIMEOUT
    local wait_interval=30
    local elapsed_time=0
    
    while [ $elapsed_time -lt $max_wait_time ]; do
        local service_status=$(aws ecs describe-services \
            --cluster "$cluster_name" \
            --services "$service_name" \
            --region $AWS_REGION \
            --query 'services[0].deployments[0].status' \
            --output text 2>/dev/null || echo "UNKNOWN")
            
        local running_count=$(aws ecs describe-services \
            --cluster "$cluster_name" \
            --services "$service_name" \
            --region $AWS_REGION \
            --query 'services[0].runningCount' \
            --output text 2>/dev/null || echo "0")
            
        local desired_count=$(aws ecs describe-services \
            --cluster "$cluster_name" \
            --services "$service_name" \
            --region $AWS_REGION \
            --query 'services[0].desiredCount' \
            --output text 2>/dev/null || echo "1")
        
        print_info "ECS Service Status: $service_status, Running: $running_count/$desired_count"
        
        if [ "$service_status" = "PRIMARY" ] && [ "$running_count" = "$desired_count" ]; then
            print_status "ECS service has stabilized"
            return 0
        fi
        
        if [ "$service_status" = "PENDING" ]; then
            print_info "Service deployment in progress... (${elapsed_time}s elapsed)"
        else
            print_warning "Service status: $service_status (${elapsed_time}s elapsed)"
        fi
        
        sleep $wait_interval
        elapsed_time=$((elapsed_time + wait_interval))
    done
    
    print_error "ECS service failed to stabilize within $max_wait_time seconds"
    
    # Get service events for debugging
    aws ecs describe-services \
        --cluster "$cluster_name" \
        --services "$service_name" \
        --region $AWS_REGION \
        --query 'services[0].events[0:10]' \
        --output table || true
        
    return 1
}

# Enhanced post-deployment verification
run_enhanced_verification() {
    if [ "$SKIP_TESTS" = "true" ]; then
        print_warning "Skipping post-deployment verification"
        return
    fi
    
    print_info "Running enhanced post-deployment verification..."
    
    # Check if outputs file exists
    if [ ! -f "cdk-outputs-$ENVIRONMENT.json" ]; then
        print_error "CDK outputs file not found. Deployment may have failed."
        return 1
    fi
    
    # Verify load balancer health
    verify_load_balancer_health
    
    # Verify ECS service health
    verify_ecs_service_health
    
    # Verify database connectivity
    verify_database_connectivity
    
    print_status "Enhanced verification completed successfully"
}

# Function to verify load balancer health
verify_load_balancer_health() {
    print_info "Verifying load balancer health..."
    
    local alb_dns=$(jq -r '.["'$STACK_PREFIX-$ENVIRONMENT-compute'"].LoadBalancerDNS // "null"' cdk-outputs-$ENVIRONMENT.json)
    
    if [ "$alb_dns" = "null" ] || [ -z "$alb_dns" ]; then
        print_warning "Load balancer DNS not found in outputs"
        return 1
    fi
    
    print_info "Load balancer DNS: $alb_dns"
    
    # Wait for DNS propagation
    print_info "Waiting for DNS propagation..."
    sleep 60
    
    # Test HTTP connectivity with retries using curl with built-in timeout
    local max_retries=5
    local retry_count=0
    
    while [ $retry_count -lt $max_retries ]; do
        if curl -f -s --connect-timeout 10 --max-time 30 "http://$alb_dns/" >/dev/null 2>&1; then
            print_status "Load balancer health check passed"
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        print_info "Health check attempt $retry_count/$max_retries failed, retrying..."
        sleep 30
    done
    
    print_error "Load balancer health check failed after $max_retries attempts"
    return 1
}

# Function to verify ECS service health
verify_ecs_service_health() {
    print_info "Verifying ECS service health..."
    
    local cluster_name="ordernimbus-$ENVIRONMENT-cluster"
    local service_name="ordernimbus-$ENVIRONMENT-api"
    
    local service_info=$(aws ecs describe-services \
        --cluster "$cluster_name" \
        --services "$service_name" \
        --region $AWS_REGION \
        --query 'services[0]' 2>/dev/null || echo "null")
    
    if [ "$service_info" = "null" ]; then
        print_error "ECS service not found"
        return 1
    fi
    
    local running_count=$(echo "$service_info" | jq -r '.runningCount')
    local desired_count=$(echo "$service_info" | jq -r '.desiredCount')
    local service_status=$(echo "$service_info" | jq -r '.status')
    
    print_info "ECS Service - Status: $service_status, Running: $running_count, Desired: $desired_count"
    
    if [ "$service_status" = "ACTIVE" ] && [ "$running_count" = "$desired_count" ]; then
        print_status "ECS service is healthy"
        return 0
    else
        print_error "ECS service is not healthy"
        return 1
    fi
}

# Function to verify database connectivity
verify_database_connectivity() {
    print_info "Verifying database connectivity..."
    
    local db_endpoint=$(jq -r '.["'$STACK_PREFIX-$ENVIRONMENT-database'"].DatabaseEndpoint // "null"' cdk-outputs-$ENVIRONMENT.json)
    
    if [ "$db_endpoint" = "null" ] || [ -z "$db_endpoint" ]; then
        print_warning "Database endpoint not found in outputs"
        return 1
    fi
    
    print_status "Database endpoint available: $db_endpoint"
    
    # Test database port connectivity using bash built-in with simple timeout
    if bash -c "(exec 3<>/dev/tcp/${db_endpoint}/5432) 2>/dev/null" & 
       sleep 5; kill $! 2>/dev/null; then
        print_status "Database port 5432 is reachable"
    else
        print_warning "Database port 5432 connectivity test failed (may be expected due to security groups)"
    fi
}

# Enhanced deployment summary with detailed information
deployment_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎉 Enhanced deployment completed!${NC}"
    echo "=========================================="
    
    if [ -f "cdk-outputs-$ENVIRONMENT.json" ]; then
        echo "📋 Deployment Summary:"
        echo ""
        
        # Extract key resources
        local alb_dns=$(jq -r '.["'$STACK_PREFIX-$ENVIRONMENT-compute'"].LoadBalancerDNS // "Not available"' cdk-outputs-$ENVIRONMENT.json)
        local db_endpoint=$(jq -r '.["'$STACK_PREFIX-$ENVIRONMENT-database'"].DatabaseEndpoint // "Not available"' cdk-outputs-$ENVIRONMENT.json)
        local ecs_service=$(jq -r '.["'$STACK_PREFIX-$ENVIRONMENT-compute'"].ECSServiceName // "Not available"' cdk-outputs-$ENVIRONMENT.json)
        
        echo "🌐 Load Balancer URL: http://$alb_dns"
        echo "🗄️  Database Endpoint: $db_endpoint"
        echo "⚙️  ECS Service: $ecs_service"
        echo ""
        
        echo "📁 Important files created:"
        echo "  - cdk-outputs-$ENVIRONMENT.json (CDK stack outputs)"
        echo "  - $LOG_FILE (deployment log)"
        echo "  - $ERROR_LOG (error log)"
        echo ""
        
        echo "🔧 Next steps:"
        echo "  1. Test the application: curl http://$alb_dns"
        echo "  2. Monitor ECS service: aws ecs describe-services --cluster ordernimbus-$ENVIRONMENT-cluster --services ordernimbus-$ENVIRONMENT-api"
        echo "  3. View logs: aws logs describe-log-groups --log-group-name-prefix '/aws/ecs/ordernimbus'"
        echo "  4. Run load tests after confirming basic functionality"
        echo ""
        
        echo "📊 Monitoring URLs:"
        echo "  - CloudWatch: https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION"
        echo "  - ECS Console: https://console.aws.amazon.com/ecs/home?region=$AWS_REGION"
        echo "  - Load Balancer: https://console.aws.amazon.com/ec2/v2/home?region=$AWS_REGION#LoadBalancers:"
    fi
    
    echo ""
    echo "✅ Deployment completed at $(date)"
    echo "📝 Check logs in $LOG_DIR/ for detailed information"
}

# Enhanced cleanup function
cleanup_on_failure() {
    print_error "Deployment failed. Enhanced cleanup initiated..."
    
    # Save current state for debugging
    local debug_file="$LOG_DIR/debug-state-$(date +%Y%m%d-%H%M%S).json"
    
    print_info "Saving debug information to $debug_file"
    
    {
        echo "{"
        echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
        echo "  \"environment\": \"$ENVIRONMENT\","
        echo "  \"region\": \"$AWS_REGION\","
        echo "  \"account_id\": \"$ACCOUNT_ID\","
        echo "  \"stacks\": ["
        
        # List all stacks with their status
        local first=true
        for stack in "${STACKS[@]}"; do
            if [ "$first" = false ]; then
                echo ","
            fi
            first=false
            
            local status=$(aws cloudformation describe-stacks \
                --stack-name "$stack" \
                --region $AWS_REGION \
                --query 'Stacks[0].StackStatus' \
                --output text 2>/dev/null || echo "NOT_FOUND")
                
            echo "    {"
            echo "      \"name\": \"$stack\","
            echo "      \"status\": \"$status\""
            echo "    }"
        done
        
        echo "  ]"
        echo "}"
    } > "$debug_file"
    
    print_info "Debug information saved. Manual cleanup may be required."
    print_info "Check AWS Console for partial resources."
    
    exit 1
}

# Main deployment function
main() {
    local start_time=$(date +%s)
    
    print_info "Enhanced deployment started at $(date)"
    
    # Pre-deployment validation
    validate_prerequisites
    check_aws_config
    
    # CDK setup
    bootstrap_cdk
    
    # AWS resources setup
    setup_parameters
    setup_secure_parameters
    
    # Deploy infrastructure
    deploy_cdk_stacks
    
    # Verification
    run_enhanced_verification
    
    # Summary
    deployment_summary
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    print_status "Total deployment time: $((duration / 60)) minutes and $((duration % 60)) seconds"
}

# Set up enhanced error handling
trap cleanup_on_failure ERR

# Redirect output to both console and log file
exec > >(tee -a $LOG_FILE)
exec 2>&1

# Run main deployment
main "$@"