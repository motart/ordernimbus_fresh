const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { dynamoDb } = require('../config/database');
const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const createForecast = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { productId, storeId, forecastPeriod, algorithm, granularity } = req.body;

  // Verify tenant access
  if (req.user.tenantId !== tenantId) {
    throw ApiError.forbidden('Access denied to this tenant');
  }

  const forecastId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const forecast = {
    forecastId,
    tenantId,
    productId,
    storeId,
    forecastPeriod,
    algorithm: algorithm || 'ensemble',
    granularity: granularity || 'daily',
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: req.user.id,
    requestedAt: timestamp
  };

  // Store forecast request
  const putCommand = new PutCommand({
    TableName: process.env.FORECASTS_TABLE || 'ordernimbus-forecasts',
    Item: forecast
  });

  await dynamoDb.send(putCommand);

  // In production, trigger ML pipeline here
  // For now, simulate processing
  setTimeout(async () => {
    const updateCommand = new UpdateCommand({
      TableName: process.env.FORECASTS_TABLE || 'ordernimbus-forecasts',
      Key: { forecastId, tenantId },
      UpdateExpression: 'SET #status = :status, updatedAt = :now, results = :results',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'completed',
        ':now': new Date().toISOString(),
        ':results': generateMockForecastResults(forecastPeriod)
      }
    });

    await dynamoDb.send(updateCommand);
  }, 5000);

  res.status(201).json({
    success: true,
    message: 'Forecast request created successfully',
    data: forecast
  });
});

const getForecast = asyncHandler(async (req, res) => {
  const { tenantId, forecastId } = req.params;

  // Verify tenant access
  if (req.user.tenantId !== tenantId) {
    throw ApiError.forbidden('Access denied to this tenant');
  }

  const getCommand = new GetCommand({
    TableName: process.env.FORECASTS_TABLE || 'ordernimbus-forecasts',
    Key: { forecastId, tenantId }
  });

  const { Item: forecast } = await dynamoDb.send(getCommand);

  if (!forecast) {
    throw ApiError.notFound('Forecast not found');
  }

  res.json({
    success: true,
    data: forecast
  });
});

const listForecasts = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { limit = 20, offset = 0, startDate, endDate, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  // Verify tenant access
  if (req.user.tenantId !== tenantId) {
    throw ApiError.forbidden('Access denied to this tenant');
  }

  let filterExpression = 'tenantId = :tenantId';
  const expressionAttributeValues = {
    ':tenantId': tenantId
  };

  if (status) {
    filterExpression += ' AND #status = :status';
    expressionAttributeValues[':status'] = status;
  }

  if (startDate) {
    filterExpression += ' AND createdAt >= :startDate';
    expressionAttributeValues[':startDate'] = startDate;
  }

  if (endDate) {
    filterExpression += ' AND createdAt <= :endDate';
    expressionAttributeValues[':endDate'] = endDate;
  }

  const queryCommand = new QueryCommand({
    TableName: process.env.FORECASTS_TABLE || 'ordernimbus-forecasts',
    KeyConditionExpression: 'tenantId = :tenantId',
    FilterExpression: status ? filterExpression : undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: status ? { '#status': 'status' } : undefined,
    Limit: limit,
    ExclusiveStartKey: offset > 0 ? { tenantId, createdAt: new Date(Date.now() - offset * 1000).toISOString() } : undefined,
    ScanIndexForward: sortOrder === 'asc'
  });

  const { Items: forecasts, LastEvaluatedKey } = await dynamoDb.send(queryCommand);

  res.json({
    success: true,
    data: {
      forecasts,
      pagination: {
        limit,
        offset,
        hasMore: !!LastEvaluatedKey,
        total: forecasts.length
      }
    }
  });
});

const updateForecast = asyncHandler(async (req, res) => {
  const { tenantId, forecastId } = req.params;
  const { status, notes } = req.body;

  // Verify tenant access
  if (req.user.tenantId !== tenantId) {
    throw ApiError.forbidden('Access denied to this tenant');
  }

  let updateExpression = 'SET updatedAt = :now';
  const expressionAttributeValues = {
    ':now': new Date().toISOString()
  };

  if (status) {
    updateExpression += ', #status = :status';
    expressionAttributeValues[':status'] = status;
  }

  if (notes) {
    updateExpression += ', notes = :notes';
    expressionAttributeValues[':notes'] = notes;
  }

  const updateCommand = new UpdateCommand({
    TableName: process.env.FORECASTS_TABLE || 'ordernimbus-forecasts',
    Key: { forecastId, tenantId },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: status ? { '#status': 'status' } : undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  });

  const { Attributes: updatedForecast } = await dynamoDb.send(updateCommand);

  res.json({
    success: true,
    message: 'Forecast updated successfully',
    data: updatedForecast
  });
});

const deleteForecast = asyncHandler(async (req, res) => {
  const { tenantId, forecastId } = req.params;

  // Verify tenant access
  if (req.user.tenantId !== tenantId) {
    throw ApiError.forbidden('Access denied to this tenant');
  }

  const deleteCommand = new DeleteCommand({
    TableName: process.env.FORECASTS_TABLE || 'ordernimbus-forecasts',
    Key: { forecastId, tenantId },
    ConditionExpression: 'attribute_exists(forecastId)'
  });

  try {
    await dynamoDb.send(deleteCommand);
    res.json({
      success: true,
      message: 'Forecast deleted successfully'
    });
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw ApiError.notFound('Forecast not found');
    }
    throw error;
  }
});

// Helper function to generate mock forecast results
function generateMockForecastResults(period) {
  const results = [];
  const baseValue = 10000;
  
  for (let i = 0; i < period; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    
    results.push({
      date: date.toISOString().split('T')[0],
      predicted: baseValue + Math.random() * 5000,
      lowerBound: baseValue - 1000 + Math.random() * 500,
      upperBound: baseValue + 5000 + Math.random() * 1000,
      confidence: 0.85 + Math.random() * 0.1
    });
  }
  
  return {
    predictions: results,
    metrics: {
      mape: (Math.random() * 10).toFixed(2),
      rmse: (Math.random() * 1000).toFixed(2),
      mae: (Math.random() * 500).toFixed(2),
      r2: (0.8 + Math.random() * 0.15).toFixed(3)
    },
    metadata: {
      algorithm: 'ensemble',
      trainingDataPoints: Math.floor(Math.random() * 10000) + 5000,
      processingTime: (Math.random() * 60).toFixed(2) + 's'
    }
  };
}

module.exports = {
  createForecast,
  getForecast,
  listForecasts,
  updateForecast,
  deleteForecast
};