/**
 * Data Ingestion Lambda Function
 * Processes and validates incoming data from CSV uploads or API calls
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

/**
 * Main handler for data ingestion
 * Supports multiple data types: sales, inventory, stores, products
 */
exports.handler = async (event) => {
    console.log('Data ingestion request:', JSON.stringify(event));
    
    try {
        const { dataType, source, data, userId, metadata } = parseEvent(event);
        
        // Validate input
        if (!dataType || !data || !userId) {
            return errorResponse(400, 'Missing required fields: dataType, data, userId');
        }
        
        // Process based on data type
        let result;
        switch (dataType) {
            case 'sales':
                result = await processSalesData(data, userId, metadata);
                break;
            case 'inventory':
                result = await processInventoryData(data, userId, metadata);
                break;
            case 'stores':
                result = await processStoreData(data, userId, metadata);
                break;
            case 'products':
                result = await processProductData(data, userId, metadata);
                break;
            case 'csv':
                result = await processCSVUpload(data, userId, metadata);
                break;
            default:
                return errorResponse(400, `Unknown data type: ${dataType}`);
        }
        
        return successResponse(result);
    } catch (error) {
        console.error('Error processing data:', error);
        return errorResponse(500, 'Failed to process data', error.message);
    }
};

/**
 * Parse event from different sources (API Gateway, S3, Direct)
 */
function parseEvent(event) {
    // Handle S3 trigger
    if (event.Records && event.Records[0].s3) {
        const s3Record = event.Records[0].s3;
        return {
            dataType: 'csv',
            source: 's3',
            data: {
                bucket: s3Record.bucket.name,
                key: s3Record.object.key
            },
            userId: extractUserIdFromS3Key(s3Record.object.key),
            metadata: {
                size: s3Record.object.size,
                uploadTime: event.Records[0].eventTime
            }
        };
    }
    
    // Handle API Gateway
    let body = event.body;
    if (typeof body === 'string') {
        body = JSON.parse(body);
    }
    
    return {
        dataType: body?.dataType || event.dataType,
        source: 'api',
        data: body?.data || event.data,
        userId: body?.userId || event.userId,
        metadata: body?.metadata || event.metadata || {}
    };
}

/**
 * Process sales data
 */
