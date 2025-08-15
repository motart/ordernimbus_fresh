#!/bin/bash

# Fix for Shopify connection 500 error
# This script adds the missing TABLE_NAME environment variable and required IAM permissions
# to the Lambda function for Shopify OAuth flow

REGION=${1:-us-west-1}
LAMBDA_NAME="ordernimbus-production-main"
TABLE_NAME="ordernimbus-production-main"

echo "🔧 Fixing Shopify Lambda configuration..."

# Step 1: Add TABLE_NAME environment variable
echo "📝 Adding TABLE_NAME environment variable..."
aws lambda update-function-configuration \
  --function-name $LAMBDA_NAME \
  --region $REGION \
  --environment "Variables={ENVIRONMENT=production,USER_POOL_CLIENT_ID=29ebgu8c8tit6aftprjgfmf4p4,USER_POOL_ID=us-west-1_Ht3X0tii8,TABLE_NAME=$TABLE_NAME}" \
  --output json > /dev/null

# Step 2: Get the Lambda IAM role
ROLE_ARN=$(aws lambda get-function-configuration \
  --function-name $LAMBDA_NAME \
  --region $REGION \
  --query 'Role' \
  --output text)

ROLE_NAME=$(echo $ROLE_ARN | rev | cut -d'/' -f1 | rev)

echo "🔐 Adding DynamoDB permissions to role: $ROLE_NAME"

# Step 3: Add DynamoDB permissions
cat > /tmp/dynamodb-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:$REGION:335021149718:table/$TABLE_NAME*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name DynamoDBAccess \
  --policy-document file:///tmp/dynamodb-policy.json \
  --region $REGION

echo "🔑 Adding Secrets Manager permissions..."

# Step 4: Add Secrets Manager permissions
cat > /tmp/secrets-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:$REGION:335021149718:secret:ordernimbus/production/shopify*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name SecretsManagerAccess \
  --policy-document file:///tmp/secrets-policy.json \
  --region $REGION

echo "✅ Shopify Lambda permissions fixed!"
echo ""
echo "The Lambda now has:"
echo "  • TABLE_NAME environment variable set to: $TABLE_NAME"
echo "  • DynamoDB read/write permissions"
echo "  • Secrets Manager read permissions for Shopify credentials"