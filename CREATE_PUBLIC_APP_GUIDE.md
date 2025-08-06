# Create OrderNimbus Public Shopify App - Step by Step

## Prerequisites
- A Shopify Partner account (free at partners.shopify.com)
- 10 minutes of your time

## Step-by-Step Guide

### 1. Login to Shopify Partners
Go to https://partners.shopify.com and login

### 2. Create App
- Click **Apps** in the left sidebar
- Click **Create app** button
- Select **Create app manually**

### 3. Choose App Type
⚠️ **IMPORTANT**: Choose **Public app** (NOT Custom app)

### 4. Configure Basic Info
Fill in these fields:
- **App name**: OrderNimbus
- **App URL**: `http://localhost:3000` (for development)
- **Allowed redirection URL(s)**: Add BOTH:
  - `http://localhost:3001/api/shopify/callback`
  - `http://localhost:3000/shopify/callback`

Click **Create app**

### 5. Get Your Credentials
After creation:
1. Go to **App setup** (in the left sidebar)
2. Scroll to **API credentials**
3. You'll see:
   - **API key**: Copy this entire string
   - **API secret key**: Copy this entire string

### 6. Configure OrderNimbus

Update `/Users/rachid/workspace/ordernimbus/env.json`:

```json
{
  "ShopifyOAuthFunction": {
    "ENVIRONMENT": "local",
    "REGION": "us-east-1",
    "TABLE_PREFIX": "ordernimbus-local",
    "SHOPIFY_SYNC_FUNCTION": "ordernimbus-local-shopify-integration",
    "SHOPIFY_API_KEY": "d4599bc60ea67dabd0be7fccc10476d9",
    "SHOPIFY_API_SECRET": "y0c9bd606f75d8bebc451115f996a17bc",
    "SHOPIFY_REDIRECT_URI": "https://app.ordernimbus.com/api/shopify/callback",
    "DYNAMODB_ENDPOINT": "http://host.docker.internal:8000",
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local"
  }
}
```

### 7. Restart Your Local Environment

```bash
# Stop everything
./scripts/stop-local.sh

# Rebuild SAM with new credentials
sam build --cached

# Start everything
./scripts/start-local.sh
```

### 8. Test the Connection

1. Go to http://localhost:3000
2. Navigate to Stores
3. Click "Connect Shopify"
4. Enter any store: `test-store` (becomes test-store.myshopify.com)
5. Click Connect
6. You'll see Shopify's OAuth page
7. Approve the connection
8. Store connects and data syncs!

## For Production

When deploying to AWS:

### 1. Update Redirect URLs in Shopify
Go back to your app in Partners dashboard and add:
- `https://api.ordernimbus.com/shopify/callback`
- `https://ordernimbus.com/shopify/callback`

### 2. Store Credentials in AWS

```bash
aws secretsmanager create-secret \
  --name ordernimbus-shopify-app \
  --secret-string '{
    "apiKey":"your-api-key",
    "apiSecret":"your-api-secret"
  }'
```

### 3. Update CloudFormation
The template already references these secrets.

## How Users Experience It

1. User signs up for OrderNimbus
2. Goes to Stores → Connect Shopify
3. Enters: `their-store`
4. Clicks Connect
5. Sees YOUR app requesting permission
6. Clicks "Install app"
7. Returns to OrderNimbus with store connected
8. Data starts syncing immediately

**Users NEVER see or touch API keys!**

## Troubleshooting

### "Invalid API key" error
- You're using a Custom App token instead of Public App credentials
- Solution: Create a Public app and use its API key/secret

### "Redirect URI mismatch" error  
- The callback URL doesn't match what's in Shopify
- Solution: Add the exact URL to your app's redirect URLs

### OAuth popup doesn't appear
- Browser blocking popups
- Solution: Allow popups for localhost

## Important Notes

1. **One App, Many Stores**: This ONE app works for ALL your users
2. **No User Setup**: Users never create apps or get API keys
3. **Automatic Token Management**: OrderNimbus handles all tokens
4. **Secure**: Each user's token is stored encrypted and isolated

## Next Steps

Once working locally:
1. Deploy to staging
2. Update redirect URLs for staging domain
3. Test with real stores
4. Deploy to production
5. Submit app to Shopify for review (optional, for app store listing)