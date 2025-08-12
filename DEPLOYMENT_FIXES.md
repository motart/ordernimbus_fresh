# OrderNimbus Deployment Fixes Summary

This document summarizes all the fixes applied to the OrderNimbus deployment scripts and infrastructure.

## Key Improvements Made

### 1. Dynamic API URL Configuration
- **Problem**: Frontend was hardcoding API URLs (localhost, api.ordernimbus.com, etc.)
- **Solution**: 
  - Frontend now uses `process.env.REACT_APP_API_URL` environment variable
  - Deploy script sets this from CloudFormation output (`$API_URL`)
  - Lambda uses `API_GATEWAY_URL` environment variable for Shopify callbacks

### 2. CloudFormation Template Fixes
- **Problem**: Stack deployment failed due to existing resources
- **Solution**:
  - Changed S3 bucket name from `app.ordernimbus.com` to `ordernimbus-production-frontend-${AWS::AccountId}`
  - Removed conflicting DNS record for app.ordernimbus.com (managed by CloudFront)
  - Fixed API DNS record reference

### 3. SSL/HTTPS Configuration
- **Problem**: API Gateway doesn't have SSL certificate for api.ordernimbus.com
- **Solution**: 
  - Using direct API Gateway URL until custom domain is configured
  - CloudFront properly configured for app.ordernimbus.com with SSL

### 4. Shopify OAuth Integration
- **Problem**: Redirect URI was using non-existent API Gateway URLs
- **Solution**:
  - Lambda dynamically determines redirect URI from `API_GATEWAY_URL` environment variable
  - Falls back to constructing URL from event context if env var not set

## Updated Scripts

### deploy-simple.sh
Key changes:
```bash
# Use actual API Gateway URL from CloudFormation output
REACT_APP_API_URL="$API_URL" \
REACT_APP_ENVIRONMENT="production" \
REACT_APP_REGION="$REGION" \
REACT_APP_USER_POOL_ID="$USER_POOL_ID" \
REACT_APP_CLIENT_ID="$USER_POOL_CLIENT_ID" \
npm run build

# Lambda environment includes API_GATEWAY_URL
aws lambda update-function-configuration \
    --function-name "ordernimbus-production-main" \
    --environment "Variables={
        TABLE_NAME=ordernimbus-production-main,
        ENVIRONMENT=production,
        USER_POOL_ID=$USER_POOL_ID,
        USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID,
        API_GATEWAY_URL=$API_URL
    }"
```

### destroy-simple.sh
Comprehensive cleanup of:
- CloudFront distributions
- S3 buckets (including app.ordernimbus.com)
- API Gateway
- Lambda functions
- DynamoDB tables
- Cognito User Pools
- DNS records (api.ordernimbus.com)
- Secrets Manager secrets

### cloudformation-simple.yaml
- Fixed S3 bucket naming conflict
- Removed duplicate DNS records
- Proper API Gateway DNS configuration

## Environment Variables

The deployment now properly uses these environment variables:

| Variable | Purpose | Set By |
|----------|---------|--------|
| `REACT_APP_API_URL` | API Gateway endpoint | CloudFormation output |
| `REACT_APP_USER_POOL_ID` | Cognito User Pool ID | CloudFormation output |
| `REACT_APP_CLIENT_ID` | Cognito Client ID | CloudFormation output |
| `REACT_APP_REGION` | AWS Region | Deploy script parameter |
| `API_GATEWAY_URL` | Lambda env var for callbacks | CloudFormation output |

## Current URLs

- **Frontend**: https://app.ordernimbus.com (via CloudFront)
- **API**: https://ql30cet378.execute-api.us-west-1.amazonaws.com/production
- **Future API**: https://api.ordernimbus.com (requires custom domain setup)

## Deployment Commands

```bash
# Deploy application
./deploy-simple.sh [region]

# Destroy all resources
./destroy-simple.sh [region] [force]

# Update Lambda only
./update-lambda.sh
```

## Testing

After deployment, test these endpoints:

```bash
# Test API directly
curl https://ql30cet378.execute-api.us-west-1.amazonaws.com/production/api/stores

# Test Shopify OAuth
curl -X POST https://ql30cet378.execute-api.us-west-1.amazonaws.com/production/api/shopify/connect \
  -H "Content-Type: application/json" \
  -d '{"storeDomain":"test.myshopify.com","userId":"test"}'
```

## Next Steps

1. **Custom Domain for API**: Set up API Gateway custom domain with SSL certificate for api.ordernimbus.com
2. **Monitoring**: Add CloudWatch alarms and dashboards
3. **Backup**: Implement DynamoDB backup strategy
4. **CI/CD**: Integrate with GitHub Actions for automated deployments