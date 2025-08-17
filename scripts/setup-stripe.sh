#!/bin/bash

# Stripe Configuration Setup Script
# Stores Stripe API keys and webhook secrets in AWS SSM Parameter Store
# 
# Security: Use SecureString type for all sensitive values
# Usage: ./setup-stripe.sh <environment> <region>

set -e

ENVIRONMENT=${1:-production}
REGION=${2:-us-west-1}

echo "========================================="
echo "🔐 Setting up Stripe Configuration"
echo "========================================="
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo "❌ AWS CLI is not configured. Please configure AWS credentials."
    exit 1
fi

# Prompt for Stripe keys if not provided via environment variables
if [ -z "$STRIPE_PUBLISHABLE_KEY" ]; then
    read -p "Enter Stripe Publishable Key (pk_test_... or pk_live_...): " STRIPE_PUBLISHABLE_KEY
fi

if [ -z "$STRIPE_SECRET_KEY" ]; then
    read -s -p "Enter Stripe Secret Key (sk_test_... or sk_live_...): " STRIPE_SECRET_KEY
    echo ""
fi

if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
    read -s -p "Enter Stripe Webhook Endpoint Secret (whsec_...): " STRIPE_WEBHOOK_SECRET
    echo ""
fi

# Validate keys format
if [[ ! "$STRIPE_PUBLISHABLE_KEY" =~ ^pk_(test|live)_ ]]; then
    echo "❌ Invalid Stripe Publishable Key format"
    exit 1
fi

if [[ ! "$STRIPE_SECRET_KEY" =~ ^sk_(test|live)_ ]]; then
    echo "❌ Invalid Stripe Secret Key format"
    exit 1
fi

if [[ ! "$STRIPE_WEBHOOK_SECRET" =~ ^whsec_ ]]; then
    echo "❌ Invalid Stripe Webhook Secret format"
    exit 1
fi

# Detect if using test or live keys
if [[ "$STRIPE_SECRET_KEY" =~ ^sk_test_ ]]; then
    echo "ℹ️  Using Stripe TEST mode keys"
    MODE="test"
else
    echo "⚠️  Using Stripe LIVE mode keys"
    MODE="live"
    read -p "Are you sure you want to use LIVE keys? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "Aborted."
        exit 1
    fi
fi

echo ""
echo "Storing Stripe configuration in SSM Parameter Store..."

# Store Stripe configuration as JSON in SSM Parameter Store
CONFIG_JSON=$(cat <<EOF
{
  "STRIPE_PUBLISHABLE_KEY": "$STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY": "$STRIPE_SECRET_KEY",
  "MODE": "$MODE"
}
EOF
)

# Store main Stripe configuration
aws ssm put-parameter \
    --name "/ordernimbus/$ENVIRONMENT/stripe" \
    --value "$CONFIG_JSON" \
    --type "SecureString" \
    --overwrite \
    --region "$REGION" \
    --description "Stripe API configuration for OrderNimbus $ENVIRONMENT" \
    >/dev/null

echo "✅ Stored Stripe API configuration"

# Store webhook secret separately
aws ssm put-parameter \
    --name "/ordernimbus/$ENVIRONMENT/stripe-webhook-secret" \
    --value "$STRIPE_WEBHOOK_SECRET" \
    --type "SecureString" \
    --overwrite \
    --region "$REGION" \
    --description "Stripe webhook endpoint secret for OrderNimbus $ENVIRONMENT" \
    >/dev/null

echo "✅ Stored Stripe webhook secret"

# Store Stripe price IDs (these should be created in Stripe Dashboard first)
echo ""
echo "Setting up Stripe Price IDs..."
echo "Note: You need to create these products and prices in your Stripe Dashboard first"

