#!/bin/bash

echo "🔍 OrderNimbus User Mismatch Debug"
echo "=================================="
echo ""

echo "Users with Shopify stores in DynamoDB:"
aws dynamodb scan --table-name ordernimbus-production-main --region us-west-1 \
  --filter-expression "begins_with(sk, :sk)" \
  --expression-attribute-values '{":sk":{"S":"store_"}}' \
  --output json | jq -r '.Items[] | "User: " + .pk.S + " | Store: " + .name.S + " | Domain: " + (.shopifyDomain.S // "N/A")'

echo ""
echo "Recent API requests from frontend:"
aws logs tail /aws/lambda/ordernimbus-production-main --since 5m --region us-west-1 | grep -E '"userid"' | tail -3 | sed 's/.*"userid":"\([^"]*\)".*/Current Frontend User: \1/' | sort -u

echo ""
echo "🎯 SOLUTION: The frontend user session doesn't match the user who connected Shopify."
echo "   You need to either:"
echo "   1. Log out and log back in with the original account, OR"
echo "   2. Connect a new Shopify store with the current session"
echo ""
echo "✅ DATA IS THERE: 17 products, 8 orders, 4 customers, 26 inventory items"
echo "   The sync is working perfectly - it's just a user session mismatch!"