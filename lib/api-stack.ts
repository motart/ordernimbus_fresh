import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  ecsService: ecs.FargateService;
  networkLoadBalancer: elbv2.NetworkLoadBalancer;
  userPool: cognito.UserPool;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Create API Gateway
    this.api = new apigateway.RestApi(this, 'ForecastingAPI', {
      restApiName: `ordernimbus-${props.environment}-api`,
      description: `Sales Forecasting API for ${props.environment} environment`,
      
      // Enable CORS
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Tenant-ID',
        ],
        allowCredentials: true,
      },
      
      // API Gateway configuration
      cloudWatchRole: true,
      deployOptions: {
        stageName: props.environment,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: props.environment !== 'production',
        metricsEnabled: true,
      },
      
      // Enable request/response logging
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.AnyPrincipal()],
            actions: ['execute-api:Invoke'],
            resources: ['*'],
          }),
        ],
      }),
    });

    // Create Cognito Authorizer
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [props.userPool],
      identitySource: 'method.request.header.Authorization',
      authorizerName: `${props.environment}-cognito-authorizer`,
    });

    // Create VPC Link for ECS integration
    const vpcLink = new apigateway.VpcLink(this, 'VpcLink', {
      description: `VPC Link for ${props.environment} ECS service`,
      targets: [props.networkLoadBalancer],
    });

    // Health check endpoint (public)
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', 
      new apigateway.HttpIntegration(`http://${props.networkLoadBalancer.loadBalancerDnsName}/health`, {
        httpMethod: 'GET',
        options: {
          connectionType: apigateway.ConnectionType.VPC_LINK,
          vpcLink: vpcLink,
        },
      }),
      {
        authorizationType: apigateway.AuthorizationType.NONE,
      }
    );

    // API v1 routes
    const v1 = this.api.root.addResource('api').addResource('v1');

    // Tenant-specific routes
    const tenants = v1.addResource('tenants');
    const tenant = tenants.addResource('{tenantId}');

    // Forecasts endpoints
    const forecasts = tenant.addResource('forecasts');
    
    // GET /api/v1/tenants/{tenantId}/forecasts  
    forecasts.addMethod('GET',
      new apigateway.HttpIntegration(`http://${props.networkLoadBalancer.loadBalancerDnsName}/api/v1/tenants/{tenantId}/forecasts`, {
        httpMethod: 'GET',
        options: {
          connectionType: apigateway.ConnectionType.VPC_LINK,
          vpcLink: vpcLink,
          requestParameters: {
            'integration.request.path.tenantId': 'method.request.path.tenantId',
            'integration.request.querystring.limit': 'method.request.querystring.limit',
            'integration.request.querystring.offset': 'method.request.querystring.offset',
          },
        },
      }),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: cognitoAuthorizer,
        requestParameters: {
          'method.request.path.tenantId': true,
          'method.request.querystring.limit': false,
          'method.request.querystring.offset': false,
          'method.request.header.X-Tenant-ID': true,
        },
      }
    );

    // POST /api/v1/tenants/{tenantId}/forecasts
    forecasts.addMethod('POST',
      new apigateway.HttpIntegration(`http://${props.networkLoadBalancer.loadBalancerDnsName}/api/v1/tenants/{tenantId}/forecasts`, {
        httpMethod: 'POST',
        options: {
          connectionType: apigateway.ConnectionType.VPC_LINK,
          vpcLink: vpcLink,
          requestParameters: {
            'integration.request.path.tenantId': 'method.request.path.tenantId',
          },
        },
      }),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: cognitoAuthorizer,
        requestParameters: {
          'method.request.path.tenantId': true,
          'method.request.header.X-Tenant-ID': true,
        },
        requestValidator: new apigateway.RequestValidator(this, 'ForecastRequestValidator', {
          restApi: this.api,
          validateRequestBody: true,
          validateRequestParameters: true,
        }),
      }
    );

    // Individual forecast endpoints
    const forecast = forecasts.addResource('{forecastId}');
    
    // GET /api/v1/tenants/{tenantId}/forecasts/{forecastId}
    forecast.addMethod('GET',
      new apigateway.HttpIntegration(`http://${props.networkLoadBalancer.loadBalancerDnsName}/api/v1/tenants/{tenantId}/forecasts/{forecastId}`, {
        httpMethod: 'GET',
        options: {
          connectionType: apigateway.ConnectionType.VPC_LINK,
          vpcLink: vpcLink,
          requestParameters: {
            'integration.request.path.tenantId': 'method.request.path.tenantId',
            'integration.request.path.forecastId': 'method.request.path.forecastId',
          },
        },
      }),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: cognitoAuthorizer,
        requestParameters: {
          'method.request.path.tenantId': true,
          'method.request.path.forecastId': true,
          'method.request.header.X-Tenant-ID': true,
        },
      }
    );

    // Data upload endpoints
    const data = tenant.addResource('data');
    const upload = data.addResource('upload');
    
    // POST /api/v1/tenants/{tenantId}/data/upload
    upload.addMethod('POST',
      new apigateway.HttpIntegration(`http://${props.networkLoadBalancer.loadBalancerDnsName}/api/v1/tenants/{tenantId}/data/upload`, {
        httpMethod: 'POST',
        options: {
          connectionType: apigateway.ConnectionType.VPC_LINK,
          vpcLink: vpcLink,
          requestParameters: {
            'integration.request.path.tenantId': 'method.request.path.tenantId',
          },
        },
      }),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: cognitoAuthorizer,
        requestParameters: {
          'method.request.path.tenantId': true,
          'method.request.header.X-Tenant-ID': true,
        },
      }
    );

    // Integration endpoints
    const integrations = tenant.addResource('integrations');
    const shopify = integrations.addResource('shopify');
    
    // POST /api/v1/tenants/{tenantId}/integrations/shopify
    shopify.addMethod('POST',
      new apigateway.HttpIntegration(`http://${props.networkLoadBalancer.loadBalancerDnsName}/api/v1/tenants/{tenantId}/integrations/shopify`, {
        httpMethod: 'POST',
        options: {
          connectionType: apigateway.ConnectionType.VPC_LINK,
          vpcLink: vpcLink,
          requestParameters: {
            'integration.request.path.tenantId': 'method.request.path.tenantId',
          },
        },
      }),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: cognitoAuthorizer,
        requestParameters: {
          'method.request.path.tenantId': true,
          'method.request.header.X-Tenant-ID': true,
        },
      }
    );

    // Create usage plan for rate limiting
    const usagePlan = this.api.addUsagePlan('UsagePlan', {
      name: `${props.environment}-usage-plan`,
      description: `Usage plan for ${props.environment} environment`,
      throttle: {
        rateLimit: props.environment === 'production' ? 10000 : 1000,
        burstLimit: props.environment === 'production' ? 5000 : 500,
      },
      quota: {
        limit: props.environment === 'production' ? 1000000 : 100000,
        period: apigateway.Period.MONTH,
      },
    });

    // Add deployment stage to usage plan
    usagePlan.addApiStage({
      stage: this.api.deploymentStage,
    });

    this.apiUrl = this.api.url;

    // Outputs
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: `${props.environment}-api-url`,
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: this.api.restApiId,
      description: 'API Gateway ID',
      exportName: `${props.environment}-api-id`,
    });
  }
}