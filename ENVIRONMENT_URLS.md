# OrderNimbus Environment URLs Configuration

## Local Development
- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001
- **Shopify Callback**: http://localhost:3001/api/shopify/callback

## Staging Environment
- **Frontend**: https://staging.ordernimbus.com
- **API**: https://api-staging.ordernimbus.com
- **Shopify Callback**: https://api-staging.ordernimbus.com/shopify/callback

## Production Environment
- **Frontend**: https://app.ordernimbus.com
- **API**: https://api.ordernimbus.com
- **Shopify Callback**: https://api.ordernimbus.com/shopify/callback

## Shopify App Configuration

### Required Redirect URLs in Shopify Partners Dashboard

Add ALL of these to your app's "Allowed redirection URL(s)":

```
http://localhost:3001/api/shopify/callback
http://localhost:3000/shopify/callback
https://api-staging.ordernimbus.com/shopify/callback
https://staging.ordernimbus.com/shopify/callback
https://api.ordernimbus.com/shopify/callback
https://app.ordernimbus.com/shopify/callback
```

### App URL Configuration

Set your app URL based on environment:
- **Development**: http://localhost:3000
- **Staging**: https://staging.ordernimbus.com  
- **Production**: https://app.ordernimbus.com

## Environment Variables

### Local (env.json)
```json
{
  "ShopifyOAuthFunction": {
    "ENVIRONMENT": "local",
    "SHOPIFY_API_KEY": "your-api-key",
    "SHOPIFY_API_SECRET": "your-api-secret",
    "SHOPIFY_REDIRECT_URI": "http://localhost:3001/api/shopify/callback",
    "APP_URL": "http://localhost:3000"
  }
}
```

### Staging (CloudFormation)
```yaml
Environment:
  Variables:
    ENVIRONMENT: staging
    SHOPIFY_REDIRECT_URI: https://api-staging.ordernimbus.com/shopify/callback
    APP_URL: https://staging.ordernimbus.com
```

### Production (CloudFormation)
```yaml
Environment:
  Variables:
    ENVIRONMENT: production
    SHOPIFY_REDIRECT_URI: https://api.ordernimbus.com/shopify/callback
    APP_URL: https://app.ordernimbus.com
```

## DNS Setup Required

### Production
- `app.ordernimbus.com` → CloudFront Distribution (Frontend)
- `api.ordernimbus.com` → API Gateway (Backend)

### Staging  
- `staging.ordernimbus.com` → CloudFront Distribution (Frontend)
- `api-staging.ordernimbus.com` → API Gateway (Backend)

## How It Works

1. **Lambda detects environment** from `ENVIRONMENT` variable
2. **Automatically uses correct URLs** for that environment
3. **Shopify redirects** to the right callback URL
4. **Success page redirects** to the right frontend URL

## Testing Each Environment

### Local
```bash
./scripts/start-local.sh
# Visit http://localhost:3000
```

### Staging
```bash
./deploy.sh staging
# Visit https://staging.ordernimbus.com
```

### Production
```bash
./deploy.sh production
# Visit https://app.ordernimbus.com
```

## Important Notes

1. **One Shopify App**: The same app works for all environments
2. **Multiple Redirect URLs**: Shopify allows multiple redirect URLs per app
3. **Automatic Selection**: Lambda picks the right URL based on environment
4. **No Manual Changes**: Deploy to any environment without code changes