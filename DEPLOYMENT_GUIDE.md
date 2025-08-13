# OrderNimbus Deployment Guide

## Current Issues & Fixes

### 1. Stack Naming Issue
**Problem**: The original `deploy.sh` script creates a stack named `ordernimbus-production-production` when deploying to production.
**Cause**: The config.json has `STACK_PREFIX` as `ordernimbus-production`, and the script adds the environment name again.
**Fix**: Use `deploy-fixed.sh` which properly handles stack naming.

### 2. CloudFront CNAME Conflict
**Problem**: CloudFront distribution with alias `app.ordernimbus.com` already exists (ID: EP62VZVVDF7SQ).
**Fix**: Run `./cleanup-cloudfront.sh` to resolve conflicts before deployment.

### 3. Failed Stack
**Current State**: Stack `ordernimbus-production-production` is in `UPDATE_ROLLBACK_COMPLETE` state.
**Fix**: Delete this stack before redeploying.

## Step-by-Step Deployment Instructions

### For Production Deployment

1. **Clean up the failed stack**:
   ```bash
   aws cloudformation delete-stack \
     --stack-name ordernimbus-production-production \
     --region us-west-1
   
   # Wait for deletion (this may take 10-15 minutes)
   aws cloudformation wait stack-delete-complete \
     --stack-name ordernimbus-production-production \
     --region us-west-1
   ```

2. **Resolve CloudFront conflicts**:
   ```bash
   ./cleanup-cloudfront.sh app.ordernimbus.com production
   # Choose option 1 to remove CNAME from existing distribution
   ```

3. **Deploy using the fixed script**:
   ```bash
   ./deploy-fixed.sh production us-west-1
   ```

### For Staging Deployment

```bash
./deploy-fixed.sh staging us-west-1
```

### For Local Development

```bash
./deploy-fixed.sh local
```

## Script Comparison

| Feature | deploy.sh (Original) | deploy-fixed.sh (Fixed) |
|---------|---------------------|------------------------|
| Stack Naming | ❌ Creates double "production" | ✅ Correct naming |
| CloudFront Conflicts | ❌ No conflict handling | ✅ Detects and handles conflicts |
| Certificate Check | ⚠️ Basic check | ✅ Comprehensive validation |
| Error Handling | ⚠️ Limited | ✅ Detailed error messages |
| Shopify Config | ✅ Working | ✅ Enhanced with APP_URL |

## Deployment Outputs

After successful deployment, you'll see:
- **API Endpoint**: The API Gateway URL
- **Frontend URL**: S3 website or CloudFront URL
- **User Pool ID**: Cognito User Pool identifier
- **Client ID**: Cognito App Client ID

## Environment Variables

The frontend build uses these environment variables:
- `REACT_APP_API_URL`: API Gateway endpoint
- `REACT_APP_ENVIRONMENT`: Environment name (staging/production)
- `REACT_APP_USER_POOL_ID`: Cognito User Pool ID
- `REACT_APP_CLIENT_ID`: Cognito Client ID
- `REACT_APP_REGION`: AWS Region

## CloudFormation Templates

- `cloudformation-simple.yaml`: Main template for all environments
- `cloudformation-complete.yaml`: Full-featured template (not currently used)
- `cloudformation-domain.yaml`: Domain-specific resources (optional)

## Troubleshooting

### Stack Creation Failed
```bash
# View failure reasons
aws cloudformation describe-stack-events \
  --stack-name ordernimbus-production \
  --region us-west-1 \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
  --output table
```

### CloudFront Distribution Issues
```bash
# List all distributions
aws cloudfront list-distributions \
  --query "DistributionList.Items[].{Id:Id,Aliases:Aliases.Items,Status:Status}" \
  --output table

# Check specific distribution
aws cloudfront get-distribution \
  --id DISTRIBUTION_ID \
  --query 'Distribution.{Status:Status,DomainName:DomainName,Aliases:DistributionConfig.Aliases.Items}'
```

### Certificate Issues
```bash
# List certificates in us-east-1 (required for CloudFront)
aws acm list-certificates \
  --region us-east-1 \
  --query 'CertificateSummaryList[].{Domain:DomainName,Status:Status,Arn:CertificateArn}' \
  --output table
```

## Quick Commands

### Full Production Deployment (Clean State)
```bash
# 1. Clean up any existing resources
./cleanup-cloudfront.sh app.ordernimbus.com production

# 2. Delete failed stack if exists
aws cloudformation delete-stack --stack-name ordernimbus-production-production --region us-west-1

# 3. Deploy fresh
./deploy-fixed.sh production us-west-1
```

### Update Existing Production
```bash
./deploy-fixed.sh production us-west-1
```

### Frontend-Only Update
```bash
cd app/frontend
npm run build
aws s3 sync build/ s3://ordernimbus-production-frontend-335021149718/ --delete
aws cloudfront create-invalidation --distribution-id EP62VZVVDF7SQ --paths "/*"
```

## Important Notes

1. **SSL Certificates**: Must be in `us-east-1` region for CloudFront
2. **DNS Validation**: Required for new certificates - check Route53
3. **CloudFront Propagation**: Takes 15-20 minutes for changes
4. **Stack Deletion**: Can take up to 30 minutes if CloudFront is involved
5. **Shopify Credentials**: Stored in AWS Secrets Manager

## Support

For issues, check:
1. CloudFormation stack events
2. CloudWatch logs for Lambda functions
3. API Gateway execution logs
4. S3 bucket policies
5. CloudFront distribution status