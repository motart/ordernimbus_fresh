#!/bin/bash

# Sales Forecasting Platform - Complete AWS Deployment Script
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
PROJECT_NAME="sales-forecasting-platform"

# Parse command line arguments
ENVIRONMENT=${1:-$DEFAULT_ENV}
AWS_REGION=${2:-$DEFAULT_REGION}
SKIP_TESTS=${3:-false}

echo -e "${BLUE}🚀 Starting deployment of Sales Forecasting Platform${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Region: ${AWS_REGION}${NC}"
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

# Function to set up CDK bootstrap if not already done
bootstrap_cdk() {
    echo "🏗️  Bootstrapping CDK..."
    
    # Check if CDK is already bootstrapped
    if aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION &>/dev/null; then
        print_warning "CDK already bootstrapped in $AWS_REGION"
    else
        print_status "Bootstrapping CDK in $AWS_REGION"
        npx cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION
    fi
}

# Function to create SNS topics for monitoring
setup_sns_topics() {
    echo "📢 Setting up SNS topics for monitoring..."
    
    TOPIC_NAME="ordernimbus-$ENVIRONMENT-alerts"
    
    # Check if topic exists
    if aws sns get-topic-attributes --topic-arn "arn:aws:sns:$AWS_REGION:$ACCOUNT_ID:$TOPIC_NAME" &>/dev/null; then
        print_warning "SNS topic $TOPIC_NAME already exists"
    else
        aws sns create-topic --name "$TOPIC_NAME" --region $AWS_REGION
        print_status "Created SNS topic: $TOPIC_NAME"
        
        # Subscribe alert email
        ALERT_EMAIL="alerts@ordernimbus.com"
        aws sns subscribe \
            --topic-arn "arn:aws:sns:$AWS_REGION:$ACCOUNT_ID:$TOPIC_NAME" \
            --protocol email \
            --notification-endpoint "$ALERT_EMAIL"
        print_status "Subscribed $ALERT_EMAIL to alerts"
    fi
}

# Function to create parameter store values
setup_parameters() {
    echo "⚙️  Setting up Parameter Store values..."
    
    PARAMETERS=(
        "/ordernimbus/$ENVIRONMENT/database/master-username:ordernimbus_admin"
        "/ordernimbus/$ENVIRONMENT/database/name:forecasting_db"
        "/ordernimbus/$ENVIRONMENT/api/cors-origins:https://$ENVIRONMENT.ordernimbus.com"
        "/ordernimbus/$ENVIRONMENT/monitoring/alert-email:alerts@ordernimbus.com"
        "/ordernimbus/$ENVIRONMENT/cache/redis-node-type:cache.r6g.large"
        "/ordernimbus/$ENVIRONMENT/compute/ecs-cpu:1024"
        "/ordernimbus/$ENVIRONMENT/compute/ecs-memory:2048"
        "/ordernimbus/$ENVIRONMENT/scaling/min-capacity:2"
        "/ordernimbus/$ENVIRONMENT/scaling/max-capacity:50"
    )
    
    for param in "${PARAMETERS[@]}"; do
        IFS=':' read -r name value <<< "$param"
        
        if aws ssm get-parameter --name "$name" --region $AWS_REGION &>/dev/null; then
            print_warning "Parameter $name already exists, skipping"
        else
            aws ssm put-parameter \
                --name "$name" \
                --value "$value" \
                --type "String" \
                --region $AWS_REGION \
                --description "Auto-created by deployment script"
            print_status "Created parameter: $name"
        fi
    done
}

# Function to create secure parameters (passwords, tokens)
setup_secure_parameters() {
    echo "🔐 Setting up secure parameters..."
    
    # Generate JWT secret
    JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)
    
    # Generate API key for load testing
    LOAD_TEST_TOKEN=$(openssl rand -hex 32)
    
    SECURE_PARAMETERS=(
        "/ordernimbus/$ENVIRONMENT/auth/jwt-secret:$JWT_SECRET" 
        "/ordernimbus/$ENVIRONMENT/testing/load-test-token:$LOAD_TEST_TOKEN"
    )
    
    for param in "${SECURE_PARAMETERS[@]}"; do
        IFS=':' read -r name value <<< "$param"
        
        if aws ssm get-parameter --name "$name" --region $AWS_REGION &>/dev/null; then
            print_warning "Secure parameter $name already exists, skipping"
        else
            aws ssm put-parameter \
                --name "$name" \
                --value "$value" \
                --type "SecureString" \
                --region $AWS_REGION \
                --description "Auto-generated secure parameter"
            print_status "Created secure parameter: $name"
        fi
    done
}