# Default test mode price IDs (you'll need to replace with your actual IDs)
if [ "$MODE" == "test" ]; then
    PRICE_STARTER_MONTHLY="price_test_starter_monthly"
    PRICE_STARTER_ANNUAL="price_test_starter_annual"
    PRICE_PROFESSIONAL_MONTHLY="price_test_professional_monthly"
    PRICE_PROFESSIONAL_ANNUAL="price_test_professional_annual"
    PRICE_ENTERPRISE_MONTHLY="price_test_enterprise_monthly"
    PRICE_ENTERPRISE_ANNUAL="price_test_enterprise_annual"
else
    # Prompt for live price IDs
    echo "Enter your Stripe Price IDs (from Stripe Dashboard):"
    read -p "Starter Monthly Price ID: " PRICE_STARTER_MONTHLY
    read -p "Starter Annual Price ID: " PRICE_STARTER_ANNUAL
    read -p "Professional Monthly Price ID: " PRICE_PROFESSIONAL_MONTHLY
    read -p "Professional Annual Price ID: " PRICE_PROFESSIONAL_ANNUAL
    read -p "Enterprise Monthly Price ID: " PRICE_ENTERPRISE_MONTHLY
    read -p "Enterprise Annual Price ID: " PRICE_ENTERPRISE_ANNUAL
fi

PRICES_JSON=$(cat <<EOF
{
  "starter": {
    "monthly": "$PRICE_STARTER_MONTHLY",
    "annual": "$PRICE_STARTER_ANNUAL"
  },
  "professional": {
    "monthly": "$PRICE_PROFESSIONAL_MONTHLY",
    "annual": "$PRICE_PROFESSIONAL_ANNUAL"
  },
  "enterprise": {
    "monthly": "$PRICE_ENTERPRISE_MONTHLY",
    "annual": "$PRICE_ENTERPRISE_ANNUAL"
  }
}
EOF
)

aws ssm put-parameter \
    --name "/ordernimbus/$ENVIRONMENT/stripe-prices" \
    --value "$PRICES_JSON" \
    --type "String" \
    --overwrite \
    --region "$REGION" \
    --description "Stripe price IDs for OrderNimbus $ENVIRONMENT" \
    >/dev/null

echo "✅ Stored Stripe price IDs"

# Update Lambda environment variables if stack exists
STACK_NAME="ordernimbus-$ENVIRONMENT"
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo ""
    echo "Updating Lambda functions with Stripe configuration..."
    
    # Update payment handler Lambda
    aws lambda update-function-configuration \
        --function-name "ordernimbus-$ENVIRONMENT-payment" \
        --environment "Variables={STRIPE_MODE=$MODE}" \
        --region "$REGION" \
        >/dev/null 2>&1 || echo "⚠️  Payment Lambda not found (will be created on next deployment)"
    
    echo "✅ Lambda functions updated"
fi

echo ""
echo "========================================="
echo "✅ Stripe Configuration Complete!"
echo "========================================="
echo ""
echo "Configuration stored in SSM Parameter Store:"
echo "  - /ordernimbus/$ENVIRONMENT/stripe"
echo "  - /ordernimbus/$ENVIRONMENT/stripe-webhook-secret"
echo "  - /ordernimbus/$ENVIRONMENT/stripe-prices"
echo ""
echo "Mode: $MODE"
echo ""

if [ "$MODE" == "test" ]; then
    echo "📝 Next steps for TEST mode:"
    echo "1. Create products and prices in Stripe Dashboard (test mode)"
    echo "2. Update price IDs in SSM Parameter Store"
    echo "3. Configure webhook endpoint in Stripe Dashboard:"
    echo "   https://your-api-url/api/payment/webhook"
    echo "4. Deploy your application"
else
    echo "📝 Next steps for LIVE mode:"
    echo "1. Ensure products and prices are created in Stripe Dashboard"
    echo "2. Configure webhook endpoint in Stripe Dashboard:"
    echo "   https://your-api-url/api/payment/webhook"
    echo "3. Deploy your application"
    echo "4. Test with real payments carefully!"
fi

echo ""
echo "🔐 Security reminder: Never commit API keys to source control!"