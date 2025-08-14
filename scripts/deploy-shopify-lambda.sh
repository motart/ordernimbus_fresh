#!/bin/bash

# Deploy Shopify Integration Lambda
# This script packages and deploys the Shopify integration Lambda function

set -e

echo "🚀 Deploying Shopify Integration Lambda"
echo "======================================="
echo ""

REGION=${AWS_REGION:-us-west-1}
ENVIRONMENT=${1:-production}

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "❌ Error: Environment must be 'staging' or 'production'"
    echo "Usage: $0 [staging|production]"
    exit 1
fi

echo "📍 Region: $REGION"
echo "🌍 Environment: $ENVIRONMENT"
echo ""

# Get the Lambda function name from CloudFormation stack
STACK_NAME="ordernimbus-${ENVIRONMENT}"
echo "Getting Lambda function name from stack: $STACK_NAME..."

FUNCTION_NAME=$(aws cloudformation describe-stack-resources \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query "StackResources[?ResourceType=='AWS::Lambda::Function' && contains(LogicalResourceId, 'ShopifyIntegration')].PhysicalResourceId" \
    --output text 2>/dev/null || echo "")

if [ -z "$FUNCTION_NAME" ]; then
    # Try alternative names
    FUNCTION_NAME=$(aws cloudformation describe-stack-resources \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "StackResources[?ResourceType=='AWS::Lambda::Function' && contains(LogicalResourceId, 'Shopify')].PhysicalResourceId" \
        --output text 2>/dev/null || echo "")
fi

if [ -z "$FUNCTION_NAME" ]; then
    # Fallback to direct Lambda name
    FUNCTION_NAME="ordernimbus-${ENVIRONMENT}-shopify-integration"
    echo "⚠️  Could not find Lambda in stack, using default: $FUNCTION_NAME"
else
    echo "✅ Found Lambda function: $FUNCTION_NAME"
fi

# Check if Lambda exists
echo ""
echo "Checking if Lambda function exists..."
if ! aws lambda get-function --function-name $FUNCTION_NAME --region $REGION >/dev/null 2>&1; then
    echo "❌ Lambda function $FUNCTION_NAME not found"
    echo ""
    echo "Available Lambda functions:"
    aws lambda list-functions --region $REGION --query "Functions[?contains(FunctionName, 'ordernimbus')].FunctionName" --output table
    exit 1
fi

# Navigate to lambda directory
cd "$(dirname "$0")/../lambda"

# Create deployment package
echo ""
echo "Creating deployment package..."
rm -rf deployment-package
mkdir -p deployment-package

# Copy Lambda files
cp shopify-integration.js deployment-package/index.js
cp -r shopify deployment-package/ 2>/dev/null || true

# Install dependencies
cd deployment-package
npm init -y >/dev/null 2>&1
npm install aws-sdk axios --save >/dev/null 2>&1

# Create zip file
echo "Creating zip file..."
zip -qr ../shopify-integration.zip .

# Deploy to Lambda
echo ""
echo "Deploying to Lambda function: $FUNCTION_NAME..."
cd ..
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://shopify-integration.zip \
    --region $REGION \
    --output json | jq '{FunctionName: .FunctionName, LastModified: .LastModified, CodeSize: .CodeSize}'

# Update environment variables
echo ""
echo "Updating Lambda environment variables..."
aws lambda update-function-configuration \
    --function-name $FUNCTION_NAME \
    --environment "Variables={ENVIRONMENT=$ENVIRONMENT,AWS_REGION=$REGION}" \
    --region $REGION \
    --output json | jq '{FunctionName: .FunctionName, Environment: .Environment.Variables}'

# Clean up
rm -rf deployment-package shopify-integration.zip

echo ""
echo "✅ Lambda function deployed successfully!"
echo ""

# Test the configuration
echo "Testing Lambda configuration..."
echo "================================"

# Verify SSM parameter exists
PARAM_NAME="/ordernimbus/${ENVIRONMENT}/shopify"
echo -n "Checking for Shopify credentials in SSM... "
if aws ssm get-parameter --name $PARAM_NAME --region $REGION >/dev/null 2>&1; then
    echo "✅ Found"
else
    echo "❌ Not found"
    echo ""
    echo "⚠️  Warning: Shopify credentials not found in SSM Parameter Store"
    echo "Run ./scripts/setup-shopify-credentials.sh to configure them"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Ensure Shopify credentials are stored in SSM"
echo "2. Test the Shopify connection in the app"
echo "3. Monitor CloudWatch logs for any errors"
echo ""
echo "CloudWatch Logs:"
echo "  https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#logsV2:log-groups/log-group/\$252Faws\$252Flambda\$252F${FUNCTION_NAME}"