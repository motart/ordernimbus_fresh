# Test-Driven Development (TDD) Workflow

## 🚨 MANDATORY: This workflow MUST be followed for EVERY feature

## Why TDD is Mandatory

We've experienced recurring test failures every time we add features. This stops now. TDD ensures:
- Tests are written BEFORE code, preventing untested features
- All edge cases are considered upfront
- Code is minimal and focused
- Refactoring is safe with test coverage
- PRs never fail due to broken tests

## The TDD Cycle (Red-Green-Refactor)

### 1. RED Phase - Write Failing Tests First
```bash
# Create feature branch
git checkout -b feature/your-feature

# Write test file FIRST
touch tests/unit/your-feature.test.js

# Write tests that SHOULD fail
npm test -- tests/unit/your-feature.test.js
# ❌ Tests fail (this is expected!)
```

### 2. GREEN Phase - Make Tests Pass
```javascript
// Write MINIMAL code to make tests pass
// Don't add extra features
// Don't optimize yet
```

```bash
# Run tests again
npm test -- tests/unit/your-feature.test.js
# ✅ Tests pass!
```

### 3. REFACTOR Phase - Improve Code
```javascript
// NOW optimize and clean up
// Tests ensure nothing breaks
```

```bash
# Verify all tests still pass
npm test
# ✅ All tests pass!
```

## Complete TDD Workflow Example

### Example: Adding a Payment Feature

#### Step 1: Write Test First
```javascript
// tests/unit/payment-processor.test.js
describe('Payment Processor', () => {
  it('should process payment successfully', async () => {
    const payment = await processPayment({
      amount: 100,
      currency: 'USD',
      customerId: 'cust_123'
    });
    
    expect(payment.status).to.equal('succeeded');
    expect(payment.amount).to.equal(100);
  });
  
  it('should handle payment failure', async () => {
    try {
      await processPayment({
        amount: -100, // Invalid amount
        currency: 'USD',
        customerId: 'cust_123'
      });
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid amount');
    }
  });
});
```

#### Step 2: Run Tests (They Should Fail)
```bash
npm test -- tests/unit/payment-processor.test.js
# ❌ Error: processPayment is not defined
```

#### Step 3: Write Minimal Code
```javascript
// lambda/payment-processor.js
async function processPayment({ amount, currency, customerId }) {
  if (amount <= 0) {
    throw new Error('Invalid amount');
  }
  
  return {
    status: 'succeeded',
    amount,
    currency,
    customerId
  };
}

module.exports = { processPayment };
```

#### Step 4: Run Tests Again
```bash
npm test -- tests/unit/payment-processor.test.js
# ✅ All tests pass!
```

#### Step 5: Run Full Test Suite
```bash
npm test
# ✅ Ensure no existing tests break!
```

#### Step 6: Commit and Push
```bash
git add -A
git commit -m "feat: Add payment processor with TDD

- Written tests first for payment processing
- Handles successful payments
- Validates payment amounts
- All tests passing"

git push -u origin feature/payment-processor
```

## Checklist Before Every Commit

- [ ] Tests written BEFORE feature code?
- [ ] Tests fail initially (Red phase)?
- [ ] Minimal code written to pass tests (Green phase)?
- [ ] Code refactored while keeping tests green?
- [ ] All existing tests still pass?
- [ ] Dependencies installed in all required directories?
- [ ] External services properly mocked?
- [ ] No hardcoded values or credentials?
- [ ] Tests are isolated and independent?

## Common Patterns for TDD

### Testing Lambda Functions
```javascript
// Always mock AWS services
const AWS = require('aws-sdk-mock');

beforeEach(() => {
  AWS.mock('DynamoDB.DocumentClient', 'put', (params, callback) => {
    callback(null, {});
  });
});

afterEach(() => {
  AWS.restore();
});
```

### Testing React Components
```javascript
// Write test first
it('should display user name', () => {
  const { getByText } = render(<UserProfile user={{ name: 'John' }} />);
  expect(getByText('John')).toBeInTheDocument();
});

// Then implement component
function UserProfile({ user }) {
  return <div>{user.name}</div>;
}
```

### Testing API Endpoints
```javascript
// Test first
it('should return 401 for unauthorized requests', async () => {
  const response = await handler({
    httpMethod: 'GET',
    path: '/api/protected',
    headers: {} // No auth header
  });
  
  expect(response.statusCode).to.equal(401);
});
```

## Fixing Failed PR Tests

If PR tests fail after following TDD:

1. **Check GitHub Actions logs immediately**
   ```bash
   gh run view
   ```

2. **Reproduce locally**
   ```bash
   npm test
   ```

3. **Fix the specific failing test**
   - Don't disable tests
   - Don't skip tests
   - Fix the root cause

4. **Verify fix**
   ```bash
   npm test
   git add -A
   git commit -m "fix: Resolve test failure in [test name]"
   git push
   ```

## Resources

- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertion Library](https://www.chaijs.com/)
- [AWS SDK Mock](https://github.com/dwyl/aws-sdk-mock)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

## Remember

> "The best time to write tests is BEFORE you write the code. The second best time is never." - TDD Principle

**NO EXCEPTIONS. NO SHORTCUTS. TESTS FIRST, ALWAYS.**