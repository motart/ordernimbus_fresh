# Development Store Setup

This guide explains how to set up automatic store connection for development.

## How It Works

When running OrderNimbus locally (development mode), the app can automatically connect to predefined Shopify dev stores without requiring manual token entry.

## Setting Up Your Dev Store

### 1. Create a Shopify Dev Store

If you don't have one already:
1. Go to [Shopify Partners](https://partners.shopify.com)
2. Click "Stores" > "Add store" > "Create development store"
3. Name it something recognizable (e.g., "ordernimbus-dev")

### 2. Create a Custom App

1. In your dev store admin, go to Settings > Apps and sales channels
2. Click "Develop apps"
3. Click "Create an app"
4. Name it "OrderNimbus Dev"
5. Configure API scopes:
   - `read_products`
   - `read_orders`
   - `write_orders`
   - `read_inventory`
   - `read_customers`
   - `read_analytics`
   - `read_locations`
   - `read_fulfillments`
6. Install the app
7. Go to "API credentials" tab
8. Copy the **Admin API access token** (starts with `shpat_`)

### 3. Configure OrderNimbus

1. Copy the sample environment file:
   ```bash
   cd app/frontend
   cp .env.development.sample .env.development.local
   ```

2. Edit `.env.development.local` and add your token:
   ```
   REACT_APP_DEV_SHOPIFY_TOKEN=shpat_YOUR_ACTUAL_TOKEN_HERE
   ```

3. (Optional) Add more stores by updating `src/config/devTokens.ts`:
   ```typescript
   export const DEV_STORES: Record<string, DevStoreConfig> = {
     'ordernimbus-dev': {
       domain: 'ordernimbus-dev.myshopify.com',
       token: process.env.REACT_APP_DEV_SHOPIFY_TOKEN || '',
       displayName: 'OrderNimbus Dev Store'
     },
     'my-other-store': {
       domain: 'my-other-store.myshopify.com',
       token: process.env.REACT_APP_DEV_SHOPIFY_TOKEN_STORE2 || '',
       displayName: 'My Other Store'
     }
   };
   ```

## Using Dev Mode

1. Start the app in development mode:
   ```bash
   npm start
   ```

2. When adding a store:
   - Enter your dev store name (e.g., "ordernimbus-dev")
   - The app will automatically detect it's a dev store
   - No need to enter the token - it will use the configured one
   - Click "Connect Store"

## Benefits

- **Faster Development**: No need to copy/paste tokens repeatedly
- **Multiple Stores**: Support multiple dev stores with different tokens
- **Automatic Detection**: App knows when you're in dev mode
- **Security**: Tokens are stored in `.env.development.local` (gitignored)

## Production Mode

In production:
- Dev store auto-detection is disabled
- Users must use OAuth or provide their own Custom App tokens
- No hardcoded tokens are used

## Troubleshooting

### "Dev store not detected"
- Check that your store name matches exactly (without .myshopify.com)
- Verify the store is listed in `src/config/devTokens.ts`
- Ensure you're running in development mode (localhost)

### "Invalid token"
- Verify the token in `.env.development.local` is correct
- Check that the token has all required permissions
- Try regenerating the token in Shopify admin

### Environment variables not loading
- Restart the development server after changing `.env` files
- Ensure the file is named `.env.development.local` (not `.env.development`)