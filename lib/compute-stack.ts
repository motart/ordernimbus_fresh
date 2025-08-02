import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ssm from 'aws-cdk-lib/aws-ssm';
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
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        enabled: true,
        healthyHttpCodes: '200',
        path: '/',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      },
    });

    // Create ALB Listener
    const listener = this.loadBalancer.addListener('Listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // Create ECS Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `ordernimbus-${props.environment}-api`,
      cpu: props.environment === 'production' ? 2048 : 1024,
      memoryLimitMiB: props.environment === 'production' ? 4096 : 2048,
    });

    // Add container to task definition
    const container = taskDefinition.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromRegistry('nginx:latest'), // Nginx placeholder
      containerName: 'api',
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'ordernimbus-api',
        logRetention: props.environment === 'production' ? 90 : 30,
      }),
      environment: {
        NODE_ENV: props.environment,
        DATABASE_HOST: props.database.clusterEndpoint.hostname,
        AWS_REGION: this.region,
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
          ssm.StringParameter.fromStringParameterName(
            this,
            'JwtSecret',
            `/ordernimbus/${props.environment}/auth/jwt-secret`
          )
        ),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Add port mapping
    container.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    // Create ECS Service
    this.ecsService = new ecs.FargateService(this, 'ECSService', {
      cluster: props.cluster,
      taskDefinition,
      serviceName: `ordernimbus-${props.environment}-api`,
      desiredCount: props.environment === 'production' ? 3 : 2,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.ecsSecurityGroup],
      enableExecuteCommand: props.environment !== 'production',
      platformVersion: ecs.FargatePlatformVersion.LATEST,
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
      port: 80,
      protocol: elbv2.Protocol.TCP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        enabled: true,
        protocol: elbv2.Protocol.HTTP,
        path: '/',
        interval: cdk.Duration.seconds(30),
        port: '80',
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