/**
 * AWS Lambda Function for Forecast API
 * 
 * Provides REST API endpoints for sales forecasting:
 * - POST /forecast/generate - Generate new forecasts
 * - GET /forecast/list - List all forecasts for user
 * - GET /forecast/{id} - Get specific forecast
 * - PUT /forecast/{id} - Update forecast parameters
 * - DELETE /forecast/{id} - Delete forecast
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS services
const dynamodb = new AWS.DynamoDB.DocumentClient();
const eventbridge = new AWS.EventBridge();
const bedrock = new AWS.BedrockRuntime({
  region: 'us-west-1'
});

const FORECASTS_TABLE = process.env.FORECASTS_TABLE || 'ordernimbus-forecasts';
const FORECAST_DATA_TABLE = process.env.FORECAST_DATA_TABLE || 'ordernimbus-forecast-data';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Forecast API Event:', JSON.stringify(event, null, 2));

  try {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'OK' })
      };
    }

    // Extract user info from JWT token
    const userInfo = extractUserInfo(event);
    if (!userInfo) {
      return errorResponse(401, 'Unauthorized');
    }

    // Route based on HTTP method and path
    const { httpMethod, path } = event;
    const pathParts = path.split('/').filter(p => p);

    switch (httpMethod) {
      case 'POST':
        if (pathParts[1] === 'generate') {
          return await generateForecast(event, userInfo);
        }
        break;
      
      case 'GET':
        if (pathParts[1] === 'list') {
          return await listForecasts(event, userInfo);
        } else if (pathParts.length === 2) {
          return await getForecast(pathParts[1], userInfo);
        }
        break;
      
      case 'PUT':
        if (pathParts.length === 2) {
          return await updateForecast(pathParts[1], event, userInfo);
        }
        break;
      
      case 'DELETE':
        if (pathParts.length === 2) {
          return await deleteForecast(pathParts[1], userInfo);
        }
        break;
    }

    return errorResponse(404, 'Endpoint not found');

  } catch (error) {
    console.error('Forecast API Error:', error);
    return errorResponse(500, 'Internal server error');
  }
};

/**
 * Generate new forecast
 */
const generateForecast = async (event, userInfo) => {
  const body = JSON.parse(event.body || '{}');
  const {
    storeId,
    skus = [],
    forecastPeriod = 30,
    algorithm = 'arima',
    parameters = {}
  } = body;

  if (!storeId) {
    return errorResponse(400, 'Store ID is required');
  }

  const forecastId = uuidv4();
  const timestamp = new Date().toISOString();

  try {
    // Create forecast record
    const forecast = {
      forecastId,
      userId: userInfo.userId,
      userEmail: userInfo.email,
      storeId,
      skus,
      forecastPeriod,
      algorithm,
      parameters,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
    };

    await dynamodb.put({
      TableName: FORECASTS_TABLE,
      Item: forecast
    }).promise();

    // Schedule forecast generation
    await scheduleGeneration(forecastId, userInfo);

    // Start forecast generation immediately
    const forecastData = await generateForecastData(storeId, skus, forecastPeriod, algorithm, parameters);
    
    // Update forecast with results
    await updateForecastStatus(forecastId, 'completed', forecastData);

    return successResponse({
      forecastId,
      status: 'completed',
      data: forecastData,
      message: 'Forecast generated successfully'
    });

  } catch (error) {
    console.error('Error generating forecast:', error);
    await updateForecastStatus(forecastId, 'failed', { error: error.message });
    return errorResponse(500, 'Failed to generate forecast');
  }
};

/**
 * Generate forecast data using ML algorithms
 */
