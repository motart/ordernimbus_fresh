# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🔒 UNSHAKEABLE RULES - MANDATORY FOR ALL CHANGES

### RULE #1: MANDATORY WORKFLOW FOR EVERY TASK
**FOR EVERY PIECE OF WORK, WITHOUT EXCEPTION:**
1. **CREATE** new branch from `develop` branch
2. **IMPLEMENT** all changes in the feature branch
3. **DEPLOY** to production to verify it works
4. **CREATE** automergeable PR to `develop` with `gh pr merge <PR> --auto --squash`
5. **IF TESTS FAIL**: Find what broke → Fix it → Start loop again
6. **LOOP** until all tests pass and PR is ready to merge
- **NO EXCEPTIONS** - This workflow is MANDATORY for ALL tasks
- **CRITICAL**: All PRs MUST have auto-merge enabled immediately after creation!

### RULE #2: ALL CHANGES CREATE PR TO DEVELOP AUTOMATICALLY
- **NEVER** commit directly to any protected branch
- **ALWAYS** create feature branch from `develop`
- **ALWAYS** create PR to `develop` branch (not main)
- **NO EXCEPTIONS** - even for "quick fixes"

### RULE #3: PR CANNOT MERGE IF ANY TEST FAILS
- **ALL 7 test suites MUST pass**: Unit, Backend, Frontend, E2E, Integration, Security, Code Quality
- **If ANY test fails → PR is BLOCKED**
- **Cannot disable tests to make them pass**
- **Cannot use admin override**

### RULE #4: ENFORCEMENT IS AUTOMATIC
- GitHub Actions run on EVERY pull request
- Branch protection rules prevent bypassing
- Git hooks enforce locally
- **See [UNSHAKEABLE_RULES.md](./UNSHAKEABLE_RULES.md) for complete details**

## Custom Instructions & Observations for Claude

### 🎨 CRITICAL PRIORITY: UI/UX Excellence
**UI/UX must be the top consideration in all development.** Always ensure:
- **Immediate Visual Feedback**: Every user action must have instant visual response
- **Smooth Animations**: State changes should use transitions (slideInScale, fadeIn, etc.)
- **Clear Loading States**: Show spinners/progress bars for all async operations
- **Toast Notifications**: Use react-hot-toast for all success/error/info messages
- **No UI Bugs**: Prevent overlapping elements, stuck modals, frozen overlays
- **Responsive Design**: Test on multiple screen sizes
- **Visual Hierarchy**: New content should stand out (badges, animations, highlights)
- **Error Recovery**: Guide users to fix issues, never leave them stuck
- **Accessibility**: Proper ARIA labels, keyboard navigation, color contrast

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
- [ ] Use ONLY `./deploy.sh` for deployments (consolidated master script in root)
- [ ] Use ONLY `./teardown-production.sh` for teardowns (no variations)
- [ ] Check for CloudFront distribution conflicts before deployment
- [ ] Verify S3 buckets are empty before attempting stack deletion

#### Known Issues & Solutions
- **React 19 + react-icons**: Compatibility issues - use `React.createElement(IconName as any)` pattern
- **Stack Naming**: The config.json STACK_PREFIX already contains "production", don't append environment again
- **CloudFront CNAMEs**: Check for existing distributions using the same domain before deploying
- **TypeScript Strict Mode**: Frontend uses strict TypeScript - always define return types for functions
- **Script Issues**: ALWAYS fix in the original script, NEVER create new versions (no deploy-fixed.sh, deploy-v2.sh, etc.)
- **Lambda Deployment**: If Lambda code missing, deploy.sh has fallback to use cached version from `/tmp/prod-lambda/`
- **Shopify Redirect URI**: Must be whitelisted in Shopify Partner Dashboard - cannot be set programmatically
- **CloudFront Deployment**: Takes 5-15 minutes to fully deploy, status changes from "InProgress" to "Deployed"
- **Dynamic API URL**: Lambda uses `event.requestContext.domainName` to dynamically generate redirect URIs

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

## 🚨 CRITICAL DEPLOYMENT RULES

