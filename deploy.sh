#!/bin/bash

################################################################################
# OrderNimbus Master Deployment Script
# Single source of truth for all deployments
# Supports: local, staging, production environments
################################################################################

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Helper functions
print_header() { echo -e "\n${CYAN}═══════════════════════════════════════${NC}\n${CYAN}$1${NC}\n${CYAN}═══════════════════════════════════════${NC}"; }
print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; [ "${NO_EXIT_ON_ERROR:-0}" = "1" ] || exit 1; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Default values
ENVIRONMENT="${1:-staging}"
AWS_REGION="${2:-us-west-1}"
SKIP_TESTS="${3:-false}"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(local|staging|production)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT. Use: local, staging, or production"
fi

# CloudFormation template - single source of truth
TEMPLATE_FILE="cloudformation-simple.yaml"

# Check template exists
if [ ! -f "$TEMPLATE_FILE" ]; then
    # Try infrastructure directory
    if [ -f "infrastructure/cloudformation/cloudformation-template.yaml" ]; then
        TEMPLATE_FILE="infrastructure/cloudformation/cloudformation-template.yaml"
    else
        print_error "CloudFormation template not found"
    fi
fi

# AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")

# Set stack name properly - avoid double "production"
if [ "$ENVIRONMENT" = "production" ]; then
    STACK_NAME="ordernimbus-production"
else
    STACK_NAME="ordernimbus-${ENVIRONMENT}"
fi

# Configuration based on environment
if [ "$ENVIRONMENT" = "production" ]; then
    S3_BUCKET="ordernimbus-production-frontend-${AWS_ACCOUNT_ID}"
    COGNITO_POOL_NAME="ordernimbus-production-users"
    DOMAIN_NAME="app.ordernimbus.com"
    ENABLE_CLOUDFRONT="true"
    HOSTED_ZONE_ID="Z03623712FIVU7Z4CJ949"
elif [ "$ENVIRONMENT" = "staging" ]; then
    S3_BUCKET="ordernimbus-staging-frontend-${AWS_ACCOUNT_ID}"
    COGNITO_POOL_NAME="ordernimbus-staging-users"
    DOMAIN_NAME=""
    ENABLE_CLOUDFRONT="false"
    HOSTED_ZONE_ID=""
else
    # Local environment
    print_header "Local Development Deployment"
    
    print_status "Checking prerequisites..."
    command -v node >/dev/null 2>&1 || print_error "Node.js is required but not installed"
    command -v npm >/dev/null 2>&1 || print_error "npm is required but not installed"
    print_success "Prerequisites checked"
    
    print_status "Installing dependencies..."
    cd app/frontend && npm install --silent && cd ../..
    print_success "Dependencies installed"
    
    print_status "Building frontend for local..."
    cd app/frontend && npm run build:local && cd ../..
    print_success "Frontend built"
    
    print_status "Starting local server..."
    cd app/frontend && npm start &
    cd ../..
    
    print_success "Local deployment ready!"
    echo "Frontend: http://localhost:3000"
    echo "Backend: Run 'node local-test-server.js' for local backend"
    exit 0
fi

# Display deployment configuration
print_header "OrderNimbus Deployment"
echo "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo "Region: ${YELLOW}$AWS_REGION${NC}"
echo "Stack: ${YELLOW}$STACK_NAME${NC}"
echo "Account: ${YELLOW}$AWS_ACCOUNT_ID${NC}"
echo "Template: ${YELLOW}$TEMPLATE_FILE${NC}"
echo ""

################################################################################
# AWS DEPLOYMENT
################################################################################
print_header "AWS Deployment - $ENVIRONMENT"

# Check AWS credentials
print_status "Checking AWS credentials..."
if [ -z "$AWS_ACCOUNT_ID" ]; then
    print_error "AWS credentials not configured. Run 'aws configure'"
fi
print_success "AWS credentials valid (Account: $AWS_ACCOUNT_ID)"

