# Shopify Integration Setup Guide

## Overview
This guide will walk you through setting up the Shopify integration for OrderNimbus.

## Prerequisites
- Shopify Partners account
- Shopify development store for testing
- AWS CLI configured with appropriate permissions

## Step 1: Create a Shopify App

1. **Log in to Shopify Partners Dashboard**
   - Go to https://partners.shopify.com
   - Navigate to Apps > All apps > Create app

2. **Create a Public App**
   - Choose "Public app" (not Custom app)
   - Enter app name: "OrderNimbus Integration"
   - Enter app URL: https://app.ordernimbus.com
   - Enter your email address

3. **Configure App Settings**
   - In your app dashboard, go to "App setup"
   - Under "App URL", set: `https://app.ordernimbus.com`
   - Under "Allowed redirection URL(s)", add ALL of these:
     ```
     https://yu7ob32qt7.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback
     https://staging-api.ordernimbus.com/api/shopify/callback
     http://localhost:3001/api/shopify/callback
     ```

4. **Configure OAuth Scopes**
   - In "App setup" > "API access" > "Access scopes"
   - Select these scopes:
     - `read_products`
     - `read_orders`
     - `read_inventory`
     - `read_customers`
     - `read_analytics`
     - `read_locations`
   - Click "Save"

5. **Get Your Credentials**
   - In "App setup" > "API credentials"
   - Copy your:
     - **Client ID** (also called API key)
     - **Client Secret** (also called API secret key)

## Step 2: Store Credentials in AWS

### Option A: Interactive Setup
```bash
# Run the interactive setup script
./scripts/setup-shopify-credentials.sh production YOUR_CLIENT_ID YOUR_CLIENT_SECRET

# Example:
./scripts/setup-shopify-credentials.sh production 7d4a5c8e9f1b2d3e4f5a6b7c 9f8e7d6c5b4a3d2e1f0a9b8c7d6e5f4a
```

### Option B: Automated Setup
```bash
# Set environment variables
export SHOPIFY_CLIENT_ID="YOUR_CLIENT_ID"
export SHOPIFY_CLIENT_SECRET="YOUR_CLIENT_SECRET"
export SHOPIFY_APP_URL="https://app.ordernimbus.com"

# Run the automated script
./scripts/store-shopify-credentials-auto.sh
```

### Option C: Manual AWS CLI
```bash
# Store credentials manually
aws ssm put-parameter \
  --name "/ordernimbus/production/shopify" \
  --value '{
    "SHOPIFY_CLIENT_ID": "YOUR_CLIENT_ID",
    "SHOPIFY_CLIENT_SECRET": "YOUR_CLIENT_SECRET",
    "SHOPIFY_APP_URL": "https://app.ordernimbus.com",
    "SHOPIFY_REDIRECT_URI": "https://yu7ob32qt7.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback"
  }' \
  --type "SecureString" \
  --overwrite \
  --region us-west-1
```

## Step 3: Deploy the Lambda Functions

The Shopify integration is already included in the main Lambda function. To update it:

```bash
# Navigate to lambda directory
cd lambda

# Create deployment package
mkdir -p deployment
cp *.js deployment/
cp -r shopify deployment/
cd deployment
npm init -y
npm install aws-sdk axios
zip -r ../lambda-deployment.zip .

# Update the Lambda function
aws lambda update-function-code \
  --function-name ordernimbus-production-main \
  --zip-file fileb://../lambda-deployment.zip \
  --region us-west-1

# Clean up
cd ..
rm -rf deployment lambda-deployment.zip
```

## Step 4: Test the Integration

### 1. Test via Frontend
1. Log in to OrderNimbus: https://app.ordernimbus.com
2. Navigate to "Stores" page
3. Click "Connect Shopify"
4. Enter your store domain (e.g., `my-store.myshopify.com`)
5. You'll be redirected to Shopify to approve the connection
6. After approval, you'll be redirected back to OrderNimbus

### 2. Test via API (Optional)
```bash
# Get auth URL
curl -X POST https://yu7ob32qt7.execute-api.us-west-1.amazonaws.com/production/api/shopify/connect \
  -H "Content-Type: application/json" \
  -H "userId: YOUR_USER_ID" \
  -d '{
    "userId": "YOUR_USER_ID",
    "storeDomain": "your-store.myshopify.com"
  }'
```

## Step 5: Verify the Connection

1. **Check SSM Parameter**
   ```bash
   aws ssm get-parameter \
     --name "/ordernimbus/production/shopify" \
     --with-decryption \
     --region us-west-1 \
     --query 'Parameter.Value' \
     --output text | jq '.'
   ```

2. **Check CloudWatch Logs**
   ```bash
   aws logs tail /aws/lambda/ordernimbus-production-main \
     --follow \
     --region us-west-1 \
     --filter-pattern "Shopify"
   ```

3. **Check DynamoDB for Stores**
   ```bash
   aws dynamodb scan \
     --table-name ordernimbus-production-main \
     --filter-expression "begins_with(pk, :pk)" \
     --expression-attribute-values '{":pk":{"S":"STORE#"}}' \
     --region us-west-1
   ```

## Troubleshooting

### "Invalid redirect_uri" Error
- Ensure ALL redirect URIs are added to your Shopify app settings
- The production URI must be exactly: `https://yu7ob32qt7.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback`

### "SecureDataManager not initialized" Error
- This is already fixed in the latest code
- Ensure you're logged in to OrderNimbus before accessing Stores

### "Parameter not found" Error
- Run the credential setup script again
- Verify the parameter exists: `aws ssm get-parameter --name "/ordernimbus/production/shopify" --region us-west-1`

### OAuth Callback Fails
- Check CloudWatch logs for detailed error messages
- Verify your Shopify app is not in test mode
- Ensure the store domain is correct (must end with `.myshopify.com`)

## Security Notes

1. **Never commit credentials** to the repository
2. **Use SSM Parameter Store** with encryption for all secrets
3. **Rotate credentials** regularly through Shopify Partners dashboard
4. **Monitor CloudWatch** for suspicious activity
5. **Use least privilege** IAM policies for Lambda functions

## Support

For issues or questions:
1. Check CloudWatch logs first
2. Review this guide
3. Check the PR: https://github.com/motart/ordernimbus/pull/10
4. Contact the development team

## Next Steps After Setup

1. ✅ Configure data sync schedules
2. ✅ Set up webhook endpoints for real-time updates
3. ✅ Configure inventory tracking
4. ✅ Enable order management features
5. ✅ Test with real store data

---

Last Updated: 2025-08-14
Version: 1.0.0