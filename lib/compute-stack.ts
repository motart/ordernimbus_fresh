import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as xray from 'aws-cdk-lib/aws-xray';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  cluster: ecs.Cluster;
  ecsSecurityGroup: ec2.SecurityGroup;
  albSecurityGroup: ec2.SecurityGroup;
  database: rds.DatabaseCluster;
}

export class ComputeStack extends cdk.Stack {
  public readonly ecsService: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly networkLoadBalancer: elbv2.NetworkLoadBalancer;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // Create Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: `ordernimbus-${props.environment}-alb`,
      securityGroup: props.albSecurityGroup,
    });

    // Create Target Group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: props.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        enabled: true,
        healthyHttpCodes: '200',
        path: '/api/v1/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // Create ALB Listener
    const listener = this.loadBalancer.addListener('Listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // Create ECS Task Definition with enhanced AWS capabilities
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `ordernimbus-${props.environment}-api-task-role`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
      ],
    });

    // Add permissions for Secrets Manager and Parameter Store
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
      ],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:ordernimbus/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/ordernimbus/*`,
      ],
    }));

    // Add DynamoDB permissions
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:*',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ordernimbus-*`,
      ],
    }));

    // Add Cognito permissions
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:*',
      ],
      resources: ['*'],
    }));

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `ordernimbus-${props.environment}-api`,
      cpu: props.environment === 'production' ? 2048 : 1024,
      memoryLimitMiB: props.environment === 'production' ? 4096 : 2048,
      taskRole: taskRole,
    });

    // Create CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/aws/ecs/ordernimbus-${props.environment}-api`,
      retention: props.environment === 'production' ? 
        logs.RetentionDays.THREE_MONTHS : 
        logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add container with AWS-optimized configuration
    const container = taskDefinition.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromAsset('/Users/rachid/workspace/ordernimbus_fresh/app/backend'),
      containerName: 'ordernimbus-api',
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'api',
        logGroup: logGroup,
      }),
      environment: {
        NODE_ENV: props.environment,
        PORT: '3000',
        DATABASE_HOST: props.database.clusterEndpoint.hostname,
        AWS_REGION: this.region,
        AWS_XRAY_TRACING: 'true',
        ENABLE_CLOUDWATCH_LOGS: 'true',
        USE_PARAMETER_STORE: 'true',
        PARAMETER_STORE_PREFIX: '/ordernimbus/api/',
        USE_COGNITO: 'true',
        ALLOWED_ORIGINS: props.environment === 'production' ? 
          'https://app.ordernimbus.com,https://ordernimbus.com' : 
          'http://localhost:3000,http://localhost:3001',
        ENABLE_SWAGGER_UI: props.environment !== 'production' ? 'true' : 'false',
      },
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
          props.database.secret!,
          'password'
        ),
        DATABASE_USERNAME: ecs.Secret.fromSecretsManager(
          props.database.secret!,
          'username'
        ),
        JWT_SECRET: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromSecureStringParameterAttributes(this, 'JWTSecret', {
            parameterName: '/ordernimbus/api/jwt-secret',
          })
        ),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/api/v1/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
      stopTimeout: cdk.Duration.seconds(30),
      essential: true,
    });

    // Add X-Ray sidecar container for distributed tracing
    if (props.environment === 'production') {
      taskDefinition.addContainer('XRayDaemon', {
        image: ecs.ContainerImage.fromRegistry('public.ecr.aws/xray/aws-xray-daemon:latest'),
        containerName: 'xray-daemon',
        memoryLimitMiB: 256,
        cpu: 32,
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: 'xray',
          logGroup: logGroup,
        }),
        portMappings: [{
          containerPort: 2000,
          protocol: ecs.Protocol.UDP,
        }],
      });
    }

    // Add port mapping
    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // Create ECS Service
    this.ecsService = new ecs.FargateService(this, 'ECSService', {
      cluster: props.cluster,
      taskDefinition,
      serviceName: `ordernimbus-${props.environment}-api`,
      desiredCount: props.environment === 'production' ? 3 : 1,
      minHealthyPercent: 0,
      maxHealthyPercent: 200,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.ecsSecurityGroup],
      enableExecuteCommand: props.environment !== 'production',
      platformVersion: ecs.FargatePlatformVersion.LATEST,
      circuitBreaker: { rollback: true },
    });

    // Attach service to target group
    this.ecsService.attachToApplicationTargetGroup(targetGroup);

    // Create Network Load Balancer for API Gateway VPC Link
    this.networkLoadBalancer = new elbv2.NetworkLoadBalancer(this, 'NLB', {
      vpc: props.vpc,
      internetFacing: false, // Internal NLB for VPC Link
      loadBalancerName: `ordernimbus-${props.environment}-nlb`,
    });

    // Create NLB Target Group pointing to ECS tasks directly
    const nlbTargetGroup = new elbv2.NetworkTargetGroup(this, 'NLBTargetGroup', {
      vpc: props.vpc,
      port: 3000,
      protocol: elbv2.Protocol.TCP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        enabled: true,
        protocol: elbv2.Protocol.HTTP,
        path: '/api/v1/health',
        interval: cdk.Duration.seconds(30),
        port: '3000',
        timeout: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10,
      },
    });

    // Create NLB Listener
    this.networkLoadBalancer.addListener('NLBListener', {
      port: 80,
      protocol: elbv2.Protocol.TCP,
      defaultAction: elbv2.NetworkListenerAction.forward([nlbTargetGroup]),
    });

    // Attach ECS service to NLB target group as well
    this.ecsService.attachToNetworkTargetGroup(nlbTargetGroup);

    // Auto Scaling Configuration
    const scalableTarget = this.ecsService.autoScaleTaskCount({
      minCapacity: props.environment === 'production' ? 3 : 1,
      maxCapacity: props.environment === 'production' ? 50 : 10,
    });

    // CPU-based auto scaling
    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
    });

    // Memory-based auto scaling
    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
    });

    // Request count-based auto scaling
    scalableTarget.scaleOnRequestCount('RequestCountScaling', {
      requestsPerTarget: 1000,
      targetGroup: targetGroup,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
    });

    // CloudWatch Alarms for monitoring
    const highCpuAlarm = new cloudwatch.Alarm(this, 'HighCpuAlarm', {
      metric: this.ecsService.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'High CPU utilization in ECS service',
    });

    const highMemoryAlarm = new cloudwatch.Alarm(this, 'HighMemoryAlarm', {
      metric: this.ecsService.metricMemoryUtilization(),
      threshold: 85,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'High memory utilization in ECS service',
    });

    // Service Connect for service discovery (optional)
    if (props.environment === 'production') {
      // Enable service connect for better service-to-service communication
      // This would be configured based on specific requirements
    }

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
      exportName: `${props.environment}-alb-dns`,
    });

    new cdk.CfnOutput(this, 'ECSServiceName', {
      value: this.ecsService.serviceName,
      description: 'ECS Service Name',
      exportName: `${props.environment}-ecs-service-name`,
    });

    new cdk.CfnOutput(this, 'ECSServiceArn', {
      value: this.ecsService.serviceArn,
      description: 'ECS Service ARN',
      exportName: `${props.environment}-ecs-service-arn`,
    });
  }
}