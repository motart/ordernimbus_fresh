# Shopify Development Store Setup Guide

This guide will help you set up a Shopify development store with sample data that OrderNimbus can connect to and pull real data from.

## Step 1: Create a Shopify Partners Account (Free)

1. Go to [partners.shopify.com](https://partners.shopify.com)
2. Click "Join now" and create a free account
3. Complete the registration process

## Step 2: Create a Development Store

1. In your Partners dashboard, click "Stores" in the left sidebar
2. Click "Add store" → "Create development store"
3. Choose store type:
   - **"Create a store to test and build"** (recommended)
   - This automatically includes sample data!
4. Store details:
   - Store name: `ordernimbus-test` (or any name)
   - Store URL: `ordernimbus-test.myshopify.com`
   - Password: Auto-generated (save this!)
5. Click "Create development store"

## Step 3: Generate Sample Data (Automatic)

Shopify development stores come with:
- **Sample products** (50+ products across categories)
- **Sample orders** (100+ orders with various statuses)
- **Sample customers** (50+ customers)
- **Inventory data** (stock levels for all products)

To add more sample data:
1. Log into your development store admin
2. Go to Settings → Apps and sales channels
3. Look for "Sample Data Generator" or install it from Shopify App Store
4. Generate additional test data as needed

## Step 4: Create Private App for API Access

1. In your development store admin, go to:
   - Settings → Apps and sales channels → Develop apps
2. Click "Create an app"
3. App name: `OrderNimbus Integration`
4. Configure Admin API scopes:
   - `read_products`
   - `read_orders`
   - `read_inventory`
   - `read_locations`
5. Click "Install app"
6. Go to "API credentials" tab
7. Copy the **Admin API access token** (starts with `shpat_`)

## Step 5: Connect to OrderNimbus

1. In OrderNimbus, click "Add Store"
2. Select "Shopify" as the store type
3. Enter:
   - **Store Name**: Your store name
   - **Shopify Domain**: `ordernimbus-test.myshopify.com`
   - **API Key**: Paste your Admin API access token
4. Click "Save"

OrderNimbus will automatically:
- Connect to your development store
- Pull all products, orders, and inventory
- Use this real Shopify data for forecasting

## Alternative: Use Shopify's Public Demo Store

If you want to quickly test without creating an account:

1. Use these demo credentials in OrderNimbus:
   - **Shopify Domain**: `quickstart-abcd1234.myshopify.com`
   - **API Key**: Leave empty or use `development-mode`

Note: This will use locally generated sample data, not real Shopify data.

## Testing with Real Data

### Option A: Use Existing Development Store
Many developers already have development stores. You can use any existing store:
1. Get the store domain (e.g., `my-test-store.myshopify.com`)
2. Create a private app as described in Step 4
3. Use those credentials in OrderNimbus

### Option B: Use Shopify's GraphQL Storefront API (Public)
Some Shopify stores have public Storefront API access:
- Domain: `graphql.myshopify.com`
- No API key needed for public data
- Limited to public product information

## Troubleshooting

### "Invalid API credentials"
- Ensure you're using the Admin API access token (starts with `shpat_`)
- Check that the token has the required scopes
- Verify the domain format: `store-name.myshopify.com`

### "No data returned"
- Ensure your development store has sample data
- Check API scopes include read permissions
- Try regenerating the API token

### Rate Limiting
- Shopify allows 2 requests per second by default
- Development stores have higher limits
- OrderNimbus handles rate limiting automatically

## Security Notes

- **Never share your API access token publicly**
- Store tokens securely (OrderNimbus encrypts them)
- Use separate tokens for development and production
- Rotate tokens regularly

## Benefits of Using Real Shopify Development Stores

1. **Real API responses** - Test actual Shopify API behavior
2. **Realistic data structures** - Products with variants, metafields, etc.
3. **Webhook testing** - Set up real-time sync (future feature)
4. **Free forever** - Development stores never expire
5. **Unlimited products/orders** - No restrictions on data volume

## Next Steps

After connecting your Shopify development store:
1. View imported products in OrderNimbus
2. Check sales data from orders
3. Generate AI forecasts based on real data patterns
4. Test inventory management features

For production use, simply replace the development store credentials with your real Shopify store's API credentials.