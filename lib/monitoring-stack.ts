import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface MonitoringStackProps extends cdk.StackProps {
  environment: string;
  api: apigateway.RestApi;
  ecsService: ecs.FargateService;
  database: rds.DatabaseCluster;
  distribution: cloudfront.Distribution;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // SNS Topics for alerts
    const criticalAlertsTopic = new sns.Topic(this, 'CriticalAlerts', {
      topicName: `${props.environment}-critical-alerts`,
      displayName: `Critical Alerts - ${props.environment}`,
    });

    const warningAlertsTopic = new sns.Topic(this, 'WarningAlerts', {
      topicName: `${props.environment}-warning-alerts`,
      displayName: `Warning Alerts - ${props.environment}`,
    });

    // Email subscriptions (you'll need to replace with actual email addresses)
    criticalAlertsTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('alerts@ordernimbus.com')
    );
    
    warningAlertsTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('warnings@ordernimbus.com')
    );

    // API Gateway Alarms
    const apiHighErrorRateAlarm = new cloudwatch.Alarm(this, 'APIHighErrorRate', {
      alarmName: `${props.environment}-api-high-error-rate`,
      alarmDescription: 'API Gateway 5xx error rate is too high',
      metric: props.api.metricServerError({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const apiHighLatencyAlarm = new cloudwatch.Alarm(this, 'APIHighLatency', {
      alarmName: `${props.environment}-api-high-latency`,
      alarmDescription: 'API Gateway latency is too high',
      metric: props.api.metricLatency({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const apiThrottlingAlarm = new cloudwatch.Alarm(this, 'APIThrottling', {
      alarmName: `${props.environment}-api-throttling`,
      alarmDescription: 'API Gateway is being throttled',
      metric: props.api.metricClientError({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 50,
      evaluationPeriods: 2,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ECS Service Alarms
    const ecsHighCpuAlarm = new cloudwatch.Alarm(this, 'ECSHighCPU', {
      alarmName: `${props.environment}-ecs-high-cpu`,
      alarmDescription: 'ECS service CPU utilization is too high',
      metric: props.ecsService.metricCpuUtilization({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const ecsHighMemoryAlarm = new cloudwatch.Alarm(this, 'ECSHighMemory', {
      alarmName: `${props.environment}-ecs-high-memory`,
      alarmDescription: 'ECS service memory utilization is too high',
      metric: props.ecsService.metricMemoryUtilization({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 85,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const ecsLowTaskCountAlarm = new cloudwatch.Alarm(this, 'ECSLowTaskCount', {
      alarmName: `${props.environment}-ecs-low-task-count`,
      alarmDescription: 'ECS service has too few running tasks',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'RunningTaskCount',
        dimensionsMap: {
          ServiceName: props.ecsService.serviceName,
          ClusterName: props.ecsService.cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: props.environment === 'production' ? 2 : 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    // Database Alarms
    const dbHighCpuAlarm = new cloudwatch.Alarm(this, 'DBHighCPU', {
      alarmName: `${props.environment}-db-high-cpu`,
      alarmDescription: 'Database CPU utilization is too high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          DBClusterIdentifier: props.database.clusterIdentifier,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const dbHighConnectionsAlarm = new cloudwatch.Alarm(this, 'DBHighConnections', {
      alarmName: `${props.environment}-db-high-connections`,
      alarmDescription: 'Database connection count is too high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnections',
        dimensionsMap: {
          DBClusterIdentifier: props.database.clusterIdentifier,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // CloudFront Alarms
    const cloudFrontHighErrorRateAlarm = new cloudwatch.Alarm(this, 'CloudFrontHighErrorRate', {
      alarmName: `${props.environment}-cloudfront-high-error-rate`,
      alarmDescription: 'CloudFront 4xx/5xx error rate is too high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: '4xxErrorRate',
        dimensionsMap: {
          DistributionId: props.distribution.distributionId,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // 5% error rate
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Assign alarms to topics - placeholder for Lambda integration
    // In production, you would create a Lambda function to send to PagerDuty/Slack
    // criticalAlertsTopic.addSubscription(new snsSubscriptions.LambdaSubscription(lambdaFunction));

    // Add alarms to SNS topics
    apiHighErrorRateAlarm.addAlarmAction(new cloudwatchActions.SnsAction(criticalAlertsTopic));
    apiHighLatencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(warningAlertsTopic));
    apiThrottlingAlarm.addAlarmAction(new cloudwatchActions.SnsAction(warningAlertsTopic));
    
    ecsHighCpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(warningAlertsTopic));
    ecsHighMemoryAlarm.addAlarmAction(new cloudwatchActions.SnsAction(warningAlertsTopic));
    ecsLowTaskCountAlarm.addAlarmAction(new cloudwatchActions.SnsAction(criticalAlertsTopic));
    
    dbHighCpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(warningAlertsTopic));
    dbHighConnectionsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(warningAlertsTopic));
    
    cloudFrontHighErrorRateAlarm.addAlarmAction(new cloudwatchActions.SnsAction(warningAlertsTopic));

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `${props.environment}-sales-forecasting-dashboard`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: 'API Gateway Metrics',
            width: 12,
            height: 6,
            left: [
              props.api.metricCount({
                statistic: 'Sum',
                label: 'Request Count',
              }),
              props.api.metricServerError({
                statistic: 'Sum',
                label: '5xx Errors',
              }),
              props.api.metricClientError({
                statistic: 'Sum',
                label: '4xx Errors',
              }),
            ],
            right: [
              props.api.metricLatency({
                statistic: 'Average',
                label: 'Latency (avg)',
              }),
            ],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'ECS Service Metrics',
            width: 12,
            height: 6,
            left: [
              props.ecsService.metricCpuUtilization({
                statistic: 'Average',
                label: 'CPU Utilization',
              }),
              props.ecsService.metricMemoryUtilization({
                statistic: 'Average',
                label: 'Memory Utilization',
              }),
            ],
            right: [
              new cloudwatch.Metric({
                namespace: 'AWS/ECS',
                metricName: 'RunningTaskCount',
                dimensionsMap: {
                  ServiceName: props.ecsService.serviceName,
                  ClusterName: props.ecsService.cluster.clusterName,
                },
                statistic: 'Average',
                label: 'Running Tasks',
              }),
            ],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'Database Metrics',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/RDS',
                metricName: 'CPUUtilization',
                dimensionsMap: {
                  DBClusterIdentifier: props.database.clusterIdentifier,
                },
                statistic: 'Average',
                label: 'CPU Utilization',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/RDS',
                metricName: 'DatabaseConnections',
                dimensionsMap: {
                  DBClusterIdentifier: props.database.clusterIdentifier,
                },
                statistic: 'Average',
                label: 'Connections',
              }),
            ],
            right: [
              new cloudwatch.Metric({
                namespace: 'AWS/RDS',
                metricName: 'ServerlessDatabaseCapacity',
                dimensionsMap: {
                  DBClusterIdentifier: props.database.clusterIdentifier,
                },
                statistic: 'Average',
                label: 'ACU Usage',
              }),
            ],
          }),
        ],
      ],
    });

    // Cost Budget (if in production)
    if (props.environment === 'production') {
      new budgets.CfnBudget(this, 'MonthlyCostBudget', {
        budget: {
          budgetName: `${props.environment}-monthly-cost-budget`,
          budgetLimit: {
            amount: 15000, // $15,000 monthly limit for production
            unit: 'USD',
          },
          timeUnit: 'MONTHLY',
          budgetType: 'COST',
          costFilters: {
            TagKey: ['Environment'],
            TagValue: [props.environment],
          },
        },
        notificationsWithSubscribers: [
          {
            notification: {
              notificationType: 'ACTUAL',
              comparisonOperator: 'GREATER_THAN',
              threshold: 80, // Alert at 80% of budget
              thresholdType: 'PERCENTAGE',
            },
            subscribers: [
              {
                subscriptionType: 'EMAIL',
                address: 'alerts@ordernimbus.com',
              },
            ],
          },
          {
            notification: {
              notificationType: 'FORECASTED',
              comparisonOperator: 'GREATER_THAN',
              threshold: 100, // Alert when forecasted to exceed budget
              thresholdType: 'PERCENTAGE',
            },
            subscribers: [
              {
                subscriptionType: 'EMAIL',
                address: 'alerts@ordernimbus.com',
              },
            ],
          },
        ],
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
      exportName: `${props.environment}-dashboard-url`,
    });

    new cdk.CfnOutput(this, 'CriticalAlertsTopicArn', {
      value: criticalAlertsTopic.topicArn,
      description: 'Critical Alerts SNS Topic ARN',
      exportName: `${props.environment}-critical-alerts-topic-arn`,
    });

    new cdk.CfnOutput(this, 'WarningAlertsTopicArn', {
      value: warningAlertsTopic.topicArn,
      description: 'Warning Alerts SNS Topic ARN',
      exportName: `${props.environment}-warning-alerts-topic-arn`,
    });
  }
}