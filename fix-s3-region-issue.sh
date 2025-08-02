#!/bin/bash

# Quick fix for S3 region constraint issue
# This script helps diagnose and fix S3 bucket creation problems

set -e

# Configuration
ENVIRONMENT=${1:-staging}
AWS_REGION=${2:-us-east-1}
STACK_PREFIX="ordernimbus"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

echo -e "${BLUE}🔧 S3 Region Issue Diagnostic and Fix${NC}"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo "=========================================="

# Check AWS CLI configuration
print_info "Checking AWS CLI configuration..."
CURRENT_REGION=$(aws configure get region)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "  - Account ID: $ACCOUNT_ID"
echo "  - Configured Region: ${CURRENT_REGION:-'Not set'}"
echo "  - Target Region: $AWS_REGION"

if [ "$CURRENT_REGION" != "$AWS_REGION" ] && [ -n "$CURRENT_REGION" ]; then
    print_warning "AWS CLI default region ($CURRENT_REGION) differs from target region ($AWS_REGION)"
    print_info "This is OK - we'll use --region parameter explicitly"
fi

# Test S3 bucket creation with proper region handling
print_info "Testing S3 bucket creation logic..."

TEST_BUCKET_NAME="test-s3-region-fix-$(date +%s)"

echo "  - Testing bucket creation in region: $AWS_REGION"

if [ "$AWS_REGION" = "us-east-1" ]; then
    print_info "Using us-east-1 specific logic (no LocationConstraint)"
    
    # Test command for us-east-1
    aws s3api create-bucket \
        --bucket "$TEST_BUCKET_NAME" \
        --region "$AWS_REGION" && {
            print_status "Successfully created test bucket in us-east-1"
            
            # Clean up test bucket
            aws s3api delete-bucket --bucket "$TEST_BUCKET_NAME" --region "$AWS_REGION"
            print_status "Cleaned up test bucket"
        } || {
            print_error "Failed to create test bucket in us-east-1"
            exit 1
        }
else
    print_info "Using non-us-east-1 logic (with LocationConstraint)"
    
    # Test command for other regions
    aws s3api create-bucket \
        --bucket "$TEST_BUCKET_NAME" \
        --region "$AWS_REGION" \
        --create-bucket-configuration LocationConstraint="$AWS_REGION" && {
            print_status "Successfully created test bucket in $AWS_REGION"
            
            # Clean up test bucket
            aws s3api delete-bucket --bucket "$TEST_BUCKET_NAME" --region "$AWS_REGION"
            print_status "Cleaned up test bucket"
        } || {
            print_error "Failed to create test bucket in $AWS_REGION"
            exit 1
        }
fi

# Now try to create the actual project buckets
print_info "Creating project S3 buckets with fixed logic..."

BUCKETS=(
    "$STACK_PREFIX-$ENVIRONMENT-frontend-assets"
    "$STACK_PREFIX-$ENVIRONMENT-data-lake"
    "$STACK_PREFIX-$ENVIRONMENT-ml-artifacts"
    "$STACK_PREFIX-$ENVIRONMENT-backups"
    "$STACK_PREFIX-$ENVIRONMENT-logs"
)

for bucket_name in "${BUCKETS[@]}"; do
    if aws s3api head-bucket --bucket "$bucket_name" --region "$AWS_REGION" 2>/dev/null; then
        print_warning "Bucket $bucket_name already exists, skipping"
    else
        print_info "Creating bucket: $bucket_name"
        
        if [ "$AWS_REGION" = "us-east-1" ]; then
            aws s3api create-bucket \
                --bucket "$bucket_name" \
                --region "$AWS_REGION" || {
                    print_error "Failed to create bucket: $bucket_name"
                    exit 1
                }
        else
            aws s3api create-bucket \
                --bucket "$bucket_name" \
                --region "$AWS_REGION" \
                --create-bucket-configuration LocationConstraint="$AWS_REGION" || {
                    print_error "Failed to create bucket: $bucket_name"
                    exit 1
                }
        fi
        
        print_status "Created bucket: $bucket_name"
        
        # Configure bucket
        print_info "Configuring bucket: $bucket_name"
        
        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "$bucket_name" \
            --versioning-configuration Status=Enabled \
            --region "$AWS_REGION"
        
        # Enable encryption
        aws s3api put-bucket-encryption \
            --bucket "$bucket_name" \
            --region "$AWS_REGION" \
            --server-side-encryption-configuration '{
                "Rules": [
                    {
                        "ApplyServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "AES256"
                        }
                    }
                ]
            }'
        
        # Block public access for non-website buckets
        if [[ "$bucket_name" != *"frontend-assets"* ]]; then
            aws s3api put-public-access-block \
                --bucket "$bucket_name" \
                --region "$AWS_REGION" \
                --public-access-block-configuration \
                BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
        fi
        
        print_status "Configured bucket: $bucket_name"
    fi
done

echo ""
echo "=========================================="
print_status "S3 bucket creation completed successfully!"
echo "=========================================="

print_info "Next steps:"
echo "  1. The S3 buckets are now created and configured"
echo "  2. You can now run the deployment script again:"
echo "     ./deploy-with-rollback.sh $ENVIRONMENT $AWS_REGION"
echo "  3. Or continue with CDK deployment:"
echo "     npm run cdk:deploy"

print_info "Buckets created:"
for bucket_name in "${BUCKETS[@]}"; do
    echo "  - s3://$bucket_name"
done