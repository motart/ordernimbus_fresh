# OrderNimbus Code Structure Documentation

## Critical Development Rules
1. **All tests must pass** - No exceptions. Every PR must have passing tests.
2. **Test coverage required** - Every code change needs either updated existing tests or new unit tests.
3. **Comments mandatory** - All new code must have comments explaining functionality.
4. **Documentation updates** - This file must be updated when code structure changes.

## Project Structure

```
ordernimbus/
├── app/
│   ├── frontend/
│   │   ├── src/                    # React application source
│   │   ├── public/                 # Static assets
│   │   └── lambda-main-check/      # Lambda function for API
│   │       └── index.js           # Main Lambda handler with auth/Shopify integration
├── tests/
│   ├── unit/                       # Unit tests (must all pass)
│   │   ├── lambda-registration.test.js  # Registration endpoint tests (proxyquire-based)
│   │   ├── lambda-signin.test.js        # Sign-in flow tests (proxyquire-based)
│   │   └── auth-registration.test.js    # UC001 backend tests
│   ├── integration/                # Integration tests
│   │   └── signin-integration.test.js   # API endpoint integration tests
│   └── e2e/                        # End-to-end tests
│       ├── UC001-new-user-registration.test.js
│       └── UC002-sign-in-flow.test.js
├── docs/
│   ├── use-cases/                  # Use case documentation
│   │   ├── UC001-new-user-registration.md
│   │   └── UC002-sign-in-flow.md
│   └── CODE_STRUCTURE.md          # This file
├── .github/
│   └── workflows/
│       └── pr-tests.yml           # CI/CD pipeline (all tests must pass)
└── CLAUDE.md                       # AI assistant instructions

```

## Testing Strategy

### Unit Tests
- **Technology**: Mocha, Chai, Sinon, Proxyquire
- **AWS Mocking**: Using proxyquire to inject mocked AWS SDK
- **Requirements**: 
  - All tests must pass before commit
  - Use descriptive test names
  - Include comments explaining test purpose
  - Mock all external dependencies

### Test File Structure
```javascript
/**
 * Test description and requirements
 * - All tests must pass
 * - Every code change needs test coverage
 * - All code must have comments
 */

// Test setup with proxyquire for proper AWS mocking
const AWSMock = {
  CognitoIdentityServiceProvider: sinon.stub().returns(cognitoStub),
  DynamoDB: {
    DocumentClient: sinon.stub().returns(dynamodbStub)
  }
};

const lambdaModule = proxyquire('../../app/frontend/lambda-main-check/index', {
  'aws-sdk': AWSMock
});
```

### Integration Tests
- Test API endpoints with mocked HTTP requests
- Verify CORS, authentication, and error handling
- Use axios with sinon stubs

### E2E Tests
- Selenium WebDriver for browser automation
- Test complete user journeys
- Conditional execution when Selenium available

## Lambda Function Structure

### Main Handler (`app/frontend/lambda-main-check/index.js`)
```javascript
exports.handler = async (event) => {
  // CORS handling
  // Route parsing
  // Authentication endpoints (/api/auth/*)
  // Shopify integration (/api/shopify/*)
  // Business endpoints (/api/products, /api/orders, etc.)
}
```

### Endpoints
- `/api/auth/register` - User registration (UC001)
- `/api/auth/login` - User sign-in (UC002)
- `/api/auth/refresh` - Token refresh
- `/api/auth/forgot-password` - Password reset
- `/api/shopify/connect` - Shopify OAuth initiation
- `/api/shopify/callback` - OAuth callback
- `/api/shopify/sync` - Data synchronization

## CI/CD Pipeline

### GitHub Actions Workflow
All tests run in parallel:
1. Unit Tests
2. Backend Lambda Tests
3. Frontend Tests
4. E2E Selenium Tests
5. Integration Tests
6. Security Scan
7. Code Quality
8. All Tests Pass (final check)

### Branch Protection Rules
- All tests must pass for PR merge
- No reviewer required for develop branch
- Auto-merge enabled when tests pass

## Development Workflow

1. Create feature branch from develop
2. Make changes with comments
3. Update/create tests for changes
4. Ensure all tests pass locally
5. Push to trigger CI/CD
6. PR auto-merges when all tests pass

## Common Issues and Solutions

### Mock Setup Issues
**Problem**: AWS SDK mocks not working in tests
**Solution**: Use proxyquire to inject mocks before module loading

### Test Failures
**Problem**: Tests fail in CI but pass locally
**Solution**: Check environment variables and ensure all dependencies installed

### CORS Issues
**Problem**: Frontend can't connect to API
**Solution**: Verify allowed origins in Lambda CORS headers

## Code Comments Standards

### Function Comments
```javascript
/**
 * Brief description of function purpose
 * @param {Type} paramName - Parameter description
 * @returns {Type} Return value description
 */
```

### Test Comments
```javascript
/**
 * Test description
 * Verifies specific functionality
 */
it('should perform expected behavior', async function() {
  // Arrange: Set up test data
  // Act: Execute function
  // Assert: Verify results
});
```

## Recent Updates

### 2024-01-13
- Fixed all unit test failures using proxyquire for AWS SDK mocking
- Updated test files with comprehensive comments
- Ensured 100% test pass rate for UC001 and UC002
- Added this documentation file with development rules

## Maintenance Notes

- Always run `npm test` before committing
- Update this documentation when structure changes
- Keep test coverage above 80%
- Review failed CI/CD logs immediately
- Use `--no-verify` only for documentation updates