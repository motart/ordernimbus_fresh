#!/bin/bash

# Automated Shopify Credentials Storage Script
# This stores provided credentials directly without prompts

set -e

echo "🔧 Automated Shopify Credentials Setup"
echo "======================================"
echo ""

# Check if credentials are provided as environment variables
if [ -z "$SHOPIFY_CLIENT_ID" ] || [ -z "$SHOPIFY_CLIENT_SECRET" ]; then
    echo "❌ Error: Missing required environment variables"
    echo ""
    echo "Please set:"
    echo "  export SHOPIFY_CLIENT_ID='your-client-id'"
    echo "  export SHOPIFY_CLIENT_SECRET='your-client-secret'"
    echo "  export SHOPIFY_APP_URL='your-app-url' (optional)"
    echo ""
    echo "Then run this script again."
    exit 1
fi

REGION=${AWS_REGION:-us-west-1}
SHOPIFY_APP_URL=${SHOPIFY_APP_URL:-"https://app.ordernimbus.com"}

echo "📍 Using AWS Region: $REGION"
echo "📱 App URL: $SHOPIFY_APP_URL"
echo ""

# Function to store credentials in SSM
store_credentials() {
    local env=$1
    local param_name="/ordernimbus/${env}/shopify"
    
    # Determine the redirect URI based on environment
    case $env in
        production)
            REDIRECT_URI="https://yu7ob32qt7.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback"
            ;;
        staging)
            REDIRECT_URI="https://staging-api.ordernimbus.com/api/shopify/callback"
            ;;
        local)
            REDIRECT_URI="http://localhost:3001/api/shopify/callback"
            ;;
    esac
    
    # Create JSON with credentials
    local credentials_json=$(cat <<EOF
{
    "SHOPIFY_CLIENT_ID": "$SHOPIFY_CLIENT_ID",
    "SHOPIFY_CLIENT_SECRET": "$SHOPIFY_CLIENT_SECRET",
    "SHOPIFY_APP_URL": "$SHOPIFY_APP_URL",
    "SHOPIFY_REDIRECT_URI": "$REDIRECT_URI"
}
EOF
    )
    
    echo "📝 Storing credentials for $env environment..."
    echo "   Parameter: $param_name"
    echo "   Redirect URI: $REDIRECT_URI"
    
    # Store in SSM Parameter Store (encrypted)
    if aws ssm put-parameter \
        --name "$param_name" \
        --value "$credentials_json" \
        --type "SecureString" \
        --overwrite \
        --region $REGION \
        --description "Shopify OAuth credentials for $env environment" \
        --output text > /dev/null 2>&1; then
        echo "   ✅ Successfully stored!"
        return 0
    else
        echo "   ❌ Failed to store credentials"
        return 1
    fi
}

# Store for all environments
ENVIRONMENTS=("production" "staging")

echo "Storing credentials in SSM Parameter Store..."
echo "============================================="

SUCCESS_COUNT=0
for env in "${ENVIRONMENTS[@]}"; do
    if store_credentials "$env"; then
        ((SUCCESS_COUNT++))
    fi
done

echo ""

if [ $SUCCESS_COUNT -gt 0 ]; then
    echo "🎉 Successfully stored credentials for $SUCCESS_COUNT environment(s)!"
    echo ""
    echo "📋 Required Redirect URIs for Shopify App Configuration:"
    echo "========================================================="
    echo ""
    echo "Add these to your Shopify app settings (Partners Dashboard > App Setup > URLs):"
    echo ""
    echo "Production:"
    echo "  https://yu7ob32qt7.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback"
    echo ""
    echo "Staging:"
    echo "  https://staging-api.ordernimbus.com/api/shopify/callback"
    echo ""
    echo "Local Development:"
    echo "  http://localhost:3001/api/shopify/callback"
    echo ""
    echo "📱 Required OAuth Scopes:"
    echo "========================"
    echo "• read_products"
    echo "• read_orders"
    echo "• read_inventory"
    echo "• read_customers"
    echo "• read_analytics"
else
    echo "❌ Failed to store credentials"
    exit 1
fi

echo ""
echo "✅ Done!"