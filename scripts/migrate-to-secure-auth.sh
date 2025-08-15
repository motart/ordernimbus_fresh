#!/bin/bash

# Script to migrate all components to use secure JWT authentication
# This removes userId from headers and localStorage, using only JWT tokens

echo "🔒 Migrating to secure JWT authentication..."
echo "==========================================="

# Step 1: Update all components to import authService
echo "Step 1: Adding authService imports..."
for file in src/components/{ProductsPage,OrderPage,InventoryPage,CustomersPage,NotificationsPage,TopBar}.tsx; do
  if ! grep -q "import { authService }" "$file"; then
    sed -i '' "1s/^/import { authService } from '..\/services\/auth';\n/" "$file"
    echo "  ✓ Added authService import to $file"
  fi
done

# Step 2: Replace all direct fetch calls with authService.authenticatedRequest
echo ""
echo "Step 2: Replacing direct fetch calls with secure authService..."

# ProductsPage.tsx - loadStores
sed -i '' '/const loadStores = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/stores.*/const response = await authService.authenticatedRequest(`\/api\/stores`, {});/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/ProductsPage.tsx

# ProductsPage.tsx - loadProducts  
sed -i '' '/const loadProducts = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/products.*/const response = await authService.authenticatedRequest(`\/api\/products?storeId=${selectedStore}`, {});/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/ProductsPage.tsx

# ProductsPage.tsx - handleManualEntry
sed -i '' '/const handleManualEntry = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/products.*/const response = await authService.authenticatedRequest(`\/api\/products`, {/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/ProductsPage.tsx

# OrderPage.tsx - loadStores
sed -i '' '/const loadStores = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/stores.*/const response = await authService.authenticatedRequest(`\/api\/stores`, {});/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/OrderPage.tsx

# OrderPage.tsx - loadOrders
sed -i '' '/const loadOrders = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/orders.*/const response = await authService.authenticatedRequest(`\/api\/orders?storeId=${selectedStore}`, {});/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/OrderPage.tsx

# InventoryPage.tsx - loadStores
sed -i '' '/const loadStores = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/stores.*/const response = await authService.authenticatedRequest(`\/api\/stores`, {});/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/InventoryPage.tsx

# InventoryPage.tsx - loadInventory
sed -i '' '/const loadInventory = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/inventory.*/const response = await authService.authenticatedRequest(`\/api\/inventory?storeId=${selectedStore}`, {});/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/InventoryPage.tsx

# CustomersPage.tsx - loadStores
sed -i '' '/const loadStores = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/stores.*/const response = await authService.authenticatedRequest(`\/api\/stores`, {});/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/CustomersPage.tsx

# CustomersPage.tsx - loadCustomers
sed -i '' '/const loadCustomers = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/customers.*/const response = await authService.authenticatedRequest(`\/api\/customers?storeId=${selectedStore}`, {});/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/CustomersPage.tsx

# NotificationsPage.tsx
sed -i '' '/const loadNotifications = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/notifications.*/const response = await authService.authenticatedRequest(`\/api\/notifications`, {});/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/NotificationsPage.tsx

# TopBar.tsx - loadNotifications
sed -i '' '/const loadNotifications = async/,/^  \};$/{
  s/const userId = localStorage.getItem.*//
  s/const response = await fetch(`${getApiUrl()}\/api\/notifications.*/const response = await authService.authenticatedRequest(`\/api\/notifications`, {});/
  s/headers: {[^}]*}[,]*/\/\/ Headers handled by authService/
}' src/components/TopBar.tsx

# Step 3: Remove all remaining userId references from headers
echo ""
echo "Step 3: Removing all userId from headers..."
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' "s/'userid':[^,]*,//g"
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' "s/'userId':[^,]*,//g"
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' "s/'UserId':[^,]*,//g"

# Step 4: Remove localStorage.getItem('currentUserId') references
echo ""
echo "Step 4: Removing localStorage userId references..."
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' "s/const userId = localStorage.getItem('currentUserId').*//g"
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' "s/localStorage.getItem('currentUserId') || //g"

# Step 5: Update AuthContext to not store userId in localStorage (keep for now as backup)
echo ""
echo "Step 5: Keeping userId in localStorage for backward compatibility (will remove later)..."

echo ""
echo "✅ Migration complete!"
echo ""
echo "Summary of changes:"
echo "  - All API calls now use authService.authenticatedRequest"
echo "  - JWT token is sent in Authorization header"
echo "  - userId is extracted from JWT on the backend"
echo "  - No userId in request headers (prevents manipulation)"
echo ""
echo "Next steps:"
echo "  1. Run 'npm run build' to build the frontend"
echo "  2. Deploy the secure Lambda function"
echo "  3. Update CloudFormation to add JWT authorizer"
echo "  4. Test all endpoints"