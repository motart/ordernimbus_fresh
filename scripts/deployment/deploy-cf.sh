#!/bin/bash

# OrderNimbus Platform - CloudFormation Deployment Script
# Single stack deployment for simplified infrastructure management

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_REGION="us-east-1"
DEFAULT_ENV="staging"
STACK_NAME="ordernimbus"

# Parse command line arguments
ENVIRONMENT=${1:-$DEFAULT_ENV}
AWS_REGION=${2:-$DEFAULT_REGION}
ADMIN_EMAIL=${3:-"admin@ordernimbus.com"}
ALERT_EMAIL=${4:-"alerts@ordernimbus.com"}

echo -e "${PURPLE}🚀 OrderNimbus CloudFormation Deployment${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Region: ${AWS_REGION}${NC}"
echo -e "${BLUE}Stack Name: ${STACK_NAME}-${ENVIRONMENT}${NC}"
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
    echo -e "${BLUE}ℹ️  $1${NC}"
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
    print_status "Deployment Region: $AWS_REGION"
}

# Function to validate CloudFormation template
validate_template() {
    echo "📋 Validating CloudFormation template..."
    
    if [ ! -f "cloudformation-template.yaml" ]; then
        print_error "CloudFormation template not found!"
        exit 1
    fi
    
    if aws cloudformation validate-template \
        --template-body file://cloudformation-template.yaml \
        --region $AWS_REGION &>/dev/null; then
        print_status "Template validation successful"
    else
        print_error "Template validation failed"
        exit 1
    fi
}

# Function to deploy or update CloudFormation stack
deploy_stack() {
    echo "☁️  Deploying CloudFormation stack..."
    
    STACK_FULL_NAME="${STACK_NAME}-${ENVIRONMENT}"
    
    # Check if stack exists
    if aws cloudformation describe-stacks \
        --stack-name $STACK_FULL_NAME \
        --region $AWS_REGION &>/dev/null; then
        
        print_info "Stack exists, updating..."
        STACK_OPERATION="update-stack"
        WAIT_CONDITION="stack-update-complete"
    else
        print_info "Creating new stack..."
        STACK_OPERATION="create-stack"
        WAIT_CONDITION="stack-create-complete"
    fi
    
    # Deploy/Update the stack
    aws cloudformation $STACK_OPERATION \
        --stack-name $STACK_FULL_NAME \
        --template-body file://cloudformation-template.yaml \
        --parameters \
            ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
            ParameterKey=AdminEmail,ParameterValue=$ADMIN_EMAIL \
            ParameterKey=AlertEmail,ParameterValue=$ALERT_EMAIL \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
        --region $AWS_REGION
    
    if [ $? -eq 0 ]; then
        print_status "Stack operation initiated"
        
        # Wait for stack operation to complete
        print_info "Waiting for stack operation to complete (this may take 10-15 minutes)..."
        
        if aws cloudformation wait $WAIT_CONDITION \
            --stack-name $STACK_FULL_NAME \
            --region $AWS_REGION; then
            print_status "Stack operation completed successfully"
        else
            print_error "Stack operation failed or timed out"
            
            # Show stack events for debugging
            echo "Recent stack events:"
            aws cloudformation describe-stack-events \
                --stack-name $STACK_FULL_NAME \
                --region $AWS_REGION \
                --query 'StackEvents[0:5].[Timestamp,ResourceStatus,ResourceType,LogicalResourceId,ResourceStatusReason]' \
                --output table
            
            exit 1
        fi
    else
        print_error "Failed to initiate stack operation"
        exit 1
    fi
}

# Function to get stack outputs
get_stack_outputs() {
    echo "📊 Retrieving stack outputs..."
    
    STACK_FULL_NAME="${STACK_NAME}-${ENVIRONMENT}"
    
    # Get outputs as JSON
    OUTPUTS=$(aws cloudformation describe-stacks \
        --stack-name $STACK_FULL_NAME \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs' \
        --output json)
    
    # Parse individual outputs
    FRONTEND_URL=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="FrontendURL") | .OutputValue')
    FRONTEND_BUCKET=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="FrontendBucketName") | .OutputValue')
    API_ENDPOINT=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="ApiEndpoint") | .OutputValue')
    USER_POOL_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="UserPoolId") | .OutputValue')
    USER_POOL_CLIENT_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="UserPoolClientId") | .OutputValue')
    
    # Save outputs to file
    echo $OUTPUTS > stack-outputs-$ENVIRONMENT.json
    print_status "Stack outputs saved to stack-outputs-$ENVIRONMENT.json"
}

