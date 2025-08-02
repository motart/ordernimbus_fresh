const winston = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'ordernimbus-api',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '2.0.0'
  }
});

// Console transport for local development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// CloudWatch transport for AWS deployment
if (process.env.ENABLE_CLOUDWATCH_LOGS === 'true') {
  const cloudWatchConfig = {
    logGroupName: process.env.CLOUDWATCH_LOG_GROUP || '/aws/ecs/ordernimbus-api',
    logStreamName: process.env.CLOUDWATCH_LOG_STREAM || 
      `${process.env.NODE_ENV}-${new Date().toISOString().split('T')[0]}`,
    awsRegion: process.env.AWS_REGION || 'us-west-1',
    messageFormatter: (item) => {
      return JSON.stringify({
        timestamp: item.timestamp,
        level: item.level,
        message: item.message,
        ...item.meta
      });
    },
    retentionInDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
    uploadRate: 2000, // 2 seconds
    errorHandler: (err) => {
      console.error('CloudWatch logging error:', err);
    }
  };
  
  // Add CloudWatch transport
  logger.add(new WinstonCloudWatch(cloudWatchConfig));
  
  // Wait for CloudWatch to be ready
  logger.on('error', (error) => {
    console.error('Logger error:', error);
  });
}

// File transport for production logs
if (process.env.ENABLE_FILE_LOGS === 'true') {
  const path = require('path');
  const logsDir = path.join(__dirname, '../../logs');
  
  // Ensure logs directory exists
  const fs = require('fs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Error logs
  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }));
  
  // Combined logs
  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 10
  }));
}

// Create structured logging methods
const structuredLogger = {
  // API request logging
  logRequest: (req, metadata = {}) => {
    logger.info('API Request', {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
      tenantId: req.tenantId,
      correlationId: req.headers['x-correlation-id'],
      ...metadata
    });
  },
  
  // API response logging
  logResponse: (req, res, responseTime, metadata = {}) => {
    logger.info('API Response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userId: req.user?.id,
      tenantId: req.tenantId,
      correlationId: req.headers['x-correlation-id'],
      ...metadata
    });
  },
  
  // Error logging
  logError: (error, req = null, metadata = {}) => {
    const errorLog = {
      message: error.message,
      stack: error.stack,
      code: error.code || error.statusCode,
      ...metadata
    };
    
    if (req) {
      errorLog.method = req.method;
      errorLog.path = req.path;
      errorLog.userId = req.user?.id;
      errorLog.tenantId = req.tenantId;
      errorLog.correlationId = req.headers['x-correlation-id'];
    }
    
    logger.error('API Error', errorLog);
  },
  
  // Audit logging
  logAudit: (action, userId, tenantId, details = {}) => {
    logger.info('Audit Log', {
      action,
      userId,
      tenantId,
      timestamp: new Date().toISOString(),
      ...details
    });
  },
  
  // Performance logging
  logPerformance: (operation, duration, metadata = {}) => {
    logger.info('Performance Metric', {
      operation,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  },
  
  // Security event logging
  logSecurity: (event, severity, details = {}) => {
    logger.warn('Security Event', {
      event,
      severity,
      timestamp: new Date().toISOString(),
      ...details
    });
  },
  
  // Database query logging
  logQuery: (query, duration, metadata = {}) => {
    logger.debug('Database Query', {
      query,
      duration: `${duration}ms`,
      ...metadata
    });
  },
  
  // Integration logging
  logIntegration: (service, action, status, metadata = {}) => {
    logger.info('External Integration', {
      service,
      action,
      status,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }
};

// Express middleware for request/response logging
const expressLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  structuredLogger.logRequest(req);
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    structuredLogger.logResponse(req, res, responseTime);
    originalSend.call(this, data);
  };
  
  next();
};

// Stream for Morgan integration
const morganStream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = {
  logger,
  structuredLogger,
  expressLogger,
  morganStream
};