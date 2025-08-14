# UC001: New User Registration with Email Verification

## Overview
This use case describes the complete flow for new user registration on OrderNimbus, including email verification to ensure valid user accounts.

## Actors
- **Primary Actor**: New User (Business Owner/Manager)
- **System**: OrderNimbus Platform
- **External System**: AWS Cognito (Email Service)

## Preconditions
- User has access to app.ordernimbus.com
- User has a valid email address
- User does not have an existing account

## Postconditions
- User account is created in AWS Cognito
- Company profile is stored in DynamoDB
- User email is verified
- User is logged in and redirected to dashboard

## Main Flow

1. **User visits app.ordernimbus.com**
   - System displays login page by default
   - Login page includes "Create one here" link for registration

2. **User clicks "Create one here" link**
   - System transitions to registration form
   - Form displays with required fields marked with asterisk (*)

3. **User enters registration information**
   - Required fields:
     - First Name *
     - Last Name *
     - Email Address *
     - Company Name *
     - Password * (minimum 8 characters)
     - Confirm Password *

4. **User submits registration form**
   - System validates all required fields are filled
   - System validates password meets requirements
   - System validates passwords match

5. **System creates user account**
   - Creates user in AWS Cognito with email_verified = false
   - Generates unique company ID
   - Stores company information in DynamoDB
   - Sends verification code to user's email

6. **System displays verification page**
   - Shows message: "We've sent a verification code to [user email]"
   - Provides input field for 6-digit verification code

7. **User receives email with verification code**
   - Email contains 6-digit verification code
   - User enters code in verification form

8. **User submits verification code**
   - System validates code with AWS Cognito
   - Updates email_verified status to true
   - Updates DynamoDB record

9. **System automatically logs in user**
   - Generates JWT tokens
   - Redirects to default dashboard

## Alternative Flows

### AF1: User Already Exists
- At step 5, if email already exists in system
- System returns error: "User already exists"
- User remains on registration form
- User can try with different email or switch to login

### AF2: Invalid Verification Code
- At step 8, if verification code is incorrect
- System returns error: "Invalid verification code"
- User can retry entering code
- User can request new code to be sent

### AF3: Password Too Weak
- At step 4, if password doesn't meet requirements
- System returns error: "Password must be at least 8 characters long"
- User remains on registration form
- User can enter stronger password

### AF4: Passwords Don't Match
- At step 4, if password and confirm password don't match
- System returns error: "Passwords do not match"
- User remains on registration form
- User can re-enter matching passwords

## Business Rules

1. **Required Fields**
   - First Name, Last Name, Email, Company Name, Password are mandatory
   - System must validate all fields before submission

2. **Password Policy**
   - Minimum 8 characters
   - Should include mix of letters, numbers, special characters (recommended)

3. **Email Verification**
   - Email must be verified before user can access dashboard
   - Verification code expires after 24 hours
   - User can request new code if needed

4. **Company ID Generation**
   - Format: `company-[timestamp]-[random string]`
   - Must be unique across system

## Technical Implementation

### Frontend Components
- `LoginForm.tsx` - Initial login page with registration link
- `RegisterForm.tsx` - Registration and verification forms
- `AuthPage.tsx` - Container for auth flow
- `AuthContext.tsx` - Authentication state management

### Backend Endpoints
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/verify` - Verify email with code
- `POST /api/auth/login` - Auto-login after verification

### AWS Services
- **Cognito User Pool** - User management and authentication
- **DynamoDB** - Company data storage
- **SES** - Email delivery for verification codes

## Acceptance Criteria

1. ✅ User can navigate from login to registration page
2. ✅ All required fields are validated before submission
3. ✅ Email verification code is sent upon registration
4. ✅ User can enter verification code to confirm email
5. ✅ Verified user is automatically logged in
6. ✅ User is redirected to dashboard after verification
7. ✅ Company information is stored in database
8. ✅ Error messages are clear and actionable

## Test Scenarios

1. **Happy Path**
   - Register with all valid information
   - Receive and enter correct verification code
   - Successfully logged in and redirected

2. **Validation Testing**
   - Missing required fields
   - Invalid email format
   - Weak password
   - Mismatched passwords

3. **Verification Testing**
   - Correct code acceptance
   - Incorrect code rejection
   - Code expiration handling

4. **Edge Cases**
   - Duplicate email registration
   - Network errors during registration
   - Concurrent registration attempts

## Security Considerations

1. **Password Storage**
   - Passwords are hashed by AWS Cognito
   - Never stored in plaintext

2. **Email Verification**
   - Prevents fake account creation
   - Ensures valid contact information

3. **CSRF Protection**
   - State tokens for OAuth flows
   - Secure session management

4. **Rate Limiting**
   - Prevent brute force attacks
   - Limit verification code attempts

## Related Use Cases
- UC002: Sign-In Flow
- UC003: Password Reset
- UC004: Company Profile Management