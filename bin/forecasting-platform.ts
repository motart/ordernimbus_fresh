#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/networking-stack';
import { SecurityStack } from '../lib/security-stack';
import { DatabaseStack } from '../lib/database-stack';
import { ComputeStack } from '../lib/compute-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

// Get environment configuration
const environment = app.node.tryGetContext('environment') || 'staging';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';

const env = { account, region };
const stackPrefix = `ordernimbus-${environment}`;

// Common tags for all stacks
const commonTags = {
  Environment: environment,
  Project: 'OrderNimbus-Forecasting',
  Owner: 'Platform-Team',
  CostCenter: 'Engineering',
  Backup: 'Required'
};

// Add tags to all stacks
cdk.Tags.of(app).add('Environment', environment);
cdk.Tags.of(app).add('Project', 'OrderNimbus-Forecasting');
cdk.Tags.of(app).add('Owner', 'Platform-Team');
cdk.Tags.of(app).add('CostCenter', 'Engineering');

// Create stacks in dependency order
const networkingStack = new NetworkingStack(app, `${stackPrefix}-networking`, {
  env,
  description: `Networking infrastructure for ${environment} environment`,
  tags: commonTags,
  environment
});

const securityStack = new SecurityStack(app, `${stackPrefix}-security`, {
  env,
  description: `Security resources for ${environment} environment`, 
  tags: commonTags,
  environment,
  vpc: networkingStack.vpc
});

const databaseStack = new DatabaseStack(app, `${stackPrefix}-database`, {
  env,
  description: `Database infrastructure for ${environment} environment`,
  tags: commonTags,
  environment,
  vpc: networkingStack.vpc,
  securityGroup: securityStack.databaseSecurityGroup
});

const computeStack = new ComputeStack(app, `${stackPrefix}-compute`, {
  env,
  description: `Compute infrastructure for ${environment} environment`,
  tags: commonTags,
  environment,
  vpc: networkingStack.vpc,
  cluster: networkingStack.ecsCluster,
  ecsSecurityGroup: securityStack.ecsSecurityGroup,
  albSecurityGroup: securityStack.albSecurityGroup,
  database: databaseStack.database
});

const apiStack = new ApiStack(app, `${stackPrefix}-api`, {
  env,
  description: `API Gateway and Lambda functions for ${environment} environment`,
  tags: commonTags,
  environment,
  vpc: networkingStack.vpc,
  ecsService: computeStack.ecsService,
  networkLoadBalancer: computeStack.networkLoadBalancer,
  userPool: securityStack.userPool
});

const frontendStack = new FrontendStack(app, `${stackPrefix}-frontend`, {
  env,
  description: `Frontend assets and CloudFront distribution for ${environment} environment`,
  tags: commonTags,
  environment,
  apiUrl: apiStack.apiUrl
});

const monitoringStack = new MonitoringStack(app, `${stackPrefix}-monitoring`, {
  env,
  description: `Monitoring and alerting for ${environment} environment`,
  tags: commonTags,
  environment,
  api: apiStack.api,
  ecsService: computeStack.ecsService,
  database: databaseStack.database,
  distribution: frontendStack.distribution
});

// Add stack dependencies
securityStack.addDependency(networkingStack);
databaseStack.addDependency(securityStack);
computeStack.addDependency(databaseStack);
apiStack.addDependency(computeStack);
frontendStack.addDependency(apiStack);
monitoringStack.addDependency(frontendStack);