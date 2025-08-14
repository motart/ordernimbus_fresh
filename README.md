# OrderNimbus Platform

AI-powered sales forecasting platform for brick-and-mortar retailers and Shopify merchants. Multi-tenant, highly-scalable platform with AWS-native infrastructure.

## 🌐 Production URLs
- **Application**: https://app.ordernimbus.com
- **API**: https://api.ordernimbus.com
- **Shopify OAuth Callback**: https://tsip547ao2.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback

## 🚀 Quick Start

### Prerequisites
- **Docker Desktop** (for local development)
- **AWS SAM CLI** (v1.100+) - [Install Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- **Node.js** (v18+) and npm (v8+)
- **AWS CLI** configured with appropriate permissions
- **Python** (3.9+ for SAM CLI)
- **k6** for load testing (optional)

## 🛠️ Development Options

### Option 1: Local Development with SAM (Recommended)
```bash
# 1. Clone the repository
git clone <your-repo-url>
cd ordernimbus_fresh

# 2. Install dependencies
npm install
cd app/frontend && npm install && cd ../..

# 3. Start local development environment
./scripts/start-local.sh

# 4. Access the application
# Frontend: http://localhost:3000
# API: http://127.0.0.1:3001
# DynamoDB Admin: http://localhost:8001
# Email UI: http://localhost:8025
```

### Option 2: Deploy to AWS

#### Using SAM (Serverless Application Model)
```bash
# Build the application
sam build

# Deploy to staging
sam deploy --config-env staging

# Deploy to production
sam deploy --config-env production
```

#### Using CloudFormation
```bash
# Deploy complete stack
./deploy-cf.sh staging us-east-1

# Tear down infrastructure
aws cloudformation delete-stack --stack-name ordernimbus-staging --region us-east-1
```
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

## 🏗️ Architecture Overview

### Tech Stack
- **Frontend**: React 19 with TypeScript, Tailwind CSS, Recharts
- **Backend**: AWS Lambda (Node.js 18.x), API Gateway HTTP APIs
- **Authentication**: AWS Cognito with multi-tenant isolation
- **Database**: DynamoDB (single-table design), Aurora Serverless v2 (analytics)
- **Storage**: S3 for static hosting, file uploads, and data lake
- **CDN**: CloudFront with custom domain (app.ordernimbus.com)
- **Infrastructure**: CloudFormation, AWS CDK, Terraform modules
- **ML/AI**: SageMaker for forecasting, Bedrock for conversational AI
- **Integration**: Shopify OAuth, REST APIs, Webhooks

### Component Architecture
```
┌─────────────────────────────────────────────────────────┐
│                   CloudFront CDN                         │
│                 (app.ordernimbus.com)                    │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│              S3 Static Website                           │
│         (React SPA - Production Build)                   │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│            API Gateway (HTTP API)                        │
│        (api.ordernimbus.com → Lambda)                    │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│          Lambda Function (Monolithic)                    │
│    - Authentication (Cognito Integration)                │
│    - Shopify OAuth & Data Sync                          │
│    - Business Logic & API Routes                        │
└──────┬──────────┬──────────┬────────────────────────────┘
       │          │          │
┌──────▼────┐ ┌──▼───┐ ┌────▼─────┐
│ DynamoDB  │ │ S3   │ │ Secrets  │
│  (Main)   │ │      │ │ Manager  │
└───────────┘ └──────┘ └──────────┘
```

### Auto-Scaling Components
- **ECS Fargate**: 2-100 tasks with CPU/memory-based scaling
- **Aurora Serverless v2**: 0.5-128 ACUs with automatic scaling
- **API Gateway**: 10k RPS burst protection with regional deployment
- **Lambda**: Provisioned concurrency for predictable performance

### Key Features
- Multi-tenant data isolation with company-based partitioning
- Real-time data ingestion from CSV uploads and Shopify APIs
- ML forecasting pipeline with time-series analysis
- OAuth-based Shopify store connection
- Dynamic configuration management
- Comprehensive monitoring and cost anomaly detection

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

## 📜 Deployment Scripts

### Available Scripts
- `deploy.sh` - Standard deployment script with CDK
- `deploy-cf.sh` - CloudFormation single-stack deployment
- `deploy-enhanced.sh` - Enhanced deployment with all features
- `deploy-with-rollback.sh` - Deployment with automatic rollback on failure
- `destroy.sh` - Tear down infrastructure
- `destroy-complete.sh` - Multi-region complete cleanup
- `validate-deployment.sh` - Validate deployment health
- `rollback-verify.sh` - Verify rollback completion

## 📚 Additional Documentation

- [Local Development Guide](docs/LOCAL_DEVELOPMENT.md) - Detailed local setup instructions
- [Architecture Plan](ARCHITECTURE_PLAN.md) - 85-day implementation roadmap
- [Capacity Planning](CAPACITY_PLANNING.md) - Scaling formulas and cost analysis
- [Claude.md](CLAUDE.md) - AI assistant guidelines for development

## 🛡️ License

MIT License - see LICENSE file for details

## 👥 Contributors

OrderNimbus Team

---

Built with ❤️ using AWS, React, and Node.js