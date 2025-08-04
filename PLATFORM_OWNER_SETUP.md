# OrderNimbus Platform Owner Setup Guide

## One-Time Setup for Platform Owner Only

This guide is for YOU, the OrderNimbus platform owner. Your users will NEVER see this or need to do any of this.

## Step 1: Create Your OrderNimbus Shopify App

1. Go to [Shopify Partners](https://partners.shopify.com/)
2. Sign up or log in with YOUR account (not a user account)
3. Click **Apps** in the left sidebar
4. Click **Create app**
5. Choose **Public app** (this allows ANY Shopify store to connect)
6. Fill in the app details:
   - **App name**: OrderNimbus
   - **App URL**: https://ordernimbus.com (or your domain)
   - **Allowed redirection URL(s)**: Add ALL of these:
     - `http://localhost:3000/api/shopify/callback` (for local dev)
     - `http://localhost:3001/api/shopify/callback` (for local API)
     - `https://ordernimbus.com/api/shopify/callback` (production)
     - `https://api.ordernimbus.com/shopify/callback` (production API)

7. After creation, go to **App setup**
8. Under **GDPR mandatory webhooks**, you can skip these for now
9. Go to **API credentials** tab
10. Copy these values:
    - **API key**: (looks like: 8f7d9c2a1b3e4f5a6d7c8b9a0e1f2d3c)
    - **API secret key**: (looks like: shpss_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p)

## Step 2: Configure OrderNimbus with Your App Credentials

### For Local Development:

1. Create a `.env.shopify` file (add to .gitignore!):
```bash
SHOPIFY_API_KEY=your-actual-api-key
SHOPIFY_API_SECRET=your-actual-api-secret
```

2. Update `env.json`:
```json
"ShopifyOAuthFunction": {
  "SHOPIFY_API_KEY": "your-actual-api-key",
  "SHOPIFY_API_SECRET": "your-actual-api-secret",
  "SHOPIFY_REDIRECT_URI": "http://localhost:3001/api/shopify/callback",
  // ... rest of config
}
```

### For Production (AWS):

1. Store in AWS Secrets Manager:
```bash
aws secretsmanager create-secret \
  --name ordernimbus-production-shopify \
  --secret-string '{
    "apiKey":"your-actual-api-key",
    "apiSecret":"your-actual-api-secret"
  }'
```

2. The CloudFormation template will automatically pull these secrets.

## Step 3: Test the Flow

1. Start your local environment
2. Go to http://localhost:3000
3. Create a test user account
4. Go to Stores → Connect Shopify
5. Enter ANY Shopify store domain (e.g., "test-store.myshopify.com")
6. Click Connect
7. You'll see Shopify's authorization page in a popup
8. Approve the connection
9. Done! The store is connected

## What Your Users See:

1. They click "Connect Shopify Store"
2. Enter their store URL: "mystore.myshopify.com"
3. Click "Connect"
4. See Shopify's official authorization popup
5. Click "Install app" on Shopify's page
6. Automatically return to OrderNimbus with store connected
7. That's it! No API keys, no leaving your app

## Important Notes:

- **NEVER** commit the API keys to git
- Users will NEVER see or need these credentials
- The same app works for ALL your users
- Each user's store data is isolated by their userId
- Shopify handles all the security and authorization

## Shopify App Review (Optional):

For production, you may want to submit your app for Shopify's review to get:
- Listed in Shopify App Store
- Verified badge
- Higher API rate limits

But this is NOT required for the app to work!