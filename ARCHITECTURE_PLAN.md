# Multi-Tenant Sales Forecasting Platform - Architecture Plan

## A) PHASED WORK PLAN (85 days total)

### Phase 1: Foundation & Core Infrastructure (20 days)
**Scalability Focus: Auto-scaling foundations**
- **Day 1-3**: CDK infrastructure setup with Application Auto Scaling policies
- **Day 4-6**: Aurora Serverless v2 with multi-AZ, RDS Proxy, read replicas
- **Day 7-9**: API Gateway regional setup with burst protection (10k RPS target)
- **Day 10-12**: Lambda vs ECS Fargate decision + provisioned concurrency config
- **Day 13-15**: S3 + CloudFront with origin shield, edge caching policies
- **Day 16-18**: DynamoDB DAX / ElastiCache Redis cluster setup
- **Day 19-20**: Basic observability (CloudWatch dashboards, auto-scaling alarms)

### Phase 2: API Backend & Authentication (15 days)
**Scalability Focus: Horizontal API scaling**
- **Day 21-23**: Multi-tenant authentication (Cognito) with tenant isolation
- **Day 24-26**: REST API core endpoints with connection pooling
- **Day 27-29**: Tenant-aware data access patterns, PII encryption at rest
- **Day 30-32**: SQS + Lambda fan-out for ingest processing
- **Day 33-35**: EventBridge buses for async job orchestration

### Phase 3: Data Pipeline & ML Infrastructure (25 days)
**Scalability Focus: MWAA auto-scaling, data partitioning**
- **Day 36-40**: MWAA setup with k8s-executor, per-tenant queues
- **Day 41-45**: S3 Data Lake with intelligent tiering, partitioned fact tables
- **Day 46-50**: Snowflake/Redshift Serverless integration (>1B rows capability)
- **Day 51-55**: SageMaker Training Jobs with managed spot scaling
- **Day 56-60**: SageMaker Serverless Endpoints for inference (0-∞ scaling)

### Phase 4: Frontend & User Experience (15 days)
**Scalability Focus: SPA optimization, CDN efficiency**
- **Day 61-65**: React SPA with code-splitting (≤250KB gzip budget)
- **Day 66-68**: Lazy loading, route-based chunking
- **Day 69-71**: Progressive loading patterns for large datasets
- **Day 72-75**: Responsive dashboard with virtualized tables

### Phase 5: Testing & Performance (10 days)
**Scalability Focus: Load testing, auto-scaling validation**
- **Day 76-78**: k6 load test suite (5k RPS, p95 <500ms targets)
- **Day 79-80**: GitHub Actions nightly load testing workflow
- **Day 81-82**: Auto-scaling stress testing across all tiers
- **Day 83-85**: Performance tuning, cost anomaly monitoring

## B) CLARIFYING QUESTIONS

### Performance & Scale (21-26)
21. **Peak & average RPS** you expect for API reads/writes?
22. **Max daily ingest size** (GB of CSVs/Shopify orders)? Growth rate?
23. **Target p95 latency** for forecast reads & job submissions?
24. **Real-time inference needed** or is batch (daily/weekly) sufficient?
25. **Forecast data retention** (months/years) & archival tier?
26. **Soft & hard cost ceilings** for autoscaling in Starter/Growth tiers?

### Additional Technical Questions
1. **Tenant isolation model**: Shared DB with tenant_id vs separate schemas vs separate databases?
2. **Forecast granularity**: SKU-level, category-level, or store-level predictions?
3. **ML model complexity**: Simple time series (ARIMA) vs deep learning (LSTM/Transformer)?
4. **Data freshness requirements**: Real-time sync vs hourly/daily batch?
5. **Compliance scope**: Which specific SOC 2 controls and ISO 27001 domains?
6. **Multi-region**: Single region initially or multi-region from start?
7. **Backup/DR RPO/RTO**: Recovery point/time objectives?
8. **Integration patterns**: Webhooks, polling, or event-driven for Shopify/ERP?
9. **Forecast horizon**: Days, weeks, months, or quarters ahead?
10. **Seasonality handling**: Holiday calendars, promotional events?
11. **Data validation**: Real-time validation vs batch cleanup?
12. **User roles**: Admin, analyst, viewer permissions model?
13. **Export formats**: PDF reports, Excel, API endpoints?
14. **Alerting**: Forecast accuracy degradation, data anomalies?
15. **Mobile support**: Native apps or responsive web only?
16. **Audit logging**: User actions, data changes, model predictions?
17. **White-labeling**: Custom branding per tenant?
18. **API rate limiting**: Per-tenant quotas and throttling?
19. **Data sources**: Only CSV/Shopify or future ERP integrations?
20. **Deployment strategy**: Blue/green, canary, or rolling updates?

## C) ARCHITECTURE SKELETONS

