# Shopify App Setup Guide for OrderNimbus

## Your App Credentials
- **Client ID**: `d4599bc60ea67dabd0be7fccc10476d9`
- **Client Secret**: Stored securely in AWS Secrets Manager

## Important URLs
- **App URL**: `http://app.ordernimbus.com`
- **Redirect URL**: `https://1w571burd5.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback`

## Setting Up Your Shopify App

### 1. Access Shopify Partners Dashboard
1. Go to https://partners.shopify.com
2. Log in with your partner account
3. Navigate to "Apps" in the sidebar

### 2. Create or Update Your App
1. Click "Create app" or select your existing app
2. Choose "Public app" type

### 3. Configure App Settings

#### Basic Information
- **App name**: OrderNimbus
- **App URL**: `http://app.ordernimbus.com`
- **Redirect URLs**: 
  ```
  https://1w571burd5.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback
  ```

#### App Permissions (Scopes)
Enable the following scopes:
- `read_products` - Access product information
- `read_orders` - Access order data
- `read_inventory` - Access inventory levels
- `read_customers` - Access customer information

### 4. Install URL Configuration
Set the install URL to:
```
http://app.ordernimbus.com/stores
```

## How the OAuth Flow Works

1. **User initiates connection**:
   - User clicks "Connect Shopify" in OrderNimbus
   - Enters their Shopify store domain

2. **OAuth redirect**:
   - Lambda generates OAuth URL with your Client ID
   - User is redirected to Shopify for authorization

3. **User authorizes**:
   - User reviews permissions and approves
   - Shopify redirects back with authorization code

4. **Token exchange**:
   - Lambda exchanges code for access token
   - Token is securely stored in DynamoDB

5. **Connection complete**:
   - Popup closes automatically
   - Store appears in user's dashboard

## Testing the Connection

### Test with a Development Store
1. Create a development store in Shopify Partners
2. Go to http://app.ordernimbus.com
3. Login with test credentials:
   - Email: `test@ordernimbus.com`
   - Password: `Test1234`
4. Navigate to "Stores"
5. Click "Connect Shopify"
6. Enter your dev store domain (e.g., `my-dev-store.myshopify.com`)
7. Authorize the app when redirected to Shopify

### Troubleshooting

#### Blank Popup Issue
✅ **Fixed**: The Lambda now properly generates OAuth URLs

#### "Invalid API Key" Error
- Verify Client ID in Shopify Partners matches the one in Secrets Manager
- Check that the app is not in "Test mode" if using production stores

#### "Invalid redirect_uri" Error
- Ensure the redirect URL in Shopify app settings exactly matches:
  ```
  https://1w571burd5.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback
  ```

#### Connection Times Out
- Check that popups are not blocked in the browser
- Verify the Lambda function has proper IAM permissions

## Security Considerations

1. **Credentials Storage**:
   - Client Secret is stored in AWS Secrets Manager
   - Access tokens are encrypted in DynamoDB
   - Never expose credentials in frontend code

2. **State Parameter**:
   - Used for CSRF protection
   - Validated on callback to prevent attacks

3. **Token Management**:
   - Tokens are scoped to specific permissions
   - Each store connection is isolated per user

## API Endpoints

### Connect Store
```bash
POST /api/shopify/connect
{
  "storeDomain": "store.myshopify.com",
  "userId": "user-123"
}
```

### OAuth Callback
```
GET /api/shopify/callback?code=xxx&state=yyy&shop=zzz
```

### Sync Data
```bash
POST /api/shopify/sync
{
  "storeId": "store-123",
  "syncType": "full"
}
```

## Next Steps

After successfully connecting a store:
1. Data sync will begin automatically
2. Products, orders, and inventory will be imported
3. Analytics and forecasting become available
4. Real-time updates via webhooks (if configured)

## Support

If you encounter issues:
1. Check Lambda logs: `aws logs tail /aws/lambda/ordernimbus-production-main --region us-west-1`
2. Verify Secrets Manager has correct credentials
3. Ensure DynamoDB table exists and is accessible
4. Check API Gateway CORS configuration