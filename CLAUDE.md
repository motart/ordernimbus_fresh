# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
./deploy.sh staging              # Deploy to staging
./deploy.sh production          # Deploy to production
./deploy.sh dev us-east-1 true  # Deploy to dev (skip tests)

# Alternative npm commands
npm run deploy:staging          # Deploy to staging
npm run deploy:production       # Deploy to production
npm run deploy:dev             # Deploy to development

# Validation and testing
./validate-deployment.sh staging  # Validate deployment health
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
```

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
- `load-tests/k6-suite.js` - Comprehensive load test scenarios
- `.github/workflows/nightly-load-test.yml` - Automated performance regression testing