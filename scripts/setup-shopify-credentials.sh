#!/bin/bash

# Setup Shopify Public App Credentials in AWS SSM Parameter Store
# Usage: ./setup-shopify-credentials.sh <environment> <client_id> <client_secret> [region]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check parameters
if [ "$#" -lt 3 ]; then
    echo -e "${RED}Error: Missing required parameters${NC}"
    echo "Usage: $0 <environment> <client_id> <client_secret> [region]"
    echo ""
    echo "Arguments:"
    echo "  environment    - staging or production"
    echo "  client_id      - Your Shopify public app client ID"
    echo "  client_secret  - Your Shopify public app client secret"
    echo "  region         - AWS region (optional, defaults to us-west-1)"
    echo ""
    echo "Example:"
    echo "  $0 staging abc123def456 xyz789secret123"
    echo "  $0 production def456abc123 secret456xyz789 us-west-1"
    exit 1
fi

ENVIRONMENT=$1
CLIENT_ID=$2
CLIENT_SECRET=$3
REGION=${4:-us-west-1}

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo -e "${RED}Error: Environment must be 'staging' or 'production'${NC}"
    exit 1
fi

# Set redirect URIs based on environment
if [ "$ENVIRONMENT" == "staging" ]; then
    APP_URL="https://staging.ordernimbus.com"
    # Use actual API Gateway URL for staging
    REDIRECT_URI="https://staging-api.ordernimbus.com/api/shopify/callback"
else
    APP_URL="https://app.ordernimbus.com"
    # Use actual API Gateway URL for production
    REDIRECT_URI="https://yu7ob32qt7.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback"
fi

echo -e "${YELLOW}Setting up Shopify credentials for ${ENVIRONMENT} environment in ${REGION}...${NC}"
echo ""

# Create the secret JSON
SECRET_JSON=$(cat <<EOF
{
  "SHOPIFY_CLIENT_ID": "${CLIENT_ID}",
  "SHOPIFY_CLIENT_SECRET": "${CLIENT_SECRET}",
  "SHOPIFY_APP_URL": "${APP_URL}",
  "SHOPIFY_REDIRECT_URI": "${REDIRECT_URI}"
}
EOF
)

PARAM_NAME="/ordernimbus/${ENVIRONMENT}/shopify"

# Check if parameter already exists
echo -n "Checking if parameter exists... "
if aws ssm get-parameter --name "$PARAM_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo -e "${YELLOW}Found existing parameter${NC}"
    
    # Ask user if they want to update
    read -p "Secret already exists. Do you want to update it? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting without changes."
        exit 0
    fi
    
    # Update existing parameter
    echo -n "Updating parameter... "
    aws ssm put-parameter \
        --name "$PARAM_NAME" \
        --value "$SECRET_JSON" \
        --type "SecureString" \
        --overwrite \
        --region "$REGION" \
        --output text >/dev/null
    
    echo -e "${GREEN}✓ Updated${NC}"
else
    echo "Not found"
    
    # Create new parameter
    echo -n "Creating new parameter... "
    aws ssm put-parameter \
        --name "$PARAM_NAME" \
        --value "$SECRET_JSON" \
        --type "SecureString" \
        --description "Shopify public app credentials for $ENVIRONMENT" \
        --region "$REGION" \
        --output text >/dev/null
    
    echo -e "${GREEN}✓ Created${NC}"
fi

echo ""
echo -e "${GREEN}Successfully configured Shopify credentials!${NC}"
echo ""
echo "Parameter Details:"
echo "  Name: $PARAM_NAME"
echo "  Region: $REGION"
echo "  App URL: $APP_URL"
echo "  Redirect URI: $REDIRECT_URI"
echo ""

# Verify the parameter
echo -n "Verifying parameter... "
VERIFY=$(aws ssm get-parameter \
    --name "$PARAM_NAME" \
    --with-decryption \
    --region "$REGION" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null | jq -r '.SHOPIFY_CLIENT_ID' 2>/dev/null)

if [ "$VERIFY" == "$CLIENT_ID" ]; then
    echo -e "${GREEN}✓ Verified${NC}"
else
    echo -e "${RED}✗ Verification failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Deploy your Lambda functions to use these credentials"
echo "2. Update your Shopify app settings with the redirect URI:"
echo "   ${REDIRECT_URI}"
echo ""
echo "To test the credentials:"
echo "  aws ssm get-parameter --name $PARAM_NAME --with-decryption --region $REGION"