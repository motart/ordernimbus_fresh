# Shopify App Types - Which One for OrderNimbus?

## The Problem
You want EVERY OrderNimbus user to seamlessly connect their Shopify store without dealing with API keys.

## Shopify App Types

### 1. Custom App (What you created) - ❌ NOT suitable
- **One app per store** - Each merchant creates their own
- **Uses Access Token** - Direct API access, no OAuth
- **Problem**: Every user would need to create their own custom app = NOT seamless

### 2. Public App (What you NEED) - ✅ CORRECT
- **One app for ALL stores** - You create ONE app, all users install it
- **Uses OAuth** - API Key + Secret for OAuth flow
- **Perfect**: Users just click "Connect" and authorize = SEAMLESS

### 3. Private App (Deprecated)
- Shopify no longer supports creating new private apps

## What You Need to Do

### Step 1: Create a PUBLIC App (Not Custom)

1. Go to [Shopify Partners](https://partners.shopify.com/)
2. Click **Apps** → **Create app**
3. Choose **Public app** (NOT Custom app)
4. Fill in:
   - **App name**: OrderNimbus
   - **App URL**: https://ordernimbus.com (or http://localhost:3000 for dev)
   - **Allowed redirection URLs**: 
     - `http://localhost:3001/api/shopify/callback`
     - `https://api.ordernimbus.com/shopify/callback` (for production)

### Step 2: Get Your OAuth Credentials

After creating the PUBLIC app:
1. Go to **App setup** → **API credentials**
2. You'll see:
   - **API key**: (like: `8f7d9c2a1b3e4f5a6d7c8b9a0e1f2d3c`)
   - **API secret key**: (like: `shpss_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p`)

These are what go in `env.json`:
```json
"ShopifyOAuthFunction": {
  "SHOPIFY_API_KEY": "8f7d9c2a1b3e4f5a6d7c8b9a0e1f2d3c",
  "SHOPIFY_API_SECRET": "shpss_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p",
  ...
}
```

## How It Works

### For You (Platform Owner):
1. Create ONE public app
2. Add credentials to your deployment
3. Done forever

### For Your Users:
1. Enter store: "mystore.myshopify.com"
2. Click "Connect"
3. See Shopify's authorization page
4. Click "Install app"
5. Done - data syncs automatically

## The Key Difference

### Custom App (Wrong approach):
```
User → Creates their own app → Gets access token → Enters token in OrderNimbus
❌ Complex for users
```

### Public App (Right approach):
```
User → Clicks Connect → Authorizes YOUR app → OrderNimbus gets token automatically
✅ Seamless for users
```

## Your Custom App Access Token

The access token you have from your custom app is ONLY for YOUR store. It won't work for other users' stores. That's why you need a public app with OAuth.

## Migration Path

1. Keep your custom app for testing your own store
2. Create a public app for OrderNimbus platform
3. Use the public app's credentials in production

## Testing Locally

For local development, you can:
1. Use your public app credentials in `env.json`
2. Set redirect URL to `http://localhost:3001/api/shopify/callback`
3. Test with any Shopify development store

## Production Deployment

For AWS production:
1. Store credentials in AWS Secrets Manager
2. Update redirect URL to your production domain
3. All users connect through the same app

## Summary

- **Don't use**: Custom App with access tokens
- **Do use**: Public App with OAuth (API key + secret)
- **Result**: One app, infinite users, seamless connection