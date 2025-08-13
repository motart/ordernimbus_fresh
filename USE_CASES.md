# Use Case Scenarios

This document maintains a comprehensive list of all use case scenarios for OrderNimbus, indexed and tracked for implementation and testing.

## UC001: New User Registration Flow

**ID:** UC001  
**Title:** New User Registration with Email Verification  
**Priority:** High  
**Status:** ✅ Implementation Ready & Tests Created

### Description
As a new user I want to be able to visit app.ordernimbus.com, see the login page, be able to navigate to the registration page, enter my basic data, with company name, email, name, being mandatory, validate and confirm the email by receiving a validation token in an email, enter the validation token, then see the Default dashboard.

### User Story
```
As a new user
I want to register for OrderNimbus with email verification
So that I can securely access the platform with my company data
```

### Acceptance Criteria
- [x] User visits app.ordernimbus.com and sees login page
- [x] User can navigate from login to registration page
- [x] Registration form validates mandatory fields:
  - Company name (required)
  - Email address (required, valid format)
  - First name (required)
  - Last name (required)
  - Password (required, meets security requirements)
- [x] Upon successful registration, verification email is sent
- [x] User receives email with validation token
- [x] User can enter validation token to verify email
- [x] After verification, user sees default dashboard
- [x] User account is created in Cognito with appropriate attributes
- [x] Company data is stored in DynamoDB

### Technical Requirements
- **Frontend:** Registration form with validation
- **Backend:** Cognito user creation with email verification
- **Email:** SES integration for verification emails
- **Database:** DynamoDB company record creation
- **Security:** Password validation, email verification flow

### Test Scenarios
- **E2E Test:** Complete registration flow from landing to dashboard
- **Unit Tests:** Form validation, API endpoints, email verification
- **Integration Tests:** Cognito integration, DynamoDB operations

### Dependencies
- ✅ AWS Cognito configured for email verification
- ✅ AWS SES configured for sending emails (via Cognito)
- ✅ DynamoDB tables for company data
- ✅ Frontend registration and verification components

### Implementation Status
- ✅ **Frontend Components**: RegisterForm.tsx with full validation and verification flow
- ✅ **Authentication**: AuthContext.tsx with Amplify integration
- ✅ **Cloud Configuration**: Runtime config loading from `/api/config`
- ✅ **AWS Cognito**: Email auto-verification enabled with password policy
- ✅ **Navigation**: App.tsx routing between auth and dashboard
- ✅ **Error Handling**: Toast notifications and form validation

### Test Files Created
- ✅ **E2E Test**: `tests/e2e/UC001-new-user-registration.test.js`
- ✅ **Unit Test**: `tests/unit/auth-registration.test.js`
- ✅ **Test Framework**: Selenium + Mocha + Chai setup complete
- ✅ **Test Data**: Fixtures and setup files created

### Test Commands
```bash
npm run test:uc001    # Run UC001 specific tests
npm run test:unit     # Run all unit tests
npm run test:e2e      # Run all E2E tests
./run-tests.sh uc001  # Alternative test runner
```

---

## Template for Future Use Cases

```markdown
## UC###: [Use Case Title]

**ID:** UC###  
**Title:** [Brief descriptive title]  
**Priority:** [High/Medium/Low]  
**Status:** [Pending/In Progress/Complete]

### Description
[Detailed description of the use case from user perspective]

### User Story
```
As a [user type]
I want to [action]
So that [benefit/goal]
```

### Acceptance Criteria
- [ ] [Specific testable requirement]
- [ ] [Specific testable requirement]

### Technical Requirements
- **Frontend:** [Requirements]
- **Backend:** [Requirements]
- **Database:** [Requirements]
- **Security:** [Requirements]

### Test Scenarios
- **E2E Test:** [End-to-end test description]
- **Unit Tests:** [Unit test areas]
- **Integration Tests:** [Integration test areas]

### Dependencies
- [List of dependencies]
```