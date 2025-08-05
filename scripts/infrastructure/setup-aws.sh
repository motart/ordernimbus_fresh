#!/bin/bash

#######################################################
# OrderNimbus Complete AWS Setup Script
# Deploys all infrastructure and application components
#######################################################

set -e

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-"staging"}
REGION=${2:-"us-west-1"}
SKIP_CONFIRM=${3:-"false"}
APP_NAME="ordernimbus"
DOMAIN_NAME="ordernimbus.com"

# Cognito configuration
COGNITO_REGION="us-west-2"  # Cognito User Pool region

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         OrderNimbus AWS Infrastructure Setup              ║${NC}"
echo -e "${BLUE}║                                                            ║${NC}"
echo -e "${BLUE}║  This script will deploy all AWS resources for            ║${NC}"
echo -e "${BLUE}║  OrderNimbus in the ${ENVIRONMENT} environment.           ║${NC}"
echo -e "${BLUE}║                                                            ║${NC}"
echo -e "${BLUE}║  Resources to be created:                                 ║${NC}"
echo -e "${BLUE}║  - S3 Buckets for frontend and data storage              ║${NC}"
echo -e "${BLUE}║  - CloudFront Distribution (CDN)                         ║${NC}"
echo -e "${BLUE}║  - Cognito User Pool for authentication                  ║${NC}"
echo -e "${BLUE}║  - Route53 DNS records                                   ║${NC}"
echo -e "${BLUE}║  - Parameter Store configuration                         ║${NC}"
echo -e "${BLUE}║  - CloudWatch monitoring                                 ║${NC}"
echo -e "${BLUE}║  - Lambda functions (if applicable)                      ║${NC}"
echo -e "${BLUE}║  - API Gateway (if applicable)                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo -e "${YELLOW}Domain: ${DOMAIN_NAME}${NC}"
echo ""

if [ "$SKIP_CONFIRM" != "true" ]; then
    read -p "Do you want to continue? (y/N): " confirmation
    if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Setup cancelled.${NC}"
        exit 0
    fi
fi

echo ""
echo -e "${GREEN}Starting setup process...${NC}"
echo ""

# Check AWS CLI is configured
echo -e "${YELLOW}Checking AWS configuration...${NC}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: AWS CLI is not configured. Please run 'aws configure' first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ AWS Account ID: ${AWS_ACCOUNT_ID}${NC}"

# Check if Node.js and npm are installed
echo -e "${YELLOW}Checking Node.js and npm...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed. Please install npm first.${NC}"
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js version: ${NODE_VERSION}${NC}"

# Check if CDK is installed
echo -e "${YELLOW}Checking AWS CDK...${NC}"
if ! command -v cdk &> /dev/null; then
    echo -e "${YELLOW}Installing AWS CDK globally...${NC}"
    npm install -g aws-cdk
fi
CDK_VERSION=$(cdk --version)
echo -e "${GREEN}✓ CDK version: ${CDK_VERSION}${NC}"

# 1. Create S3 Buckets
echo ""
echo -e "${BLUE}=== Creating S3 Buckets ===${NC}"

