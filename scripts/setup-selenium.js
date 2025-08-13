/**
 * Setup script for Selenium WebDriver
 * Ensures Chrome and ChromeDriver are properly configured for E2E tests
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up Selenium WebDriver environment...');

try {
  // Check if Chrome is installed
  console.log('📋 Checking Chrome browser...');
  try {
    if (process.platform === 'darwin') {
      execSync('which google-chrome || which chrome || ls /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome', { stdio: 'pipe' });
      console.log('✅ Chrome browser found');
    } else if (process.platform === 'linux') {
      execSync('which google-chrome || which chromium-browser', { stdio: 'pipe' });
      console.log('✅ Chrome browser found');
    } else {
      console.log('⚠️  Chrome detection not implemented for this platform');
    }
  } catch (error) {
    console.log('⚠️  Chrome browser not found. Please install Chrome manually.');
    console.log('   Download from: https://www.google.com/chrome/');
  }

  // Check ChromeDriver version
  console.log('📋 Checking ChromeDriver...');
  try {
    const chromeDriverVersion = execSync('chromedriver --version', { encoding: 'utf8' });
    console.log('✅ ChromeDriver found:', chromeDriverVersion.trim());
  } catch (error) {
    console.log('⚠️  ChromeDriver not found in PATH');
    console.log('   Installing via npm package...');
  }

  // Create test directories if they don't exist
  console.log('📁 Setting up test directories...');
  const directories = [
    'tests',
    'tests/unit',
    'tests/e2e',
    'tests/fixtures',
    'tests/reports'
  ];

  directories.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    } else {
      console.log(`📁 Directory exists: ${dir}`);
    }
  });

  // Create Mocha configuration
  console.log('⚙️  Creating Mocha configuration...');
  const mochaConfig = {
    recursive: true,
    timeout: 30000,
    reporter: 'spec',
    ui: 'bdd',
    require: ['./tests/setup.js']
  };

  fs.writeFileSync(
    path.join(process.cwd(), '.mocharc.json'),
    JSON.stringify(mochaConfig, null, 2)
  );
  console.log('✅ Created .mocharc.json');

  // Create test setup file
  console.log('📄 Creating test setup file...');
  const setupContent = `/**
 * Global test setup for OrderNimbus tests
 */

// Global test configuration
global.TEST_CONFIG = {
  APP_URL: 'https://app.ordernimbus.com',
  API_URL: 'https://ay8k50buyd.execute-api.us-west-1.amazonaws.com/production',
  TIMEOUT: 30000,
  BROWSER: 'chrome'
};

// Setup for E2E tests
if (process.env.TEST_TYPE === 'e2e') {
  const { Builder } = require('selenium-webdriver');
  
  global.createDriver = async () => {
    return await new Builder()
      .forBrowser(global.TEST_CONFIG.BROWSER)
      .build();
  };
}

// Setup for unit tests
beforeEach(function() {
  this.timeout(global.TEST_CONFIG.TIMEOUT);
});

console.log('Test environment configured for OrderNimbus');
`;

  fs.writeFileSync(path.join(process.cwd(), 'tests', 'setup.js'), setupContent);
  console.log('✅ Created tests/setup.js');

  // Create test data fixtures
  console.log('📊 Creating test fixtures...');
  const testFixtures = {
    users: {
      validUser: {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@ordernimbus.com',
        companyName: 'Test Company',
        password: 'TestPassword123!'
      },
      invalidUsers: [
        { email: '', password: 'test', companyName: 'Test' }, // Missing email
        { email: 'test@test.com', password: '', companyName: 'Test' }, // Missing password
        { email: 'test@test.com', password: 'test', companyName: '' } // Missing company
      ]
    },
    api: {
      endpoints: {
        register: '/api/auth/register',
        login: '/api/auth/login',
        config: '/api/config'
      }
    }
  };

  fs.writeFileSync(
    path.join(process.cwd(), 'tests', 'fixtures', 'test-data.json'),
    JSON.stringify(testFixtures, null, 2)
  );
  console.log('✅ Created test fixtures');

  // Create test runner script
  const testRunnerScript = `#!/bin/bash
# Test runner for OrderNimbus
# Usage: ./run-tests.sh [unit|e2e|all|uc001]

set -e

TEST_TYPE=\${1:-all}
export TEST_TYPE

echo "🧪 Running OrderNimbus tests: \$TEST_TYPE"

case \$TEST_TYPE in
  unit)
    echo "Running unit tests..."
    npm run test:unit
    ;;
  e2e)
    echo "Running E2E tests..."
    export TEST_TYPE=e2e
    npm run test:e2e
    ;;
  uc001)
    echo "Running UC001 tests..."
    npm run test:uc001
    ;;
  all)
    echo "Running all tests..."
    npm run test:all
    ;;
  *)
    echo "Unknown test type: \$TEST_TYPE"
    echo "Usage: ./run-tests.sh [unit|e2e|all|uc001]"
    exit 1
    ;;
esac

echo "✅ Tests completed successfully!"
`;

  fs.writeFileSync(path.join(process.cwd(), 'run-tests.sh'), testRunnerScript);
  fs.chmodSync(path.join(process.cwd(), 'run-tests.sh'), '755');
  console.log('✅ Created run-tests.sh');

  console.log('\n🎉 Selenium setup completed successfully!');
  console.log('\n📋 Next steps:');
  console.log('   1. Install test dependencies: npm install');
  console.log('   2. Run UC001 tests: npm run test:uc001');
  console.log('   3. Run all tests: npm run test:all');
  console.log('   4. Use test runner: ./run-tests.sh unit');
  console.log('\n🔧 Available test commands:');
  console.log('   npm run test:unit    - Unit tests only');
  console.log('   npm run test:e2e     - End-to-end tests only');
  console.log('   npm run test:uc001   - UC001 specific tests');
  console.log('   npm run test:all     - All tests');
  console.log('   npm run test:watch   - Watch mode for unit tests');

} catch (error) {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
}