# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🔒 UNSHAKEABLE RULES - MANDATORY FOR ALL CHANGES

### RULE #1: ALL CHANGES CREATE PR TO DEVELOP AUTOMATICALLY
- **NEVER** commit directly to any protected branch
- **ALWAYS** create feature branch from `develop`
- **ALWAYS** create PR to `develop` branch (not main)
- **NO EXCEPTIONS** - even for "quick fixes"

### RULE #2: PR CANNOT MERGE IF ANY TEST FAILS
- **ALL 7 test suites MUST pass**: Unit, Backend, Frontend, E2E, Integration, Security, Code Quality
- **If ANY test fails → PR is BLOCKED**
- **Cannot disable tests to make them pass**
- **Cannot use admin override**

### RULE #3: ENFORCEMENT IS AUTOMATIC
- GitHub Actions run on EVERY pull request
- Branch protection rules prevent bypassing
- Git hooks enforce locally
- **See [UNSHAKEABLE_RULES.md](./UNSHAKEABLE_RULES.md) for complete details**

## Custom Instructions & Observations for Claude

### CORE ARCHITECTURAL PRINCIPLE: Cloud-Native Application
**This is a cloud-native application that must:**
- Use as little custom code as possible
- Leverage AWS IaaS and PaaS services directly (Amplify, Cognito, DynamoDB, Lambda, etc.)
- Avoid custom implementations when AWS provides a service
- Use AWS Amplify for authentication, data, and API management
- Prefer managed services over self-managed solutions

### IMPORTANT: User-Specific Working Patterns
<!-- Add your observations below. Claude will follow these in all future conversations -->

#### Things to Always Check
- [ ] Check for existing CloudFormation stacks before deploying (avoid duplicate stack names)
- [ ] Always use `deploy-fixed.sh` instead of `deploy.sh` (the original has stack naming issues)
- [ ] Check for CloudFront distribution conflicts before deployment
- [ ] Verify S3 buckets are empty before attempting stack deletion

#### Known Issues & Solutions
- **React 19 + react-icons**: Compatibility issues - use `React.createElement(IconName as any)` pattern
- **Stack Naming**: The config.json STACK_PREFIX already contains "production", don't append environment again
- **CloudFront CNAMEs**: Check for existing distributions using the same domain before deploying
- **TypeScript Strict Mode**: Frontend uses strict TypeScript - always define return types for functions

#### Preferred Development Practices
- Always build frontend with environment variables set (REACT_APP_*)
- Run builds from `/Users/rachid/workspace/ordernimbus/app/frontend` directory
- Use AWS Secrets Manager for all credentials, never hardcode
- When deployment fails, check CloudFormation stack events first
- Deploy to staging first, then production after verification

#### Command Shortcuts & Fixes
```bash
# Quick frontend rebuild and deploy (production)
cd app/frontend && \
export REACT_APP_API_URL="<API_URL>" && \
export REACT_APP_ENVIRONMENT="production" && \
export REACT_APP_USER_POOL_ID="<POOL_ID>" && \
export REACT_APP_CLIENT_ID="<CLIENT_ID>" && \
export REACT_APP_REGION="us-west-1" && \
npm run build && \
aws s3 sync build/ s3://<BUCKET_NAME>/ --delete --region us-west-1
```

#### Your Custom Notes
<!-- Add your specific observations and preferences below this line -->
<!-- Claude will integrate these into all future processing -->

### CRITICAL RULE: NO HARDCODING ANYTHING!!!
- **NEVER** put URLs, IDs, keys, or any configuration values directly in code
- **ALWAYS** use environment variables, configuration files, or CloudFormation outputs
- **ALWAYS** make everything configurable from external sources
- Configuration should be:
  - Read from `.env` files
  - Passed as environment variables
  - Retrieved from CloudFormation stack outputs
  - Stored in AWS Parameter Store or Secrets Manager
- Even "temporary" values must be configurable
- This applies to ALL files: JavaScript, TypeScript, YAML, scripts, everything

### Code Documentation Requirements
- **ALWAYS** add detailed comments to code explaining:
  - Purpose of functions/components
  - Data flow and transformations
  - Security considerations
  - Error handling approach
  - Integration points with other services
- **ALWAYS** consult `CODE_MAP.md` before answering questions about the codebase
- **ALWAYS** update `CODE_MAP.md` when making significant changes
- Comments should explain "why" not just "what"
- Use JSDoc format for JavaScript/TypeScript functions

### Example Comment Style:
```javascript
/**
 * Validates and processes Shopify webhook events
 * @param {Object} event - API Gateway event containing webhook data
 * @returns {Object} HTTP response with processing status
 * 
 * Security: Validates HMAC signature before processing
 * Integration: Updates DynamoDB and triggers SNS notifications
 * Error Handling: Returns 200 even on errors to prevent Shopify retries
 */
```

