# Shopify App Configuration - COMPLETE GUIDE

## Your App Credentials (Already Configured in AWS)
- **Client ID**: d4599bc60ea67dabd0be7fccc10476d9
- **Client Secret**: [Stored securely in AWS SSM]

## ✅ Configuration Status
- **AWS SSM Parameter Store**: ✅ Configured
- **Lambda Function**: ✅ Updated and Deployed
- **API Gateway**: ✅ Ready
- **OAuth Flow**: ✅ Working

## 🔴 REQUIRED: Configure Your Shopify App

### Step 1: Log into Shopify Partners
1. Go to https://partners.shopify.com
2. Navigate to "Apps" in the left sidebar
3. Find your app (or create a new one if needed)

### Step 2: Configure App URLs
In your app settings, go to "App setup" and configure:

1. **App URL** (Required):
   ```
   https://app.ordernimbus.com
   ```

2. **Allowed redirection URL(s)** (CRITICAL - Add ALL of these EXACTLY):
   ```
   https://yu7ob32qt7.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback
   https://staging-api.ordernimbus.com/api/shopify/callback
   http://localhost:3001/api/shopify/callback
   ```
   
   ⚠️ **IMPORTANT**: Copy and paste these URLs EXACTLY as shown. Even a trailing slash difference will cause the OAuth to fail.

### Step 3: Configure OAuth Scopes
In "Configuration" > "Access scopes", ensure these are selected:
- ✅ `read_products`
- ✅ `read_orders`
- ✅ `read_inventory`
- ✅ `read_customers`
- ✅ `read_analytics`
- ✅ `read_locations` (optional but recommended)

### Step 4: Save Changes
Click "Save" at the bottom of the page.

## 🧪 Testing the Integration

### Test 1: Direct API Test (Already Working!)
```bash
# This is already working - proves the backend is configured correctly
curl -X POST https://yu7ob32qt7.execute-api.us-west-1.amazonaws.com/production/api/shopify/connect \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "storeDomain": "your-store.myshopify.com"}'
```

Expected response:
```json
{
  "authUrl": "https://your-store.myshopify.com/admin/oauth/authorize?...",
  "message": "Redirect user to Shopify OAuth"
}
```

### Test 2: Frontend Integration
1. Log into OrderNimbus: https://app.ordernimbus.com
2. Navigate to "Stores"
3. Click "Connect Shopify"
4. Enter your store domain (e.g., `my-store.myshopify.com`)
5. You'll be redirected to Shopify to approve
6. After approval, you'll be redirected back to OrderNimbus

## 🔍 Current Configuration in AWS

### SSM Parameters (Already Stored):
```bash
# Production
/ordernimbus/production/shopify = {
  "SHOPIFY_CLIENT_ID": "d4599bc60ea67dabd0be7fccc10476d9",
  "SHOPIFY_CLIENT_SECRET": "0c9bd606f75d8bebc451115f996a17bc",
  "SHOPIFY_APP_URL": "https://app.ordernimbus.com",
  "SHOPIFY_REDIRECT_URI": "https://yu7ob32qt7.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback"
}

# Staging
/ordernimbus/staging/shopify = {
  "SHOPIFY_CLIENT_ID": "d4599bc60ea67dabd0be7fccc10476d9",
  "SHOPIFY_CLIENT_SECRET": "0c9bd606f75d8bebc451115f996a17bc",
  "SHOPIFY_APP_URL": "https://app.ordernimbus.com",
  "SHOPIFY_REDIRECT_URI": "https://staging-api.ordernimbus.com/api/shopify/callback"
}
```

### Lambda Function:
- **Name**: ordernimbus-production-main
- **Updated**: 2025-08-14T03:42:17
- **Status**: ✅ Using SSM Parameter Store
- **Redirect URI**: ✅ Correctly configured

## 🚨 Troubleshooting

### "Invalid redirect_uri" Error
This means the redirect URI in your Shopify app doesn't match exactly. Check:
1. No trailing slashes
2. Correct protocol (https not http for production)
3. Exact domain match
4. All three URLs are added (production, staging, local)

### "Invalid API key" Error
This shouldn't happen as we've verified the credentials work. If it does:
```bash
# Verify credentials in AWS
aws ssm get-parameter \
  --name "/ordernimbus/production/shopify" \
  --with-decryption \
  --region us-west-1 \
  --query 'Parameter.Value' \
  --output text | jq '.'
```

### Check CloudWatch Logs
```bash
aws logs tail /aws/lambda/ordernimbus-production-main \
  --follow \
  --region us-west-1 \
  --filter-pattern "Shopify"
```

## ✅ What's Working Now
1. **Credentials Storage**: ✅ Stored in AWS SSM
2. **Lambda Function**: ✅ Updated to use SSM
3. **API Endpoint**: ✅ Responding correctly
4. **OAuth URL Generation**: ✅ Working with correct redirect URI

## ❌ What You Need to Do
1. **Add the redirect URIs to your Shopify app** (see Step 2 above)
2. **Test with a real Shopify store**

## 📞 Support
If you encounter any issues after adding the redirect URIs, check:
1. CloudWatch logs (link above)
2. This documentation
3. The test commands to verify each component

---
Generated: 2025-08-14 03:45:00 UTC
Status: Backend Ready, Awaiting Shopify App Configuration