const generateForecastData = async (storeId, skus, forecastPeriod, algorithm, parameters) => {
  // Mock sophisticated forecasting algorithm
  // In production, this would use AWS Forecast, SageMaker, or custom ML models
  
  const results = [];
  const baseDate = new Date();
  
  // If no SKUs specified, use default set
  const targetSkus = skus.length > 0 ? skus : ['SKU001', 'SKU002', 'SKU003', 'SKU004', 'SKU005'];
  
  for (const sku of targetSkus) {
    const skuResults = [];
    
    for (let day = 1; day <= forecastPeriod; day++) {
      const forecastDate = new Date(baseDate);
      forecastDate.setDate(baseDate.getDate() + day);
      
      // Simulate realistic forecast with trends and seasonality
      const baseValue = 100 + Math.sin(day / 7) * 20; // Weekly seasonality
      const trend = day * 0.5; // Slight upward trend
      const noise = (Math.random() - 0.5) * 10; // Random variation
      
      const demand = Math.max(0, Math.round(baseValue + trend + noise));
      const confidence = 0.75 + (Math.random() * 0.2); // 75-95% confidence
      
      skuResults.push({
        date: forecastDate.toISOString().split('T')[0],
        sku,
        predictedDemand: demand,
        confidence: Math.round(confidence * 100) / 100,
        lowerBound: Math.round(demand * 0.8),
        upperBound: Math.round(demand * 1.2),
        algorithm,
        factors: {
          seasonality: Math.round(Math.sin(day / 7) * 20),
          trend: Math.round(trend),
          baseline: Math.round(baseValue)
        }
      });
    }
    
    results.push({
      sku,
      forecasts: skuResults,
      summary: {
        totalPredictedDemand: skuResults.reduce((sum, f) => sum + f.predictedDemand, 0),
        avgDailyDemand: Math.round(skuResults.reduce((sum, f) => sum + f.predictedDemand, 0) / forecastPeriod),
        avgConfidence: Math.round((skuResults.reduce((sum, f) => sum + f.confidence, 0) / forecastPeriod) * 100) / 100,
        peakDay: skuResults.reduce((max, f) => f.predictedDemand > max.predictedDemand ? f : max, skuResults[0]),
        lowDay: skuResults.reduce((min, f) => f.predictedDemand < min.predictedDemand ? f : min, skuResults[0])
      }
    });
  }

  // Overall summary
  const overallSummary = {
    totalSKUs: results.length,
    forecastPeriod,
    algorithm,
    generatedAt: new Date().toISOString(),
    totalPredictedDemand: results.reduce((sum, r) => sum + r.summary.totalPredictedDemand, 0),
    avgConfidence: Math.round((results.reduce((sum, r) => sum + (r.summary.avgConfidence * r.forecasts.length), 0) / (results.length * forecastPeriod)) * 100) / 100,
    accuracy: {
      historical: 0.94, // Mock historical accuracy
      confidence: 0.88,
      mape: 12.5 // Mean Absolute Percentage Error
    }
  };

  return {
    summary: overallSummary,
    forecasts: results
  };
};

/**
 * List all forecasts for user
 */
const listForecasts = async (event, userInfo) => {
  const queryParams = event.queryStringParameters || {};
  const { storeId, status, limit = 50 } = queryParams;

  try {
    const params = {
      TableName: FORECASTS_TABLE,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userInfo.userId
      },
      Limit: parseInt(limit),
      ScanIndexForward: false // Most recent first
    };

    // Add filters
    if (storeId) {
      params.FilterExpression = 'storeId = :storeId';
      params.ExpressionAttributeValues[':storeId'] = storeId;
    }

    if (status) {
      const filterExpr = params.FilterExpression ? params.FilterExpression + ' AND ' : '';
      params.FilterExpression = filterExpr + '#status = :status';
      params.ExpressionAttributeValues[':status'] = status;
      params.ExpressionAttributeNames = { '#status': 'status' };
    }

    const result = await dynamodb.query(params).promise();

    return successResponse({
      forecasts: result.Items,
      count: result.Items.length,
      lastEvaluatedKey: result.LastEvaluatedKey
    });

  } catch (error) {
    console.error('Error listing forecasts:', error);
    return errorResponse(500, 'Failed to list forecasts');
  }
};

/**
 * Get specific forecast
 */