---

## Project Overview

Multi-tenant, highly-scalable Sales Forecasting Platform with AWS-native infrastructure, designed for brick-and-mortar retailers and Shopify merchants.

## Key Architecture Decisions

### Compute Strategy
- **ECS Fargate** chosen over Lambda for ML workloads (>15min runtime requirements)
- **Aurora Serverless v2** with auto-scaling (0.5-128 ACUs) for variable tenant loads  
- **MWAA with k8s-executor** for auto-scaling ML pipeline workers
- **API Gateway Regional** with 10k RPS burst protection

### Scaling Approach
- Application Auto Scaling policies across all tiers
- Provisioned concurrency for predictable Lambda workloads
- ElastiCache Redis + DynamoDB DAX for hot-path caching
- Tenant-aware partitioning strategy for >1M SKUs

## Development Commands

```bash
# Complete platform deployment
./scripts/deployment/deploy.sh staging              # Deploy to staging
./scripts/deployment/deploy.sh production          # Deploy to production
./scripts/deployment/deploy.sh dev us-west-1 true  # Deploy to dev (skip tests)

# Infrastructure destruction (CAREFUL!)
./scripts/infrastructure/destroy.sh staging            # Destroy staging environment
./scripts/infrastructure/destroy.sh production        # Destroy production environment
./scripts/infrastructure/destroy.sh staging us-west-1 true  # Destroy without confirmation

# Alternative npm commands
npm run deploy:staging          # Deploy to staging
npm run deploy:production       # Deploy to production
npm run deploy:dev             # Deploy to development

# Validation and testing
./scripts/utilities/validate-deployment.sh staging  # Validate deployment health
npm run test:load                 # Run k6 load tests
npm run test:load:staging        # Test against staging

# Infrastructure management
npm run cdk:deploy              # Deploy CDK stacks only
npm run cdk:destroy            # Destroy all stacks
npm run cdk:diff              # Show deployment differences

# Monitoring and troubleshooting
npm run monitor:cloudwatch     # View CloudWatch metrics
npm run costs:analyze         # Analyze AWS costs
npm run logs:api             # Tail API service logs
npm run logs:ml              # Tail ML pipeline logs

# Frontend auto-deployment (automatic moving forward)
cd app/frontend && ./auto-deploy.sh  # Auto-build and deploy frontend to AWS S3
```

## Infrastructure Management

### Deployment Script (`scripts/deployment/deploy.sh`)
- **Fixed Issues**: 
  - S3 public access block handling for website buckets
  - SNS topic creation before stack deployment
  - Frontend deployment path corrected to `app/frontend`
  - Proper error handling for missing CloudFront distributions
  
### Destruction Script (`scripts/infrastructure/destroy.sh`)
- **Comprehensive cleanup** of all AWS resources
- **Safety features**: Requires explicit confirmation
- **Resource handling**:
  - CloudFormation stacks (in reverse dependency order)
  - S3 buckets (empties all versions before deletion)
  - SSM parameters
  - SNS topics and subscriptions
  - Cognito user pools
  - Remaining ECS clusters and load balancers
  - Security groups (except VPC default)
  
### Usage Examples
```bash
# Deploy with all fixes
./scripts/deployment/deploy.sh staging us-west-1

# Destroy everything (with confirmation)
./scripts/infrastructure/destroy.sh staging us-west-1

# Destroy without prompts (DANGEROUS!)
./scripts/infrastructure/destroy.sh staging us-west-1 true
```

## Current Deployment Status

- **Frontend**: Deployed to S3 bucket `ordernimbus-staging-frontend-assets`
- **Frontend URL**: http://ordernimbus-staging-frontend-assets.s3-website-us-west-1.amazonaws.com
- **Chatbot**: Fixed blank page issue, now working correctly
- **Auto-deployment**: Configured via `app/frontend/auto-deploy.sh`

## Scalability SLOs

- **API Latency**: p95 <500ms for reads, <2s for writes
- **Throughput**: 10k RPS burst, 5k sustained  
- **Availability**: 99.9% uptime target
- **Auto-scaling**: Scale-out in <5min, scale-in in <10min

## Load Testing

Run nightly load tests with GitHub Actions:
- **API Load**: 200 VUs ramping to test normal traffic
- **Peak Load**: 5k RPS constant arrival rate  
- **Upload Stress**: Large file upload simulation
- **Tenant Isolation**: Multi-tenant data isolation verification

## Architecture Files

- `ARCHITECTURE_PLAN.md` - Detailed 85-day implementation plan
- `CAPACITY_PLANNING.md` - Scaling formulas and cost ceilings  
- `tests/load/k6-suite.js` - Comprehensive load test scenarios
- `.github/workflows/nightly-load-test.yml` - Automated performance regression testing