async function processSalesData(data, userId, metadata) {
    console.log(`Processing ${data.length} sales records for user ${userId}`);
    
    const tableName = process.env.SALES_TABLE || 'ordernimbus-sales';
    const processedRecords = [];
    const errors = [];
    
    for (const record of data) {
        try {
            // Validate sales record
            const validatedRecord = validateSalesRecord(record);
            
            // Add metadata
            const enrichedRecord = {
                ...validatedRecord,
                userId,
                id: `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                uploadedAt: new Date().toISOString(),
                source: metadata.source || 'manual',
                ...enrichMetadata(metadata)
            };
            
            // Store in DynamoDB
            await dynamodb.put({
                TableName: tableName,
                Item: enrichedRecord
            }).promise();
            
            processedRecords.push(enrichedRecord);
        } catch (error) {
            console.error('Error processing sales record:', error);
            errors.push({
                record,
                error: error.message
            });
        }
    }
    
    // Update aggregates
    await updateSalesAggregates(userId, processedRecords);
    
    return {
        processed: processedRecords.length,
        failed: errors.length,
        errors: errors.slice(0, 10), // Return first 10 errors
        summary: calculateSummary(processedRecords)
    };
}

/**
 * Process inventory data
 */
async function processInventoryData(data, userId, metadata) {
    console.log(`Processing ${data.length} inventory records for user ${userId}`);
    
    const tableName = process.env.INVENTORY_TABLE || 'ordernimbus-inventory';
    const processedRecords = [];
    
    for (const record of data) {
        const enrichedRecord = {
            ...validateInventoryRecord(record),
            userId,
            id: `${userId}_${record.sku}_${record.storeId || 'main'}`,
            updatedAt: new Date().toISOString(),
            ...enrichMetadata(metadata)
        };
        
        // Upsert inventory (update if exists)
        await dynamodb.put({
            TableName: tableName,
            Item: enrichedRecord
        }).promise();
        
        processedRecords.push(enrichedRecord);
    }
    
    return {
        processed: processedRecords.length,
        records: processedRecords
    };
}

/**
 * Process store data
 */
async function processStoreData(data, userId, metadata) {
    console.log(`Processing ${data.length} store records for user ${userId}`);
    
    const tableName = process.env.STORES_TABLE || 'ordernimbus-stores';
    const processedStores = [];
    
    for (const store of data) {
        const enrichedStore = {
            ...validateStoreRecord(store),
            userId,
            id: store.id || `${userId}_store_${Date.now()}`,
            createdAt: new Date().toISOString(),
            status: 'active'
        };
        
        await dynamodb.put({
            TableName: tableName,
            Item: enrichedStore
        }).promise();
        
        processedStores.push(enrichedStore);
    }
    
    return {
        processed: processedStores.length,
        stores: processedStores
    };
}

/**
 * Process product data
 */
async function processProductData(data, userId, metadata) {
    console.log(`Processing ${data.length} product records for user ${userId}`);
    
    const tableName = process.env.PRODUCTS_TABLE || 'ordernimbus-products';
    const processedProducts = [];
    
    for (const product of data) {
        const enrichedProduct = {
            ...validateProductRecord(product),
            userId,
            id: product.sku || `${userId}_prod_${Date.now()}`,
            updatedAt: new Date().toISOString()
        };
        
        await dynamodb.put({
            TableName: tableName,
            Item: enrichedProduct
        }).promise();
        
        processedProducts.push(enrichedProduct);
    }
    
    return {
        processed: processedProducts.length,
        products: processedProducts
    };
}

/**
 * Process CSV upload from S3
 */
async function processCSVUpload(data, userId, metadata) {
    console.log(`Processing CSV from S3: ${data.bucket}/${data.key}`);
    
    // Get file from S3
    const s3Object = await s3.getObject({
        Bucket: data.bucket,
        Key: data.key
    }).promise();
    
    const csvContent = s3Object.Body.toString('utf-8');
    const parsedData = parseCSV(csvContent);
    
    // Detect data type from CSV headers or file name
    const dataType = detectDataType(data.key, parsedData.headers);
    
    // Process based on detected type
    switch (dataType) {
        case 'sales':
            return await processSalesData(parsedData.rows, userId, metadata);
        case 'inventory':
            return await processInventoryData(parsedData.rows, userId, metadata);
        case 'products':
            return await processProductData(parsedData.rows, userId, metadata);
        default:
            throw new Error(`Could not detect data type for file: ${data.key}`);
    }
}

/**
 * Validate sales record
 */
function validateSalesRecord(record) {
    const validated = {
        date: record.date || new Date().toISOString().split('T')[0],
        storeId: record.storeId || record.store || 'main',
        sku: record.sku || record.productId || 'unknown',
        productName: record.productName || record.product || '',
        quantity: parseInt(record.quantity || 0),
        unitPrice: parseFloat(record.unitPrice || record.price || 0),
        revenue: parseFloat(record.revenue || 0),
        cost: parseFloat(record.cost || 0),
        profit: 0,
        category: record.category || 'uncategorized',
        customer: record.customer || 'anonymous'
    };
    
    // Calculate profit if not provided
    if (!validated.profit) {
        validated.profit = validated.revenue - validated.cost;
    }
    
    // Calculate revenue if not provided
    if (!validated.revenue && validated.quantity && validated.unitPrice) {
        validated.revenue = validated.quantity * validated.unitPrice;
    }
    
    return validated;
}

/**
 * Validate inventory record
 */
function validateInventoryRecord(record) {
    return {
        sku: record.sku || record.productId,
        storeId: record.storeId || record.store || 'main',
        productName: record.productName || record.product || '',
        quantity: parseInt(record.quantity || 0),
        availableQuantity: parseInt(record.availableQuantity || record.quantity || 0),
        reservedQuantity: parseInt(record.reservedQuantity || 0),
        reorderPoint: parseInt(record.reorderPoint || 10),
        reorderQuantity: parseInt(record.reorderQuantity || 50),
        unitCost: parseFloat(record.unitCost || record.cost || 0),
        location: record.location || '',
        category: record.category || 'uncategorized'
    };
}

/**
 * Validate store record
 */
function validateStoreRecord(record) {
    return {
        name: record.name || 'Unnamed Store',
        type: record.type || 'physical',
        address: record.address || '',
        city: record.city || '',
        state: record.state || '',
        zip: record.zip || '',
        country: record.country || 'US',
        phone: record.phone || '',
        email: record.email || '',
        manager: record.manager || '',
        timezone: record.timezone || 'America/New_York',
        currency: record.currency || 'USD',
        isActive: record.isActive !== false
    };
}

/**
 * Validate product record
 */
function validateProductRecord(record) {
    return {
        sku: record.sku || record.id,
        name: record.name || 'Unnamed Product',
        description: record.description || '',
        category: record.category || 'uncategorized',
        subcategory: record.subcategory || '',
        brand: record.brand || '',
        supplier: record.supplier || '',
        unitCost: parseFloat(record.unitCost || record.cost || 0),
        retailPrice: parseFloat(record.retailPrice || record.price || 0),
        weight: parseFloat(record.weight || 0),
        dimensions: record.dimensions || '',
        barcode: record.barcode || '',
        isActive: record.isActive !== false
    };
}

/**
 * Update sales aggregates for faster queries
 */
async function updateSalesAggregates(userId, records) {
    const tableName = process.env.AGGREGATES_TABLE || 'ordernimbus-aggregates';
    
    // Calculate daily aggregates
    const dailyAggregates = {};
    
    records.forEach(record => {
        const date = record.date;
        if (!dailyAggregates[date]) {
            dailyAggregates[date] = {
                userId,
                date,
                type: 'daily',
                revenue: 0,
                orders: 0,
                units: 0,
                profit: 0
            };
        }
        
        dailyAggregates[date].revenue += record.revenue;
        dailyAggregates[date].orders += 1;
        dailyAggregates[date].units += record.quantity;
        dailyAggregates[date].profit += record.profit;
    });
    
    // Store aggregates
    for (const aggregate of Object.values(dailyAggregates)) {
        await dynamodb.put({
            TableName: tableName,
            Item: {
                ...aggregate,
                id: `${userId}_daily_${aggregate.date}`,
                updatedAt: new Date().toISOString()
            }
        }).promise();
    }
}

/**
 * Parse CSV content
 */
function parseCSV(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        
        headers.forEach((header, index) => {
            row[header] = values[index]?.trim() || '';
        });
        
        rows.push(row);
    }
    
    return { headers, rows };
}

/**
 * Detect data type from file name or headers
 */
function detectDataType(fileName, headers) {
    const lowerFileName = fileName.toLowerCase();
    
    // Check file name
    if (lowerFileName.includes('sales')) return 'sales';
    if (lowerFileName.includes('inventory')) return 'inventory';
    if (lowerFileName.includes('product')) return 'products';
    if (lowerFileName.includes('store')) return 'stores';
    
    // Check headers
    const headerString = headers.join(' ');
    if (headerString.includes('revenue') || headerString.includes('quantity')) return 'sales';
    if (headerString.includes('stock') || headerString.includes('available')) return 'inventory';
    if (headerString.includes('sku') && headerString.includes('price')) return 'products';
    
    return 'unknown';
}

/**
 * Extract user ID from S3 key
 */
function extractUserIdFromS3Key(key) {
    // Expected format: uploads/{userId}/{timestamp}/{filename}
    const parts = key.split('/');
    return parts[1] || 'unknown';
}

/**
 * Enrich metadata
 */
function enrichMetadata(metadata) {
    return {
        uploadSource: metadata.source || 'api',
        uploadTime: metadata.uploadTime || new Date().toISOString(),
        fileSize: metadata.size || 0,
        fileName: metadata.fileName || '',
        ipAddress: metadata.ipAddress || '',
        userAgent: metadata.userAgent || ''
    };
}

/**
 * Calculate summary statistics
 */
function calculateSummary(records) {
    if (!records || records.length === 0) {
        return {
            totalRevenue: 0,
            totalOrders: 0,
            totalUnits: 0,
            averageOrderValue: 0
        };
    }
    
    const totalRevenue = records.reduce((sum, r) => sum + (r.revenue || 0), 0);
    const totalOrders = records.length;
    const totalUnits = records.reduce((sum, r) => sum + (r.quantity || 0), 0);
    
    return {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders,
        totalUnits,
        averageOrderValue: Math.round((totalRevenue / totalOrders) * 100) / 100
    };
}

/**
 * Success response helper
 */
function successResponse(data) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            data,
            timestamp: new Date().toISOString()
        })
    };
}

/**
 * Error response helper
 */
function errorResponse(statusCode, message, details) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: false,
            error: message,
            details,
            timestamp: new Date().toISOString()
        })
    };
}

module.exports = {
    handler: exports.handler,
    processSalesData,
    processInventoryData,
    processStoreData,
    processProductData
};