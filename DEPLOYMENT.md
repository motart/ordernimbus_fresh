# OrderNimbus - One-Command Deployment

## 🚀 Quick Start

Deploy the entire OrderNimbus application with a single command:

```bash
./deploy-complete.sh
```

That's it! The script will handle everything automatically.

## 📋 What Gets Deployed

The deployment creates a complete serverless infrastructure including:

### Infrastructure Components
- **API Gateway**: HTTP API with CORS enabled
- **Lambda Functions**: 6 serverless functions
  - Products Management
  - Orders Management
  - Inventory Management
  - Customers Management
  - Notifications Management
  - Stores Management
- **DynamoDB Tables**: 5 NoSQL tables
  - Stores
  - Products
  - Orders
  - Sales
  - OAuth States
- **S3 Bucket**: Static website hosting
- **CloudFront**: Global CDN distribution
- **Cognito**: User authentication

### Features
- ✅ **100% Serverless**: No servers to manage
- ✅ **Auto-scaling**: Handles any load automatically
- ✅ **CORS Configured**: No cross-origin issues
- ✅ **Secure**: IAM roles and policies configured
- ✅ **Cost-effective**: Pay only for what you use

## 🛠 Prerequisites

Before running the deployment, ensure you have:

1. **AWS CLI** installed and configured
   ```bash
   aws --version
   aws configure
   ```

2. **Node.js** and **npm** installed
   ```bash
   node --version
   npm --version
   ```

3. **jq** installed (for JSON parsing)
   ```bash
   # macOS
   brew install jq
   
   # Linux
   sudo apt-get install jq
   ```

## 📦 Deployment Options

### Basic Deployment (Staging)
```bash
./deploy-complete.sh
```

### Production Deployment
```bash
./deploy-complete.sh production
```

### Custom Region
```bash
./deploy-complete.sh staging us-west-2
```

## 🔧 Manual Deployment

If you prefer to deploy manually:

1. **Deploy CloudFormation Stack**
   ```bash
   aws cloudformation create-stack \
     --stack-name ordernimbus-staging-complete \
     --template-body file://cloudformation-complete.yaml \
     --parameters ParameterKey=Environment,ParameterValue=staging \
     --capabilities CAPABILITY_IAM \
     --region us-east-1
   ```

2. **Wait for Stack Creation**
   ```bash
   aws cloudformation wait stack-create-complete \
     --stack-name ordernimbus-staging-complete \
     --region us-east-1
   ```

3. **Get Stack Outputs**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name ordernimbus-staging-complete \
     --query 'Stacks[0].Outputs' \
     --region us-east-1
   ```

4. **Build and Deploy Frontend**
   ```bash
   cd app/frontend
   npm install
   npm run build
   aws s3 sync build/ s3://[YOUR-S3-BUCKET]/ --delete
   ```

## 🧹 Cleanup

To remove all resources:

```bash
# Delete the stack (removes all resources)
aws cloudformation delete-stack \
  --stack-name ordernimbus-staging-complete \
  --region us-east-1

# Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name ordernimbus-staging-complete \
  --region us-east-1
```

## 🔍 Troubleshooting

### Stack Creation Failed
Check the CloudFormation console for detailed error messages:
```bash
aws cloudformation describe-stack-events \
  --stack-name ordernimbus-staging-complete \
  --region us-east-1
```

### Lambda Functions Not Working
Check Lambda logs:
```bash
aws logs tail /aws/lambda/ordernimbus-staging-products-management \
  --region us-east-1
```

### Frontend Not Loading
1. Check S3 bucket has files
2. Verify CloudFront distribution is enabled
3. Wait for CloudFront propagation (can take 15-20 minutes)

### CORS Errors
The template includes CORS configuration, but if issues persist:
1. Check API Gateway CORS settings
2. Verify Lambda functions return CORS headers
3. Clear browser cache

## 📊 Cost Estimation

For typical usage (staging environment):
- **Lambda**: ~$0-5/month (first 1M requests free)
- **API Gateway**: ~$0-10/month (first 1M requests free)
- **DynamoDB**: ~$0-25/month (on-demand pricing)
- **S3**: ~$0-5/month (storage and requests)
- **CloudFront**: ~$0-10/month (first 1TB free)
- **Total**: ~$5-50/month for moderate usage

## 🔐 Security Notes

- All Lambda functions use least-privilege IAM roles
- API endpoints require userId header for authentication
- Cognito handles user authentication securely
- S3 bucket is configured for static website hosting only
- CloudFront provides HTTPS encryption

## 📝 Environment Variables

The frontend uses these environment variables (automatically configured):
- `REACT_APP_API_URL`: API Gateway endpoint
- `REACT_APP_ENVIRONMENT`: Current environment (staging/production)
- `REACT_APP_USER_POOL_ID`: Cognito User Pool ID
- `REACT_APP_CLIENT_ID`: Cognito Client ID
- `REACT_APP_REGION`: AWS Region

## 🚦 Deployment Status

After deployment, the script will show:
- ✅ Green checkmarks for successful components
- ⚠️ Yellow warnings for components needing initialization
- ❌ Red X for failed components

## 📚 Additional Resources

- [AWS CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [DynamoDB Documentation](https://docs.aws.amazon.com/dynamodb/)

## 💡 Tips

1. **First Deployment**: May take 15-20 minutes
2. **Updates**: Subsequent deployments are faster (~5-10 minutes)
3. **Cold Starts**: First API calls may be slow (Lambda initialization)
4. **CloudFront**: Changes take time to propagate globally
5. **Costs**: Use AWS Cost Explorer to monitor spending

## 🤝 Support

For issues or questions:
1. Check CloudFormation events for errors
2. Review Lambda function logs
3. Verify all prerequisites are installed
4. Ensure AWS credentials have sufficient permissions

---

**Note**: This deployment creates real AWS resources that incur costs. Always clean up resources when not needed.