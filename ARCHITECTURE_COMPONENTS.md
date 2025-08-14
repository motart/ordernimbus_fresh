# OrderNimbus Architecture & Component Correlations

## 🏗️ System Architecture Overview

OrderNimbus is a cloud-native, multi-tenant SaaS platform built on AWS infrastructure. The system uses a serverless architecture with managed services to ensure scalability, reliability, and cost-effectiveness.

## 🔗 Component Correlations

### 1. Frontend Layer
```
React SPA (app.ordernimbus.com)
    ├── CloudFront Distribution (EP62VZVVDF7SQ)
    │   └── S3 Bucket (ordernimbus-production-frontend-335021149718)
    ├── API Calls → API Gateway
    └── Authentication → Cognito User Pool
```

**Key Correlations**:
- React app makes API calls using environment variables (REACT_APP_API_URL)
- CloudFront serves static assets with HTTPS and caching
- Authentication tokens from Cognito included in API headers

### 2. API Layer
```
API Gateway (tsip547ao2.execute-api.us-west-1.amazonaws.com)
    ├── Custom Domain (api.ordernimbus.com)
    ├── HTTP API Routes
    │   ├── /api/auth/* → Lambda → Cognito
    │   ├── /api/shopify/* → Lambda → Secrets Manager + DynamoDB
    │   ├── /api/products → Lambda → DynamoDB
    │   ├── /api/orders → Lambda → DynamoDB
    │   └── /api/config → Lambda → Environment Variables
    └── Lambda Authorizer → Cognito User Pool
```

**Key Correlations**:
- API Gateway triggers Lambda function for all routes
- Lambda uses AWS SDK to interact with other services
- Dynamic URL generation using request context for Shopify OAuth

### 3. Authentication Layer
```
Cognito User Pool (us-west-1_eY0a03NVh)
    ├── User Pool Client (3uis9h8ul7hqlm47vbmatsgejf)
    ├── Custom Attributes
    │   ├── company_id
    │   ├── company_name
    │   └── role
    ├── Auth Flows
    │   ├── ADMIN_USER_PASSWORD_AUTH
    │   └── REFRESH_TOKEN_AUTH
    └── Integration Points
        ├── Lambda Function (adminInitiateAuth)
        └── Frontend SDK (Amplify Auth)
```

**Key Correlations**:
- Lambda function validates tokens using Cognito SDK
- Multi-tenant isolation via custom attributes
- Admin user created automatically during deployment

### 4. Data Layer
```
DynamoDB Table (ordernimbus-production-main)
    ├── Partition Keys (PK/SK pattern)
    │   ├── company_{id} / metadata
    │   ├── store_{domain} / user_{id}
    │   ├── oauth_state_{state} / shopify
    │   └── user_{id} / profile
    ├── Indexes
    │   └── GSI for query patterns
    └── TTL
        └── OAuth state expiration (10 minutes)
```

**Key Correlations**:
- Single-table design for all application data
- Company-based partitioning for multi-tenancy
- OAuth states stored temporarily with TTL

### 5. Integration Layer
```
Shopify OAuth Flow
    ├── Secrets Manager (ordernimbus/production/shopify)
    │   ├── SHOPIFY_CLIENT_ID
    │   └── SHOPIFY_CLIENT_SECRET
    ├── OAuth Endpoints
    │   ├── /api/shopify/connect → Generate Auth URL
    │   ├── /api/shopify/callback → Token Exchange
    │   └── /api/shopify/sync → Data Synchronization
    └── Storage
        └── DynamoDB (store access tokens)
```

**Key Correlations**:
- Credentials retrieved from Secrets Manager at runtime
- OAuth state stored in DynamoDB for CSRF protection
- Access tokens stored per store/user combination
- Dynamic redirect URI generation prevents mismatch errors

## 📊 Data Flow Diagrams

### User Registration Flow
```
User → Frontend → API Gateway → Lambda
                                   ├── Cognito (Create User)
                                   └── DynamoDB (Store Company)
```

### Shopify Connection Flow
```
User → Frontend → API Gateway → Lambda
                                   ├── Secrets Manager (Get Credentials)
                                   ├── DynamoDB (Store State)
                                   └── Return Auth URL
                                   
Shopify → API Gateway → Lambda
            ├── DynamoDB (Verify State)
            ├── Shopify API (Exchange Token)
            └── DynamoDB (Store Token)
```