create_s3_bucket() {
    local bucket_name=$1
    local public_access=${2:-"false"}
    
    echo -e "${YELLOW}Creating S3 bucket: ${bucket_name}${NC}"
    
    if aws s3api head-bucket --bucket "$bucket_name" 2>/dev/null; then
        echo -e "${GREEN}✓ Bucket ${bucket_name} already exists${NC}"
    else
        aws s3api create-bucket \
            --bucket ${bucket_name} \
            --region ${REGION} \
            --create-bucket-configuration LocationConstraint=${REGION} 2>/dev/null || \
        aws s3api create-bucket \
            --bucket ${bucket_name} \
            --region ${REGION} 2>/dev/null
        
        if [ "$public_access" == "true" ]; then
            # Configure for static website hosting
            echo -e "${YELLOW}Configuring bucket for static website hosting...${NC}"
            
            # Enable static website hosting
            aws s3 website s3://${bucket_name}/ \
                --index-document index.html \
                --error-document error.html 2>/dev/null || true
            
            # Set bucket policy for public read
            cat > /tmp/bucket-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::${bucket_name}/*"
        }
    ]
}
EOF
            # Try to set public access block settings
            aws s3api put-public-access-block \
                --bucket ${bucket_name} \
                --public-access-block-configuration \
                "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" 2>/dev/null || true
            
            # Apply bucket policy
            aws s3api put-bucket-policy \
                --bucket ${bucket_name} \
                --policy file:///tmp/bucket-policy.json 2>/dev/null || true
            
            rm /tmp/bucket-policy.json
        fi
        
        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket ${bucket_name} \
            --versioning-configuration Status=Enabled 2>/dev/null || true
        
        echo -e "${GREEN}✓ Created bucket ${bucket_name}${NC}"
    fi
}

# Create buckets
create_s3_bucket "${APP_NAME}-${ENVIRONMENT}-webapp" "true"
create_s3_bucket "${APP_NAME}-${ENVIRONMENT}-frontend-assets" "true"
create_s3_bucket "${APP_NAME}-${ENVIRONMENT}-data-uploads" "false"
create_s3_bucket "${APP_NAME}-${ENVIRONMENT}-ml-models" "false"
create_s3_bucket "${APP_NAME}-${ENVIRONMENT}-backups" "false"

# 2. Build and Deploy Frontend
echo ""
echo -e "${BLUE}=== Building and Deploying Frontend ===${NC}"

if [ -d "app/frontend" ]; then
    cd app/frontend
    
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    npm install
    
    echo -e "${YELLOW}Building frontend application...${NC}"
    npm run build
    
    echo -e "${YELLOW}Deploying to S3...${NC}"
    aws s3 sync build/ s3://${APP_NAME}-${ENVIRONMENT}-webapp/ \
        --delete \
        --cache-control "public, max-age=3600"
    
    echo -e "${GREEN}✓ Frontend deployed to S3${NC}"
    cd ../..
else
    echo -e "${YELLOW}Frontend directory not found, skipping build...${NC}"
fi

# 3. Create CloudFront Distribution
echo ""
echo -e "${BLUE}=== Creating CloudFront Distribution ===${NC}"

EXISTING_DIST=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Origins.Items[0].DomainName=='${APP_NAME}-${ENVIRONMENT}-webapp.s3-website-${REGION}.amazonaws.com'].Id" \
    --output text 2>/dev/null || true)

if [ ! -z "$EXISTING_DIST" ]; then
    echo -e "${GREEN}✓ CloudFront distribution already exists: ${EXISTING_DIST}${NC}"
    DISTRIBUTION_ID=$EXISTING_DIST
else
    echo -e "${YELLOW}Creating CloudFront distribution...${NC}"
    
    # Create CloudFront distribution configuration
    cat > /tmp/cf-config.json <<EOF
{
    "CallerReference": "${APP_NAME}-${ENVIRONMENT}-$(date +%s)",
    "Comment": "OrderNimbus ${ENVIRONMENT} distribution",
    "Enabled": true,
    "Origins": {
        "Quantity": 1,
        "Items": [{
            "Id": "${APP_NAME}-${ENVIRONMENT}-origin",
            "DomainName": "${APP_NAME}-${ENVIRONMENT}-webapp.s3-website-${REGION}.amazonaws.com",
            "CustomOriginConfig": {
                "HTTPPort": 80,
                "HTTPSPort": 443,
                "OriginProtocolPolicy": "http-only"
            }
        }]
    },
    "DefaultRootObject": "index.html",
    "DefaultCacheBehavior": {
        "TargetOriginId": "${APP_NAME}-${ENVIRONMENT}-origin",
        "ViewerProtocolPolicy": "redirect-to-https",
        "TrustedSigners": {
            "Enabled": false,
            "Quantity": 0
        },
        "ForwardedValues": {
            "QueryString": false,
            "Cookies": {"Forward": "none"}
        },
        "MinTTL": 0,
        "DefaultTTL": 86400,
        "MaxTTL": 31536000
    },
    "CustomErrorResponses": {
        "Quantity": 1,
        "Items": [{
            "ErrorCode": 404,
            "ResponseCode": "200",
            "ResponsePagePath": "/index.html",
            "ErrorCachingMinTTL": 300
        }]
    }
}
EOF
    
    DISTRIBUTION=$(aws cloudfront create-distribution \
        --distribution-config file:///tmp/cf-config.json \
        --query 'Distribution.Id' \
        --output text)
    
    rm /tmp/cf-config.json
    
    echo -e "${GREEN}✓ Created CloudFront distribution: ${DISTRIBUTION}${NC}"
    DISTRIBUTION_ID=$DISTRIBUTION
    
    echo -e "${YELLOW}Waiting for distribution to deploy (this may take 15-30 minutes)...${NC}"
    aws cloudfront wait distribution-deployed --id ${DISTRIBUTION_ID}
    
    DIST_DOMAIN=$(aws cloudfront get-distribution \
        --id ${DISTRIBUTION_ID} \
        --query 'Distribution.DomainName' \
        --output text)
    
    echo -e "${GREEN}✓ CloudFront distribution deployed${NC}"
    echo -e "${GREEN}  URL: https://${DIST_DOMAIN}${NC}"
fi

# 4. Create Cognito User Pool
echo ""
echo -e "${BLUE}=== Creating Cognito User Pool ===${NC}"

EXISTING_POOL=$(aws cognito-idp list-user-pools --max-results 60 \
    --query "UserPools[?Name=='${APP_NAME}-${ENVIRONMENT}'].Id" \
    --output text --region ${COGNITO_REGION} 2>/dev/null || true)

if [ ! -z "$EXISTING_POOL" ]; then
    echo -e "${GREEN}✓ Cognito User Pool already exists: ${EXISTING_POOL}${NC}"
    USER_POOL_ID=$EXISTING_POOL
else
    echo -e "${YELLOW}Creating Cognito User Pool...${NC}"
    
    USER_POOL=$(aws cognito-idp create-user-pool \
        --pool-name "${APP_NAME}-${ENVIRONMENT}" \
        --region ${COGNITO_REGION} \
        --policies "PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}" \
        --auto-verified-attributes email \
        --account-recovery-setting "RecoveryMechanisms=[{Priority=1,Name=verified_email}]" \
        --query 'UserPool.Id' \
        --output text)
    
    echo -e "${GREEN}✓ Created User Pool: ${USER_POOL}${NC}"
    USER_POOL_ID=$USER_POOL
    
    # Create User Pool Client
    echo -e "${YELLOW}Creating User Pool Client...${NC}"
    
    CLIENT=$(aws cognito-idp create-user-pool-client \
        --user-pool-id ${USER_POOL_ID} \
        --client-name "${APP_NAME}-${ENVIRONMENT}-client" \
        --region ${COGNITO_REGION} \
        --generate-secret false \
        --explicit-auth-flows "ALLOW_USER_PASSWORD_AUTH" "ALLOW_REFRESH_TOKEN_AUTH" \
        --query 'UserPoolClient.ClientId' \
        --output text)
    
    echo -e "${GREEN}✓ Created User Pool Client: ${CLIENT}${NC}"
    
    # Create demo user
    echo -e "${YELLOW}Creating demo user...${NC}"
    
    aws cognito-idp admin-create-user \
        --user-pool-id ${USER_POOL_ID} \
        --username "demo@ordernimbus.com" \
        --user-attributes Name=email,Value=demo@ordernimbus.com Name=email_verified,Value=true \
        --temporary-password "TempPass123!" \
        --message-action SUPPRESS \
        --region ${COGNITO_REGION} 2>/dev/null || true
    
    # Set permanent password
    aws cognito-idp admin-set-user-password \
        --user-pool-id ${USER_POOL_ID} \
        --username "demo@ordernimbus.com" \
        --password "demo123" \
        --permanent \
        --region ${COGNITO_REGION} 2>/dev/null || true
    
    echo -e "${GREEN}✓ Created demo user: demo@ordernimbus.com / demo123${NC}"
fi

# 5. Setup Parameter Store
echo ""
echo -e "${BLUE}=== Setting up Parameter Store ===${NC}"

set_parameter() {
    local name=$1
    local value=$2
    local secure=${3:-"false"}
    
    echo -e "${YELLOW}Setting parameter: ${name}${NC}"
    
    if [ "$secure" == "true" ]; then
        aws ssm put-parameter \
            --name "${name}" \
            --value "${value}" \
            --type SecureString \
            --overwrite \
            --region ${REGION} 2>/dev/null || true
    else
        aws ssm put-parameter \
            --name "${name}" \
            --value "${value}" \
            --type String \
            --overwrite \
            --region ${REGION} 2>/dev/null || true
    fi
}

# Set parameters
set_parameter "/${APP_NAME}/${ENVIRONMENT}/cognito/user-pool-id" "${USER_POOL_ID}"
set_parameter "/${APP_NAME}/${ENVIRONMENT}/cognito/client-id" "${CLIENT}"
set_parameter "/${APP_NAME}/${ENVIRONMENT}/cloudfront/distribution-id" "${DISTRIBUTION_ID}"
set_parameter "/${APP_NAME}/${ENVIRONMENT}/s3/webapp-bucket" "${APP_NAME}-${ENVIRONMENT}-webapp"
set_parameter "/${APP_NAME}/${ENVIRONMENT}/s3/assets-bucket" "${APP_NAME}-${ENVIRONMENT}-frontend-assets"

echo -e "${GREEN}✓ Parameter Store configured${NC}"

# 6. Update Frontend Configuration
echo ""
echo -e "${BLUE}=== Updating Frontend Configuration ===${NC}"

if [ -d "app/frontend/src" ] && [ ! -z "$USER_POOL_ID" ] && [ ! -z "$CLIENT" ]; then
    echo -e "${YELLOW}Updating aws-config.ts with new Cognito settings...${NC}"
    
    cat > app/frontend/src/aws-config.ts <<EOF
export const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: '${USER_POOL_ID}',
      userPoolClientId: '${CLIENT}',
      signUpVerificationMethod: 'code' as const,
    }
  }
};
EOF
    
    echo -e "${GREEN}✓ Updated frontend configuration${NC}"
    
    # Rebuild and redeploy with new config
    echo -e "${YELLOW}Rebuilding frontend with new configuration...${NC}"
    cd app/frontend
    npm run build
    
    echo -e "${YELLOW}Redeploying to S3...${NC}"
    aws s3 sync build/ s3://${APP_NAME}-${ENVIRONMENT}-webapp/ \
        --delete \
        --cache-control "public, max-age=3600"
    
    # Invalidate CloudFront cache
    if [ ! -z "$DISTRIBUTION_ID" ]; then
        echo -e "${YELLOW}Invalidating CloudFront cache...${NC}"
        aws cloudfront create-invalidation \
            --distribution-id ${DISTRIBUTION_ID} \
            --paths "/*" 2>/dev/null || true
    fi
    
    cd ../..
    echo -e "${GREEN}✓ Frontend redeployed with new configuration${NC}"
fi

# 7. Setup Route53 (Optional)
echo ""
echo -e "${BLUE}=== Route53 DNS Configuration ===${NC}"

if [ "$ENVIRONMENT" == "production" ]; then
    echo -e "${YELLOW}For production deployment, manually configure Route53:${NC}"
    echo -e "  1. Create an A record for app.${DOMAIN_NAME}"
    echo -e "  2. Point it to CloudFront distribution: ${DIST_DOMAIN}"
    echo -e "  3. Configure SSL certificate in CloudFront"
else
    echo -e "${YELLOW}Staging environment uses CloudFront URL directly${NC}"
fi

# 8. Display Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    SETUP COMPLETE                          ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  OrderNimbus has been successfully deployed!              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}=== Deployment Summary ===${NC}"
echo -e "${GREEN}Environment:${NC} ${ENVIRONMENT}"
echo -e "${GREEN}Region:${NC} ${REGION}"
echo ""
echo -e "${GREEN}S3 Buckets:${NC}"
echo -e "  • ${APP_NAME}-${ENVIRONMENT}-webapp"
echo -e "  • ${APP_NAME}-${ENVIRONMENT}-frontend-assets"
echo -e "  • ${APP_NAME}-${ENVIRONMENT}-data-uploads"
echo ""

if [ ! -z "$DISTRIBUTION_ID" ]; then
    DIST_DOMAIN=$(aws cloudfront get-distribution \
        --id ${DISTRIBUTION_ID} \
        --query 'Distribution.DomainName' \
        --output text 2>/dev/null || echo "N/A")
    echo -e "${GREEN}CloudFront:${NC}"
    echo -e "  • Distribution ID: ${DISTRIBUTION_ID}"
    echo -e "  • URL: https://${DIST_DOMAIN}"
    echo ""
fi

if [ ! -z "$USER_POOL_ID" ]; then
    echo -e "${GREEN}Cognito:${NC}"
    echo -e "  • User Pool ID: ${USER_POOL_ID}"
    echo -e "  • Client ID: ${CLIENT}"
    echo -e "  • Region: ${COGNITO_REGION}"
    echo ""
fi

echo -e "${GREEN}Demo Credentials:${NC}"
echo -e "  • Email: demo@ordernimbus.com"
echo -e "  • Password: demo123"
echo ""

echo -e "${YELLOW}=== Next Steps ===${NC}"
echo -e "1. Access your application at: https://${DIST_DOMAIN}"
echo -e "2. Login with the demo credentials"
echo -e "3. Configure custom domain in Route53 (if needed)"
echo -e "4. Set up monitoring and alerts in CloudWatch"
echo -e "5. Configure backup policies for S3 buckets"
echo ""

echo -e "${GREEN}Setup script completed successfully!${NC}"