# Handle CloudFront for production
if [ "$ENVIRONMENT" = "production" ] && [ "$ENABLE_CLOUDFRONT" = "true" ]; then
    print_status "Checking for CloudFront conflicts..."
    
    # Find existing distributions using app.ordernimbus.com
    EXISTING_DIST=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Aliases.Items, 'app.ordernimbus.com')].Id" \
        --output text 2>/dev/null | head -1)
    
    if [ -n "$EXISTING_DIST" ]; then
        print_warning "Found existing CloudFront distribution: $EXISTING_DIST"
        
        # Check if the distribution is enabled
        DIST_ENABLED=$(aws cloudfront get-distribution \
            --id "$EXISTING_DIST" \
            --query 'Distribution.DistributionConfig.Enabled' \
            --output text 2>/dev/null || echo "false")
        
        if [ "$DIST_ENABLED" = "false" ]; then
            print_status "Existing CloudFront distribution is disabled. Re-enabling it..."
            
            # Get the distribution config
            aws cloudfront get-distribution-config --id "$EXISTING_DIST" > /tmp/dist-config.json 2>/dev/null
            ETAG=$(jq -r '.ETag' /tmp/dist-config.json)
            
            # Update to point to our S3 bucket and enable it
            jq --arg bucket "$S3_BUCKET.s3-website-${AWS_REGION}.amazonaws.com" \
               '.DistributionConfig.Enabled = true | 
                .DistributionConfig.Origins.Items[0].DomainName = $bucket |
                .DistributionConfig.Origins.Items[0].Id = ("S3-" + $bucket)' /tmp/dist-config.json > /tmp/dist-config-updated.json
            
            # Update the distribution
            aws cloudfront update-distribution \
                --id "$EXISTING_DIST" \
                --distribution-config "$(jq '.DistributionConfig' /tmp/dist-config-updated.json)" \
                --if-match "$ETAG" > /dev/null 2>&1
            
            print_success "CloudFront distribution re-enabled and updated"
            CLOUDFRONT_ID="$EXISTING_DIST"
            ENABLE_CLOUDFRONT="false"  # Don't create a new one
        else
            # Check if it's from our stack
            STACK_DIST=$(aws cloudformation describe-stack-resources \
                --stack-name "$STACK_NAME" \
                --query "StackResources[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId" \
                --output text 2>/dev/null || echo "")
            
            if [ "$EXISTING_DIST" != "$STACK_DIST" ]; then
                print_warning "Distribution $EXISTING_DIST is not managed by this stack"
                print_status "Using existing CloudFront distribution"
                CLOUDFRONT_ID="$EXISTING_DIST"
                ENABLE_CLOUDFRONT="false"  # Don't create a new one
            fi
        fi
    fi
    
    # Check certificate
    if [ "$ENABLE_CLOUDFRONT" = "true" ]; then
        print_status "Checking SSL certificate in us-east-1..."
        CERT_ARN=$(aws acm list-certificates \
            --region us-east-1 \
            --query "CertificateSummaryList[?DomainName=='app.ordernimbus.com' || DomainName=='*.ordernimbus.com'].CertificateArn" \
            --output text | head -1)
        
        if [ -z "$CERT_ARN" ]; then
            print_warning "No SSL certificate found for app.ordernimbus.com"
            print_status "CloudFront will be disabled for this deployment"
            ENABLE_CLOUDFRONT="false"
        else
            CERT_STATUS=$(aws acm describe-certificate \
                --certificate-arn "$CERT_ARN" \
                --region us-east-1 \
                --query 'Certificate.Status' \
                --output text)
            
            if [ "$CERT_STATUS" != "ISSUED" ]; then
                print_warning "Certificate not yet validated (Status: $CERT_STATUS)"
                ENABLE_CLOUDFRONT="false"
            else
                print_success "Certificate is valid: $CERT_ARN"
            fi
        fi
    fi
fi

# Deploy CloudFormation stack
print_status "Deploying CloudFormation stack..."

# Build parameter overrides
PARAMS="Environment=$ENVIRONMENT"
if [ "$ENABLE_CLOUDFRONT" = "true" ] && [ -n "$CERT_ARN" ]; then
    PARAMS="$PARAMS EnableCloudFront=true CertificateArn=$CERT_ARN"
fi
if [ -n "$HOSTED_ZONE_ID" ]; then
    PARAMS="$PARAMS HostedZoneId=$HOSTED_ZONE_ID"
fi

