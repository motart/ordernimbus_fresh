#!/bin/bash

# OrderNimbus Data Cleanup Script
# Clears all data from local DynamoDB tables for a fresh start

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}🧹 OrderNimbus Data Cleanup${NC}"
echo "================================"
echo ""
echo -e "${YELLOW}⚠️  WARNING: This will delete ALL data from your local DynamoDB tables!${NC}"
echo ""

# Ask for confirmation unless --force flag is provided
if [ "$1" != "--force" ]; then
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo -e "${RED}Cleanup cancelled.${NC}"
        exit 0
    fi
fi

# Configure AWS CLI for local development
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_DEFAULT_REGION=us-east-1

echo ""
echo -e "${BLUE}🗑️  Clearing DynamoDB tables...${NC}"

# Function to clear a table
clear_table() {
    local table_name=$1
    echo -e "${BLUE}   Clearing table: $table_name${NC}"
    
    # Scan and delete all items from the table
    aws dynamodb scan \
        --table-name $table_name \
        --endpoint-url http://localhost:8000 \
        --no-cli-pager \
        --output json 2>/dev/null | \
    jq -r '.Items[] | @json' 2>/dev/null | \
    while read -r item; do
        # Extract the key attributes based on table name
        if [[ "$table_name" == *"sales"* ]] || [[ "$table_name" == *"inventory"* ]] || \
           [[ "$table_name" == *"stores"* ]] || [[ "$table_name" == *"products"* ]] || \
           [[ "$table_name" == *"aggregates"* ]]; then
            # Tables with userId and id as keys
            key=$(echo "$item" | jq -r '{userId: .userId, id: .id}')
        elif [[ "$table_name" == *"password-reset"* ]]; then
            # Password reset table with email as key
            key=$(echo "$item" | jq -r '{email: .email}')
        elif [[ "$table_name" == *"sessions"* ]]; then
            # Sessions table with userId and sessionId as keys
            key=$(echo "$item" | jq -r '{userId: .userId, sessionId: .sessionId}')
        elif [[ "$table_name" == *"conversations"* ]]; then
            # Conversations table with userId and timestamp as keys
            key=$(echo "$item" | jq -r '{userId: .userId, timestamp: .timestamp}')
        elif [[ "$table_name" == *"forecasts"* ]]; then
            # Forecasts table with userId and forecastId as keys
            key=$(echo "$item" | jq -r '{userId: .userId, forecastId: .forecastId}')
        elif [[ "$table_name" == *"uploads"* ]]; then
            # Data uploads table with userId and uploadId as keys
            key=$(echo "$item" | jq -r '{userId: .userId, uploadId: .uploadId}')
        else
            continue
        fi
        
        # Delete the item
        aws dynamodb delete-item \
            --table-name $table_name \
            --key "$key" \
            --endpoint-url http://localhost:8000 \
            --no-cli-pager \
            2>/dev/null || true
    done
    
    echo -e "${GREEN}   ✅ Table cleared: $table_name${NC}"
}

# List of tables to clear
tables=(
    "ordernimbus-local-sales"
    "ordernimbus-local-inventory"
    "ordernimbus-local-stores"
    "ordernimbus-local-products"
    "ordernimbus-local-aggregates"
    "ordernimbus-local-password-reset-tokens"
    "ordernimbus-local-user-sessions"
    "ordernimbus-local-conversations"
    "ordernimbus-local-forecasts"
    "ordernimbus-local-data-uploads"
)

# Clear each table
for table in "${tables[@]}"; do
    clear_table "$table"
done

# Clear S3 buckets in LocalStack
echo ""
echo -e "${BLUE}🪣 Clearing S3 buckets...${NC}"

# Function to clear S3 bucket
clear_s3_bucket() {
    local bucket=$1
    echo -e "${BLUE}   Clearing bucket: $bucket${NC}"
    
    # Delete all objects from the bucket
    aws s3 rm s3://$bucket --recursive \
        --endpoint-url http://localhost:4566 \
        --no-cli-pager \
        2>/dev/null || true
    
    echo -e "${GREEN}   ✅ Bucket cleared: $bucket${NC}"
}

# List of S3 buckets to clear
buckets=(
    "ordernimbus-local-data-uploads"
    "ordernimbus-local-user-data"
    "ordernimbus-local-frontend"
)

# Clear each bucket
for bucket in "${buckets[@]}"; do
    clear_s3_bucket "$bucket"
done

echo ""
echo -e "${GREEN}=========================================="
echo -e "✅ All data has been cleared successfully!"
echo -e "==========================================${NC}"
echo ""
echo -e "${BLUE}📝 Note:${NC}"
echo "  • All DynamoDB tables have been emptied"
echo "  • All S3 buckets have been cleared"
echo "  • You now have a fresh, clean environment"
echo ""
echo -e "${YELLOW}💡 Tip:${NC}"
echo "  • Clear your browser's localStorage by running:"
echo "    ${BLUE}localStorage.clear()${NC} in the browser console"
echo "  • Or use the Clear Cache button in the app settings"
echo ""