### API Request Flow
```
Frontend → CloudFront → API Gateway → Lambda
    ↑                                    ├── Cognito (Verify Token)
    └────────────────────────────────────├── DynamoDB (Get/Put Data)
                                         └── Return Response
```

## 🔒 Security Boundaries

### Network Security
- CloudFront: DDoS protection, geo-restrictions
- API Gateway: Rate limiting, request validation
- VPC: Private subnets for sensitive resources

### Application Security
- Cognito: Token-based authentication
- Lambda: IAM roles with least privilege
- Secrets Manager: Encrypted credential storage
- DynamoDB: Encryption at rest and in transit

### Multi-Tenant Isolation
- Company ID in Cognito custom attributes
- Row-level security in DynamoDB via partition keys
- Tenant-aware Lambda logic

## 🎯 Key Design Decisions

### 1. Monolithic Lambda Function
**Decision**: Single Lambda function handles all API routes  
**Rationale**: 
- Reduced cold starts
- Simplified deployment
- Shared code and dependencies
- Lower operational overhead

### 2. Single-Table DynamoDB Design
**Decision**: One table with composite keys  
**Rationale**:
- Consistent performance at scale
- Simplified backup and recovery
- Cost optimization
- Flexible query patterns

### 3. CloudFront + S3 for Frontend
**Decision**: Static site hosting with CDN  
**Rationale**:
- Global distribution
- High availability
- Cost-effective
- Simple deployment

### 4. Secrets Manager for Credentials
**Decision**: Never hardcode sensitive data  
**Rationale**:
- Automatic rotation capability
- Audit trail
- Encryption at rest
- Centralized management

### 5. Dynamic URL Generation
**Decision**: Lambda generates URLs from request context  
**Rationale**:
- Prevents hardcoded values
- Supports multiple environments
- Resilient to infrastructure changes
- Automatic after teardown/redeploy

## 🔄 Deployment Dependencies

```
1. CloudFormation Stack
   ├── Creates all AWS resources
   ├── Outputs critical IDs and URLs
   └── Manages resource lifecycle

2. Lambda Deployment
   ├── Depends on Stack creation
   ├── Uses cached code from /tmp/prod-lambda/
   └── Environment variables from Stack outputs

3. Frontend Build
   ├── Requires API URL from Stack
   ├── Requires Cognito IDs from Stack
   └── Built with environment variables

4. S3 Deployment
   ├── Requires built frontend
   └── Syncs to S3 bucket from Stack

5. CloudFront Configuration
   ├── Points to S3 bucket
   ├── Custom domain from Route53
   └── SSL certificate from ACM

6. DNS Configuration
   ├── Route53 hosted zone
   ├── CNAME to CloudFront
   └── API custom domain
```

## 📈 Scaling Characteristics

### Horizontal Scaling
- Lambda: Concurrent executions (1000 default)
- DynamoDB: Auto-scaling read/write capacity
- API Gateway: 10,000 RPS burst capacity

### Vertical Scaling
- Lambda: Up to 10GB memory
- DynamoDB: Unlimited storage
- S3: Unlimited storage

### Cost Optimization
- Lambda: Pay per invocation
- DynamoDB: On-demand pricing
- S3: Lifecycle policies for old data
- CloudFront: Edge caching reduces origin requests

## 🚨 Critical Integration Points

1. **Cognito ↔ Lambda**: Authentication and user management
2. **Lambda ↔ DynamoDB**: All application data
3. **Lambda ↔ Secrets Manager**: Shopify credentials
4. **CloudFront ↔ S3**: Frontend delivery
5. **API Gateway ↔ Lambda**: Request routing
6. **Lambda ↔ Shopify API**: OAuth and data sync

## 📝 Environment-Specific Configurations

### Production
- Region: us-west-1
- Stack: ordernimbus-production
- Domain: app.ordernimbus.com
- API: api.ordernimbus.com

### Staging
- Region: us-west-1
- Stack: ordernimbus-staging
- Domain: staging.ordernimbus.com
- API: api-staging.ordernimbus.com

### Local Development
- DynamoDB Local: Port 8000
- SAM Local API: Port 3001
- React Dev Server: Port 3000
- MailDev: Port 8025