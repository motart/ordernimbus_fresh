# OrderNimbus Code Map
<!-- This file is automatically referenced by Claude to understand the codebase structure -->
<!-- Last Updated: 2025-08-13 -->

## 🗺️ Project Structure Overview

```
ordernimbus/
├── app/                     # Application code
│   ├── frontend/           # React frontend application
│   └── backend/            # Backend services (if separate from Lambda)
├── lambda/                 # AWS Lambda functions
├── infrastructure/         # Infrastructure as Code
│   └── cloudformation/     # CloudFormation templates
├── scripts/                # Deployment and utility scripts
├── tests/                  # Test suites
└── docs/                   # Documentation
```

## 📁 Core Directories

### `/app/frontend/` - React Frontend Application
**Purpose**: Multi-tenant SaaS frontend for sales forecasting
**Technology**: React 19, TypeScript, AWS Amplify

#### Key Files:
- `src/App.tsx` - Main application entry point, handles routing and authentication state
- `src/components/Dashboard.tsx` - Main dashboard container, manages page navigation
- `src/components/LogsPage.tsx` - Real-time CloudWatch logs viewer (uses polling, not WebSocket)
- `src/services/auth.ts` - Authentication service, handles Cognito JWT tokens
- `src/utils/SecureDataManager.ts` - Encrypted local storage with user isolation
- `src/contexts/AuthContext.tsx` - React context for authentication state

#### Important Patterns:
```typescript
// Authentication flow in every component:
const { user } = useAuth();
if (!user) return <Navigate to="/login" />;

// API calls always use authenticatedRequest:
await authService.authenticatedRequest('/api/endpoint', options);

// Secure data storage:
const dataManager = SecureDataManager.getInstance();
await dataManager.setSecureData(key, value);
```

### `/lambda/` - Serverless Functions
**Purpose**: API endpoints and background processing
**Technology**: Node.js 18.x, AWS SDK v3

#### Core Lambda Functions:

##### `jwt-authorizer.js`
- **Purpose**: Validates JWT tokens from Cognito
- **Trigger**: API Gateway authorizer
- **Returns**: Policy document with userId in context
- **Critical Code**:
```javascript
// Extracts and validates Cognito JWT
const token = event.authorizationToken.replace('Bearer ', '');
const verified = await verifyToken(token, jwksUri, issuer);
return generatePolicy(verified.sub, 'Allow', event.methodArn, { userId: verified.sub });
```

##### `store-management.js`
- **Purpose**: CRUD operations for Shopify stores
- **Database**: DynamoDB table `ordernimbus-{env}-stores`
- **Key Operations**: Create, list, update, delete stores
- **Security**: User isolation via userId from JWT

##### `shopify-integration.js`
- **Purpose**: Shopify OAuth and API integration
- **Secrets**: Uses AWS Secrets Manager for credentials
- **OAuth Flow**: 
  1. `/api/shopify/oauth/initiate` - Starts OAuth
  2. `/api/shopify/oauth/callback` - Handles callback
  3. Stores tokens in DynamoDB encrypted

##### `logs-reader.js`
- **Purpose**: Fetches CloudWatch logs for frontend display
- **Security**: JWT authorized, filters by user permissions
- **Performance**: Limits to 500 logs, supports pagination

### `/infrastructure/cloudformation/` - IaC Templates
**Purpose**: AWS resource definitions
**Main Template**: `cloudformation-template.yaml` (2000+ lines)

#### Key Resources:

##### Networking (Lines 40-150)
```yaml
VPC:
  Type: AWS::EC2::VPC
  Properties:
    CidrBlock: 10.0.0.0/16  # Private network for resources
```

##### API Gateway (Lines 1400-1500)
```yaml
ApiGateway:
  Type: AWS::ApiGatewayV2::Api
  Properties:
    Name: !Sub 'ordernimbus-${Environment}-api'
    ProtocolType: HTTP
    CorsConfiguration:  # CORS enabled for all origins
```

##### Lambda Functions (Lines 600-900)
- Each function has Role, Function, and Permission resources
- All use JWT Authorizer for security
- Environment variables injected from stack parameters

##### DynamoDB Tables (Lines 300-500)
- Main table: Partition key `userId`, Sort key `id`
- Stores table: Stores Shopify connection data
- OAuth states: Temporary OAuth flow storage

### `/scripts/` - Automation Scripts

#### Deployment Scripts:
- `deploy-fixed.sh` - **USE THIS** - Fixed version that handles stack naming correctly
- `deploy.sh` - **DON'T USE** - Has stack naming bug (creates double "production")
- `cleanup-cloudfront.sh` - Resolves CloudFront CNAME conflicts
- `auto-deploy.sh` - Frontend CI/CD pipeline

#### Key Script Patterns:
```bash
# Always check for existing resources:
aws cloudformation describe-stacks --stack-name $STACK_NAME 2>&1 | grep -q "does not exist"

# Always empty S3 buckets before deletion:
aws s3 rm "s3://$BUCKET_NAME" --recursive

# Always use proper environment variables:
export REACT_APP_API_URL="$API_URL"
export REACT_APP_ENVIRONMENT="$ENVIRONMENT"
```

## 🔄 Data Flow

### User Authentication Flow:
1. User enters credentials → `LoginPage.tsx`
2. Cognito authentication → Returns JWT token
3. Token stored in `authService.ts`
4. All API calls include `Authorization: Bearer {token}`
5. `jwt-authorizer.js` validates token
6. Lambda functions receive `userId` from authorizer context