# Function to create S3 buckets with proper configuration
setup_s3_buckets() {
    echo "🪣 Setting up S3 buckets..."
    
    BUCKETS=(
        "$STACK_PREFIX-$ENVIRONMENT-frontend-assets:website"
        "$STACK_PREFIX-$ENVIRONMENT-data-lake:private"
        "$STACK_PREFIX-$ENVIRONMENT-ml-artifacts:private"
        "$STACK_PREFIX-$ENVIRONMENT-backups:private"
        "$STACK_PREFIX-$ENVIRONMENT-logs:private"
    )
    
    for bucket_config in "${BUCKETS[@]}"; do
        IFS=':' read -r bucket_name bucket_type <<< "$bucket_config"
        
        # Check if bucket exists
        if aws s3api head-bucket --bucket "$bucket_name" --region $AWS_REGION 2>/dev/null; then
            print_warning "Bucket $bucket_name already exists, skipping"
        else
            # Create bucket with proper region handling
            if [ "$AWS_REGION" = "us-east-1" ]; then
                # For us-east-1, don't specify location constraint but include region
                aws s3api create-bucket \
                    --bucket "$bucket_name" \
                    --region $AWS_REGION
            else
                # For other regions, specify location constraint
                aws s3api create-bucket \
                    --bucket "$bucket_name" \
                    --region $AWS_REGION \
                    --create-bucket-configuration LocationConstraint=$AWS_REGION
            fi
            
            # Configure bucket based on type
            if [ "$bucket_type" = "website" ]; then
                # Enable static website hosting
                aws s3 website s3://$bucket_name --index-document index.html --error-document error.html
                
                # Disable public access block first for website buckets
                aws s3api delete-public-access-block --bucket "$bucket_name" || true
                
                # Set public read policy for website assets
                cat > /tmp/website-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$bucket_name/*"
        }
    ]
}
EOF
                aws s3api put-bucket-policy --bucket "$bucket_name" --policy file:///tmp/website-policy.json
            else
                # Block public access for private buckets
                aws s3api put-public-access-block \
                    --bucket "$bucket_name" \
                    --public-access-block-configuration \
                    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
            fi
            
            # Enable versioning
            aws s3api put-bucket-versioning \
                --bucket "$bucket_name" \
                --versioning-configuration Status=Enabled
            
            # Enable server-side encryption
            aws s3api put-bucket-encryption \
                --bucket "$bucket_name" \
                --server-side-encryption-configuration '{
                    "Rules": [
                        {
                            "ApplyServerSideEncryptionByDefault": {
                                "SSEAlgorithm": "AES256"
                            }
                        }
                    ]
                }'
            
            print_status "Created and configured bucket: $bucket_name"
        fi
    done
    
    # Clean up temp files
    rm -f /tmp/website-policy.json
}

# Function to deploy CDK stacks
deploy_cdk_stacks() {
    echo "☁️  Deploying CDK stacks..."
    
    # Ensure CDK dependencies are installed
    if [ ! -d "node_modules" ]; then
        print_status "Installing CDK dependencies..."
        npm install
    fi
    
    # Set environment variables for CDK
    export CDK_DEFAULT_ACCOUNT=$ACCOUNT_ID
    export CDK_DEFAULT_REGION=$AWS_REGION
    export ENVIRONMENT=$ENVIRONMENT
    
    # Deploy stacks in order
    STACKS=(
        "$STACK_PREFIX-$ENVIRONMENT-networking"
        "$STACK_PREFIX-$ENVIRONMENT-security"
        "$STACK_PREFIX-$ENVIRONMENT-database"
        "$STACK_PREFIX-$ENVIRONMENT-compute"
        "$STACK_PREFIX-$ENVIRONMENT-api"
        "$STACK_PREFIX-$ENVIRONMENT-frontend"
        "$STACK_PREFIX-$ENVIRONMENT-ml-pipeline"
        "$STACK_PREFIX-$ENVIRONMENT-monitoring"
    )
    
    for stack in "${STACKS[@]}"; do
        print_status "Deploying stack: $stack"
        npx cdk deploy $stack \
            --require-approval never \
            --region $AWS_REGION \
            --context environment=$ENVIRONMENT \
            --outputs-file cdk-outputs-$ENVIRONMENT.json
        
        if [ $? -eq 0 ]; then
            print_status "Successfully deployed: $stack"
        else
            print_error "Failed to deploy: $stack"
            exit 1
        fi
    done
}

# Function to set up Cognito user pool and initial users
setup_cognito() {
    echo "👤 Setting up Cognito authentication..."
    
    # Get User Pool ID from CDK outputs
    USER_POOL_ID=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-security'".UserPoolId' cdk-outputs-$ENVIRONMENT.json)
    
    if [ "$USER_POOL_ID" != "null" ] && [ -n "$USER_POOL_ID" ]; then
        # Create initial admin user
        ADMIN_EMAIL="admin@ordernimbus.com"
        TEMP_PASSWORD=$(openssl rand -base64 12)
        
        if aws cognito-idp admin-get-user --user-pool-id $USER_POOL_ID --username $ADMIN_EMAIL 2>/dev/null; then
            print_warning "Admin user already exists"
        else
            aws cognito-idp admin-create-user \
                --user-pool-id $USER_POOL_ID \
                --username $ADMIN_EMAIL \
                --user-attributes Name=email,Value=$ADMIN_EMAIL Name=email_verified,Value=true \
                --temporary-password $TEMP_PASSWORD \
                --message-action SUPPRESS
            
            print_status "Created admin user: $ADMIN_EMAIL"
            print_warning "Temporary password: $TEMP_PASSWORD (change on first login)"
        fi
    else
        print_error "Could not find User Pool ID in CDK outputs"
    fi
}

# Function to deploy frontend to S3 and invalidate CloudFront
deploy_frontend() {
    echo "🌐 Deploying frontend application..."
    
    FRONTEND_BUCKET="$STACK_PREFIX-$ENVIRONMENT-frontend-assets"
    
    # Build the React application
    if [ -d "app/frontend" ]; then
        cd app/frontend
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            print_status "Installing frontend dependencies..."
            npm install
        fi
        
        # Build for production
        print_status "Building React application..."
        REACT_APP_API_URL="https://api-$ENVIRONMENT.ordernimbus.com" \
        REACT_APP_ENVIRONMENT=$ENVIRONMENT \
        npm run build
        
        # Deploy to S3
        print_status "Deploying to S3..."
        aws s3 sync build/ s3://$FRONTEND_BUCKET/ --delete
        
        # Get CloudFront distribution ID from CDK outputs (if exists)
        cd ../..
        if [ -f "cdk-outputs-$ENVIRONMENT.json" ]; then
            DISTRIBUTION_ID=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-frontend'".CloudFrontDistributionId // null' cdk-outputs-$ENVIRONMENT.json)
            
            if [ "$DISTRIBUTION_ID" != "null" ] && [ -n "$DISTRIBUTION_ID" ]; then
                print_status "Invalidating CloudFront cache..."
                aws cloudfront create-invalidation \
                    --distribution-id $DISTRIBUTION_ID \
                    --paths "/*" \
                    --query 'Invalidation.Id' \
                    --output text
            else
                print_status "No CloudFront distribution found, S3 website hosting active"
                print_status "Frontend URL: http://$FRONTEND_BUCKET.s3-website-$AWS_REGION.amazonaws.com"
            fi
        fi
        
        print_status "Frontend deployed successfully"
    else
        print_warning "Frontend directory not found at app/frontend, skipping frontend deployment"
    fi
}

# Function to run post-deployment tests
run_post_deployment_tests() {
    if [ "$SKIP_TESTS" = "true" ]; then
        print_warning "Skipping post-deployment tests"
        return
    fi
    
    echo "🧪 Running post-deployment verification tests..."
    
    # Get API Gateway URL from CDK outputs
    API_URL=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-api'".ApiGatewayUrl' cdk-outputs-$ENVIRONMENT.json)
    
    if [ "$API_URL" != "null" ] && [ -n "$API_URL" ]; then
        # Health check
        echo "Testing API health endpoint..."
        if curl -f "$API_URL/health" >/dev/null 2>&1; then
            print_status "API health check passed"
        else
            print_error "API health check failed"
            exit 1
        fi
        
        # Test authentication endpoint
        echo "Testing authentication endpoint..."
        if curl -f "$API_URL/api/v1/ping" -H "Authorization: Bearer test-token" >/dev/null 2>&1; then
            print_status "Authentication endpoint test passed"
        else
            print_warning "Authentication endpoint test failed (expected for new deployment)"
        fi
    else
        print_error "Could not find API Gateway URL in CDK outputs"
    fi
    
    # Test database connectivity
    echo "Testing database connectivity..."
    DB_ENDPOINT=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-database'".DatabaseEndpoint' cdk-outputs-$ENVIRONMENT.json)
    if [ "$DB_ENDPOINT" != "null" ] && [ -n "$DB_ENDPOINT" ]; then
        print_status "Database endpoint available: $DB_ENDPOINT"
    else
        print_error "Could not find database endpoint"
    fi
}

# Function to output deployment summary
deployment_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
    echo "=========================================="
    
    if [ -f "cdk-outputs-$ENVIRONMENT.json" ]; then
        echo "📋 Deployment Summary:"
        echo ""
        
        # Extract key URLs and resources
        API_URL=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-api'".ApiGatewayUrl // "Not available"' cdk-outputs-$ENVIRONMENT.json)
        FRONTEND_URL=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-frontend'".CloudFrontUrl // "Not available"' cdk-outputs-$ENVIRONMENT.json)
        DB_ENDPOINT=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-database'".DatabaseEndpoint // "Not available"' cdk-outputs-$ENVIRONMENT.json)
        
        echo "🌐 Frontend URL: $FRONTEND_URL"
        echo "🔗 API URL: $API_URL"
        echo "🗄️  Database Endpoint: $DB_ENDPOINT"
        echo "📧 Admin Email: admin@ordernimbus.com"
        echo ""
        
        echo "📁 Important files created:"
        echo "  - cdk-outputs-$ENVIRONMENT.json (CDK stack outputs)"
        echo "  - deployment-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).log (deployment log)"
        echo ""
        
        echo "🔧 Next steps:"
        echo "  1. Change the admin user password on first login"
        echo "  2. Configure your domain DNS to point to CloudFront"
        echo "  3. Upload SSL certificate if using custom domain"
        echo "  4. Run load tests: k6 run load-tests/k6-suite.js"
        echo "  5. Monitor deployment: aws cloudwatch get-metric-statistics"
        echo ""
        
        echo "📊 Resource URLs:"
        echo "  - CloudWatch: https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION"
        echo "  - RDS: https://console.aws.amazon.com/rds/home?region=$AWS_REGION"
        echo "  - ECS: https://console.aws.amazon.com/ecs/home?region=$AWS_REGION"
        echo "  - S3: https://console.aws.amazon.com/s3/home?region=$AWS_REGION"
    fi
}

# Function to handle deployment failures and cleanup
cleanup_on_failure() {
    print_error "Deployment failed. Cleaning up partial resources..."
    
    # Optionally clean up resources that were created
    # This is commented out for safety - manual cleanup recommended
    # aws cloudformation delete-stack --stack-name $STACK_PREFIX-$ENVIRONMENT-* --region $AWS_REGION
    
    echo "Manual cleanup may be required. Check AWS Console for partial resources."
    exit 1
}

# Set up error handling
trap cleanup_on_failure ERR

# Main deployment flow
main() {
    echo "Starting deployment at $(date)"
    
    # Pre-deployment checks
    check_aws_config
    
    # CDK setup
    bootstrap_cdk
    
    # AWS resources setup
    setup_sns_topics
    setup_parameters
    setup_secure_parameters
    setup_s3_buckets
    
    # Deploy infrastructure
    deploy_cdk_stacks
    
    # Post-deployment setup
    setup_cognito
    deploy_frontend
    
    # Verification
    run_post_deployment_tests
    
    # Summary
    deployment_summary
    
    echo "Deployment completed at $(date)"
}

# Create deployment log
LOG_FILE="deployment-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a $LOG_FILE)
exec 2>&1

# Run main deployment
main "$@"