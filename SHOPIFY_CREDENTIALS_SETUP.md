# Shopify Public App Credentials Setup

## Overview
This guide explains how to securely manage Shopify public app credentials across staging and production environments using AWS Secrets Manager.

## Option 1: AWS Secrets Manager (Recommended)

### Step 1: Store Credentials in AWS Secrets Manager

```bash
# Staging environment
aws secretsmanager create-secret \
  --name ordernimbus/staging/shopify \
  --description "Shopify public app credentials for staging" \
  --secret-string '{
    "SHOPIFY_CLIENT_ID":"your-staging-client-id",
    "SHOPIFY_CLIENT_SECRET":"your-staging-client-secret",
    "SHOPIFY_APP_URL":"https://staging.ordernimbus.com",
    "SHOPIFY_REDIRECT_URI":"https://staging.ordernimbus.com/api/shopify/callback"
  }' \
  --region us-west-1

# Production environment
aws secretsmanager create-secret \
  --name ordernimbus/production/shopify \
  --description "Shopify public app credentials for production" \
  --secret-string '{
    "SHOPIFY_CLIENT_ID":"your-production-client-id",
    "SHOPIFY_CLIENT_SECRET":"your-production-client-secret",
    "SHOPIFY_APP_URL":"https://app.ordernimbus.com",
    "SHOPIFY_REDIRECT_URI":"https://app.ordernimbus.com/api/shopify/callback"
  }' \
  --region us-west-1
```

### Step 2: Update Lambda Functions to Use Secrets

```javascript
// lambda/shopify-integration.js
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

let shopifyCredentials = null;

async function getShopifyCredentials() {
    if (shopifyCredentials) return shopifyCredentials;
    
    const environment = process.env.ENVIRONMENT || 'staging';
    const secretName = `ordernimbus/${environment}/shopify`;
    
    try {
        const secret = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
        shopifyCredentials = JSON.parse(secret.SecretString);
        return shopifyCredentials;
    } catch (error) {
        console.error('Error fetching Shopify credentials:', error);
        throw new Error('Unable to retrieve Shopify credentials');
    }
}

exports.handler = async (event) => {
    const credentials = await getShopifyCredentials();
    // Use credentials.SHOPIFY_CLIENT_ID and credentials.SHOPIFY_CLIENT_SECRET
};
```

### Step 3: Update IAM Permissions

Add this policy to your Lambda execution role:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue"
            ],
            "Resource": [
                "arn:aws:secretsmanager:us-west-1:*:secret:ordernimbus/staging/shopify-*",
                "arn:aws:secretsmanager:us-west-1:*:secret:ordernimbus/production/shopify-*"
            ]
        }
    ]
}
```

## Option 2: GitHub Secrets + AWS Systems Manager Parameter Store

### Step 1: Add Secrets to GitHub Repository

1. Go to your GitHub repository settings
2. Navigate to Settings → Secrets and variables → Actions
3. Add the following secrets:
   - `SHOPIFY_STAGING_CLIENT_ID`
   - `SHOPIFY_STAGING_CLIENT_SECRET`
   - `SHOPIFY_PRODUCTION_CLIENT_ID`
   - `SHOPIFY_PRODUCTION_CLIENT_SECRET`

### Step 2: Update GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main, staging]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-west-1
      
      - name: Store Shopify credentials in Parameter Store
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
            ENV="production"
            CLIENT_ID="${{ secrets.SHOPIFY_PRODUCTION_CLIENT_ID }}"
            CLIENT_SECRET="${{ secrets.SHOPIFY_PRODUCTION_CLIENT_SECRET }}"
          else
            ENV="staging"
            CLIENT_ID="${{ secrets.SHOPIFY_STAGING_CLIENT_ID }}"
            CLIENT_SECRET="${{ secrets.SHOPIFY_STAGING_CLIENT_SECRET }}"
          fi
          
          aws ssm put-parameter \
            --name "/ordernimbus/$ENV/shopify/client_id" \
            --value "$CLIENT_ID" \
            --type "SecureString" \
            --overwrite
          
          aws ssm put-parameter \
            --name "/ordernimbus/$ENV/shopify/client_secret" \
            --value "$CLIENT_SECRET" \
            --type "SecureString" \
            --overwrite
      
      - name: Deploy application
        run: |
          ./scripts/deployment/deploy.sh $ENV
```

