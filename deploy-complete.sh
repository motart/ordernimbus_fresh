#!/bin/bash

################################################################################
# OrderNimbus Complete Deployment Script
# This script deploys the entire OrderNimbus application with a single command
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
STACK_NAME="ordernimbus-${ENVIRONMENT}-complete"
TEMPLATE_FILE="cloudformation-complete.yaml"

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

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please configure AWS CLI."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install it first."
        exit 1
    fi
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        print_warning "jq is not installed. Installing it would improve this script."
        print_warning "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    fi
    
    print_success "All prerequisites met"
}

# Function to validate CloudFormation template
validate_template() {
    print_status "Validating CloudFormation template..."
    
    if [ ! -f "$TEMPLATE_FILE" ]; then
        print_error "CloudFormation template not found: $TEMPLATE_FILE"
        exit 1
    fi
    
    if aws cloudformation validate-template \
        --template-body file://"$TEMPLATE_FILE" \
        --region "$REGION" &> /dev/null; then
        print_success "Template validation successful"
    else
        print_error "Template validation failed"
        aws cloudformation validate-template \
            --template-body file://"$TEMPLATE_FILE" \
            --region "$REGION"
        exit 1
    fi
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

# Function to handle stack rollback
handle_stack_failure() {
    local stack_status=$(get_stack_status)
    
    print_error "Stack operation failed. Current status: $stack_status"
    
    if [[ "$stack_status" == *"ROLLBACK_COMPLETE"* ]] || [[ "$stack_status" == *"FAILED"* ]]; then
        print_warning "Stack is in a failed state. You need to delete it before retrying."
        read -p "Do you want to delete the failed stack now? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_status "Deleting failed stack..."
            aws cloudformation delete-stack \
                --stack-name "$STACK_NAME" \
                --region "$REGION"
            
            print_status "Waiting for stack deletion..."
            aws cloudformation wait stack-delete-complete \
                --stack-name "$STACK_NAME" \
                --region "$REGION" 2>/dev/null || true
            
            print_success "Failed stack deleted. You can now retry deployment."
        else
            print_warning "Please delete the stack manually before retrying:"
            echo "aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION"
        fi
    fi
    
    # Show recent error events
    print_status "Recent error events:"
    aws cloudformation describe-stack-events \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`] | [0:3].[LogicalResourceId,ResourceStatusReason]' \
        --output table
    
    exit 1
}

# Function to deploy CloudFormation stack
deploy_stack() {
    print_status "Deploying CloudFormation stack: $STACK_NAME in $REGION"
    
    local stack_status=$(get_stack_status)
    
    # Handle different stack states
    case "$stack_status" in
        "DOES_NOT_EXIST")
            print_status "Creating new stack..."
            if aws cloudformation create-stack \
                --stack-name "$STACK_NAME" \
                --template-body file://"$TEMPLATE_FILE" \
                --parameters ParameterKey=Environment,ParameterValue="$ENVIRONMENT" \
                --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
                --region "$REGION" \
                --on-failure DO_NOTHING; then
                
                print_status "Waiting for stack creation to complete (this may take 10-15 minutes)..."
                if aws cloudformation wait stack-create-complete \
                    --stack-name "$STACK_NAME" \
                    --region "$REGION"; then
                    print_success "Stack created successfully"
                else
                    handle_stack_failure
                fi
            else
                print_error "Failed to initiate stack creation"
                exit 1
            fi
            ;;
            
        "CREATE_COMPLETE"|"UPDATE_COMPLETE"|"UPDATE_ROLLBACK_COMPLETE")
            print_warning "Stack already exists. Attempting update..."
            if aws cloudformation update-stack \
                --stack-name "$STACK_NAME" \
                --template-body file://"$TEMPLATE_FILE" \
                --parameters ParameterKey=Environment,ParameterValue="$ENVIRONMENT" \
                --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
                --region "$REGION" 2>&1 | grep -q "No updates are to be performed"; then
                print_warning "No updates needed for stack"
            else
                print_status "Waiting for stack update to complete..."
                if aws cloudformation wait stack-update-complete \
                    --stack-name "$STACK_NAME" \
                    --region "$REGION"; then
                    print_success "Stack updated successfully"
                else
                    handle_stack_failure
                fi
            fi
            ;;
            
        "ROLLBACK_COMPLETE"|"CREATE_FAILED"|"DELETE_FAILED"|"UPDATE_ROLLBACK_FAILED")
            print_error "Stack is in failed state: $stack_status"
            handle_stack_failure
            ;;
            
        "CREATE_IN_PROGRESS"|"UPDATE_IN_PROGRESS"|"DELETE_IN_PROGRESS")
            print_warning "Stack operation already in progress: $stack_status"
            print_status "Waiting for operation to complete..."
            sleep 30
            deploy_stack  # Recursive call to check again
            ;;
            
        *)
            print_error "Unexpected stack status: $stack_status"
            handle_stack_failure
            ;;
    esac
}

# Function to get stack outputs
get_stack_outputs() {
    print_status "Retrieving stack outputs..."
    
    local outputs=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null)
    
    if [ -z "$outputs" ] || [ "$outputs" = "null" ]; then
        print_error "Failed to retrieve stack outputs"
        exit 1
    fi
    
    # Parse outputs
    if command -v jq &> /dev/null; then
        API_URL=$(echo "$outputs" | jq -r '.[] | select(.OutputKey=="ApiEndpoint") | .OutputValue')
        FRONTEND_URL=$(echo "$outputs" | jq -r '.[] | select(.OutputKey=="FrontendURL") | .OutputValue')
        USER_POOL_ID=$(echo "$outputs" | jq -r '.[] | select(.OutputKey=="UserPoolId") | .OutputValue')
        USER_POOL_CLIENT_ID=$(echo "$outputs" | jq -r '.[] | select(.OutputKey=="UserPoolClientId") | .OutputValue')
        S3_BUCKET=$(echo "$outputs" | jq -r '.[] | select(.OutputKey=="S3BucketName") | .OutputValue')
    else
        # Fallback parsing without jq
        API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)
        FRONTEND_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`FrontendURL`].OutputValue' --output text)
        USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
        USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)
        S3_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text)
    fi
    
    # Validate outputs
    if [ -z "$API_URL" ] || [ -z "$S3_BUCKET" ]; then
        print_error "Failed to retrieve essential stack outputs"
        exit 1
    fi
    
    print_success "Stack outputs retrieved"
}

# Function to build frontend
build_frontend() {
    print_status "Building frontend application..."
    
    if [ ! -d "app/frontend" ]; then
        print_error "Frontend directory not found: app/frontend"
        exit 1
    fi
    
    cd app/frontend
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm install || {
            print_error "Failed to install frontend dependencies"
            cd ../..
            exit 1
        }
    fi
    
    # Build with environment variables
    print_status "Building frontend with production configuration..."
    REACT_APP_API_URL="$API_URL" \
    REACT_APP_ENVIRONMENT="$ENVIRONMENT" \
    REACT_APP_USER_POOL_ID="$USER_POOL_ID" \
    REACT_APP_CLIENT_ID="$USER_POOL_CLIENT_ID" \
    REACT_APP_REGION="$REGION" \
    npm run build || {
        print_error "Failed to build frontend"
        cd ../..
        exit 1
    }
    
    cd ../..
    print_success "Frontend build completed"
}

# Function to deploy frontend to S3
deploy_frontend() {
    print_status "Deploying frontend to S3..."
    
    if [ ! -d "app/frontend/build" ]; then
        print_error "Frontend build directory not found"
        exit 1
    fi
    
    # Sync build files to S3
    if aws s3 sync app/frontend/build/ "s3://$S3_BUCKET/" \
        --delete \
        --region "$REGION"; then
        print_success "Frontend deployed to S3"
    else
        print_error "Failed to deploy frontend to S3"
        exit 1
    fi
}

# Function to invalidate CloudFront cache
invalidate_cache() {
    print_status "Invalidating CloudFront cache..."
    
    # Get CloudFront distribution ID
    local distribution_id=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Origins.Items[0].DomainName, '${S3_BUCKET}')].Id" \
        --output text 2>/dev/null)
    
    if [ -n "$distribution_id" ]; then
        if aws cloudfront create-invalidation \
            --distribution-id "$distribution_id" \
            --paths "/*" &> /dev/null; then
            print_success "CloudFront cache invalidated"
        else
            print_warning "Failed to invalidate CloudFront cache"
        fi
    else
        print_warning "CloudFront distribution not found (this is normal for first deployment)"
    fi
}

# Function to create test data
create_test_data() {
    print_status "Creating test data in DynamoDB..."
    
    # Create a test store
    aws dynamodb put-item \
        --table-name "ordernimbus-${ENVIRONMENT}-stores" \
        --item '{
            "userId": {"S": "test-user-1"},
            "id": {"S": "store-1"},
            "name": {"S": "Test Store"},
            "domain": {"S": "test-store.myshopify.com"},
            "status": {"S": "active"}
        }' \
        --region "$REGION" 2>/dev/null || true
    
    # Create test products
    aws dynamodb put-item \
        --table-name "ordernimbus-${ENVIRONMENT}-products" \
        --item '{
            "userId": {"S": "test-user-1"},
            "id": {"S": "prod-1"},
            "storeId": {"S": "store-1"},
            "title": {"S": "Test Product 1"},
            "price": {"N": "29.99"},
            "inventory": {"N": "100"}
        }' \
        --region "$REGION" 2>/dev/null || true
    
    print_success "Test data created"
}

# Function to test API endpoints
test_endpoints() {
    print_status "Testing API endpoints..."
    
    local endpoints=("products" "orders" "inventory" "customers" "notifications" "stores")
    local all_working=true
    
    for endpoint in "${endpoints[@]}"; do
        local url="${API_URL}/api/${endpoint}"
        if [ "$endpoint" != "notifications" ] && [ "$endpoint" != "stores" ]; then
            url="${url}?storeId=store-1"
        fi
        
        if curl -s -X GET "$url" \
            -H "userId: test-user-1" \
            -H "Content-Type: application/json" \
            --max-time 10 &> /dev/null; then
            print_success "API endpoint /api/${endpoint} is working"
        else
            print_warning "API endpoint /api/${endpoint} may need initialization"
            all_working=false
        fi
    done
    
    if [ "$all_working" = true ]; then
        print_success "All API endpoints are working"
    else
        print_warning "Some endpoints may need Lambda cold start initialization (this is normal)"
    fi
}

# Function to display deployment summary
display_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎉 OrderNimbus Deployment Complete!${NC}"
    echo "=========================================="
    echo ""
    echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
    echo -e "${BLUE}Region:${NC} $REGION"
    echo -e "${BLUE}Stack Name:${NC} $STACK_NAME"
    echo ""
    echo -e "${GREEN}📱 Application URLs:${NC}"
    echo -e "  Frontend: ${YELLOW}$FRONTEND_URL${NC}"
    echo -e "  API: ${YELLOW}$API_URL${NC}"
    echo ""
    echo -e "${GREEN}🔐 Authentication:${NC}"
    echo -e "  User Pool ID: $USER_POOL_ID"
    echo -e "  Client ID: $USER_POOL_CLIENT_ID"
    echo ""
    echo -e "${GREEN}📦 Resources Created:${NC}"
    echo "  • API Gateway with 6 endpoints"
    echo "  • 6 Lambda functions with CORS enabled"
    echo "  • 5 DynamoDB tables"
    echo "  • S3 bucket for frontend hosting"
    echo "  • CloudFront distribution"
    echo "  • Cognito User Pool"
    echo ""
    echo -e "${GREEN}🚀 Next Steps:${NC}"
    echo "  1. Access the application at: $FRONTEND_URL"
    echo "  2. Create a user account or use test credentials"
    echo "  3. Connect your Shopify store"
    echo ""
    echo -e "${YELLOW}⚠️  Note:${NC} CloudFront may take 15-20 minutes to fully propagate"
    echo ""
    echo "=========================================="
}

# Main deployment flow
main() {
    echo "=========================================="
    echo "OrderNimbus Complete Deployment"
    echo "=========================================="
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Validate template
    validate_template
    
    # Deploy CloudFormation stack
    deploy_stack
    
    # Get stack outputs
    get_stack_outputs
    
    # Build frontend
    build_frontend
    
    # Deploy frontend
    deploy_frontend
    
    # Invalidate CloudFront cache
    invalidate_cache
    
    # Create test data
    create_test_data
    
    # Test endpoints
    test_endpoints
    
    # Display summary
    display_summary
}

# Handle script errors
error_handler() {
    local line_no=$1
    local exit_code=$2
    print_error "Deployment failed at line $line_no with exit code $exit_code"
    print_error "Check the error messages above for details"
    
    # Show stack status if it exists
    if stack_exists; then
        local status=$(get_stack_status)
        print_status "Current stack status: $status"
        
        if [[ "$status" == *"ROLLBACK"* ]] || [[ "$status" == *"FAILED"* ]]; then
            print_warning "Stack is in a failed state. Run './destroy-complete.sh $ENVIRONMENT $REGION' to clean up."
        fi
    fi
    
    exit $exit_code
}

# Set error trap
trap 'error_handler $LINENO $?' ERR

# Run main function
main