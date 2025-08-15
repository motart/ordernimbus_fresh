#!/bin/bash

################################################################################
# OrderNimbus Immutable Infrastructure Deployment Script
# Deploy once, use forever - Creates persistent infrastructure components
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
print_error() { echo -e "${RED}✗${NC} $1"; exit 1; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Parameters
ENVIRONMENT="${1:-production}"
AWS_REGION="${2:-us-west-1}"
FORCE_UPDATE="${3:-false}"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(production|staging|development)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT. Use: production, staging, or development"
fi

# Stack configuration
STACK_NAME="ordernimbus-immutable-${ENVIRONMENT}"
TEMPLATE_FILE="infrastructure/immutable-stack.yaml"

# Check template exists
if [ ! -f "$TEMPLATE_FILE" ]; then
    print_error "Immutable stack template not found: $TEMPLATE_FILE"
fi

# AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
if [ -z "$AWS_ACCOUNT_ID" ]; then
    print_error "AWS credentials not configured. Run 'aws configure'"
fi

print_header "OrderNimbus Immutable Infrastructure Deployment"
echo "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo "Region: ${YELLOW}$AWS_REGION${NC}"
echo "Stack: ${YELLOW}$STACK_NAME${NC}"
echo "Account: ${YELLOW}$AWS_ACCOUNT_ID${NC}"
echo "Template: ${YELLOW}$TEMPLATE_FILE${NC}"
echo ""

# Check if this is an update to existing immutable infrastructure
print_status "Checking existing immutable infrastructure..."
STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "")

if [ -n "$STACK_EXISTS" ]; then
    if [ "$FORCE_UPDATE" != "true" ]; then
        print_warning "Immutable infrastructure already exists!"
        echo ""
        echo "Stack: $STACK_NAME"
        echo "Status: $STACK_EXISTS"
        echo ""
        echo "Immutable infrastructure should only be deployed once."
        echo "Updates to immutable infrastructure can cause downtime and may break existing applications."
        echo ""
        echo "To proceed with update anyway, run:"
        echo "  $0 $ENVIRONMENT $AWS_REGION true"
        echo ""
        echo "Or to deploy application infrastructure instead, run:"
        echo "  ./deploy.sh $ENVIRONMENT $AWS_REGION"
        echo ""
        exit 0
    else
        print_warning "Force update mode enabled - updating existing immutable infrastructure"
        echo ""
        echo "⚠️  WARNING: This may cause downtime!"
        echo "⚠️  CloudFront distributions take 15-20 minutes to update"
        echo "⚠️  DNS changes may cause propagation delays"
        echo ""
        read -p "Continue with immutable infrastructure update? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "Update cancelled"
            exit 0
        fi
    fi
fi

