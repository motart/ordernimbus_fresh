#!/bin/bash

################################################################################
# Frontend Deployment Script with Configuration Management
# NO HARDCODING - All values from .env files or command line
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Helper functions
print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; exit 1; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Parse arguments
ENVIRONMENT="${1:-production}"
SKIP_BUILD="${2:-false}"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(local|development|staging|production)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT. Use: local, development, staging, or production"
fi

print_status "Deploying frontend for environment: $ENVIRONMENT"

# Load environment file
ENV_FILE=".env.${ENVIRONMENT}"
if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "development" ]; then
    ENV_FILE=".env.local"
fi

if [ ! -f "$ENV_FILE" ]; then
    print_warning "Environment file $ENV_FILE not found, checking for .env"
    if [ -f ".env" ]; then
        ENV_FILE=".env"
    else
        print_error "No environment file found. Create $ENV_FILE from .env.example"
    fi
fi

print_status "Loading configuration from $ENV_FILE"

# Export all variables from .env file
set -a
source "$ENV_FILE"
set +a

# Validate required variables
if [ -z "$REACT_APP_API_URL" ]; then
    print_error "REACT_APP_API_URL not set in $ENV_FILE"
fi

if [ -z "$REACT_APP_USER_POOL_ID" ] || [ -z "$REACT_APP_CLIENT_ID" ]; then
    print_error "Cognito configuration missing in $ENV_FILE"
fi

# Display configuration (without sensitive data)
echo ""
echo "Configuration:"
echo "  App URL: ${REACT_APP_APP_URL:-'(using default)'}"
echo "  API URL: $REACT_APP_API_URL"
echo "  GraphQL: ${REACT_APP_GRAPHQL_URL:-'(will use API_URL/graphql)'}"
echo "  Environment: $REACT_APP_ENVIRONMENT"
echo "  Region: $REACT_APP_REGION"
echo "  Debug Mode: ${REACT_APP_ENABLE_DEBUG:-false}"
echo ""

# Build the application
if [ "$SKIP_BUILD" != "true" ]; then
    print_status "Building React application..."
    
    # Add build timestamp
    export REACT_APP_BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Build with the loaded environment
    npm run build || print_error "Build failed"
    
    print_success "Build completed"
else
    print_warning "Skipping build (using existing build directory)"
fi

# Deployment based on environment
if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "development" ]; then
    print_status "Starting local development server..."
    npm start
    
elif [ "$ENVIRONMENT" = "production" ] || [ "$ENVIRONMENT" = "staging" ]; then
    # Deploy to AWS S3
    
    # Get S3 bucket from CloudFormation or environment
    if [ -z "$S3_BUCKET" ]; then
        print_status "Getting S3 bucket from CloudFormation..."
        STACK_NAME="ordernimbus-${ENVIRONMENT}"
        S3_BUCKET=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "${REACT_APP_REGION:-us-west-1}" \
            --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
            --output text 2>/dev/null)
        
        if [ -z "$S3_BUCKET" ]; then
            print_error "Could not find S3 bucket. Set S3_BUCKET in $ENV_FILE or deploy stack first"
        fi
    fi
    
    print_status "Deploying to S3 bucket: $S3_BUCKET"
    
    # Sync static files
    aws s3 sync build/ "s3://$S3_BUCKET/" \
        --delete \
        --region "${REACT_APP_REGION:-us-west-1}" \
        --cache-control "public, max-age=31536000" \
        --exclude "index.html" \
        --exclude "*.json" \
        --exclude ".env*"
    
    # Upload HTML and JSON with no-cache headers
    aws s3 cp build/index.html "s3://$S3_BUCKET/" \
        --region "${REACT_APP_REGION:-us-west-1}" \
        --cache-control "no-cache, no-store, must-revalidate" \
        --content-type "text/html"
    
    aws s3 cp build/ "s3://$S3_BUCKET/" \
        --recursive \
        --region "${REACT_APP_REGION:-us-west-1}" \
        --exclude "*" \
        --include "*.json" \
        --exclude ".env*" \
        --cache-control "no-cache, no-store, must-revalidate" \
        --content-type "application/json"
    
    print_success "Deployed to S3"
    
    # Invalidate CloudFront if configured
    if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
        print_status "Invalidating CloudFront cache..."
        aws cloudfront create-invalidation \
            --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
            --paths "/*" \
            --region "${REACT_APP_REGION:-us-west-1}" > /dev/null
        print_success "CloudFront cache invalidated"
    fi
    
    # Display access URLs
    echo ""
    echo "Deployment Complete!"
    echo "===================="
    
    if [ -n "$REACT_APP_APP_URL" ]; then
        echo "Application URL: $REACT_APP_APP_URL"
    elif [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
        CLOUDFRONT_URL=$(aws cloudfront get-distribution \
            --id "$CLOUDFRONT_DISTRIBUTION_ID" \
            --query 'Distribution.DomainName' \
            --output text 2>/dev/null)
        echo "CloudFront URL: https://$CLOUDFRONT_URL"
    else
        echo "S3 Website: http://$S3_BUCKET.s3-website-${REACT_APP_REGION:-us-west-1}.amazonaws.com"
    fi
    
    echo "API Endpoint: $REACT_APP_API_URL"
    if [ -n "$REACT_APP_GRAPHQL_URL" ]; then
        echo "GraphQL Endpoint: $REACT_APP_GRAPHQL_URL"
    fi
fi

print_success "Deployment script completed!"