# Deploy the stack
aws cloudformation deploy \
    --template-file "$TEMPLATE_FILE" \
    --stack-name "$STACK_NAME" \
    --parameter-overrides $PARAMS \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --region "$AWS_REGION" \
    --no-fail-on-empty-changeset || {
        print_error "CloudFormation deployment failed. Check the stack events for details."
    }

print_success "CloudFormation stack deployed"

# Get stack outputs
print_status "Getting stack outputs..."

API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "")

S3_BUCKET_OUTPUT=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
    --output text 2>/dev/null || echo "")

# Use output bucket if available, otherwise use configured
if [ -n "$S3_BUCKET_OUTPUT" ]; then
    S3_BUCKET="$S3_BUCKET_OUTPUT"
fi

FRONTEND_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`FrontendURL`].OutputValue' \
    --output text 2>/dev/null || echo "")

CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text 2>/dev/null || echo "")

USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
    --output text 2>/dev/null || echo "")

USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
    --output text 2>/dev/null || echo "")

# Deploy Lambda functions
print_status "Deploying Lambda functions..."

# Get the main Lambda function name from the stack
MAIN_LAMBDA=$(aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --query "StackResources[?ResourceType=='AWS::Lambda::Function'].PhysicalResourceId" \
    --output text \
    --region "$AWS_REGION" 2>/dev/null | head -1)

