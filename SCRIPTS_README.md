# OrderNimbus Scripts Guide

## 🚀 Main Scripts (Use These!)

### `deploy.sh` - Universal Deployment Script
Deploys OrderNimbus to any environment with smart configuration.

```bash
# Local deployment
./deploy.sh local

# Staging deployment
./deploy.sh staging [region] [skip-tests]

# Production deployment  
./deploy.sh production [region] [skip-tests]

# Examples:
./deploy.sh local                    # Local development
./deploy.sh staging us-west-1        # Deploy to staging in us-west-1
./deploy.sh production us-west-1 true # Deploy to production, skip tests
```

**Features:**
- ✅ Dynamic API URL discovery
- ✅ Smart configuration management
- ✅ Automatic resource creation
- ✅ Shopify integration setup
- ✅ Frontend build with correct API URLs
- ✅ Lambda deployment with CORS
- ✅ CloudFront cache invalidation

### `destroy.sh` - Universal Destruction Script
Safely removes all resources for specified environment.

```bash
# Local cleanup
./destroy.sh local

# Staging destruction
./destroy.sh staging [region] [force]

# Production destruction (requires extra confirmation)
./destroy.sh production [region] [force]

# Examples:
./destroy.sh local                   # Clean local environment
./destroy.sh staging us-west-1       # Destroy staging (with confirmation)
./destroy.sh production us-west-1 true # Force destroy production (DANGEROUS!)
```

**Safety Features:**
- ⚠️ Requires confirmation (type "DELETE")
- ⚠️ Production requires "DELETE PRODUCTION"
- ✅ Empties S3 buckets before deletion
- ✅ Handles CloudFront distributions
- ✅ Removes Cognito domains
- ✅ Cleans up orphaned resources

## 📦 Helper Scripts

### `redeploy-frontend.sh`
Quick frontend redeployment with automatic API URL discovery.

```bash
./redeploy-frontend.sh [environment]
```

### `test-shopify-flow.sh`
Integration test script for Shopify OAuth and data flow.

```bash
./test-shopify-flow.sh
```

## 📁 Configuration

### `config.json`
Central configuration file for all environments.

```json
{
  "environments": {
    "local": {
      "APP_URL": "http://localhost:3000",
      "API_URL": "http://localhost:3001",
      ...
    },
    "aws": {
      "APP_URL": "https://app.ordernimbus.com",
      "API_URL": "dynamically discovered",
      ...
    }
  }
}
```

### `cloudformation-simple.yaml`
CloudFormation template for AWS infrastructure.

## 🗂️ Archived Scripts

All old deployment and utility scripts have been moved to `archived-scripts/` directory. These are kept for reference but should not be used. Always use the main `deploy.sh` and `destroy.sh` scripts.

## 🔄 Typical Workflows

### Initial Setup
```bash
# Deploy to local
./deploy.sh local

# Deploy to staging
./deploy.sh staging

# Deploy to production
./deploy.sh production
```

### Update Frontend Only
```bash
./redeploy-frontend.sh production
```

### Complete Reset
```bash
# Destroy environment
./destroy.sh staging

# Redeploy fresh
./deploy.sh staging
```

### Testing
```bash
# Run integration tests
./test-shopify-flow.sh

# Check deployment
curl https://your-api-url/api
```

## 🛠️ Troubleshooting

### API URL Not Found
The deploy script automatically discovers the API URL from CloudFormation. If it fails:
1. Check CloudFormation stack outputs
2. Look for API Gateway in AWS Console
3. Update config.json manually if needed

### CloudFront Not Updating
```bash
# Manual cache invalidation
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

### Stack Deletion Failed
1. Check CloudFormation events for error
2. Manually empty S3 buckets
3. Delete Cognito domains
4. Retry: `./destroy.sh environment region true`

## 📝 Notes

- **Always use the main scripts** - They handle all edge cases
- **Check config.json** - Ensure settings are correct
- **Monitor AWS costs** - Use appropriate instance sizes
- **Test in staging first** - Never deploy directly to production
- **Keep backups** - Export DynamoDB data before destruction

## 🔐 Security

- Shopify credentials are stored in AWS Secrets Manager
- API keys should never be committed to git
- Use IAM roles with minimal permissions
- Enable CloudTrail for audit logging

---

For issues or questions, check the archived scripts for reference implementations or create an issue in the repository.