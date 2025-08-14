# 🚀 OrderNimbus Production Deployment Guide

## Prerequisites

- AWS CLI installed and configured (`aws configure`)
- Node.js 18+ and npm installed
- AWS account with appropriate permissions
- Region: us-west-1 (default)

## 🎯 Quick Production Deployment

### Option 1: Full Stack Deployment (Recommended)
```bash
# Deploy everything with one command
./scripts/deployment/deploy.sh production us-west-1
```

### Option 2: Frontend Only (If Backend Already Deployed)
```bash
cd app/frontend
./auto-deploy.sh production us-west-1
```

## Current Production Configuration

- **API Gateway**: `https://ay8k50buyd.execute-api.us-west-1.amazonaws.com/production`
- **User Pool ID**: `us-west-1_GeV4w2rCQ`
- **Client ID**: `2dr8p83gqu0v9iktpdq4qo2rdg`
- **Frontend Bucket**: `ordernimbus-production-frontend-335021149718`

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

# IMPORTANT: Use build:production to ensure .env.production is used
npm run build:production  # NOT just 'npm run build'

# Deploy to S3
aws s3 sync build/ s3://ordernimbus-production-frontend-335021149718/ --delete

# If using CloudFront, invalidate cache
aws cloudfront create-invalidation --distribution-id EP62VZVVDF7SQ --paths "/*"
```

## 📋 Complete Step-by-Step Deployment

### Step 1: Deploy Backend Infrastructure
```bash
cd infrastructure/cloudformation
aws cloudformation deploy \
  --template-file cloudformation-template.yaml \
  --stack-name ordernimbus-production \
  --parameter-overrides Environment=production \
  --capabilities CAPABILITY_IAM \
  --region us-west-1
```

### Step 2: Deploy Lambda Functions
```bash
cd lambda
# Package and deploy each Lambda function
for func in *.js; do
  filename="${func%.*}"
  zip -r ${filename}.zip ${func}
  aws lambda update-function-code \
    --function-name ordernimbus-production-${filename} \
    --zip-file fileb://${filename}.zip \
    --region us-west-1
done
```

### Step 3: Deploy Frontend with Correct Environment
```bash
cd app/frontend
npm install
npm run build:production  # Uses .env.production
./auto-deploy.sh production
```

## 🔍 Verify Deployment

### Test API Endpoints
```bash
# Test config endpoint (should return JSON configuration)
curl https://ay8k50buyd.execute-api.us-west-1.amazonaws.com/production/api/config

# Test stores endpoint
curl https://ay8k50buyd.execute-api.us-west-1.amazonaws.com/production/api/stores \
  -H "userId: test-user"
```

### Check Frontend
1. Visit your frontend URL (S3 or CloudFront)
2. Open browser console (F12)
3. Verify NO localhost/127.0.0.1 calls in Network tab
4. Check that API calls go to amazonaws.com endpoints

### Validate Environment Configuration
```bash
cd app/frontend
./test-environments.sh
```

## ⚠️ Critical Notes for Production

1. **Environment Variables**: 
   - Frontend MUST use `.env.production` (no localhost references)
   - Always build with `npm run build:production`, NOT `npm run build`

2. **SSL Certificates**: Must be in `us-east-1` region for CloudFront

3. **DNS Validation**: Required for new certificates - check Route53

4. **CloudFront Propagation**: Takes 15-20 minutes for changes

5. **Stack Deletion**: Can take up to 30 minutes if CloudFront is involved

6. **Shopify Credentials**: Stored in AWS Secrets Manager

## Support

For issues, check:
1. CloudFormation stack events
2. CloudWatch logs for Lambda functions
3. API Gateway execution logs
4. S3 bucket policies
5. CloudFront distribution status