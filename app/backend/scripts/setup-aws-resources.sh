#!/bin/bash

# AWS Resources Setup Script for OrderNimbus API
# This script creates necessary AWS resources for the API

set -e

ENVIRONMENT=${1:-staging}
AWS_REGION=${2:-us-west-1}

echo "Setting up AWS resources for ${ENVIRONMENT} in ${AWS_REGION}..."

# 1. Create Parameter Store entries
echo "Creating Parameter Store parameters..."

# JWT Secret
aws ssm put-parameter \
  --name "/ordernimbus/api/jwt-secret" \
  --value "$(openssl rand -hex 32)" \
  --type "SecureString" \
  --description "JWT secret for OrderNimbus API" \
  --region ${AWS_REGION} \
  --overwrite || true

# Database credentials (example)
aws ssm put-parameter \
  --name "/ordernimbus/api/database-url" \
  --value "dynamodb://localhost:8000" \
  --type "SecureString" \
  --description "Database URL for OrderNimbus API" \
  --region ${AWS_REGION} \
  --overwrite || true

# Cognito configuration
aws ssm put-parameter \
  --name "/ordernimbus/api/cognito-user-pool-id" \
  --value "us-west-1_XXXXXXXXX" \
  --type "String" \
  --description "Cognito User Pool ID" \
  --region ${AWS_REGION} \
  --overwrite || true

aws ssm put-parameter \
  --name "/ordernimbus/api/cognito-client-id" \
  --value "XXXXXXXXXXXXXXXXXXXXXXXXXX" \
  --type "String" \
  --description "Cognito Client ID" \
  --region ${AWS_REGION} \
  --overwrite || true

# 2. Create Secrets Manager secrets
echo "Creating Secrets Manager secrets..."

aws secretsmanager create-secret \
  --name "ordernimbus/api/config" \
  --description "OrderNimbus API configuration" \
  --secret-string '{
    "JWT_SECRET": "'$(openssl rand -hex 32)'",
    "API_KEY": "'$(uuidgen)'",
    "ENCRYPTION_KEY": "'$(openssl rand -hex 16)'"
  }' \
  --region ${AWS_REGION} || \
  aws secretsmanager update-secret \
    --secret-id "ordernimbus/api/config" \
    --secret-string '{
      "JWT_SECRET": "'$(openssl rand -hex 32)'",
      "API_KEY": "'$(uuidgen)'",
      "ENCRYPTION_KEY": "'$(openssl rand -hex 16)'"
    }' \
    --region ${AWS_REGION}

# 3. Create DynamoDB tables
echo "Creating DynamoDB tables..."

# Users table
aws dynamodb create-table \
  --table-name ordernimbus-users \
  --attribute-definitions \
    AttributeName=email,AttributeType=S \
    AttributeName=id,AttributeType=S \
  --key-schema \
    AttributeName=email,KeyType=HASH \
  --global-secondary-indexes \
    '[{
      "IndexName": "id-index",
      "Keys": [{"AttributeName":"id","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"},
      "BillingMode": "PAY_PER_REQUEST"
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Project,Value=OrderNimbus Key=Environment,Value=${ENVIRONMENT} \
  --region ${AWS_REGION} || echo "Table ordernimbus-users already exists"

# Forecasts table
aws dynamodb create-table \
  --table-name ordernimbus-forecasts \
  --attribute-definitions \
    AttributeName=forecastId,AttributeType=S \
    AttributeName=tenantId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=forecastId,KeyType=HASH \
    AttributeName=tenantId,KeyType=RANGE \
  --global-secondary-indexes \
    '[{
      "IndexName": "tenant-date-index",
      "Keys": [
        {"AttributeName":"tenantId","KeyType":"HASH"},
        {"AttributeName":"createdAt","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"},
      "BillingMode": "PAY_PER_REQUEST"
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Project,Value=OrderNimbus Key=Environment,Value=${ENVIRONMENT} \
  --region ${AWS_REGION} || echo "Table ordernimbus-forecasts already exists"

# Data table
aws dynamodb create-table \
  --table-name ordernimbus-data \
  --attribute-definitions \
    AttributeName=recordId,AttributeType=S \
    AttributeName=tenantId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=recordId,KeyType=HASH \
    AttributeName=tenantId,KeyType=RANGE \
  --global-secondary-indexes \
    '[{
      "IndexName": "tenant-date-index",
      "Keys": [
        {"AttributeName":"tenantId","KeyType":"HASH"},
        {"AttributeName":"createdAt","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"},
      "BillingMode": "PAY_PER_REQUEST"
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Project,Value=OrderNimbus Key=Environment,Value=${ENVIRONMENT} \
  --region ${AWS_REGION} || echo "Table ordernimbus-data already exists"

# Uploads table
aws dynamodb create-table \
  --table-name ordernimbus-uploads \
  --attribute-definitions \
    AttributeName=uploadId,AttributeType=S \
    AttributeName=tenantId,AttributeType=S \
  --key-schema \
    AttributeName=uploadId,KeyType=HASH \
    AttributeName=tenantId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Project,Value=OrderNimbus Key=Environment,Value=${ENVIRONMENT} \
  --region ${AWS_REGION} || echo "Table ordernimbus-uploads already exists"

# 4. Create CloudWatch Log Groups
echo "Creating CloudWatch Log Groups..."

aws logs create-log-group \
  --log-group-name "/aws/ecs/ordernimbus-${ENVIRONMENT}-api" \
  --region ${AWS_REGION} || echo "Log group already exists"

aws logs put-retention-policy \
  --log-group-name "/aws/ecs/ordernimbus-${ENVIRONMENT}-api" \
  --retention-in-days 30 \
  --region ${AWS_REGION}

# 5. Create X-Ray sampling rules
echo "Creating X-Ray sampling rules..."

cat > /tmp/xray-sampling-rule.json <<EOF
{
  "version": 2,
  "default": {
    "fixed_target": 1,
    "rate": 0.1
  },
  "rules": [
    {
      "description": "OrderNimbus API",
      "service_name": "OrderNimbus-API",
      "http_method": "*",
      "url_path": "*",
      "fixed_target": 2,
      "rate": 0.5,
      "priority": 9000
    }
  ]
}
EOF

aws xray create-sampling-rule \
  --cli-input-json file:///tmp/xray-sampling-rule.json \
  --region ${AWS_REGION} || echo "Sampling rule already exists"

echo "AWS resources setup complete!"
echo ""
echo "Next steps:"
echo "1. Update Cognito configuration in Parameter Store with actual values"
echo "2. Deploy the API using: ./deploy-ecs.sh ${ENVIRONMENT} ${AWS_REGION}"
echo "3. Configure API Gateway to point to the NLB"