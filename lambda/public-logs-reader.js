/**
 * Public Logs Reader Lambda Function
 * Provides read-only access to system logs without authentication
 * For monitoring and debugging purposes
 */

const AWS = require('aws-sdk');
const cloudWatchLogs = new AWS.CloudWatchLogs();

// Map of Lambda function names to log group names
const LOG_GROUPS = {
  'store-management': '/aws/lambda/ordernimbus-production-store-management',
  'shopify-integration': '/aws/lambda/ordernimbus-production-shopify-integration',
  'jwt-authorizer': '/aws/lambda/ordernimbus-production-jwt-authorizer',
  'auth-handler': '/aws/lambda/ordernimbus-production-auth-handler',
  'forecast-api': '/aws/lambda/ordernimbus-production-forecast-api',
  'data-analysis': '/aws/lambda/ordernimbus-production-data-analysis',
  'product-management': '/aws/lambda/ordernimbus-production-products-management',
  'order-management': '/aws/lambda/ordernimbus-production-orders-management',
  'inventory-management': '/aws/lambda/ordernimbus-production-inventory-management',
  'customer-management': '/aws/lambda/ordernimbus-production-customers-management',
  'chatbot-handler': '/aws/lambda/ordernimbus-production-chatbot-handler',
  'password-reset': '/aws/lambda/ordernimbus-production-password-reset'
};

// Parse CloudWatch log event
const parseLogEvent = (event, source) => {
  try {
    // Try to parse as JSON first (structured logs)
    const parsed = JSON.parse(event.message);
    return {
      timestamp: new Date(event.timestamp).toISOString(),
      level: parsed.level || detectLogLevel(event.message),
      source: source,
      message: parsed.message || event.message,
      requestId: parsed.requestId || extractRequestId(event.message),
      duration: parsed.duration,
      details: parsed.details || parsed.data
    };
  } catch (e) {
    // Fallback to text parsing
    return {
      timestamp: new Date(event.timestamp).toISOString(),
      level: detectLogLevel(event.message),
      source: source,
      message: cleanMessage(event.message),
      requestId: extractRequestId(event.message),
      duration: extractDuration(event.message)
    };
  }
};

// Detect log level from message
const detectLogLevel = (message) => {
  const msg = message.toUpperCase();
  if (msg.includes('ERROR') || msg.includes('FAIL')) return 'ERROR';
  if (msg.includes('WARN') || msg.includes('WARNING')) return 'WARN';
  if (msg.includes('DEBUG')) return 'DEBUG';
  return 'INFO';
};

// Extract request ID from message
const extractRequestId = (message) => {
  const match = message.match(/RequestId:\s*([a-f0-9-]+)/i);
  return match ? match[1] : null;
};

// Extract duration from message
const extractDuration = (message) => {
  const match = message.match(/Duration:\s*([\d.]+)\s*ms/i);
  return match ? parseFloat(match[1]) : null;
};

// Clean message by removing metadata
const cleanMessage = (message) => {
  return message
    .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+[a-f0-9-]+\s+/, '') // Remove timestamp and request ID
    .replace(/^(START|END|REPORT) RequestId:.*$/gm, '') // Remove Lambda markers
    .replace(/\t/g, ' ') // Replace tabs with spaces
    .trim();
};

// Fetch logs from a single log group
const fetchLogsFromGroup = async (logGroupName, options = {}) => {
  const {
    startTime = Date.now() - 3600000, // Default to last hour
    endTime = Date.now(),
    limit = 100,
    filterPattern = ''
  } = options;

  try {
    const params = {
      logGroupName,
      startTime,
      endTime,
      limit,
      filterPattern,
      interleaved: true
    };

    const response = await cloudWatchLogs.filterLogEvents(params).promise();
    
    return response.events || [];
  } catch (error) {
    console.error(`Error fetching logs from ${logGroupName}:`, error);
    
    // Check if log group exists
    if (error.code === 'ResourceNotFoundException') {
      console.log(`Log group ${logGroupName} not found, skipping...`);
      return [];
    }
    
    return [];
  }
};