### CDK Stack Structure (Auto-scaling Highlights)
```typescript
// cdk/lib/forecasting-platform-stack.ts
export class ForecastingPlatformStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Aurora Serverless v2 with auto-scaling
    const aurora = new rds.ServerlessCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4
      }),
      serverlessV2MinCapacity: 0.5,  // ACUs
      serverlessV2MaxCapacity: 128,   // ACUs
      multiAz: true,
      enableDataApi: true
    });

    // RDS Proxy for connection pooling
    const rdsProxy = new rds.DatabaseProxy(this, 'RDSProxy', {
      proxyTarget: rds.ProxyTarget.fromCluster(aurora),
      connectionPoolConfig: {
        maxConnectionsPercent: 100,
        maxIdleConnectionsPercent: 50
      }
    });

    // API Gateway with throttling
    const api = new apigateway.RestApi(this, 'ForecastingAPI', {
      throttle: {
        rateLimit: 10000,  // 10k RPS
        burstLimit: 5000
      }
    });

    // ECS Fargate with auto-scaling (chosen for long-running ML tasks)
    const cluster = new ecs.Cluster(this, 'FargateCluster', {
      enableFoargateCapacityProviders: true
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 2
    });

    // Application Auto Scaling
    const scaling = service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 100
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70
    });

    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80
    });

    // MWAA with k8s executor auto-scaling
    const mwaaEnvironment = new mwaa.Environment(this, 'AirflowEnv', {
      executorType: mwaa.ExecutorType.KUBERNETES,
      maxWorkers: 50,
      minWorkers: 1,
      schedulerCount: 2
    });

    // ElastiCache Redis cluster
    const redisCluster = new elasticache.CfnReplicationGroup(this, 'Redis', {
      numCacheClusters: 3,
      automaticFailoverEnabled: true,
      multiAzEnabled: true,
      cacheNodeType: 'cache.r6g.large'
    });

    // CloudWatch Auto Scaling Alarms
    new cloudwatch.Alarm(this, 'HighCPUAlarm', {
      metric: service.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2
    });
  }
}
```

### OpenAPI Specification Outline
```yaml
# api/openapi.yaml
openapi: 3.0.3
info:
  title: Sales Forecasting Platform API
  version: 1.0.0
  description: Multi-tenant sales forecasting with auto-scaling

paths:
  /api/v1/tenants/{tenantId}/forecasts:
    get:
      summary: Get forecasts with pagination
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            maximum: 1000
            default: 100
      responses:
        '200':
          description: Paginated forecast results
          headers:
            X-RateLimit-Remaining:
              schema:
                type: integer
    post:
      summary: Create forecast job
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ForecastRequest'

  /api/v1/tenants/{tenantId}/data/upload:
    post:
      summary: Upload sales data (streaming)
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                  maximum: 100000000  # 100MB limit

  /api/v1/tenants/{tenantId}/integrations/shopify:
    post:
      summary: Connect Shopify store
      security:
        - BearerAuth: []

components:
  schemas:
    ForecastRequest:
      type: object
      properties:
        horizon_days:
          type: integer
          minimum: 1
          maximum: 365
        confidence_levels:
          type: array
          items:
            type: number
            minimum: 0.5
            maximum: 0.99
        sku_filters:
          type: array
          items:
            type: string
          maxItems: 10000

  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

### SPA Routes Structure
```typescript
// frontend/src/routes.tsx
export const routes = [
  {
    path: '/',
    component: lazy(() => import('./pages/Dashboard')),
    exact: true
  },
  {
    path: '/forecasts',
    component: lazy(() => import('./pages/Forecasts')),
    children: [
      {
        path: '/forecasts/new',
        component: lazy(() => import('./components/ForecastWizard'))
      },
      {
        path: '/forecasts/:id',
        component: lazy(() => import('./components/ForecastDetail'))
      }
    ]
  },
  {
    path: '/data',
    component: lazy(() => import('./pages/DataManagement')),
    children: [
      {
        path: '/data/upload',
        component: lazy(() => import('./components/DataUpload'))
      },
      {
        path: '/data/integrations',
        component: lazy(() => import('./components/Integrations'))
      }
    ]
  },
  {
    path: '/settings',
    component: lazy(() => import('./pages/Settings')),
    requiresRole: ['admin']
  }
];

// Code splitting with route-based chunks
// Webpack config ensures each route bundle ≤ 50KB gzipped
```

### Storybook Index
```typescript
// frontend/.storybook/main.ts
export default {
  stories: [
    '../src/components/**/*.stories.@(js|jsx|ts|tsx)',
    '../src/pages/**/*.stories.@(js|jsx|ts|tsx)'
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-performance'  // Bundle size monitoring
  ],
  features: {
    buildStoriesJson: true
  }
};

// Key component stories for scalability testing:
// - VirtualizedTable.stories.ts (10k+ rows)
// - ForecastChart.stories.ts (time series visualization)
// - DataUploadProgress.stories.ts (large file handling)
// - TenantSwitcher.stories.ts (multi-tenant UI)
```

## D) EXPLICIT ASSUMPTIONS

### Performance Assumptions
- **API RPS**: Assuming 1k average, 5k peak RPS initially
- **Data ingestion**: Assuming 10GB daily max, 50% monthly growth
- **Latency targets**: p95 <500ms for reads, <2s for job submissions
- **Inference mode**: Batch forecasting sufficient (daily/weekly runs)
- **Data retention**: 2 years active, 5 years archived to Glacier
- **Cost ceilings**: $500/month Starter, $5k/month Growth tier

### Technical Assumptions
- **Compute choice**: ECS Fargate over Lambda for ML workloads (>15min runtime)
- **Database**: Aurora Serverless v2 handles tenant isolation via row-level security
- **Feature store**: Snowflake chosen over Redshift for better auto-scaling
- **Caching**: Redis for hot forecast data, DynamoDB DAX for metadata
- **Region**: Single region (us-east-1) initially, multi-region in Phase 2
- **ML complexity**: Time series forecasting (Prophet/ARIMA), not deep learning initially

### Business Assumptions
- **Tenant isolation**: Shared database with tenant_id partitioning
- **Forecast granularity**: SKU-level predictions with category rollups
- **Integration priority**: Shopify first, generic CSV upload, ERP APIs later
- **Compliance**: SOC 2 Type II focus on security/availability controls
- **Mobile support**: Responsive web app, native apps in future phases