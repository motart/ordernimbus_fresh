# OrderNimbus Scripts Documentation

## 🚀 Primary Deployment Scripts

### `./deploy.sh`
**Purpose**: Master deployment script for all environments  
**Location**: `/Users/rachid/workspace/ordernimbus/deploy.sh`  
**Usage**: `./deploy.sh [environment] [region] [skip-tests]`  
**Key Features**:
- Deploys complete OrderNimbus stack to AWS
- Handles CloudFormation stack creation/updates
- Deploys Lambda functions with fallback to cached code
- Configures Cognito User Pool and creates admin user
- Updates Shopify credentials in Secrets Manager
- Builds and deploys React frontend to S3
- Configures CloudFront distribution
- Updates Route53 DNS records
- Validates deployment health

**Intelligence Added**:
- Automatic Lambda code caching in `/tmp/prod-lambda/`
- Fallback deployment from cache if Lambda code missing
- Dynamic API Gateway URL resolution for Shopify OAuth
- Automatic admin user creation with credentials output

### `./teardown-production.sh`
**Purpose**: Complete infrastructure teardown with safety checks  
**Location**: `/Users/rachid/workspace/ordernimbus/teardown-production.sh`  
**Usage**: `./teardown-production.sh`  
**Key Features**:
- Requires explicit "DELETE PRODUCTION" confirmation
- Empties all S3 buckets before deletion
- Removes CloudFormation stack
- Cleans up SSM parameters
- Deletes SNS topics
- Removes Cognito resources
- Cleans up security groups

**Safety Features**:
- Interactive confirmation required
- Shows list of resources to be deleted
- Handles resource dependencies correctly

## 📁 Scripts Directory Structure

### `/scripts/deployment/`
- **deploy.sh**: Production deployment orchestrator
- **deploy-enhanced.sh**: Enhanced deployment with retry logic
- **validate-deployment.sh**: Post-deployment validation

### `/scripts/infrastructure/`
- **destroy.sh**: Infrastructure teardown script
- **create-stack.sh**: CloudFormation stack creation

### `/scripts/utilities/`
- **validate-deployment.sh**: Health check validation
- **create-tables.sh**: DynamoDB table creation
- **clean-data.sh**: Data cleanup utilities

### `/scripts/local/`
- **start-local.sh**: Start local development environment
- **stop-local.sh**: Stop local services
- **create-local-tables.sh**: Create local DynamoDB tables

## 🧪 Testing Scripts

### `./run-tests.sh`
**Purpose**: Run all test suites  
**Location**: `/Users/rachid/workspace/ordernimbus/run-tests.sh`  
**Test Coverage**:
- Unit tests
- Integration tests  
- E2E tests
- Security tests
- Load tests (k6)

### `/tests/`
- **validate-cognito-config.sh**: Validate Cognito configuration
- **validate-shopify-redirect.sh**: Test Shopify OAuth flow
- **test-shopify-flow.sh**: End-to-end Shopify integration test

## 🔧 Utility Scripts

### Frontend Scripts
- **app/frontend/auto-deploy.sh**: Auto-build and deploy frontend
- **app/frontend/build.sh**: Build React application

### Lambda Scripts
- **lambda/deploy-lambda.sh**: Deploy Lambda functions
- **lambda/update-lambda.sh**: Update Lambda code

## 📊 NPM Scripts

### Deployment Commands
```json
{
  "deploy:staging": "./deploy.sh staging",
  "deploy:production": "./deploy.sh production",
  "deploy:local": "./deploy.sh local",
  "teardown": "./teardown-production.sh"
}
```

### Testing Commands
```json
{
  "test": "./run-tests.sh",
  "test:unit": "jest --testPathPattern=unit",
  "test:integration": "jest --testPathPattern=integration",
  "test:e2e": "cypress run",
  "test:load": "k6 run tests/load/k6-suite.js"
}
```

### Infrastructure Commands
```json
{
  "cdk:deploy": "cdk deploy --all",
  "cdk:destroy": "cdk destroy --all",
  "cdk:diff": "cdk diff",
  "cdk:synth": "cdk synth"
}
```

## 🔄 Script Dependencies

```mermaid
graph TD
    A[deploy.sh] --> B[CloudFormation Stack]
    A --> C[Lambda Deployment]
    A --> D[Frontend Build]
    A --> E[S3 Sync]
    A --> F[CloudFront Config]
    A --> G[Route53 DNS]
    
    C --> H[/tmp/prod-lambda cache]
    D --> I[npm run build]
    E --> J[aws s3 sync]
    
    K[teardown-production.sh] --> L[Empty S3 Buckets]
    K --> M[Delete Stack]
    K --> N[Clean SSM]
    K --> O[Remove Cognito]
```

## ⚠️ Important Notes

1. **Never create duplicate scripts** - Always fix issues in existing scripts
2. **Use cached Lambda code** - Deploy script has automatic fallback to `/tmp/prod-lambda/`
3. **Check CloudFront status** - Distribution takes 5-15 minutes to deploy
4. **Verify S3 buckets** - Must be empty before stack deletion
5. **Shopify Redirect URI** - Must be manually added to Shopify Partner Dashboard
6. **Dynamic API URLs** - Lambda uses request context for URL generation

## 🔍 Troubleshooting

### Script Fails with "No Lambda code"
- Deploy script will automatically use cached version from `/tmp/prod-lambda/`
- Ensure the cache directory exists and contains valid Lambda code

### CloudFormation Stack Won't Delete
```bash
# Empty S3 buckets first
aws s3 rm s3://bucket-name --recursive
# Then retry deletion
./teardown-production.sh
```

### CloudFront Distribution Disabled
```bash
# Re-enable distribution
aws cloudfront get-distribution-config --id DIST_ID > /tmp/cf.json
ETAG=$(jq -r '.ETag' /tmp/cf.json)
jq '.DistributionConfig.Enabled = true' /tmp/cf.json > /tmp/cf-updated.json
aws cloudfront update-distribution --id DIST_ID \
  --distribution-config "$(jq '.DistributionConfig' /tmp/cf-updated.json)" \
  --if-match "$ETAG"
```

## 📝 Script Maintenance

- All scripts should be executable: `chmod +x script.sh`
- Use bash shebang: `#!/bin/bash`
- Include error handling: `set -e`
- Add helpful output: `echo` statements for progress
- Document required environment variables
- Test scripts in staging before production