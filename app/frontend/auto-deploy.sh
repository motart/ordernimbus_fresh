#!/bin/bash

# Auto-deploy script for OrderNimbus frontend
# This script builds and deploys the frontend to AWS S3 automatically
# Supports different environments: staging, production

set -e

# Parse environment argument
ENVIRONMENT=${1:-staging}
AWS_REGION=${2:-us-west-1}

echo "🚀 Starting automated frontend deployment for $ENVIRONMENT environment..."

# Set AWS region
export AWS_DEFAULT_REGION=$AWS_REGION

# Determine S3 bucket and build environment
case $ENVIRONMENT in
  "production")
    S3_BUCKET="ordernimbus-production-frontend-assets"
    BUILD_ENV="production"
    FRONTEND_URL="https://app.ordernimbus.com"
    ;;
  "staging")
    S3_BUCKET="ordernimbus-staging-frontend-assets"
    BUILD_ENV="staging"
    FRONTEND_URL="http://ordernimbus-staging-frontend-assets.s3-website-$AWS_REGION.amazonaws.com"
    ;;
  *)
    echo "❌ Invalid environment: $ENVIRONMENT. Use 'staging' or 'production'"
    exit 1
    ;;
esac

echo "📋 Deployment Configuration:"
echo "  Environment: $ENVIRONMENT"
echo "  Build Mode: $BUILD_ENV"
echo "  S3 Bucket: $S3_BUCKET"
echo "  Frontend URL: $FRONTEND_URL"
echo ""

# Create environment-specific build
echo "📦 Building React application for $BUILD_ENV environment..."

# Set NODE_ENV for the build
export NODE_ENV=$BUILD_ENV

# Build the app with environment-specific settings
if [ "$BUILD_ENV" = "production" ]; then
  # Production build with optimizations - uses .env.production
  npm run build:production
else
  # Staging build - also uses production settings for AWS deployment
  npm run build:production
fi

# Verify build completed
if [ ! -d "build" ]; then
  echo "❌ Build failed - build directory not found"
  exit 1
fi

echo "📊 Build Statistics:"
echo "  Build size: $(du -sh build | cut -f1)"
echo "  Files: $(find build -type f | wc -l)"
echo ""

# Create S3 bucket if it doesn't exist
if ! aws s3api head-bucket --bucket $S3_BUCKET 2>/dev/null; then
  echo "🪣 Creating S3 bucket: $S3_BUCKET"
  if [ "$AWS_REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket $S3_BUCKET --region $AWS_REGION
  else
    aws s3api create-bucket --bucket $S3_BUCKET --region $AWS_REGION --create-bucket-configuration LocationConstraint=$AWS_REGION
  fi
  
  # Configure for static website hosting
  aws s3 website s3://$S3_BUCKET --index-document index.html --error-document error.html
  
  # Set public read policy if staging (production might use CloudFront)
  if [ "$ENVIRONMENT" = "staging" ]; then
    aws s3api delete-public-access-block --bucket $S3_BUCKET || true
    aws s3api put-bucket-policy --bucket $S3_BUCKET --policy "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [{
        \"Sid\": \"PublicReadGetObject\",
        \"Effect\": \"Allow\",
        \"Principal\": \"*\",
        \"Action\": \"s3:GetObject\",
        \"Resource\": \"arn:aws:s3:::$S3_BUCKET/*\"
      }]
    }"
  fi
fi

# Deploy to S3 with cache-busting headers
echo "☁️ Deploying to S3..."
aws s3 sync build/ s3://$S3_BUCKET/ \
  --delete \
  --cache-control "no-cache, no-store, must-revalidate" \
  --metadata-directive REPLACE

# Invalidate CloudFront if production
if [ "$ENVIRONMENT" = "production" ]; then
  echo "🔄 Invalidating CloudFront cache..."
  # Add CloudFront invalidation here when distribution is set up
  # aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
fi

# Show deployment results
echo ""
echo "✅ Deployment complete!"
echo "🌐 Frontend URL: $FRONTEND_URL"
echo "📋 Environment: $ENVIRONMENT"
echo "🕒 Deployed at: $(date)"
echo ""
echo "🔧 Next steps:"
echo "  • Test the application in browser"
echo "  • Verify all pages load correctly"
echo "  • Check browser developer console for errors"
echo "  • Test Shopify connection flow"
echo ""
echo "🎉 Your updates are now live!"