################################################################################
# SSL CERTIFICATE CHECK (for production)
################################################################################
if [ "$ENVIRONMENT" = "production" ]; then
    print_status "Checking SSL certificate requirements..."
    
    # For immutable infrastructure, we'll create the certificate in the template
    # This requires the hosted zone to exist
    HOSTED_ZONE_EXISTS=$(aws route53 list-hosted-zones \
        --query "HostedZones[?Name=='ordernimbus.com.'].Id" \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$HOSTED_ZONE_EXISTS" ]; then
        print_error "Route 53 hosted zone for ordernimbus.com not found. Please create it first."
    fi
    
    print_success "Route 53 hosted zone found"
fi

################################################################################
# DEPLOY IMMUTABLE INFRASTRUCTURE
################################################################################
print_header "Deploying Immutable Infrastructure"

print_status "Building CloudFormation parameters..."
PARAMS="Environment=$ENVIRONMENT"

# Add domain parameters for production
if [ "$ENVIRONMENT" = "production" ]; then
    PARAMS="$PARAMS Domain=ordernimbus.com"
    PARAMS="$PARAMS SubdomainPrefix=app"
    PARAMS="$PARAMS ApiSubdomainPrefix=api"
fi

print_status "Deploying CloudFormation stack..."
echo "Parameters: $PARAMS"

# Deploy with retry logic
MAX_RETRIES=3
RETRY_COUNT=0
DEPLOY_SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$DEPLOY_SUCCESS" = "false" ]; do
    if [ $RETRY_COUNT -gt 0 ]; then
        print_warning "Retry attempt $RETRY_COUNT of $MAX_RETRIES..."
        sleep 10
    fi
    
    if aws cloudformation deploy \
        --template-file "$TEMPLATE_FILE" \
        --stack-name "$STACK_NAME" \
        --parameter-overrides $PARAMS \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
        --region "$AWS_REGION" \
        --no-fail-on-empty-changeset 2>&1 | tee /tmp/cf-immutable-deploy.log; then
        DEPLOY_SUCCESS=true
        print_success "Immutable infrastructure deployed successfully"
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if grep -q "No updates are to be performed" /tmp/cf-immutable-deploy.log; then
            print_success "Immutable infrastructure is already up-to-date"
            DEPLOY_SUCCESS=true
        elif [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            print_error "Immutable infrastructure deployment failed after $MAX_RETRIES attempts"
        fi
    fi
done

################################################################################
# WAIT FOR SSL CERTIFICATE VALIDATION (Production Only)
################################################################################
if [ "$ENVIRONMENT" = "production" ]; then
    print_status "Waiting for SSL certificate validation..."
    
    # Get certificate ARN from stack outputs
    CERT_ARN=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`SSLCertificateArn`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$CERT_ARN" ]; then
        print_status "Certificate ARN: $CERT_ARN"
        print_status "Waiting for DNS validation (this may take 5-10 minutes)..."
        
        # Wait for certificate validation
        WAIT_COUNT=0
        MAX_WAIT=20  # 20 attempts * 30 seconds = 10 minutes
        
        while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
            CERT_STATUS=$(aws acm describe-certificate \
                --certificate-arn "$CERT_ARN" \
                --region us-east-1 \
                --query 'Certificate.Status' \
                --output text 2>/dev/null || echo "UNKNOWN")
            
            if [ "$CERT_STATUS" = "ISSUED" ]; then
                print_success "SSL certificate validated and issued"
                break
            elif [ "$CERT_STATUS" = "FAILED" ]; then
                print_error "SSL certificate validation failed"
            else
                print_status "Certificate status: $CERT_STATUS (waiting...)"
                sleep 30
                WAIT_COUNT=$((WAIT_COUNT + 1))
            fi
        done
        
        if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
            print_warning "Certificate validation is taking longer than expected"
            print_warning "CloudFront distribution may not be accessible until validation completes"
        fi
    fi
fi

################################################################################
# WAIT FOR CLOUDFRONT DEPLOYMENT
################################################################################
print_status "Waiting for CloudFront distribution deployment..."

# Get CloudFront distribution ID from stack outputs
CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -n "$CLOUDFRONT_ID" ]; then
    print_status "CloudFront Distribution ID: $CLOUDFRONT_ID"
    
    # Check CloudFront deployment status
    WAIT_COUNT=0
    MAX_WAIT=30  # 30 attempts * 60 seconds = 30 minutes
    
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        DIST_STATUS=$(aws cloudfront get-distribution \
            --id "$CLOUDFRONT_ID" \
            --query 'Distribution.Status' \
            --output text 2>/dev/null || echo "Unknown")
        
        if [ "$DIST_STATUS" = "Deployed" ]; then
            print_success "CloudFront distribution deployed"
            break
        else
            print_status "CloudFront status: $DIST_STATUS (ETA: ~15 minutes for new distributions)"
            sleep 60
            WAIT_COUNT=$((WAIT_COUNT + 1))
        fi
    done
    
    if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
        print_warning "CloudFront deployment is taking longer than expected"
        print_warning "Distribution may still be deploying in the background"
    fi
fi

################################################################################
# GET STACK OUTPUTS AND UPDATE STATIC CONFIG
################################################################################
print_header "Retrieving Immutable Infrastructure Outputs"

# Get all stack outputs
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

FRONTEND_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`FrontendURL`].OutputValue' \
    --output text 2>/dev/null || echo "")