### Step 3: Update Lambda to Use Parameter Store

```javascript
// lambda/shopify-integration.js
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

let shopifyCredentials = null;

async function getShopifyCredentials() {
    if (shopifyCredentials) return shopifyCredentials;
    
    const environment = process.env.ENVIRONMENT || 'staging';
    
    try {
        const params = await ssm.getParameters({
            Names: [
                `/ordernimbus/${environment}/shopify/client_id`,
                `/ordernimbus/${environment}/shopify/client_secret`
            ],
            WithDecryption: true
        }).promise();
        
        shopifyCredentials = {
            SHOPIFY_CLIENT_ID: params.Parameters.find(p => p.Name.includes('client_id')).Value,
            SHOPIFY_CLIENT_SECRET: params.Parameters.find(p => p.Name.includes('client_secret')).Value
        };
        
        return shopifyCredentials;
    } catch (error) {
        console.error('Error fetching Shopify credentials:', error);
        throw new Error('Unable to retrieve Shopify credentials');
    }
}
```

## Option 3: AWS Systems Manager Parameter Store (Direct)

### Simple approach without GitHub Secrets:

```bash
# Store credentials directly in Parameter Store
aws ssm put-parameter \
  --name "/ordernimbus/staging/shopify/client_id" \
  --value "your-staging-client-id" \
  --type "SecureString" \
  --key-id "alias/aws/ssm" \
  --region us-west-1

aws ssm put-parameter \
  --name "/ordernimbus/staging/shopify/client_secret" \
  --value "your-staging-client-secret" \
  --type "SecureString" \
  --key-id "alias/aws/ssm" \
  --region us-west-1

# Production
aws ssm put-parameter \
  --name "/ordernimbus/production/shopify/client_id" \
  --value "your-production-client-id" \
  --type "SecureString" \
  --key-id "alias/aws/ssm" \
  --region us-west-1

aws ssm put-parameter \
  --name "/ordernimbus/production/shopify/client_secret" \
  --value "your-production-client-secret" \
  --type "SecureString" \
  --key-id "alias/aws/ssm" \
  --region us-west-1
```

## Updating CloudFormation Template

Add environment variables to Lambda functions in your CloudFormation template:

```yaml
ShopifyIntegrationFunction:
  Type: AWS::Lambda::Function
  Properties:
    Environment:
      Variables:
        ENVIRONMENT: !Ref Environment
        SECRET_NAME: !Sub 'ordernimbus/${Environment}/shopify'
    # ... other properties

ShopifyFunctionRole:
  Type: AWS::IAM::Role
  Properties:
    Policies:
      - PolicyName: SecretAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action:
                - secretsmanager:GetSecretValue
              Resource: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:ordernimbus/${Environment}/shopify-*'
            - Effect: Allow
              Action:
                - ssm:GetParameter
                - ssm:GetParameters
              Resource: !Sub 'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/ordernimbus/${Environment}/shopify/*'
```

## Local Development

For local development, use environment variables in `.env` files (already in .gitignore):

```bash
# .env.local (not committed)
SHOPIFY_CLIENT_ID=your-dev-client-id
SHOPIFY_CLIENT_SECRET=your-dev-client-secret
```

## Security Best Practices

1. **Never commit credentials** to Git
2. **Use different credentials** for staging and production
3. **Rotate credentials regularly** (quarterly recommended)
4. **Enable CloudTrail logging** for audit trails
5. **Use least privilege IAM policies**
6. **Enable MFA** for AWS account access
7. **Use KMS encryption** for stored secrets

## Verification

Test that credentials are accessible:

```bash
# Test Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id ordernimbus/staging/shopify \
  --region us-west-1 \
  --query SecretString \
  --output text | jq .

# Test Parameter Store
aws ssm get-parameter \
  --name "/ordernimbus/staging/shopify/client_id" \
  --with-decryption \
  --region us-west-1 \
  --query Parameter.Value \
  --output text
```

## Recommended Approach

For OrderNimbus, we recommend **AWS Secrets Manager** because:
1. Native AWS service integration
2. Automatic rotation capabilities
3. Better for complex JSON credentials
4. CloudFormation integration
5. Cross-region replication available
6. Version history and rollback

Parameter Store is a good alternative if you prefer:
- Simpler key-value pairs
- Lower cost (free tier available)
- Integration with GitHub Actions