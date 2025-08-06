#!/bin/bash

# Create DynamoDB tables for local development

ENDPOINT="http://localhost:8000"
REGION="us-east-1"
PREFIX="ordernimbus-local"

echo "Creating DynamoDB tables..."

# Stores table
aws dynamodb create-table \
    --table-name ${PREFIX}-stores \
    --attribute-definitions \
        AttributeName=userId,AttributeType=S \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=userId,KeyType=HASH \
        AttributeName=id,KeyType=RANGE \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --endpoint-url $ENDPOINT \
    --region $REGION 2>/dev/null && echo "✓ Created stores table" || echo "! Stores table already exists"

# Products table
aws dynamodb create-table \
    --table-name ${PREFIX}-products \
    --attribute-definitions \
        AttributeName=userId,AttributeType=S \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=userId,KeyType=HASH \
        AttributeName=id,KeyType=RANGE \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --endpoint-url $ENDPOINT \
    --region $REGION 2>/dev/null && echo "✓ Created products table" || echo "! Products table already exists"

# Orders table
aws dynamodb create-table \
    --table-name ${PREFIX}-orders \
    --attribute-definitions \
        AttributeName=userId,AttributeType=S \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=userId,KeyType=HASH \
        AttributeName=id,KeyType=RANGE \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --endpoint-url $ENDPOINT \
    --region $REGION 2>/dev/null && echo "✓ Created orders table" || echo "! Orders table already exists"

# Sales table
aws dynamodb create-table \
    --table-name ${PREFIX}-sales \
    --attribute-definitions \
        AttributeName=userId,AttributeType=S \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=userId,KeyType=HASH \
        AttributeName=id,KeyType=RANGE \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --endpoint-url $ENDPOINT \
    --region $REGION 2>/dev/null && echo "✓ Created sales table" || echo "! Sales table already exists"

# Inventory table
aws dynamodb create-table \
    --table-name ${PREFIX}-inventory \
    --attribute-definitions \
        AttributeName=userId,AttributeType=S \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=userId,KeyType=HASH \
        AttributeName=id,KeyType=RANGE \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --endpoint-url $ENDPOINT \
    --region $REGION 2>/dev/null && echo "✓ Created inventory table" || echo "! Inventory table already exists"

# Customers table
aws dynamodb create-table \
    --table-name ${PREFIX}-customers \
    --attribute-definitions \
        AttributeName=userId,AttributeType=S \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=userId,KeyType=HASH \
        AttributeName=id,KeyType=RANGE \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --endpoint-url $ENDPOINT \
    --region $REGION 2>/dev/null && echo "✓ Created customers table" || echo "! Customers table already exists"

echo "Table creation complete!"