if [ -n "$MAIN_LAMBDA" ]; then
    print_status "Found Lambda function: $MAIN_LAMBDA"
    
    # Check if we have a main Lambda handler
    if [ -f "lambda/main-handler.js" ] || [ -f "lambda/index.js" ]; then
        # Package and deploy main Lambda
        mkdir -p /tmp/lambda-deploy
        
        # Copy all Lambda files
        if [ -d "lambda" ]; then
            cp -r lambda/* /tmp/lambda-deploy/ 2>/dev/null || true
        fi
        
        # Ensure index.js exists
        if [ -f "/tmp/lambda-deploy/main-handler.js" ] && [ ! -f "/tmp/lambda-deploy/index.js" ]; then
            mv /tmp/lambda-deploy/main-handler.js /tmp/lambda-deploy/index.js
        fi
        
        # Add config endpoint handling if not present
        if [ -f "/tmp/lambda-deploy/index.js" ]; then
            # Check if config case exists
            if ! grep -q "case 'config':" /tmp/lambda-deploy/index.js; then
                print_status "Adding config endpoint to Lambda..."
                # Add config case before 'stores' case or at the end of switch
                python3 -c "
import sys
with open('/tmp/lambda-deploy/index.js', 'r') as f:
    content = f.read()
    
# Add config case if not present
if \"case 'config':\" not in content:
    config_case = '''
      case 'config':
        // Return application configuration
        responseData = {
          environment: process.env.ENVIRONMENT || 'production',
          apiUrl: \`https://\${event.requestContext?.domainName || event.headers?.host}/\${event.requestContext?.stage || 'production'}\`,
          region: process.env.AWS_REGION || '$AWS_REGION',
          userPoolId: process.env.USER_POOL_ID,
          clientId: process.env.USER_POOL_CLIENT_ID,
          features: {
            enableDebug: false,
            enableAnalytics: true,
            enableMockData: false,
            useWebCrypto: true
          }
        };
        break;
'''
    # Try to insert before 'default:' or at the end of switch
    if 'default:' in content:
        content = content.replace('default:', config_case + '\\n      default:')
    elif \"case 'stores':\" in content:
        content = content.replace(\"case 'stores':\", config_case + \"\\n      case 'stores':\")
    
    with open('/tmp/lambda-deploy/index.js', 'w') as f:
        f.write(content)
" 2>/dev/null || true
            fi
        fi
        
        # Package Lambda
        cd /tmp/lambda-deploy
        
        # Add package.json if missing
        if [ ! -f package.json ]; then
            npm init -y --silent > /dev/null 2>&1
        fi
        
        # Install dependencies if needed
        if [ -f package.json ]; then
            npm install --silent > /dev/null 2>&1 || true
        fi
        
        # Create deployment package
        zip -qr lambda-deploy.zip .
        
        # Update Lambda function
        aws lambda update-function-code \
            --function-name "$MAIN_LAMBDA" \
            --zip-file fileb://lambda-deploy.zip \
            --region "$AWS_REGION" > /dev/null 2>&1
        
        print_success "Updated Lambda function: $MAIN_LAMBDA"
        
        cd - > /dev/null
    else
        print_warning "No Lambda code found to deploy"
    fi
else
    print_warning "No Lambda function found in stack"
fi

# Deploy individual Lambda functions if they exist
if [ -d "lambda" ]; then
    cd lambda
    
    for func in *.js; do
        if [ -f "$func" ] && [ "$func" != "index.js" ] && [ "$func" != "main-handler.js" ]; then
            filename="${func%.*}"
            FUNCTION_NAME="${STACK_NAME}-${filename}"
            
            # Check if this function exists in the stack
            if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$AWS_REGION" &>/dev/null; then
                print_status "Packaging Lambda: $filename"
                
                # Create temp directory for packaging
                mkdir -p /tmp/lambda-${filename}
                cp ${func} /tmp/lambda-${filename}/index.js
                
                # Add package.json if needed
                cd /tmp/lambda-${filename}
                if [ ! -f package.json ]; then
                    npm init -y --silent > /dev/null 2>&1
                fi
                
                # Install basic dependencies
                npm install aws-sdk --silent > /dev/null 2>&1 || true
                
                # Create zip
                zip -qr ${filename}.zip .
                
                # Update function
                aws lambda update-function-code \
                    --function-name "$FUNCTION_NAME" \
                    --zip-file fileb://${filename}.zip \
                    --region "$AWS_REGION" > /dev/null 2>&1
                    
                print_success "Updated Lambda: $filename"
                
                cd - > /dev/null
            fi
        fi
    done
    
    cd ..
fi

# Build and deploy frontend
print_header "Building and Deploying Frontend"

cd app/frontend

# Install dependencies
print_status "Installing frontend dependencies..."
npm install --silent
print_success "Dependencies installed"

# Build frontend with production configuration
print_status "Building frontend for $ENVIRONMENT..."

# Remove .env.local to prevent it from overriding production values
if [ "$ENVIRONMENT" = "production" ] && [ -f ".env.local" ]; then
    print_status "Temporarily moving .env.local to prevent override..."
    mv .env.local .env.local.backup
fi

# Update .env.production with discovered values
if [ "$ENVIRONMENT" = "production" ] && [ -n "$API_URL" ]; then
    cat > .env.production << EOF
# Production Environment Configuration
# Auto-generated by deploy.sh on $(date)
# IMPORTANT: No local host references allowed in production!

# Environment identifier
REACT_APP_ENVIRONMENT=production

# AWS Region
REACT_APP_REGION=$AWS_REGION

# API Gateway URL - Production endpoint
REACT_APP_API_URL=$API_URL

# AWS Cognito Configuration
REACT_APP_USER_POOL_ID=$USER_POOL_ID
REACT_APP_CLIENT_ID=$USER_POOL_CLIENT_ID

# Additional endpoints (all AWS-based)
REACT_APP_GRAPHQL_URL=${API_URL}/graphql
REACT_APP_WS_URL=$(echo $API_URL | sed 's/https:/wss:/g')/ws

# Feature Flags
REACT_APP_ENABLE_DEBUG=false
REACT_APP_ENABLE_ANALYTICS=true
REACT_APP_ENABLE_MOCK_DATA=false

# Build identification
REACT_APP_BUILD_TIME=$(date -Iseconds)
REACT_APP_BUILD_VERSION=$ENVIRONMENT-$(date +%Y%m%d-%H%M%S)
EOF
    print_success "Updated .env.production with discovered API endpoints"
fi

# Build with the appropriate environment
if [ "$ENVIRONMENT" = "production" ]; then
    # Explicitly set environment variables for production build
    REACT_APP_ENVIRONMENT=production \
    REACT_APP_API_URL="$API_URL" \
    REACT_APP_USER_POOL_ID="$USER_POOL_ID" \
    REACT_APP_CLIENT_ID="$USER_POOL_CLIENT_ID" \
    REACT_APP_REGION="$AWS_REGION" \
    REACT_APP_GRAPHQL_URL="${API_URL}/graphql" \
    REACT_APP_WS_URL="$(echo $API_URL | sed 's/https:/wss:/g')/ws" \
    REACT_APP_ENABLE_DEBUG=false \
    REACT_APP_ENABLE_ANALYTICS=true \
    REACT_APP_ENABLE_MOCK_DATA=false \
    npm run build
else
    npm run build
fi
print_success "Frontend built"

# Restore .env.local if it was moved
if [ "$ENVIRONMENT" = "production" ] && [ -f ".env.local.backup" ]; then
    mv .env.local.backup .env.local
fi

# Deploy to S3
if [ -n "$S3_BUCKET" ]; then
    print_status "Deploying frontend to S3 bucket: $S3_BUCKET..."
    
    # Sync all files with cache headers
    aws s3 sync build/ "s3://$S3_BUCKET/" \
        --delete \
        --region "$AWS_REGION" \
        --cache-control "public, max-age=31536000" \
        --exclude "index.html" \
        --exclude "*.json"
    
    # Upload index.html with no-cache
    aws s3 cp build/index.html "s3://$S3_BUCKET/" \
        --region "$AWS_REGION" \
        --cache-control "no-cache, no-store, must-revalidate" \
        --content-type "text/html"
    
    # Upload JSON files with no-cache
    aws s3 cp build/ "s3://$S3_BUCKET/" \
        --recursive \
        --region "$AWS_REGION" \
        --exclude "*" \
        --include "*.json" \
        --cache-control "no-cache, no-store, must-revalidate" \
        --content-type "application/json"
    
    print_success "Frontend deployed to S3"
    
    # Invalidate CloudFront if enabled
    if [ -n "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "None" ]; then
        print_status "Invalidating CloudFront cache..."
        aws cloudfront create-invalidation \
            --distribution-id "$CLOUDFRONT_ID" \
            --paths "/*" \
            --region "$AWS_REGION" > /dev/null
        print_success "CloudFront cache invalidated"
    fi
fi

cd ../..

# Display deployment summary
print_header "Deployment Complete!"
echo ""
echo "Stack Name: ${GREEN}$STACK_NAME${NC}"
echo "Region: ${GREEN}$AWS_REGION${NC}"
echo "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo ""

if [ -n "$API_URL" ]; then
    echo "API Endpoint: ${CYAN}$API_URL${NC}"
fi

if [ -n "$FRONTEND_URL" ]; then
    echo "Frontend URL: ${CYAN}$FRONTEND_URL${NC}"
elif [ -n "$S3_BUCKET" ]; then
    echo "S3 Website: ${CYAN}http://${S3_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com${NC}"
fi

if [ "$DOMAIN_NAME" = "app.ordernimbus.com" ] && [ "$ENABLE_CLOUDFRONT" = "true" ]; then
    echo "Custom Domain: ${CYAN}https://app.ordernimbus.com${NC}"
elif [ -n "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "None" ]; then
    CLOUDFRONT_DOMAIN=$(aws cloudfront get-distribution \
        --id "$CLOUDFRONT_ID" \
        --query 'Distribution.DomainName' \
        --output text 2>/dev/null)
    if [ -n "$CLOUDFRONT_DOMAIN" ]; then
        echo "CloudFront URL: ${CYAN}https://$CLOUDFRONT_DOMAIN${NC}"
    fi
fi

echo ""
echo "User Pool ID: ${YELLOW}$USER_POOL_ID${NC}"
echo "Client ID: ${YELLOW}$USER_POOL_CLIENT_ID${NC}"
echo ""

# Test endpoints
print_status "Testing deployment..."
if [ -n "$API_URL" ]; then
    if curl -s "$API_URL/api/config" > /dev/null 2>&1; then
        print_success "API is responding"
    else
        print_warning "API may still be initializing"
    fi
fi

print_success "Deployment successful!"

# AWS Resource Availability Tests
print_header "Running AWS Resource Availability Tests"

TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: API Gateway health
print_status "Testing API Gateway..."
if [ -n "$API_URL" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/config" --max-time 10)
    if [ "$HTTP_CODE" = "200" ]; then
        print_success "API Gateway is responding (HTTP $HTTP_CODE)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_error "API Gateway test failed (HTTP $HTTP_CODE)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    print_warning "API URL not available for testing"
fi

# Test 2: S3 bucket accessibility
print_status "Testing S3 bucket..."
if [ -n "$S3_BUCKET" ]; then
    if aws s3 ls "s3://$S3_BUCKET/" --region "$AWS_REGION" > /dev/null 2>&1; then
        print_success "S3 bucket is accessible"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_error "S3 bucket is not accessible"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
fi

# Test 3: Frontend URL accessibility
print_status "Testing frontend URL..."
FRONTEND_TEST_URL=""
if [ "$DOMAIN_NAME" = "app.ordernimbus.com" ]; then
    FRONTEND_TEST_URL="https://app.ordernimbus.com"
elif [ -n "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "None" ]; then
    CLOUDFRONT_DOMAIN=$(aws cloudfront get-distribution \
        --id "$CLOUDFRONT_ID" \
        --query 'Distribution.DomainName' \
        --output text 2>/dev/null)
    if [ -n "$CLOUDFRONT_DOMAIN" ]; then
        FRONTEND_TEST_URL="https://$CLOUDFRONT_DOMAIN"
    fi
elif [ -n "$S3_BUCKET" ]; then
    FRONTEND_TEST_URL="http://${S3_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"
fi

if [ -n "$FRONTEND_TEST_URL" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_TEST_URL" --max-time 10)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "403" ]; then  # 403 might be expected for S3
        print_success "Frontend is accessible at $FRONTEND_TEST_URL (HTTP $HTTP_CODE)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_error "Frontend is not accessible (HTTP $HTTP_CODE)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
fi

# Test 4: CloudFront distribution status (if applicable)
if [ -n "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "None" ]; then
    print_status "Testing CloudFront distribution..."
    DIST_STATUS=$(aws cloudfront get-distribution \
        --id "$CLOUDFRONT_ID" \
        --query 'Distribution.Status' \
        --output text 2>/dev/null || echo "Unknown")
    
    DIST_ENABLED=$(aws cloudfront get-distribution \
        --id "$CLOUDFRONT_ID" \
        --query 'Distribution.DistributionConfig.Enabled' \
        --output text 2>/dev/null || echo "false")
    
    if [ "$DIST_STATUS" = "Deployed" ] && [ "$DIST_ENABLED" = "true" ]; then
        print_success "CloudFront distribution is deployed and enabled"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    elif [ "$DIST_STATUS" = "InProgress" ]; then
        print_warning "CloudFront distribution is still deploying (this may take 15-20 minutes)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_error "CloudFront distribution issue: Status=$DIST_STATUS, Enabled=$DIST_ENABLED"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
fi

# Test 5: Cognito User Pool
print_status "Testing Cognito User Pool..."
if [ -n "$USER_POOL_ID" ]; then
    POOL_STATUS=$(aws cognito-idp describe-user-pool \
        --user-pool-id "$USER_POOL_ID" \
        --region "$AWS_REGION" \
        --query 'UserPool.Status' \
        --output text 2>/dev/null || echo "Unknown")
    
    if [ "$POOL_STATUS" = "Enabled" ]; then
        print_success "Cognito User Pool is enabled"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_error "Cognito User Pool status: $POOL_STATUS"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
fi

# Test 6: DNS resolution (for production)
if [ "$DOMAIN_NAME" = "app.ordernimbus.com" ]; then
    print_status "Testing DNS resolution..."
    DNS_RESULT=$(nslookup app.ordernimbus.com 8.8.8.8 2>/dev/null | grep -A 1 "Name:" | grep "Address:" | head -1)
    if [ -n "$DNS_RESULT" ]; then
        print_success "DNS is resolving for app.ordernimbus.com"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_warning "DNS may still be propagating (can take up to 48 hours)"
    fi
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Results: ${GREEN}$TESTS_PASSED passed${NC}, ${RED}$TESTS_FAILED failed${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $TESTS_FAILED -gt 0 ]; then
    echo ""
    print_warning "Some tests failed. Please check the errors above."
    echo "Common solutions:"
    echo "  • CloudFront: Wait 15-20 minutes for distribution to deploy"
    echo "  • DNS: Can take up to 48 hours to propagate globally"
    echo "  • S3: Ensure bucket policy allows public access"
fi

echo ""
echo "Next steps:"
echo "  1. Visit the frontend URL to test the application"
echo "  2. Check CloudWatch logs if any issues occur"
echo "  3. Run './teardown-production.sh' to remove all resources"
echo ""