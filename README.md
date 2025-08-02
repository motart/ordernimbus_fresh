# Sales Forecasting Platform

Multi-tenant, highly-scalable Sales Forecasting Platform with AWS-native infrastructure, designed for brick-and-mortar retailers and Shopify merchants.

## Quick Start

### Prerequisites
- AWS CLI configured with appropriate permissions
- Node.js 18+ and npm 8+
- k6 for load testing (optional)

### Deploy the Platform

#### Option 1: Safe Deployment with Automatic Rollback ⭐
```bash
# First, install dependencies
npm install

# Deploy to staging with rollback protection
./deploy-with-rollback.sh staging us-east-1

# Deploy to production with rollback protection
./deploy-with-rollback.sh production us-east-1

# Deploy to development with rollback protection
./deploy-with-rollback.sh dev us-east-1 true
```

#### Option 2: Using npm scripts
```bash
# Install dependencies
npm install

# Safe deployments (recommended)
npm run deploy:safe:staging
npm run deploy:safe:production
npm run deploy:safe:dev

# Standard deployments
npm run deploy:staging
npm run deploy:production
npm run deploy:dev
```

#### Option 3: Manual Deployment
```bash
# Standard deployment (no automatic rollback)
./deploy.sh staging
./deploy.sh production
./deploy.sh dev us-east-1 true
```

### Validate Deployment
```bash
# Validate staging deployment
./validate-deployment.sh staging

# Validate production deployment  
./validate-deployment.sh production

# Verify rollback completion (if rollback occurred)
./rollback-verify.sh staging
npm run rollback:verify:staging
```

## Architecture Overview

### Auto-Scaling Components
- **ECS Fargate**: 2-100 tasks with CPU/memory-based scaling
- **Aurora Serverless v2**: 0.5-128 ACUs with automatic scaling
- **API Gateway**: 10k RPS burst protection with regional deployment
- **MWAA**: k8s-executor with 1-50 auto-scaling workers

### Key Features
- Multi-tenant data isolation with tenant-aware partitioning
- Real-time data ingestion from CSV uploads and Shopify APIs
- ML forecasting pipeline with SageMaker integration
- Comprehensive monitoring and cost anomaly detection
- Load testing with nightly performance regression checks

## Development Commands

```bash
# Infrastructure Management
npm run cdk:deploy          # Deploy CDK stacks
npm run cdk:destroy         # Destroy all stacks
npm run cdk:diff           # Show deployment diff

# Load Testing
npm run test:load          # Run k6 load tests locally
npm run test:load:staging  # Run against staging environment

# Monitoring
npm run monitor:cloudwatch # View CloudWatch metrics
npm run costs:analyze      # Analyze AWS costs
npm run logs:api          # Tail API logs
npm run logs:ml           # Tail ML pipeline logs
```

## Configuration

### Environment Configuration
Edit `deploy-config.json` to customize deployment settings:

- **Scaling limits**: Min/max capacity for each environment
- **Cost ceilings**: Daily and monthly spending limits
- **Monitoring**: Log retention and alerting preferences
- **Feature flags**: Enable/disable components like MWAA, SageMaker

### Environment Variables
The deployment script automatically creates these Parameter Store values:
- Database credentials (encrypted)
- JWT secrets for authentication
- Load testing tokens
- CORS origins and API configuration

## Environments

### Development (`dev`)
- Minimal scaling (1-10 tasks, 0.5-16 ACUs)
- $500/month cost ceiling
- 7-day log retention
- Slack alerting

### Staging (`staging`)  
- Production-like scaling (2-50 tasks, 0.5-64 ACUs)
- $2,500/month cost ceiling
- 30-day log retention
- PagerDuty alerting

### Production (`production`)
- Full scaling (5-100 tasks, 2-128 ACUs)
- $15,000/month cost ceiling
- 90-day log retention
- PagerDuty alerting with escalation

## Load Testing

