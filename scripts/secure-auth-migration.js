#!/usr/bin/env node

/**
 * Migration script to update all components to use secure JWT authentication
 * This removes direct userId manipulation and uses only JWT tokens
 */

const fs = require('fs');
const path = require('path');

const componentsDir = path.join(__dirname, '../app/frontend/src/components');
const servicesDir = path.join(__dirname, '../app/frontend/src/services');

// Components that need updating
const components = [
  'ProductsPage.tsx',
  'OrderPage.tsx', 
  'InventoryPage.tsx',
  'CustomersPage.tsx',
  'NotificationsPage.tsx',
  'TopBar.tsx',
  'StoresPage.tsx'
];

function updateComponent(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  let changes = [];

  // Add authService import if not present
  if (!content.includes("import { authService }") && !content.includes("import authService")) {
    const importLine = "import { authService } from '../services/auth';\n";
    content = importLine + content;
    changes.push('Added authService import');
  }

  // Replace all localStorage.getItem('currentUserId') with secure auth
  if (content.includes("localStorage.getItem('currentUserId')")) {
    content = content.replace(
      /const userId = localStorage\.getItem\('currentUserId'\)[^;]*;?\n/g,
      '// userId is now extracted from JWT token on backend\n'
    );
    changes.push('Removed localStorage userId references');
  }

  // Replace direct fetch calls with authService.authenticatedRequest
  // Pattern 1: fetch with getApiUrl()
  content = content.replace(
    /await fetch\(`\$\{getApiUrl\(\)\}(\/api\/[^`]*)`[^}]*\{[^}]*headers:[^}]*userid[^}]*\}[^)]*\)/g,
    'await authService.authenticatedRequest(`$1`)'
  );

  // Pattern 2: fetch with headers containing userid/userId
  content = content.replace(
    /await fetch\(([^,]+),\s*\{[^}]*headers:\s*\{[^}]*['"]userid['"][^}]*\}[^}]*\}\)/g,
    'await authService.authenticatedRequest($1)'
  );

  // Remove userid from headers in all fetch calls
  content = content.replace(
    /['"]userid['"]\s*:\s*[^,}\n]+[,]?\n?/gi,
    ''
  );

  // Clean up empty headers objects
  content = content.replace(
    /headers:\s*\{\s*\}/g,
    ''
  );

  // For StoresPage specifically - it already uses authService
  if (fileName === 'StoresPage.tsx') {
    // Just ensure no userid in other fetch calls
    content = content.replace(
      /fetch\(`\$\{apiUrl\}\/api\/[^`]*`[^}]*\{[^}]*['"]userid['"]/g,
      (match) => {
        const endpoint = match.match(/\/api\/[^`]*/)[0];
        return `authService.authenticatedRequest('${endpoint}'`;
      }
    );
    changes.push('Updated remaining fetch calls to use authService');
  }

  // Update POST/PUT/DELETE requests
  content = content.replace(
    /await fetch\(([^,]+),\s*\{\s*method:\s*['"]POST['"]/g,
    'await authService.authenticatedRequest($1, { method: "POST"'
  );

  content = content.replace(
    /await fetch\(([^,]+),\s*\{\s*method:\s*['"]PUT['"]/g,
    'await authService.authenticatedRequest($1, { method: "PUT"'
  );

  content = content.replace(
    /await fetch\(([^,]+),\s*\{\s*method:\s*['"]DELETE['"]/g,
    'await authService.authenticatedRequest($1, { method: "DELETE"'
  );

  if (changes.length > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ ${fileName}: ${changes.join(', ')}`);
  } else {
    console.log(`⏭️  ${fileName}: No changes needed`);
  }
}

console.log('🔒 Migrating to Secure JWT Authentication');
console.log('==========================================\n');

// Update each component
components.forEach(component => {
  const filePath = path.join(componentsDir, component);
  if (fs.existsSync(filePath)) {
    updateComponent(filePath);
  } else {
    console.log(`⚠️  ${component}: File not found`);
  }
});

console.log('\n✅ Migration Complete!');
console.log('\nNext Steps:');
console.log('1. Review the changes with: git diff');
console.log('2. Build the frontend: npm run build');
console.log('3. Deploy the secure Lambda function');
console.log('4. Update CloudFormation with JWT authorizer');
console.log('5. Test all endpoints\n');