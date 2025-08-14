# Shopify OAuth Redirect URI Configuration

## Current Production Redirect URI
```
https://tvaog6ef2f.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback
```

## How It Works
The Lambda function now dynamically generates the redirect URI based on the API Gateway context. This ensures the redirect URI always matches the current API Gateway URL, even after stack teardowns and redeployments.

## Shopify App Configuration
To configure your Shopify App to work with OrderNimbus:

1. Go to your Shopify Partners Dashboard
2. Navigate to your app's settings
3. In the "App URLs" section, add the following redirect URI:
   ```
   https://tvaog6ef2f.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback
   ```

4. Also add these backup URLs (for different environments):
   - Staging: `https://<staging-api-id>.execute-api.us-west-1.amazonaws.com/staging/api/shopify/callback`
   - Development: `http://localhost:3001/api/shopify/callback`

## Important Notes
- The redirect URI is now **dynamically generated** from the API Gateway request context
- After redeployment, the Lambda will automatically use the new API Gateway URL
- No manual intervention needed after stack teardown/redeploy
- The Lambda logs the redirect URI for debugging: check CloudWatch logs for "Redirect URI:"

## Troubleshooting
If you get a "redirect_uri is not whitelisted" error:
1. Check CloudWatch logs for the actual redirect URI being used
2. Ensure that exact URI is added to your Shopify App settings
3. Verify the API Gateway URL hasn't changed (check CloudFormation outputs)

## Technical Implementation
The Lambda function determines the redirect URI using this logic:
```javascript
const domainName = event.requestContext?.domainName || event.headers?.Host;
const stage = event.requestContext?.stage || 'production';
const API_GATEWAY_URL = domainName 
  ? `https://${domainName}/${stage}`
  : `https://${process.env.API_GATEWAY_URL || 'tvaog6ef2f.execute-api.us-west-1.amazonaws.com/production'}`;
const REDIRECT_URI = `${API_GATEWAY_URL}/api/shopify/callback`;
```

This ensures the redirect URI always matches the actual API Gateway endpoint being used.