S3_BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
    --output text 2>/dev/null || echo "")

FRONTEND_DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`FrontendDomain`].OutputValue' \
    --output text 2>/dev/null || echo "")

################################################################################
# UPDATE STATIC CONFIGURATION FILE
################################################################################
print_status "Updating static configuration file..."

CONFIG_FILE="app/frontend/src/config/static-config.ts"
CONFIG_BACKUP="app/frontend/src/config/static-config.ts.backup.$(date +%Y%m%d-%H%M%S)"

# Backup existing config
if [ -f "$CONFIG_FILE" ]; then
    cp "$CONFIG_FILE" "$CONFIG_BACKUP"
    print_status "Backed up existing config to: $CONFIG_BACKUP"
fi

# Update static configuration with actual values
print_status "Updating static configuration with immutable infrastructure values..."

# Update production config values in the static config file
if [ "$ENVIRONMENT" = "production" ] && [ -n "$USER_POOL_ID" ] && [ -n "$USER_POOL_CLIENT_ID" ]; then
    # Use sed to update the hardcoded values in production config
    sed -i.tmp "s/cloudfrontDistributionId: 'EZLBQFH8BW8XD'/cloudfrontDistributionId: '$CLOUDFRONT_ID'/g" "$CONFIG_FILE"
    sed -i.tmp "s/userPoolId: 'us-west-1_FIXED_POOL_ID'/userPoolId: '$USER_POOL_ID'/g" "$CONFIG_FILE"
    sed -i.tmp "s/clientId: 'fixed_client_id_from_cognito'/clientId: '$USER_POOL_CLIENT_ID'/g" "$CONFIG_FILE"
    sed -i.tmp "s/s3BucketName: 'ordernimbus-production-frontend-335021149718'/s3BucketName: '$S3_BUCKET_NAME'/g" "$CONFIG_FILE"
    
    # Remove temporary files
    rm -f "$CONFIG_FILE.tmp"
    
    print_success "Updated static configuration with production values"
fi

################################################################################
# DISPLAY DEPLOYMENT SUMMARY
################################################################################
print_header "Immutable Infrastructure Deployment Complete!"

echo ""
echo "Stack Name: ${GREEN}$STACK_NAME${NC}"
echo "Region: ${GREEN}$AWS_REGION${NC}"
echo "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo ""

echo "🏗️  Immutable Infrastructure:"
echo "  User Pool ID: ${CYAN}$USER_POOL_ID${NC}"
echo "  Client ID: ${CYAN}$USER_POOL_CLIENT_ID${NC}"
echo "  CloudFront ID: ${CYAN}$CLOUDFRONT_ID${NC}"
echo "  S3 Bucket: ${CYAN}$S3_BUCKET_NAME${NC}"
echo "  Frontend URL: ${CYAN}$FRONTEND_URL${NC}"

if [ "$ENVIRONMENT" = "production" ]; then
    echo ""
    echo "🌐 Production URLs:"
    echo "  Frontend: ${CYAN}https://app.ordernimbus.com${NC}"
    echo "  API: ${CYAN}https://api.ordernimbus.com${NC}"
fi

echo ""
echo "📝 Configuration Updated:"
echo "  Static config file: ${YELLOW}$CONFIG_FILE${NC}"
echo "  Backup saved to: ${YELLOW}$CONFIG_BACKUP${NC}"

echo ""
echo "🚀 Next Steps:"
echo "  1. Deploy application infrastructure:"
echo "     ${GREEN}./deploy.sh $ENVIRONMENT $AWS_REGION${NC}"
echo ""
echo "  2. Or run full deployment (application + frontend):"
echo "     ${GREEN}./deploy.sh $ENVIRONMENT $AWS_REGION${NC}"
echo ""

