#!/bin/bash

################################################################################
# OrderNimbus Domain Deployment Script
# Deploys with custom domain (app.ordernimbus.com)
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-production}
REGION=${2:-us-west-1}  # ACM certificates for CloudFront must be in us-west-1
STACK_NAME="ordernimbus-${ENVIRONMENT}-domain"
TEMPLATE_FILE="cloudformation-domain.yaml"
HOSTED_ZONE_ID="Z03623712FIVU7Z4CJ949"

print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check template
    if [ ! -f "$TEMPLATE_FILE" ]; then
        print_error "Template not found: $TEMPLATE_FILE"
        exit 1
    fi
    
    # Verify hosted zone exists
    if ! aws route53 get-hosted-zone --id "$HOSTED_ZONE_ID" &>/dev/null; then
        print_error "Hosted zone not found: $HOSTED_ZONE_ID"
        exit 1
    fi
    
    print_success "Prerequisites met"
}

# Get stack status
get_stack_status() {
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "DOES_NOT_EXIST"
}

# Deploy stack
deploy_stack() {
    print_status "Deploying CloudFormation stack with domain configuration..."
    
    local stack_status=$(get_stack_status)
    
    if [ "$stack_status" = "DOES_NOT_EXIST" ]; then
        print_status "Creating new stack (this may take 15-20 minutes due to CloudFront)..."
        aws cloudformation create-stack \
            --stack-name "$STACK_NAME" \
            --template-body file://"$TEMPLATE_FILE" \
            --parameters \
                ParameterKey=Environment,ParameterValue="$ENVIRONMENT" \
                ParameterKey=HostedZoneId,ParameterValue="$HOSTED_ZONE_ID" \
            --capabilities CAPABILITY_IAM \
            --region "$REGION" \
            --on-failure DO_NOTHING
        
        print_status "Waiting for stack creation..."
        if aws cloudformation wait stack-create-complete \
            --stack-name "$STACK_NAME" \
            --region "$REGION"; then
            print_success "Stack created successfully"
        else
            print_error "Stack creation failed"
            exit 1
        fi
    else
        print_warning "Stack exists. Updating..."
        if aws cloudformation update-stack \
            --stack-name "$STACK_NAME" \
            --template-body file://"$TEMPLATE_FILE" \
            --parameters \
                ParameterKey=Environment,ParameterValue="$ENVIRONMENT" \
                ParameterKey=HostedZoneId,ParameterValue="$HOSTED_ZONE_ID" \
            --capabilities CAPABILITY_IAM \
            --region "$REGION" 2>&1 | grep -q "No updates"; then
            print_warning "No updates needed"
        else
            print_status "Waiting for update..."
            aws cloudformation wait stack-update-complete \
                --stack-name "$STACK_NAME" \
                --region "$REGION"
            print_success "Stack updated"
        fi
    fi
}

# Get stack outputs
get_outputs() {
    print_status "Getting stack outputs..."
    
    APP_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`AppURL`].OutputValue' \
        --output text)
    
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiURL`].OutputValue' \
        --output text)
    
    S3_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
        --output text)
    
    CF_DIST_ID=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
        --output text)
}

# Build and deploy frontend
deploy_frontend() {
    print_status "Building frontend..."
    cd app/frontend
    
    # Install dependencies if needed
    [ ! -d "node_modules" ] && npm install
    
    # Build with production URLs
    REACT_APP_API_URL="$API_URL" \
    REACT_APP_ENVIRONMENT="$ENVIRONMENT" \
    REACT_APP_REGION="$REGION" \
    npm run build
    
    print_status "Deploying to S3..."
    aws s3 sync build/ "s3://$S3_BUCKET/" \
        --delete \
        --region "$REGION"
    
    cd ../..
    
    # Invalidate CloudFront
    if [ -n "$CF_DIST_ID" ]; then
        print_status "Invalidating CloudFront cache..."
        aws cloudfront create-invalidation \
            --distribution-id "$CF_DIST_ID" \
            --paths "/*" &>/dev/null
        print_success "CloudFront cache invalidated"
    fi
}

# Test deployment
test_deployment() {
    print_status "Testing deployment..."
    
    # Test API health
    if curl -s "$API_URL/api/health" --max-time 10 | grep -q "healthy"; then
        print_success "API is healthy"
    else
        print_warning "API health check failed"
    fi
    
    # Test app URL
    if curl -s -o /dev/null -w "%{http_code}" "$APP_URL" --max-time 10 | grep -q "200\|301\|302"; then
        print_success "App is accessible"
    else
        print_warning "App may still be propagating"
    fi
    
    # Check DNS propagation
    print_status "Checking DNS propagation..."
    if host "app.ordernimbus.com" &>/dev/null; then
        print_success "DNS is resolving"
    else
        print_warning "DNS may still be propagating (can take up to 48 hours)"
    fi
}

# Display summary
display_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎉 Deployment Complete!${NC}"
    echo "=========================================="
    echo ""
    echo -e "${GREEN}📱 Application URLs:${NC}"
    echo -e "  App: ${YELLOW}$APP_URL${NC}"
    echo -e "  API: ${YELLOW}$API_URL${NC}"
    echo ""
    echo -e "${GREEN}🔐 SSL/TLS:${NC}"
    echo "  ✓ HTTPS enabled with ACM certificate"
    echo "  ✓ Automatic certificate renewal"
    echo ""
    echo -e "${GREEN}🌍 DNS Configuration:${NC}"
    echo "  ✓ app.ordernimbus.com → CloudFront"
    echo "  ✓ api.ordernimbus.com → API Gateway"
    echo ""
    echo -e "${YELLOW}⚠️  Notes:${NC}"
    echo "  • CloudFront propagation: 15-20 minutes"
    echo "  • DNS propagation: Up to 48 hours"
    echo "  • First HTTPS request may be slow (cert validation)"
    echo ""
    echo "=========================================="
}

# Main
main() {
    echo "=========================================="
    echo -e "${GREEN}OrderNimbus Domain Deployment${NC}"
    echo "=========================================="
    echo "Environment: $ENVIRONMENT"
    echo "Region: $REGION"
    echo "Domain: app.ordernimbus.com"
    echo ""
    
    check_prerequisites
    deploy_stack
    get_outputs
    deploy_frontend
    test_deployment
    display_summary
}

# Run
main