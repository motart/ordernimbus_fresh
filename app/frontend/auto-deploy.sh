#!/bin/bash

# Auto-deploy script for OrderNimbus frontend
# This script builds and deploys the frontend to AWS S3 automatically

set -e

echo "🚀 Starting automated frontend deployment..."

# Set AWS region
export AWS_DEFAULT_REGION=us-east-1

# Build the React app
echo "📦 Building React application..."
npm run build

# Deploy to S3
echo "☁️ Deploying to S3..."
aws s3 sync build/ s3://ordernimbus-staging-frontend-assets --delete

# Show the frontend URL
echo "✅ Deployment complete!"
echo "Frontend URL: http://ordernimbus-staging-frontend-assets.s3-website-us-east-1.amazonaws.com"
echo "🎉 Your updates are now live!"