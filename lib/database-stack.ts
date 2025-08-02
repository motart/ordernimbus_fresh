import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
}

export class DatabaseStack extends cdk.Stack {
  public readonly database: rds.DatabaseCluster;
  // public readonly databaseProxy: rds.DatabaseProxy;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Get database configuration from Parameter Store
    const dbUsername = ssm.StringParameter.valueForStringParameter(
      this,
      `/ordernimbus/${props.environment}/database/master-username`
    );

    const dbName = ssm.StringParameter.valueForStringParameter(
      this,
      `/ordernimbus/${props.environment}/database/name`
    );

    // Create Aurora Serverless v2 cluster with auto-generated secret
    this.database = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      clusterIdentifier: `ordernimbus-${props.environment}-db-cluster`,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [props.securityGroup],
      credentials: rds.Credentials.fromGeneratedSecret(dbUsername, {
        secretName: `ordernimbus-${props.environment}-db-credentials`,
      }),
      defaultDatabaseName: dbName,
      
      // Use Aurora Serverless v2 writer
      writer: rds.ClusterInstance.serverlessV2('writer', {
        scaleWithWriter: true,
      }),
      
      // Serverless v2 scaling configuration
      serverlessV2MinCapacity: props.environment === 'production' ? 2 : 0.5,
      serverlessV2MaxCapacity: props.environment === 'production' ? 128 : 16,
      
      // Multi-AZ for production
      subnetGroup: new rds.SubnetGroup(this, 'DBSubnetGroup', {
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        description: `Database subnet group for ${props.environment}`,
      }),
      
      // Backup configuration
      backup: {
        retention: props.environment === 'production' 
          ? cdk.Duration.days(30) 
          : cdk.Duration.days(7),
        preferredWindow: '03:00-04:00',
      },
      
      // Monitoring
      monitoringInterval: cdk.Duration.seconds(60),
      enablePerformanceInsights: true,
      performanceInsightRetention: props.environment === 'production'
        ? rds.PerformanceInsightRetention.LONG_TERM
        : rds.PerformanceInsightRetention.DEFAULT,
      
      // Encryption
      storageEncrypted: true,
      
      // Deletion protection for production
      deletionProtection: props.environment === 'production',
      
      removalPolicy: props.environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // RDS Proxy temporarily commented out to avoid circular dependencies
    // This can be added in a separate stack or after refactoring dependencies
    // this.databaseProxy = new rds.DatabaseProxy(this, 'DatabaseProxy', {
    //   proxyTarget: rds.ProxyTarget.fromCluster(this.database),
    //   secrets: [this.database.secret!],
    //   vpc: props.vpc,
    //   vpcSubnets: {
    //     subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    //   },
    //   securityGroups: [props.securityGroup],
    //   maxConnectionsPercent: 100,
    //   maxIdleConnectionsPercent: 50,
    //   requireTLS: true,
    //   sessionPinningFilters: [rds.SessionPinningFilter.EXCLUDE_VARIABLE_SETS],
    //   borrowTimeout: cdk.Duration.seconds(120),
    //   initQuery: 'SET timezone="UTC"',
    // });

    // Create read replica for production
    if (props.environment === 'production') {
      const readReplica = new rds.DatabaseCluster(this, 'ReadReplica', {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_15_4,
        }),
        clusterIdentifier: `ordernimbus-${props.environment}-db-read-replica`,
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [props.securityGroup],
        
        // Read replica configuration
        writer: rds.ClusterInstance.serverlessV2('reader-writer', {
          scaleWithWriter: true,
        }),
        readers: [
          rds.ClusterInstance.serverlessV2('reader-1', {
            scaleWithWriter: false,
          }),
        ],
        
        credentials: rds.Credentials.fromGeneratedSecret(dbUsername, {
          secretName: `ordernimbus-${props.environment}-db-read-replica-credentials`,
        }),
        
        serverlessV2MinCapacity: 1,
        serverlessV2MaxCapacity: 64,
        
        storageEncrypted: true,
        enablePerformanceInsights: true,
        
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      new cdk.CfnOutput(this, 'ReadReplicaEndpoint', {
        value: readReplica.clusterEndpoint.hostname,
        description: 'Aurora Read Replica Endpoint',
        exportName: `${props.environment}-db-read-replica-endpoint`,
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.clusterEndpoint.hostname,
      description: 'Aurora Cluster Endpoint',
      exportName: `${props.environment}-db-endpoint`,
    });

    // new cdk.CfnOutput(this, 'DatabaseProxyEndpoint', {
    //   value: this.databaseProxy.endpoint,
    //   description: 'RDS Proxy Endpoint',
    //   exportName: `${props.environment}-db-proxy-endpoint`,
    // });

    new cdk.CfnOutput(this, 'DatabaseName', {
      value: dbName,
      description: 'Database Name',
      exportName: `${props.environment}-db-name`,
    });
  }
}