// Main handler - PUBLIC ACCESS (no authentication required)
exports.handler = async (event) => {
  console.log('Public Logs Reader Lambda triggered:', JSON.stringify(event));
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  try {
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const {
      source = 'all',
      level = 'all',
      since,
      startTime,
      endTime,
      limit = '100' // Lower default limit for public access
    } = queryParams;
    
    // Limit max logs for public access
    const maxLimit = 500;
    const actualLimit = Math.min(parseInt(limit), maxLimit);
    
    // Determine time range (limit to last 24 hours for public access)
    const twentyFourHoursAgo = Date.now() - 86400000;
    let timeStart = startTime ? Math.max(parseInt(startTime), twentyFourHoursAgo) : Date.now() - 3600000;
    let timeEnd = endTime ? parseInt(endTime) : Date.now();
    
    // Enforce max time range
    if (timeStart < twentyFourHoursAgo) {
      timeStart = twentyFourHoursAgo;
    }
    
    // If 'since' is provided, use it as start time (for incremental updates)
    if (since) {
      const sinceTime = new Date(since).getTime() + 1;
      timeStart = Math.max(sinceTime, twentyFourHoursAgo);
    }
    
    // Determine which log groups to query
    let logGroupsToQuery = [];
    if (source === 'all') {
      logGroupsToQuery = Object.entries(LOG_GROUPS);
    } else if (LOG_GROUPS[source]) {
      logGroupsToQuery = [[source, LOG_GROUPS[source]]];
    } else {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid source specified' })
      };
    }
    
    // Build filter pattern based on level
    let filterPattern = '';
    if (level !== 'all') {
      filterPattern = level.toUpperCase();
    }
    
    // Fetch logs from all relevant log groups
    const allLogs = [];
    const fetchPromises = logGroupsToQuery.map(async ([sourceName, logGroupName]) => {
      // Adjust log group name based on environment
      const environment = process.env.ENVIRONMENT || 'production';
      const actualLogGroupName = logGroupName.replace('production', environment);
      
      const events = await fetchLogsFromGroup(actualLogGroupName, {
        startTime: timeStart,
        endTime: timeEnd,
        limit: Math.floor(actualLimit / logGroupsToQuery.length),
        filterPattern
      });
      
      // Parse and format events (remove sensitive data for public access)
      return events.map(event => {
        const parsed = parseLogEvent(event, sourceName);
        // Remove potentially sensitive details
        delete parsed.details;
        if (parsed.message) {
          // Sanitize message - remove emails, IPs, tokens
          parsed.message = parsed.message
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
            .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
            .replace(/Bearer\s+[A-Za-z0-9-._~+/]+=*/g, 'Bearer [token]')
            .replace(/eyJ[A-Za-z0-9-._~+/]+=*/g, '[jwt]');
        }
        return parsed;
      });
    });
    
    const results = await Promise.all(fetchPromises);
    results.forEach(logs => allLogs.push(...logs));
    
    // Sort logs by timestamp (newest first)
    allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Apply level filter if needed
    let filteredLogs = allLogs;
    if (level !== 'all') {
      filteredLogs = allLogs.filter(log => log.level === level.toUpperCase());
    }
    
    // Limit results
    const finalLogs = filteredLogs.slice(0, actualLimit);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        logs: finalLogs,
        count: finalLogs.length,
        hasMore: filteredLogs.length > actualLimit,
        timeRange: {
          start: new Date(timeStart).toISOString(),
          end: new Date(timeEnd).toISOString()
        },
        notice: 'Public access - limited to last 24 hours and sanitized data'
      })
    };
    
  } catch (error) {
    console.error('Error in public logs reader:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to fetch logs',
        message: 'An error occurred while retrieving logs'
      })
    };
  }
};

// Export for testing
module.exports.parseLogEvent = parseLogEvent;
module.exports.detectLogLevel = detectLogLevel;