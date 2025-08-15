# Shopify App Setup Instructions

## CRITICAL: Redirect URI Configuration

The Shopify OAuth flow requires the redirect URI to be **exactly** whitelisted in your Shopify Partners Dashboard.

### Current Production Redirect URI
```
https://p12brily0d.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback
```

## How to Add Redirect URI to Shopify App

1. **Log in to Shopify Partners Dashboard**
   - Go to: https://partners.shopify.com
   - Sign in with your partner account

2. **Navigate to Your App**
   - Click on "Apps" in the left sidebar
   - Select your OrderNimbus app

3. **Go to App Setup**
   - Click on "Configuration" or "App setup" in the left menu

4. **Add Redirect URI**
   - Find the "App URL" or "Allowed redirection URL(s)" section
   - Add this EXACT URL:
   ```
   https://p12brily0d.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback
   ```
   - Make sure there are NO trailing slashes or extra spaces
   - Save the changes

5. **Verify the Configuration**
   - The URL must match EXACTLY what the Lambda generates
   - Check for typos or extra characters
   - Ensure the save was successful

## Important Notes

⚠️ **The redirect URI must match EXACTLY** - even a trailing slash difference will cause the "invalid_request" error

⚠️ **Multiple Environments**: If you have staging/development environments, add those redirect URIs too:
- Staging: `https://YOUR_STAGING_API/staging/api/shopify/callback`
- Development: `http://localhost:3001/api/shopify/callback`

⚠️ **Dynamic Generation**: The Lambda dynamically generates this URI based on the API Gateway context, so it will always use the correct domain

## Troubleshooting

If you still get "The redirect_uri is not whitelisted" error:

1. **Double-check the exact URL** being generated:
   ```bash
   curl -X POST https://p12brily0d.execute-api.us-west-1.amazonaws.com/production/api/shopify/connect \
     -H "Content-Type: application/json" \
     -d '{"userId":"test","storeDomain":"test.myshopify.com"}' \
     -s | jq -r '.authUrl'
   ```

2. **Verify in Shopify Partners Dashboard** that the URL is saved correctly

3. **Clear browser cache** and try again

4. **Check for multiple apps** - make sure you're configuring the right app

## Current App Credentials

- **Client ID**: `d4599bc60ea67dabd0be7fccc10476d9`
- **App Name**: OrderNimbus (or your configured app name)

## Support

If the issue persists after following these steps, check:
- Shopify Partners Dashboard for any app suspension or issues
- AWS CloudWatch logs for the exact redirect URI being generated
- Ensure the Shopify app is approved and installed correctly