const getForecast = async (forecastId, userInfo) => {
  try {
    const result = await dynamodb.get({
      TableName: FORECASTS_TABLE,
      Key: { forecastId }
    }).promise();

    if (!result.Item) {
      return errorResponse(404, 'Forecast not found');
    }

    // Verify ownership
    if (result.Item.userId !== userInfo.userId) {
      return errorResponse(403, 'Access denied');
    }

    // Get forecast data if completed
    if (result.Item.status === 'completed') {
      const dataResult = await dynamodb.get({
        TableName: FORECAST_DATA_TABLE,
        Key: { forecastId }
      }).promise();

      if (dataResult.Item) {
        result.Item.data = dataResult.Item.data;
      }
    }

    return successResponse(result.Item);

  } catch (error) {
    console.error('Error getting forecast:', error);
    return errorResponse(500, 'Failed to get forecast');
  }
};

/**
 * Update forecast parameters
 */
const updateForecast = async (forecastId, event, userInfo) => {
  const body = JSON.parse(event.body || '{}');
  const updates = {};
  const expressionAttributeValues = {};
  const expressionAttributeNames = {};

  // Build update expression
  const allowedUpdates = ['parameters', 'algorithm', 'forecastPeriod'];
  const updateExpressions = [];

  for (const field of allowedUpdates) {
    if (body[field] !== undefined) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = body[field];
    }
  }

  if (updateExpressions.length === 0) {
    return errorResponse(400, 'No valid updates provided');
  }

  // Always update timestamp
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();

  try {
    const result = await dynamodb.update({
      TableName: FORECASTS_TABLE,
      Key: { forecastId },
      UpdateExpression: 'SET ' + updateExpressions.join(', '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: 'userId = :userId',
      ReturnValues: 'ALL_NEW'
    }).promise();

    return successResponse(result.Attributes);

  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return errorResponse(404, 'Forecast not found or access denied');
    }
    console.error('Error updating forecast:', error);
    return errorResponse(500, 'Failed to update forecast');
  }
};

/**
 * Delete forecast
 */
const deleteForecast = async (forecastId, userInfo) => {
  try {
    // Delete forecast record
    await dynamodb.delete({
      TableName: FORECASTS_TABLE,
      Key: { forecastId },
      ConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userInfo.userId
      }
    }).promise();

    // Delete forecast data
    await dynamodb.delete({
      TableName: FORECAST_DATA_TABLE,
      Key: { forecastId }
    }).promise();

    return successResponse({ message: 'Forecast deleted successfully' });

  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return errorResponse(404, 'Forecast not found or access denied');
    }
    console.error('Error deleting forecast:', error);
    return errorResponse(500, 'Failed to delete forecast');
  }
};

/**
 * Schedule forecast generation with EventBridge
 */
const scheduleGeneration = async (forecastId, userInfo) => {
  const params = {
    Entries: [{
      Source: 'ordernimbus.forecast',
      DetailType: 'Forecast Generation Scheduled',
      Detail: JSON.stringify({
        forecastId,
        userId: userInfo.userId,
        scheduledAt: new Date().toISOString()
      }),
      Time: new Date()
    }]
  };

  await eventbridge.putEvents(params).promise();
};

/**
 * Update forecast status in database
 */
const updateForecastStatus = async (forecastId, status, data = null) => {
  const updateParams = {
    TableName: FORECASTS_TABLE,
    Key: { forecastId },
    UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': status,
      ':updatedAt': new Date().toISOString()
    }
  };

  await dynamodb.update(updateParams).promise();

  // Store forecast data separately if provided
  if (data && status === 'completed') {
    await dynamodb.put({
      TableName: FORECAST_DATA_TABLE,
      Item: {
        forecastId,
        data,
        createdAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
      }
    }).promise();
  }
};

/**
 * Extract user info from JWT token
 */
const extractUserInfo = (event) => {
  try {
    // In API Gateway with Cognito authorizer, user info is in requestContext
    const claims = event.requestContext?.authorizer?.claims;
    if (claims) {
      return {
        userId: claims.sub,
        email: claims.email
      };
    }

    // Fallback: extract from Authorization header (for testing)
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // In production, verify JWT token here
      return {
        userId: 'test-user',
        email: 'test@example.com'
      };
    }

    return null;
  } catch (error) {
    console.error('Error extracting user info:', error);
    return null;
  }
};

/**
 * Helper functions for responses
 */
const successResponse = (data) => ({
  statusCode: 200,
  headers: corsHeaders,
  body: JSON.stringify(data)
});

const errorResponse = (statusCode, message) => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify({ error: message })
});