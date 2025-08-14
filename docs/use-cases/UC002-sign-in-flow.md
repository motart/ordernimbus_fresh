# UC002: User Sign-In Flow

## Use Case Overview
**ID:** UC002  
**Name:** User Sign-In Flow  
**Actor:** Registered User  
**Priority:** High  
**Status:** In Development  

## Description
This use case describes how a registered user signs into the OrderNimbus platform to access their sales forecasting dashboard and analytics.

## Preconditions
1. User has a registered account with email verification completed
2. User has a valid password
3. User has internet connectivity
4. OrderNimbus platform is operational

## Main Flow
1. User navigates to app.ordernimbus.com
2. System displays sign-in page with:
   - Email input field
   - Password input field
   - "Sign In" button
   - "Forgot Password?" link
   - "Create Account" link
   - "Remember Me" checkbox (optional)
3. User enters their registered email address
4. User enters their password
5. User clicks "Sign In" button
6. System validates credentials against AWS Cognito
7. System generates JWT tokens (access, refresh, ID tokens)
8. System stores tokens securely in browser
9. System redirects user to dashboard
10. System displays personalized dashboard with user's company data

## Alternative Flows

### AF1: Invalid Credentials
1. At step 6, if credentials are invalid:
   - System displays error message: "Invalid email or password"
   - System clears password field
   - System increments failed login attempt counter
   - User returns to step 4

### AF2: Account Locked (After 5 Failed Attempts)
1. After 5 consecutive failed login attempts:
   - System temporarily locks account for 15 minutes
   - System displays: "Account temporarily locked. Please try again in 15 minutes or reset your password"
   - System sends security alert email to user

### AF3: Forgot Password
1. User clicks "Forgot Password?" link
2. System navigates to password reset page
3. User enters email address
4. System sends password reset link to email
5. User follows email link to reset password

### AF4: Session Expired
1. If user's session token expires:
   - System attempts to refresh token using refresh token
   - If refresh succeeds, user continues without interruption
   - If refresh fails, system redirects to sign-in page with message: "Session expired. Please sign in again"

### AF5: Remember Me Selected
1. If user checks "Remember Me":
   - System stores refresh token with extended expiration (30 days)
   - System auto-fills email on next visit
   - System maintains session across browser restarts

## Postconditions
1. User is successfully authenticated
2. User session is established with valid JWT tokens
3. User has access to their dashboard and company data
4. Login activity is logged for security audit

## Business Rules
1. Email addresses are case-insensitive
2. Passwords are case-sensitive
3. Session timeout: 1 hour of inactivity (without Remember Me)
4. Session timeout: 30 days (with Remember Me)
5. Maximum failed login attempts: 5 within 15 minutes
6. All login attempts are logged with IP address and timestamp

## Technical Requirements
1. HTTPS encryption for all data transmission
2. JWT tokens stored in httpOnly cookies or secure localStorage
3. CORS properly configured for app.ordernimbus.com
4. Rate limiting: Max 10 login attempts per IP per minute
5. AWS Cognito integration for authentication
6. CloudWatch logging for security monitoring

## Error Messages
- "Invalid email or password" - Wrong credentials
- "Account temporarily locked" - Too many failed attempts
- "Session expired" - Token expired
- "Network error. Please try again" - Connection issues
- "Service temporarily unavailable" - Server issues

## Security Considerations
1. Passwords never stored in plain text
2. Failed login attempts trigger security monitoring
3. Successful login from new device triggers email notification
4. Optional MFA support for enhanced security
5. Session tokens invalidated on password change
6. XSS and CSRF protection implemented

## Acceptance Criteria
1. ✅ User can sign in with valid email and password
2. ✅ Invalid credentials show appropriate error message
3. ✅ Account locks after 5 failed attempts
4. ✅ JWT tokens are properly generated and stored
5. ✅ User is redirected to dashboard after successful login
6. ✅ Remember Me functionality works correctly
7. ✅ Session refresh works without user intervention
8. ✅ All security measures are implemented
9. ✅ Login activity is properly logged

## Test Scenarios
1. **Happy Path:** Valid credentials → successful login → dashboard access
2. **Invalid Email:** Non-existent email → error message
3. **Invalid Password:** Wrong password → error message
4. **Account Lockout:** 5 failed attempts → account locked
5. **Session Expiry:** Expired token → auto-refresh or re-login
6. **Remember Me:** Check box → extended session
7. **Concurrent Sessions:** Multiple devices → all sessions valid
8. **Password Reset:** Forgot password → reset flow works