# Shopify Integration Setup Guide

## Prerequisites

To connect your Shopify store to OrderNimbus, you need to create a Shopify app. This can be either:

1. **Development/Custom App** (Recommended for testing)
2. **Public App** (For production use)

## Step 1: Create a Shopify Development Store (Optional)

If you don't have a Shopify store yet, create a development store:

1. Go to [Shopify Partners](https://partners.shopify.com/)
2. Sign up or log in
3. Click "Stores" → "Add store" → "Create development store"
4. Choose "Create a store to test and build"
5. Fill in the store details

## Step 2: Create a Custom App (For Development)

1. In your Shopify admin, go to **Settings** → **Apps and sales channels**
2. Click **Develop apps** (you may need to enable this first)
3. Click **Create an app**
4. Name your app "OrderNimbus Integration"
5. After creation, go to **Configuration** tab
6. In **Admin API integration**, configure these scopes:
   - `read_products`
   - `read_orders` 
   - `read_inventory`
   - `read_customers`
7. Click **Save**
8. Go to **API credentials** tab
9. Under **Admin API access token**, click **Reveal token once**
10. Copy the access token - you'll need this

## Step 3: Configure OrderNimbus (Option A - Using Access Token)

For quick testing with the access token:

1. Update `/Users/rachid/workspace/ordernimbus/env.json`:
```json
"ShopifyOAuthFunction": {
  "SHOPIFY_API_KEY": "your-actual-api-key",
  "SHOPIFY_API_SECRET": "your-actual-api-secret",
  // ... other settings
}
```

2. When adding a store in the UI, use:
   - Store Type: Shopify
   - Domain: your-store.myshopify.com
   - API Token: (paste the access token from Step 2.10)

## Step 4: Configure OrderNimbus (Option B - OAuth Flow)

For production-ready OAuth flow:

### Create a Public/Private App

1. Go to [Shopify Partners](https://partners.shopify.com/)
2. Click **Apps** → **Create app**
3. Choose **Public app** or **Custom app**
4. Configure app settings:
   - App name: OrderNimbus
   - App URL: http://localhost:3000 (for local dev)
   - Allowed redirection URL(s): 
     - http://localhost:3000/shopify/callback
     - http://localhost:3001/api/shopify/callback
5. After creation, go to **App setup**
6. Copy the **API key** and **API secret key**

### Update Environment Variables

1. Update `/Users/rachid/workspace/ordernimbus/env.json`:
```json
"ShopifyOAuthFunction": {
  "SHOPIFY_API_KEY": "your-actual-api-key-from-shopify",
  "SHOPIFY_API_SECRET": "your-actual-api-secret-from-shopify",
  "SHOPIFY_REDIRECT_URI": "http://localhost:3000/shopify/callback",
  // ... other settings
}
```

2. Restart SAM API:
```bash
# Kill existing process
pkill -f "sam local start-api"

# Restart with new env vars
sam local start-api --env-vars env.json --docker-network ordernimbus-network --port 3001 --skip-pull-image --host 127.0.0.1 &
```

## Step 5: Test the Integration

1. Go to http://localhost:3000/#/stores
2. Click **Connect Shopify**
3. Enter your store domain (e.g., `your-store.myshopify.com`)
4. Click **Connect to Shopify**
5. You'll be redirected to Shopify to approve the app
6. After approval, you'll be redirected back and the store will be connected

## For Production Deployment

When deploying to AWS:

1. Store credentials in AWS Secrets Manager:
```bash
aws secretsmanager create-secret \
  --name ordernimbus-production-shopify \
  --secret-string '{"apiKey":"your-api-key","apiSecret":"your-api-secret"}'
```

2. Update the template.yaml to reference the secret (already configured)

3. Update redirect URLs in Shopify app settings to your production domain:
   - https://your-domain.com/shopify/callback

## Troubleshooting

### "application_cannot_be_found" Error
- You're using placeholder credentials (`test-api-key`)
- Follow Step 2 or Step 4 to get real credentials

### "Invalid API key or access token" Error
- The API key or token is incorrect
- Verify you copied them correctly from Shopify

### OAuth Redirect Issues
- Ensure redirect URLs match exactly in Shopify app settings
- Check that ports (3000, 3001) are correct

## Security Notes

- Never commit real API credentials to git
- Use environment variables or AWS Secrets Manager
- In production, always use OAuth flow instead of static tokens
- Rotate access tokens regularly