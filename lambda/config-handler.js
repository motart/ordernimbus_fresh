/**
 * Configuration Handler
 * Returns dynamic configuration for the frontend application
 */

exports.handler = async (event) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Content-Type': 'application/json'
    };
    
    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }
    
    // Get environment from Lambda environment variables
    const environment = process.env.ENVIRONMENT || 'production';
    const region = process.env.AWS_REGION || 'us-west-1';
    const apiGatewayId = process.env.API_GATEWAY_ID || '';
    const userPoolId = process.env.USER_POOL_ID || '';
    const clientId = process.env.CLIENT_ID || '';
    
    // Build API URL from API Gateway ID
    const apiUrl = apiGatewayId 
        ? `https://${apiGatewayId}.execute-api.${region}.amazonaws.com/${environment}`
        : process.env.API_URL || '';
    
    const config = {
        // API URLs
        apiUrl: apiUrl,
        wsUrl: apiUrl.replace('https://', 'wss://') + '/ws',
        graphqlUrl: apiUrl + '/graphql',
        
        // AWS Cognito
        userPoolId: userPoolId,
        clientId: clientId,
        region: region,
        
        // Environment
        environment: environment,
        version: process.env.VERSION || '1.0.0',
        
        // Features
        features: {
            enableDebug: environment === 'development',
            enableAnalytics: environment === 'production',
            enableMockData: false,
            shopifyIntegration: true,
            csvUpload: true,
            multiTenant: true
        },
        
        // Additional settings
        maxFileUploadSize: 52428800, // 50MB
        supportedFileTypes: ['.csv', '.xlsx', '.xls'],
        sessionTimeout: 3600000, // 1 hour
        buildTime: process.env.BUILD_TIME || new Date().toISOString(),
        deploymentId: process.env.DEPLOYMENT_ID || `${environment}-${Date.now()}`
    };
    
    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(config)
    };
};