### Shopify Integration Flow:
1. User clicks "Connect Shopify" → `StoresPage.tsx`
2. Initiates OAuth → `shopify-integration.js`
3. Shopify redirects back with code
4. Exchange code for access token
5. Store encrypted token in DynamoDB
6. Fetch store data via GraphQL API

### Real-time Logs Flow:
1. `LogsPage.tsx` polls every 2 seconds
2. Calls `/api/logs` endpoint
3. `logs-reader.js` fetches from CloudWatch
4. Filters by source, level, and time
5. Returns formatted log entries
6. Frontend updates display

## 🗃️ Database Schema

### DynamoDB Tables:

#### `ordernimbus-{env}-main`
```javascript
{
  userId: "cognito-sub-id",     // Partition key
  id: "unique-resource-id",     // Sort key
  type: "store|order|product",  // Resource type
  data: {},                     // Resource data
  createdAt: "ISO-8601",
  updatedAt: "ISO-8601"
}
```

#### `ordernimbus-{env}-stores`
```javascript
{
  userId: "cognito-sub-id",
  storeId: "shopify-store-id",
  storeName: "My Store",
  shopifyDomain: "my-store.myshopify.com",
  accessToken: "encrypted-token",  // Encrypted with KMS
  scope: "read_products,read_orders",
  installedAt: "ISO-8601"
}
```

## 🔐 Security Patterns

### Authentication:
- **JWT Validation**: Every API call validated by `jwt-authorizer.js`
- **User Isolation**: All queries filtered by `userId` from JWT
- **Token Refresh**: Handled automatically by Amplify

### Encryption:
- **At Rest**: DynamoDB encryption enabled
- **In Transit**: HTTPS enforced via API Gateway
- **Secrets**: AWS Secrets Manager for API keys
- **Local Storage**: AES-256-GCM in `SecureDataManager.ts`

### CORS Configuration:
```javascript
// Lambda response headers (all functions):
{
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
}
```

## 🚀 Deployment Configuration

### Environment Variables:
```bash
# Frontend build variables:
REACT_APP_API_URL          # API Gateway endpoint
REACT_APP_ENVIRONMENT      # staging|production
REACT_APP_USER_POOL_ID     # Cognito User Pool
REACT_APP_CLIENT_ID        # Cognito App Client
REACT_APP_REGION           # AWS Region (us-west-1)

# Lambda environment variables:
ENVIRONMENT               # staging|production
TABLE_NAME                # DynamoDB table name
USER_POOL_ID             # For JWT validation
SHOPIFY_SECRET_NAME      # Secrets Manager key
```

### Stack Outputs:
- `ApiEndpoint` - API Gateway URL
- `S3BucketName` - Frontend hosting bucket
- `UserPoolId` - Cognito User Pool ID
- `UserPoolClientId` - Cognito client for frontend
- `CloudFrontDistributionId` - CDN distribution (if enabled)

## 🐛 Known Issues & Fixes

### Issue: React 19 + react-icons TypeScript errors
**Location**: Any component using react-icons
**Fix**: Use `React.createElement(IconName as any, props)`
```typescript
// Instead of: <FiSearch />
// Use: React.createElement(FiSearch as any)
```

### Issue: CloudFormation stack naming
**Location**: `deploy.sh` line 65
**Problem**: Creates `ordernimbus-production-production`
**Fix**: Use `deploy-fixed.sh` which handles naming correctly

### Issue: CloudFront CNAME conflicts
**Location**: CloudFormation deployment
**Fix**: Run `cleanup-cloudfront.sh` before deployment

### Issue: S3 bucket not empty during stack deletion
**Location**: CloudFormation stack deletion
**Fix**: Always run this first:
```bash
aws s3 rm "s3://bucket-name" --recursive
```

## 📝 Common Tasks

### Add New API Endpoint:
1. Create Lambda function in `/lambda/`
2. Add function definition in CloudFormation template
3. Add API Gateway route and integration
4. Add JWT authorizer to route
5. Update frontend to call new endpoint

### Update Frontend Environment:
1. Get stack outputs: `aws cloudformation describe-stacks`
2. Set environment variables
3. Build: `npm run build`
4. Deploy: `aws s3 sync build/ s3://bucket/`
5. Invalidate CloudFront (if used)

### Debug Lambda Function:
1. Check CloudWatch logs: `/aws/lambda/function-name`
2. Check authorizer context: `event.requestContext.authorizer`
3. Verify environment variables
4. Test with curl including JWT token

## 🔍 Quick Reference

### File Locations:
- **Authentication Logic**: `app/frontend/src/services/auth.ts`
- **API Routes**: `infrastructure/cloudformation/cloudformation-template.yaml` (search for "Route")
- **Lambda Functions**: `lambda/*.js`
- **Deployment Scripts**: `scripts/deployment/` and root directory
- **Frontend Components**: `app/frontend/src/components/`
- **Database Schema**: This file + CloudFormation template

### Important Commands:
```bash
# Check stack status
aws cloudformation describe-stacks --stack-name ordernimbus-production --region us-west-1

# View Lambda logs
aws logs tail /aws/lambda/ordernimbus-production-store-management --follow

# Test API endpoint
curl -H "Authorization: Bearer $TOKEN" https://api-url/endpoint

# Deploy frontend only
cd app/frontend && npm run build && aws s3 sync build/ s3://bucket/
```

## 🔄 Update Instructions

To keep this CODE_MAP current:
1. Update when adding new files or functions
2. Document data flow changes
3. Add new error patterns and fixes
4. Update security patterns
5. Document new deployment procedures

---
*This map is essential for Claude's understanding of the codebase. Keep it updated!*