# Capacity Planning & Load Profiles

## Target Metrics & SLOs

### API Performance Targets
| Metric | Target | Headroom |
|--------|--------|----------|
| API Gateway RPS | 10,000 burst | 20% buffer (12k provisioned) |
| p95 Latency (reads) | <500ms | Target 300ms |
| p95 Latency (writes) | <2s | Target 1.2s |
| Availability | 99.9% | 99.95% target |

### Database Scaling
| Component | Min | Max | Auto-scale Trigger |
|-----------|-----|-----|-------------------|
| Aurora ACUs | 0.5 | 128 | CPU >70%, Connections >80% |
| Read Replicas | 1 | 6 | Read latency >200ms |
| RDS Proxy Connections | 100 | 5000 | Connection pool >80% |

### Compute Scaling
| Service | Min | Max | Scale Trigger |
|---------|-----|-----|---------------|
| ECS Fargate Tasks | 2 | 100 | CPU >70%, Memory >80% |
| Lambda Concurrency | 10 | 1000 | Queue depth >50 |
| MWAA Workers | 1 | 50 | Task queue depth >100 |

## Load Profiles

### Daily Pattern (Typical Retail Client)
```
00:00-06:00: 10% baseline  (100 RPS)
06:00-09:00: 40% ramp-up   (400 RPS)  
09:00-17:00: 100% peak     (1000 RPS)
17:00-20:00: 60% wind-down (600 RPS)
20:00-24:00: 20% evening   (200 RPS)
```

### Seasonal Scaling (Black Friday scenario)
```
Normal Peak:     1,000 RPS
Black Friday:    5,000 RPS (5x multiplier)
Holiday Season:  2,500 RPS (2.5x multiplier)
End of Quarter:  1,500 RPS (1.5x multiplier)
```

### Data Ingestion Patterns
```
Shopify Sync:    Every 15 minutes, 100MB batches
CSV Upload:      Daily bulk, 1-10GB files
ERP Integration: Hourly delta, 50-500MB
ML Training:     Weekly full retrain, 100GB datasets
```

## Auto-scaling Formulas

### ECS Fargate Scaling
```
Target Tasks = ceil(
  max(
    CPU_utilization / 70 * current_tasks,
    Memory_utilization / 80 * current_tasks,
    API_queue_depth / 10
  )
)

Scale-out cooldown: 300s
Scale-in cooldown: 600s
```

### Aurora Serverless Scaling
```
Target ACUs = ceil(
  max(
    CPU_utilization / 70 * current_ACUs,
    Active_connections / 100,
    Read_latency_ms / 50
  )
)

Min increment: 0.5 ACUs
Max increment: 16 ACUs per scaling event
```

### Lambda Concurrency
```
Reserved Concurrency = ceil(
  Expected_RPS * Average_duration_seconds * 1.3
)

Provisioned Concurrency = ceil(
  Peak_RPS * Average_duration_seconds * 1.1
)
```

## Cost Planning Matrix

### Tier-based Cost Ceilings
| Tier | Monthly Ceiling | Auto-scale Limits |
|------|----------------|------------------|
| Starter | $500 | 10 ECS tasks, 16 ACUs, 100 Lambda concurrent |
| Growth | $5,000 | 50 ECS tasks, 64 ACUs, 500 Lambda concurrent |
| Enterprise | $50,000 | 100 ECS tasks, 128 ACUs, 1000 Lambda concurrent |

### Cost Anomaly Thresholds
```
Warning:  >120% of historical average
Critical: >200% of historical average
Emergency shutdown: >500% of tier ceiling
```

## Load Test Scenarios

### Scenario 1: API Stress Test
```javascript
// k6 test profile
export let options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up
    { duration: '5m', target: 1000 },  // Normal load
    { duration: '2m', target: 5000 },  // Peak load
    { duration: '1m', target: 10000 }, // Stress test
    { duration: '3m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    http_req_failed: ['rate<0.01'],    // 99% success rate
  }
};
```

### Scenario 2: Data Upload Stress
```javascript
// Large file upload simulation
export let options = {
  scenarios: {
    csv_upload: {
      executor: 'constant-arrival-rate',
      rate: 10, // 10 uploads per second
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 50,
    }
  }
};
```

### Scenario 3: Multi-tenant Isolation
```javascript
// Tenant isolation load test
export let options = {
  scenarios: {
    tenant_a: { executor: 'constant-vus', vus: 100, duration: '10m' },
    tenant_b: { executor: 'constant-vus', vus: 100, duration: '10m' },
    tenant_c: { executor: 'constant-vus', vus: 100, duration: '10m' },
  }
};
```

## Monitoring & Alerting Thresholds

### Critical Alerts (PagerDuty)
- API Gateway 5xx errors >1%
- Aurora ACU utilization >90%
- ECS task failure rate >5%
- p95 latency >1000ms for 5 minutes

### Warning Alerts (Slack)
- API Gateway throttling >0.1%
- Aurora connections >80%
- Lambda cold starts >10%
- p95 latency >500ms for 2 minutes

### Cost Alerts (Email)
- Daily spend >120% of budget
- Unusual resource usage patterns
- Reserved capacity underutilization <70%