### RULE: NO SCRIPT DUPLICATION - FIX IN PLACE
- **NEVER** create new deployment or teardown scripts to fix issues
- **ALWAYS** fix issues within the existing scripts:
  - `./deploy.sh` - The ONLY deployment script (root directory)
  - `./teardown-production.sh` - The ONLY teardown script (root directory)
- **NO EXCEPTIONS** - All deployment logic must be in these two scripts
- If a script has an issue, fix it IN THE SCRIPT, don't create deploy-fixed.sh or similar
- This prevents script proliferation and confusion

## Development Commands

```bash
# Complete platform deployment (ONLY USE THESE)
./deploy.sh staging              # Deploy to staging
./deploy.sh production          # Deploy to production
./deploy.sh local               # Setup local development

# Infrastructure destruction (CAREFUL!)
./teardown-production.sh        # Destroy production environment (with confirmation)

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

## Current Production Deployment (us-west-1)

### Live URLs
- **Frontend**: https://app.ordernimbus.com (CloudFront + S3)
- **API Gateway**: https://tsip547ao2.execute-api.us-west-1.amazonaws.com/production
- **API Custom Domain**: https://api.ordernimbus.com (Route53 CNAME to API Gateway)

### AWS Resources
- **CloudFormation Stack**: `ordernimbus-production`
- **S3 Frontend Bucket**: `ordernimbus-production-frontend-335021149718`
- **CloudFront Distribution**: `EP62VZVVDF7SQ` (serving app.ordernimbus.com)
- **Cognito User Pool**: `us-west-1_eY0a03NVh`
- **Cognito Client ID**: `3uis9h8ul7hqlm47vbmatsgejf`
- **Lambda Function**: `ordernimbus-production-main` (single monolithic handler)
- **DynamoDB Table**: `ordernimbus-production-main`
- **Secrets Manager**: `ordernimbus/production/shopify` (Shopify OAuth credentials)

### Shopify Integration
- **Redirect URI**: `https://tsip547ao2.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback`
- **OAuth Flow**: Dynamic redirect URI generation using API Gateway context
- **Credentials**: Stored in AWS Secrets Manager, never hardcoded

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

## Deployment Troubleshooting Guide

### Common Deployment Issues & Fixes

#### 1. Lambda Code Not Found
**Error**: "No Lambda code found to deploy"
**Solution**: Deploy script automatically uses cached Lambda from `/tmp/prod-lambda/` if available

#### 2. CloudFormation Stack Deletion Fails
**Error**: "Stack cannot be deleted while resources exist"
**Solution**: 
```bash
# Empty S3 buckets first
aws s3 rm s3://BUCKET_NAME --recursive
# Then delete stack
./teardown-production.sh
```

#### 3. Shopify OAuth Redirect Mismatch
**Error**: "Redirect URI mismatch"
**Solution**: Lambda now dynamically generates redirect URI using API Gateway context. Update Shopify app with: `https://YOUR_API_GATEWAY_URL/production/api/shopify/callback`

#### 4. CloudFront Distribution Disabled
**Error**: Site not accessible after teardown/redeploy
**Solution**: Re-enable distribution:
```bash
aws cloudfront get-distribution-config --id DIST_ID > /tmp/cf-dist.json
ETAG=$(jq -r '.ETag' /tmp/cf-dist.json)
jq '.DistributionConfig.Enabled = true' /tmp/cf-dist.json > /tmp/cf-updated.json
aws cloudfront update-distribution --id DIST_ID --distribution-config "$(jq '.DistributionConfig' /tmp/cf-updated.json)" --if-match "$ETAG"
```

## Architecture Files

- `ARCHITECTURE_PLAN.md` - Detailed 85-day implementation plan
- `CAPACITY_PLANNING.md` - Scaling formulas and cost ceilings  
- `tests/load/k6-suite.js` - Comprehensive load test scenarios
- `.github/workflows/nightly-load-test.yml` - Automated performance regression testing
- `SHOPIFY_REDIRECT_URI.md` - Current Shopify OAuth redirect configuration