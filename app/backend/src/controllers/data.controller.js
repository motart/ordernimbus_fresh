const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { dynamoDb } = require('../config/database');
const { PutCommand, QueryCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const uploadData = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { dataType, format, data } = req.body;

  // Verify tenant access
  if (req.user.tenantId !== tenantId) {
    throw ApiError.forbidden('Access denied to this tenant');
  }

  const uploadId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // Process and validate data based on type
  let processedRecords = [];
  
  if (dataType === 'sales') {
    processedRecords = processSalesData(data, tenantId);
  } else if (dataType === 'inventory') {
    processedRecords = processInventoryData(data, tenantId);
  } else if (dataType === 'products') {
    processedRecords = processProductsData(data, tenantId);
  } else if (dataType === 'customers') {
    processedRecords = processCustomersData(data, tenantId);
  }

  // Store upload metadata
  const uploadMetadata = {
    uploadId,
    tenantId,
    dataType,
    format: format || 'json',
    recordCount: processedRecords.length,
    status: 'processing',
    uploadedBy: req.user.id,
    uploadedAt: timestamp
  };

  const putCommand = new PutCommand({
    TableName: process.env.UPLOADS_TABLE || 'ordernimbus-uploads',
    Item: uploadMetadata
  });

  await dynamoDb.send(putCommand);

  // Batch write data records
  if (processedRecords.length > 0) {
    const chunks = chunkArray(processedRecords, 25); // DynamoDB batch write limit
    
    for (const chunk of chunks) {
      const batchCommand = new BatchWriteCommand({
        RequestItems: {
          [process.env.DATA_TABLE || 'ordernimbus-data']: chunk.map(record => ({
            PutRequest: { Item: record }
          }))
        }
      });

      await dynamoDb.send(batchCommand);
    }
  }

  res.status(201).json({
    success: true,
    message: `Successfully uploaded ${processedRecords.length} ${dataType} records`,
    data: {
      uploadId,
      recordsProcessed: processedRecords.length,
      dataType,
      status: 'completed'
    }
  });
});

const bulkUpload = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { records } = req.body;

  // Verify tenant access
  if (req.user.tenantId !== tenantId) {
    throw ApiError.forbidden('Access denied to this tenant');
  }

  const uploadId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // Process records
  const processedRecords = records.map(record => ({
    recordId: crypto.randomUUID(),
    tenantId,
    ...record,
    uploadId,
    createdAt: timestamp
  }));

  // Batch write records
  const chunks = chunkArray(processedRecords, 25);
  let successCount = 0;

  for (const chunk of chunks) {
    try {
      const batchCommand = new BatchWriteCommand({
        RequestItems: {
          [process.env.DATA_TABLE || 'ordernimbus-data']: chunk.map(record => ({
            PutRequest: { Item: record }
          }))
        }
      });

      await dynamoDb.send(batchCommand);
      successCount += chunk.length;
    } catch (error) {
      console.error('Batch write error:', error);
    }
  }

  res.status(201).json({
    success: true,
    message: `Successfully uploaded ${successCount} records`,
    data: {
      uploadId,
      totalRecords: records.length,
      successfulRecords: successCount,
      failedRecords: records.length - successCount
    }
  });
});

const getData = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { dataType, startDate, endDate, limit = 100, offset = 0 } = req.query;

  // Verify tenant access
  if (req.user.tenantId !== tenantId) {
    throw ApiError.forbidden('Access denied to this tenant');
  }

  let filterExpression = '';
  const expressionAttributeValues = {
    ':tenantId': tenantId
  };
  const expressionAttributeNames = {};

  if (dataType) {
    filterExpression += '#dataType = :dataType';
    expressionAttributeValues[':dataType'] = dataType;
    expressionAttributeNames['#dataType'] = 'dataType';
  }

  if (startDate) {
    filterExpression += (filterExpression ? ' AND ' : '') + '#date >= :startDate';
    expressionAttributeValues[':startDate'] = startDate;
    expressionAttributeNames['#date'] = 'date';
  }

  if (endDate) {
    filterExpression += (filterExpression ? ' AND ' : '') + '#date <= :endDate';
    expressionAttributeValues[':endDate'] = endDate;
    if (!expressionAttributeNames['#date']) {
      expressionAttributeNames['#date'] = 'date';
    }
  }

  const queryCommand = new QueryCommand({
    TableName: process.env.DATA_TABLE || 'ordernimbus-data',
    KeyConditionExpression: 'tenantId = :tenantId',
    FilterExpression: filterExpression || undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
    Limit: limit,
    ExclusiveStartKey: offset > 0 ? { tenantId, createdAt: new Date(Date.now() - offset * 1000).toISOString() } : undefined
  });

  const { Items: data, LastEvaluatedKey } = await dynamoDb.send(queryCommand);

  res.json({
    success: true,
    data: {
      records: data,
      pagination: {
        limit,
        offset,
        hasMore: !!LastEvaluatedKey,
        total: data.length
      }
    }
  });
});