# Function to deploy frontend application
deploy_frontend() {
    echo "🌐 Deploying frontend application..."
    
    if [ -z "$FRONTEND_BUCKET" ]; then
        print_error "Frontend bucket not found in stack outputs"
        return 1
    fi
    
    if [ -d "app/frontend" ]; then
        cd app/frontend
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            print_info "Installing frontend dependencies..."
            npm install
        fi
        
        # Build the application
        print_info "Building React application..."
        REACT_APP_API_URL="$API_ENDPOINT" \
        REACT_APP_ENVIRONMENT="$ENVIRONMENT" \
        REACT_APP_USER_POOL_ID="$USER_POOL_ID" \
        REACT_APP_CLIENT_ID="$USER_POOL_CLIENT_ID" \
        REACT_APP_REGION="$AWS_REGION" \
        npm run build
        
        # Deploy to S3
        print_info "Uploading to S3..."
        aws s3 sync build/ s3://$FRONTEND_BUCKET/ \
            --delete \
            --region $AWS_REGION
        
        cd ../..
        print_status "Frontend deployed successfully"
    else
        print_warning "Frontend directory not found, skipping frontend deployment"
    fi
}

# Function to create initial admin user
create_admin_user() {
    echo "👤 Creating admin user..."
    
    if [ -z "$USER_POOL_ID" ]; then
        print_error "User Pool ID not found"
        return 1
    fi
    
    TEMP_PASSWORD="TempPass@$(openssl rand -base64 8)"
    
    # Check if user exists
    if aws cognito-idp admin-get-user \
        --user-pool-id $USER_POOL_ID \
        --username $ADMIN_EMAIL \
        --region $AWS_REGION &>/dev/null; then
        print_warning "Admin user already exists"
    else
        # Create user
        aws cognito-idp admin-create-user \
            --user-pool-id $USER_POOL_ID \
            --username $ADMIN_EMAIL \
            --user-attributes \
                Name=email,Value=$ADMIN_EMAIL \
                Name=email_verified,Value=true \
                Name=name,Value="Admin User" \
            --temporary-password "$TEMP_PASSWORD" \
            --message-action SUPPRESS \
            --region $AWS_REGION
        
        # Add to admin group
        aws cognito-idp admin-add-user-to-group \
            --user-pool-id $USER_POOL_ID \
            --username $ADMIN_EMAIL \
            --group-name admin \
            --region $AWS_REGION
        
        print_status "Admin user created"
        print_warning "Temporary password: $TEMP_PASSWORD"
        print_info "Please change this password on first login"
    fi
}

# Function to run basic health checks
run_health_checks() {
    echo "🧪 Running health checks..."
    
    # Test API endpoints
    if [ -n "$API_ENDPOINT" ]; then
        print_info "Testing API endpoints..."
        
        # Test forecast endpoint
        RESPONSE=$(curl -s -X GET "$API_ENDPOINT/api/forecast" \
            --max-time 10 || echo "failed")
        
        if [[ "$RESPONSE" == *"forecasts"* ]]; then
            print_status "Forecast API: ✓"
        else
            print_warning "Forecast API: Failed to respond"
        fi
    fi
    
    # Check frontend
    if [ -n "$FRONTEND_URL" ]; then
        if curl -s -I "$FRONTEND_URL" | grep -q "200\|301\|302\|403"; then
            print_status "Frontend: ✓"
        else
            print_warning "Frontend: Not responding yet (may take a few minutes for CloudFront)"
        fi
    fi
}

# Function to display deployment summary
deployment_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎉 Deployment Complete!${NC}"
    echo "=========================================="
    echo ""
    echo "📋 Deployment Summary:"
    echo ""
    echo "Stack Name: ${STACK_NAME}-${ENVIRONMENT}"
    echo "Region: $AWS_REGION"
    echo ""
    echo "🌐 Application URLs:"
    echo "  Frontend: $FRONTEND_URL"
    echo "  API Endpoint: $API_ENDPOINT"
    echo ""
    echo "🔐 Authentication:"
    echo "  User Pool ID: $USER_POOL_ID"
    echo "  Client ID: $USER_POOL_CLIENT_ID"
    echo "  Admin Email: $ADMIN_EMAIL"
    echo ""
    echo "📊 AWS Console Links:"
    echo "  CloudFormation: https://console.aws.amazon.com/cloudformation/home?region=$AWS_REGION"
    echo "  Lambda Functions: https://console.aws.amazon.com/lambda/home?region=$AWS_REGION"
    echo "  API Gateway: https://console.aws.amazon.com/apigateway/home?region=$AWS_REGION"
    echo "  Cognito: https://console.aws.amazon.com/cognito/home?region=$AWS_REGION"
    echo "  CloudWatch: https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION"
    echo ""
    echo "🔧 Next Steps:"
    echo "  1. Change the admin password on first login"
    echo "  2. Verify email addresses in SES if needed"
    echo "  3. Configure custom domain if required"
    echo "  4. Test all features thoroughly"
    echo ""
}

# Main deployment flow
main() {
    echo "Starting deployment at $(date)"
    echo ""
    
    # Pre-deployment checks
    check_aws_config
    validate_template
    
    # Deploy CloudFormation stack
    deploy_stack
    
    # Get stack outputs
    get_stack_outputs
    
    # Deploy frontend
    deploy_frontend
    
    # Create admin user
    create_admin_user
    
    # Run health checks
    run_health_checks
    
    # Display summary
    deployment_summary
    
    echo "Deployment completed at $(date)"
}

# Run main deployment
main "$@"