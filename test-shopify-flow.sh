#!/bin/bash

echo "Testing complete Shopify store flow..."

# Configuration
USER_ID="e85183d0-3061-70b8-25f5-171fd848ac9d"
API_URL="http://127.0.0.1:3001"
SHOPIFY_TOKEN="${SHOPIFY_TOKEN:-}"

# Check if token is provided
if [ -z "$SHOPIFY_TOKEN" ]; then
    echo "Error: SHOPIFY_TOKEN environment variable is not set"
    echo "Usage: SHOPIFY_TOKEN=your_token ./test-shopify-flow.sh"
    exit 1
fi

# Step 1: Create a Shopify store
echo -e "\n1. Creating Shopify store..."
STORE_RESPONSE=$(curl -s -X POST $API_URL/api/stores \
  -H "Content-Type: application/json" \
  -H "userId: $USER_ID" \
  -d '{
    "name": "ordernimbus-dev",
    "displayName": "OrderNimbus Dev Store",
    "type": "shopify",
    "shopifyDomain": "ordernimbus-dev.myshopify.com",
    "apiKey": "'$SHOPIFY_TOKEN'",
    "status": "active"
  }')

echo "Store creation response: $STORE_RESPONSE"
STORE_ID=$(echo $STORE_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "Created store with ID: $STORE_ID"

# Step 2: Wait for sync to complete
echo -e "\n2. Waiting for Shopify sync to complete..."
sleep 10

# Step 3: Check store status
echo -e "\n3. Checking store status..."
STORES=$(curl -s -X GET $API_URL/api/stores \
  -H "userId: $USER_ID")
echo "Stores: $STORES"

# Step 4: Check products
echo -e "\n4. Checking products..."
PRODUCTS=$(curl -s -X GET "$API_URL/api/products?storeId=$STORE_ID" \
  -H "userId: $USER_ID")
echo "Products: $PRODUCTS"

# Step 5: Test CSV upload for orders
echo -e "\n5. Testing CSV upload..."
CSV_DATA='[
  {
    "Order Number": "1001",
    "Date": "2025-01-15",
    "Customer": "John Doe",
    "Product": "Gift Card",
    "Quantity": "1",
    "Total": "25.00"
  },
  {
    "Order Number": "1002", 
    "Date": "2025-01-16",
    "Customer": "Jane Smith",
    "Product": "Gift Card",
    "Quantity": "2",
    "Total": "50.00"
  }
]'

COLUMN_MAPPINGS='{
  "orderNumber": "Order Number",
  "date": "Date",
  "customerName": "Customer",
  "productName": "Product",
  "quantity": "Quantity",
  "totalAmount": "Total"
}'

CSV_RESPONSE=$(curl -s -X POST $API_URL/api/orders/upload-csv \
  -H "Content-Type: application/json" \
  -H "userId: $USER_ID" \
  -d "{
    \"storeId\": \"$STORE_ID\",
    \"csvData\": $CSV_DATA,
    \"columnMappings\": $COLUMN_MAPPINGS,
    \"dataType\": \"orders\"
  }")

echo "CSV upload response: $CSV_RESPONSE"

# Step 6: Check orders
echo -e "\n6. Checking orders..."
ORDERS=$(curl -s -X GET "$API_URL/api/orders?storeId=$STORE_ID" \
  -H "userId: $USER_ID")
echo "Orders: $ORDERS"

echo -e "\nTest complete!"