const deleteData = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { dataType, ids, dateRange } = req.body;

  // Verify tenant access
  if (req.user.tenantId !== tenantId) {
    throw ApiError.forbidden('Access denied to this tenant');
  }

  let deletedCount = 0;

  if (ids && ids.length > 0) {
    // Delete specific records by IDs
    for (const id of ids) {
      try {
        const deleteCommand = new DeleteCommand({
          TableName: process.env.DATA_TABLE || 'ordernimbus-data',
          Key: { recordId: id, tenantId }
        });

        await dynamoDb.send(deleteCommand);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete record ${id}:`, error);
      }
    }
  } else if (dateRange) {
    // Delete records within date range
    const queryCommand = new QueryCommand({
      TableName: process.env.DATA_TABLE || 'ordernimbus-data',
      KeyConditionExpression: 'tenantId = :tenantId',
      FilterExpression: '#date BETWEEN :startDate AND :endDate AND #dataType = :dataType',
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':startDate': dateRange.start,
        ':endDate': dateRange.end,
        ':dataType': dataType
      },
      ExpressionAttributeNames: {
        '#date': 'date',
        '#dataType': 'dataType'
      }
    });

    const { Items: recordsToDelete } = await dynamoDb.send(queryCommand);

    for (const record of recordsToDelete) {
      try {
        const deleteCommand = new DeleteCommand({
          TableName: process.env.DATA_TABLE || 'ordernimbus-data',
          Key: { recordId: record.recordId, tenantId }
        });

        await dynamoDb.send(deleteCommand);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete record ${record.recordId}:`, error);
      }
    }
  }

  res.json({
    success: true,
    message: `Successfully deleted ${deletedCount} records`,
    data: {
      deletedCount,
      dataType
    }
  });
});

// Helper functions
function processSalesData(data, tenantId) {
  if (!Array.isArray(data)) {
    data = [data];
  }

  return data.map(record => ({
    recordId: crypto.randomUUID(),
    tenantId,
    dataType: 'sales',
    date: record.date || new Date().toISOString(),
    productId: record.productId,
    storeId: record.storeId,
    quantity: parseInt(record.quantity) || 0,
    price: parseFloat(record.price) || 0,
    revenue: (parseInt(record.quantity) || 0) * (parseFloat(record.price) || 0),
    customerId: record.customerId,
    createdAt: new Date().toISOString()
  }));
}

function processInventoryData(data, tenantId) {
  if (!Array.isArray(data)) {
    data = [data];
  }

  return data.map(record => ({
    recordId: crypto.randomUUID(),
    tenantId,
    dataType: 'inventory',
    date: record.date || new Date().toISOString(),
    productId: record.productId,
    storeId: record.storeId,
    quantity: parseInt(record.quantity) || 0,
    location: record.location,
    status: record.status || 'available',
    createdAt: new Date().toISOString()
  }));
}

function processProductsData(data, tenantId) {
  if (!Array.isArray(data)) {
    data = [data];
  }

  return data.map(record => ({
    recordId: crypto.randomUUID(),
    tenantId,
    dataType: 'products',
    productId: record.productId || crypto.randomUUID(),
    name: record.name,
    category: record.category,
    price: parseFloat(record.price) || 0,
    cost: parseFloat(record.cost) || 0,
    sku: record.sku,
    description: record.description,
    createdAt: new Date().toISOString()
  }));
}

function processCustomersData(data, tenantId) {
  if (!Array.isArray(data)) {
    data = [data];
  }

  return data.map(record => ({
    recordId: crypto.randomUUID(),
    tenantId,
    dataType: 'customers',
    customerId: record.customerId || crypto.randomUUID(),
    email: record.email,
    name: record.name,
    segment: record.segment,
    lifetime_value: parseFloat(record.lifetime_value) || 0,
    createdAt: new Date().toISOString()
  }));
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

module.exports = {
  uploadData,
  bulkUpload,
  getData,
  deleteData
};