### Automated Testing
Nightly GitHub Actions workflow runs comprehensive load tests:
- **API Load**: 200 VUs ramping to test normal traffic patterns
- **Peak Load**: 5k RPS constant arrival rate for stress testing
- **Upload Stress**: Large file upload simulation
- **Tenant Isolation**: Multi-tenant data isolation verification

### Manual Testing
```bash
# Run specific test scenarios
k6 run load-tests/k6-suite.js --env K6_SCENARIO=api_load
k6 run load-tests/k6-suite.js --env K6_SCENARIO=peak_load
k6 run load-tests/k6-suite.js --env K6_SCENARIO=upload_stress
```

### Performance SLOs
- **API Latency**: p95 <500ms for reads, <2s for writes
- **Throughput**: 10k RPS burst capability, 5k sustained
- **Availability**: 99.9% uptime target
- **Error Rate**: <1% for all endpoints

## Monitoring & Observability

### CloudWatch Dashboards
Auto-deployed dashboards track:
- API Gateway metrics (latency, errors, throttling)
- ECS task metrics (CPU, memory, count)
- Aurora metrics (connections, ACU usage)
- Custom business metrics (forecasts generated, data processed)

### Alerting
- **Critical**: PagerDuty for API 5xx errors, database failures
- **Warning**: Slack for performance degradation, cost anomalies
- **Info**: Email for deployment completions, weekly reports

### Cost Monitoring
- AWS Budgets with anomaly detection
- Daily cost reports with trend analysis
- Resource utilization recommendations
- Reserved capacity optimization alerts

## Security & Compliance

### Data Protection
- All data encrypted at rest (Aurora, S3, EBS)
- TLS 1.2+ for all communications
- PII encryption with AWS KMS
- Tenant data isolation via RLS policies

### Access Control
- IAM roles with least-privilege principles
- Cognito for user authentication
- API Gateway rate limiting per tenant
- VPC security groups restricting network access

### Compliance Features
- CloudTrail logging for audit trails
- VPC Flow Logs for network monitoring
- Parameter Store for secrets management
- Backup automation with point-in-time recovery

## Troubleshooting

### Common Issues

#### Deployment Failures
```bash
# Check CloudFormation stack status
aws cloudformation describe-stacks --stack-name ordernimbus-staging-api

# View deployment logs (with rollback info)
tail -f deployment-staging-*.log
cat /tmp/deploy-*-transaction.log
cat /tmp/deploy-*-rollback.log

# Validate configuration
./validate-deployment.sh staging

# Verify rollback completion
./rollback-verify.sh staging

# Manual cleanup if needed
aws cloudformation delete-stack --stack-name ordernimbus-staging-api
aws s3 rm s3://ordernimbus-staging-frontend-assets --recursive
```

#### Performance Issues
```bash
# Check ECS service health
aws ecs describe-services --cluster ordernimbus-staging-cluster

# Monitor Aurora performance
aws rds describe-db-clusters --db-cluster-identifier ordernimbus-staging-db

# View API Gateway metrics
aws cloudwatch get-metric-statistics --namespace AWS/ApiGateway
```

#### Cost Overruns
```bash
# Analyze current costs
npm run costs:analyze

# Check auto-scaling policies
aws application-autoscaling describe-scalable-targets

# Review cost anomaly alerts
aws ce get-anomalies --date-interval Start=2024-01-01,End=2024-01-31
```

## Support

### Documentation
- `ARCHITECTURE_PLAN.md` - Detailed implementation plan
- `CAPACITY_PLANNING.md` - Scaling formulas and cost analysis
- `CLAUDE.md` - Development guidance for Claude Code

### Monitoring URLs
- CloudWatch: https://console.aws.amazon.com/cloudwatch
- ECS: https://console.aws.amazon.com/ecs  
- RDS: https://console.aws.amazon.com/rds
- API Gateway: https://console.aws.amazon.com/apigateway

### Getting Help
- Check GitHub Issues for known problems
- Review CloudWatch logs for error details
- Use validation script to diagnose deployment issues
- Monitor Slack/PagerDuty for real-time alerts