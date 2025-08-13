#!/bin/bash

# Verification script to ensure no deprecated REST endpoints remain
# Fails CI if any /products or /variants REST endpoints are found

set -e

echo "======================================"
echo "Verifying No Deprecated REST API Usage"
echo "======================================"
echo ""

# Define patterns to search for
PATTERNS=(
  'admin/api/.*/products\.json'
  'admin/api/.*/products/'
  'admin/api/.*/variants\.json'
  'admin/api/.*/variants/'
  '/products\.json'
  '/variants\.json'
)

# Files to exclude from search
EXCLUDE_PATTERNS=(
  '--exclude=*.md'
  '--exclude=*.txt'
  '--exclude=*.log'
  '--exclude-dir=node_modules'
  '--exclude-dir=.git'
  '--exclude-dir=archived-scripts'
  '--exclude-dir=archive'
  '--exclude-dir=build'
  '--exclude-dir=dist'
  '--exclude=verify_no_deprecated_rest.sh'
)

FOUND_ISSUES=0
RESULTS=""

echo "Searching for deprecated REST API usage..."
echo ""

for pattern in "${PATTERNS[@]}"; do
  echo "Checking for pattern: $pattern"
  
  # Search for the pattern
  result=$(grep -r -n -E "$pattern" . "${EXCLUDE_PATTERNS[@]}" 2>/dev/null || true)
  
  if [ -n "$result" ]; then
    echo "  ❌ Found deprecated usage:"
    echo "$result" | while IFS= read -r line; do
      echo "    $line"
    done
    RESULTS="${RESULTS}\n${result}"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
  else
    echo "  ✅ No usage found"
  fi
  echo ""
done

# Also check for direct axios/fetch calls to products/variants
echo "Checking for direct HTTP calls to products/variants endpoints..."

# Check for axios calls
axios_result=$(grep -r -n -E "axios\.(get|post|put|delete|patch)\(['\"].*/(products|variants)" . "${EXCLUDE_PATTERNS[@]}" 2>/dev/null || true)
if [ -n "$axios_result" ]; then
  echo "  ❌ Found axios calls to deprecated endpoints:"
  echo "$axios_result" | while IFS= read -r line; do
    echo "    $line"
  done
  FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
  echo "  ✅ No axios calls found"
fi

# Check for fetch calls
fetch_result=$(grep -r -n -E "fetch\(['\"].*/(products|variants)" . "${EXCLUDE_PATTERNS[@]}" 2>/dev/null || true)
if [ -n "$fetch_result" ]; then
  echo "  ❌ Found fetch calls to deprecated endpoints:"
  echo "$fetch_result" | while IFS= read -r line; do
    echo "    $line"
  done
  FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
  echo "  ✅ No fetch calls found"
fi

echo ""
echo "======================================"

# Check for GraphQL implementation
echo "Verifying GraphQL implementation..."
echo ""

REQUIRED_FILES=(
  "lambda/shopify/gqlClient.js"
  "lambda/shopify/queries.js"
  "lambda/shopify/mutations.js"
  "lambda/shopify/services/productService.js"
  "lambda/shopify/services/inventoryService.js"
  "lambda/shopify/mappers/productMapper.js"
)

MISSING_FILES=0
for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ Found: $file"
  else
    echo "  ❌ Missing: $file"
    MISSING_FILES=$((MISSING_FILES + 1))
  fi
done

echo ""
echo "======================================"

# Final report
if [ $FOUND_ISSUES -gt 0 ] || [ $MISSING_FILES -gt 0 ]; then
  echo "❌ VERIFICATION FAILED"
  echo ""
  
  if [ $FOUND_ISSUES -gt 0 ]; then
    echo "Found $FOUND_ISSUES deprecated REST API usage(s)"
    echo "Please migrate these to GraphQL using the ProductService or InventoryService"
  fi
  
  if [ $MISSING_FILES -gt 0 ]; then
    echo "Missing $MISSING_FILES required GraphQL implementation file(s)"
  fi
  
  exit 1
else
  echo "✅ VERIFICATION PASSED"
  echo ""
  echo "No deprecated REST API usage found for products/variants"
  echo "All GraphQL implementation files are present"
  echo ""
  
  # Check if feature flag is set
  if [ "$USE_GRAPHQL_PRODUCTS" = "false" ]; then
    echo "⚠️  Warning: USE_GRAPHQL_PRODUCTS is set to false"
    echo "   GraphQL is implemented but not active"
  else
    echo "✅ GraphQL is active (USE_GRAPHQL_PRODUCTS != false)"
  fi
  
  exit 0
fi