if [ "$ENVIRONMENT" = "production" ]; then
    echo "  3. Update Shopify app configuration:"
    echo "     Redirect URI: ${CYAN}https://api.ordernimbus.com/api/shopify/callback${NC}"
    echo ""
fi

echo "✅ Immutable infrastructure is now deployed and ready for application deployments"

################################################################################
# VALIDATION TESTS
################################################################################
print_header "Running Validation Tests"

TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: CloudFront accessibility
if [ -n "$FRONTEND_URL" ]; then
    print_status "Testing CloudFront distribution..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" --max-time 10)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "403" ]; then  # 403 is expected for empty bucket
        print_success "CloudFront distribution is accessible (HTTP $HTTP_CODE)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_warning "CloudFront distribution test failed (HTTP $HTTP_CODE) - may still be deploying"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
fi

# Test 2: S3 bucket accessibility
if [ -n "$S3_BUCKET_NAME" ]; then
    print_status "Testing S3 bucket..."
    if aws s3 ls "s3://$S3_BUCKET_NAME/" --region "$AWS_REGION" > /dev/null 2>&1; then
        print_success "S3 bucket is accessible"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_warning "S3 bucket is not accessible"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
fi

# Test 3: Cognito User Pool
if [ -n "$USER_POOL_ID" ]; then
    print_status "Testing Cognito User Pool..."
    POOL_STATUS=$(aws cognito-idp describe-user-pool \
        --user-pool-id "$USER_POOL_ID" \
        --region "$AWS_REGION" \
        --query 'UserPool.Status' \
        --output text 2>/dev/null || echo "Unknown")
    
    if [ "$POOL_STATUS" = "Enabled" ]; then
        print_success "Cognito User Pool is enabled"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_warning "Cognito User Pool status: $POOL_STATUS"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
fi

# Test 4: DNS resolution (for production)
if [ "$ENVIRONMENT" = "production" ]; then
    print_status "Testing DNS resolution..."
    DNS_RESULT=$(nslookup app.ordernimbus.com 8.8.8.8 2>/dev/null | grep -A 1 "Name:" | grep "Address:" | head -1)
    if [ -n "$DNS_RESULT" ]; then
        print_success "DNS is resolving for app.ordernimbus.com"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_warning "DNS may still be propagating (can take up to 48 hours)"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Validation Results: ${GREEN}$TESTS_PASSED passed${NC}, ${RED}$TESTS_FAILED failed${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $TESTS_FAILED -gt 0 ]; then
    echo ""
    print_warning "Some validation tests failed. This is normal for initial deployments."
    echo "Common reasons:"
    echo "  • CloudFront: Takes 15-20 minutes to fully deploy"
    echo "  • DNS: Can take up to 48 hours to propagate globally"
    echo "  • SSL: May need manual DNS validation in some cases"
fi

echo ""
print_success "Immutable infrastructure deployment completed successfully!"

################################################################################
# SAVE DEPLOYMENT INFO
################################################################################
# Save deployment info for application stack reference
DEPLOYMENT_INFO_FILE="/tmp/ordernimbus-immutable-${ENVIRONMENT}.json"
cat > "$DEPLOYMENT_INFO_FILE" << EOF
{
  "stackName": "$STACK_NAME",
  "environment": "$ENVIRONMENT",
  "region": "$AWS_REGION",
  "deployedAt": "$(date -Iseconds)",
  "outputs": {
    "userPoolId": "$USER_POOL_ID",
    "userPoolClientId": "$USER_POOL_CLIENT_ID",
    "cloudfrontDistributionId": "$CLOUDFRONT_ID",
    "s3BucketName": "$S3_BUCKET_NAME",
    "frontendUrl": "$FRONTEND_URL",
    "frontendDomain": "$FRONTEND_DOMAIN"
  }
}
EOF

print_status "Deployment info saved to: $DEPLOYMENT_INFO_FILE"
echo ""
print_success "Ready for application infrastructure deployment!"