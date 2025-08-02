require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./src/config/swagger');

// AWS specific imports
const { 
  initializeXRay, 
  closeXRaySegment, 
  loadAWSConfig,
  getECSMetadata 
} = require('./src/config/aws-config');
const { 
  logger, 
  structuredLogger, 
  expressLogger, 
  morganStream 
} = require('./src/config/cloudwatch-logger');

// Import middleware
const { errorHandler } = require('./src/middleware/errorHandler');
const { sanitizeInput } = require('./src/middleware/validation');
const { generalLimiter } = require('./src/middleware/rateLimiter');

// Import routes
const authRoutes = require('./src/routes/auth.routes');
const forecastRoutes = require('./src/routes/forecast.routes');
const dataRoutes = require('./src/routes/data.routes');
const healthRoutes = require('./src/routes/health.routes');

const app = express();

// Initialize AWS X-Ray tracing before other middleware
initializeXRay(app);

// Load AWS configuration (Secrets Manager / Parameter Store)
let awsConfig = {};
(async () => {
  try {
    awsConfig = await loadAWSConfig();
    // Merge AWS config with environment variables
    Object.keys(awsConfig).forEach(key => {
      if (!process.env[key]) {
        process.env[key] = awsConfig[key];
      }
    });
    logger.info('AWS configuration loaded successfully');
  } catch (error) {
    logger.error('Failed to load AWS configuration:', error);
  }
})();

const PORT = process.env.PORT || 3000;

// Get ECS metadata if running in ECS
(async () => {
  const ecsMetadata = await getECSMetadata();
  if (ecsMetadata) {
    logger.info('Running in ECS', ecsMetadata);
    structuredLogger.logAudit('ECS_STARTUP', 'system', ecsMetadata.taskArn, ecsMetadata);
  }
})();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration for AWS environments
const corsOptions = {
  origin: function (origin, callback) {
    // Allow CloudFront, ALB health checks, and configured origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    
    // Add AWS-specific origins
    if (process.env.CLOUDFRONT_DISTRIBUTION) {
      allowedOrigins.push(`https://${process.env.CLOUDFRONT_DISTRIBUTION}.cloudfront.net`);
    }
    
    // Allow ELB health checks (no origin)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-API-Key', 'X-Amz-Security-Token', 'X-Amz-Date'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Amzn-Trace-Id']
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// AWS CloudWatch logging
app.use(expressLogger);

// Morgan logging with CloudWatch stream
const morgan = require('morgan');
app.use(morgan('combined', { stream: morganStream }));

// Security: Input sanitization
app.use(sanitizeInput);

// General rate limiting
app.use(generalLimiter);

// Trust proxy (for accurate IP addresses behind ALB/CloudFront)
app.set('trust proxy', true);

// Add correlation ID for request tracking
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || 
                      req.headers['x-amzn-trace-id'] || 
                      require('crypto').randomUUID();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
});

// API Documentation (disable in production for security)
if (process.env.ENABLE_SWAGGER_UI !== 'false') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'OrderNimbus API Documentation'
  }));
}

// ALB/ELB Health check (must be before authentication)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    region: process.env.AWS_REGION
  });
});

// API Routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', forecastRoutes);
app.use('/api/v1', dataRoutes);

// API Gateway health check support
app.get('/', (req, res) => {
  res.json({
    service: 'OrderNimbus API',
    version: process.env.npm_package_version || '2.0.0',
    status: 'running',
    documentation: '/api-docs'
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Resource not found',
      path: req.path,
      method: req.method,
      correlationId: req.correlationId
    }
  });
});

// Close X-Ray segment
closeXRaySegment(app);

// Global error handler (must be last)
app.use((err, req, res, next) => {
  // Log error with CloudWatch
  structuredLogger.logError(err, req, {
    correlationId: req.correlationId,
    userId: req.user?.id,
    tenantId: req.tenantId
  });
  
  // Call the error handler
  errorHandler(err, req, res, next);
});

// Graceful shutdown for ECS/Kubernetes
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal} signal, starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections
    // Close cache connections
    // Flush logs
    if (logger.transports.length > 0) {
      logger.info('Flushing logs...');
      logger.end(() => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals (ECS sends SIGTERM)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  structuredLogger.logSecurity('UNCAUGHT_EXCEPTION', 'critical', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  structuredLogger.logSecurity('UNHANDLED_REJECTION', 'critical', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
  process.exit(1);
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  const startupMessage = `
╔═══════════════════════════════════════════════╗
║                                               ║
║     OrderNimbus API Server (AWS Edition)     ║
║                                               ║
╠═══════════════════════════════════════════════╣
║  Environment: ${process.env.NODE_ENV || 'development'}                     ║
║  Port: ${PORT}                                ║
║  Region: ${process.env.AWS_REGION || 'not-set'}                      ║
║  X-Ray: ${process.env.AWS_XRAY_TRACING === 'true' ? 'Enabled' : 'Disabled'}                          ║
║  CloudWatch: ${process.env.ENABLE_CLOUDWATCH_LOGS === 'true' ? 'Enabled' : 'Disabled'}                 ║
╚═══════════════════════════════════════════════╝
  `;
  
  console.log(startupMessage);
  logger.info('API Server started', {
    port: PORT,
    environment: process.env.NODE_ENV,
    region: process.env.AWS_REGION,
    xray: process.env.AWS_XRAY_TRACING === 'true',
    cloudwatch: process.env.ENABLE_CLOUDWATCH_LOGS === 'true',
    cognito: process.env.USE_COGNITO === 'true',
    parameterStore: process.env.USE_PARAMETER_STORE === 'true',
    secretsManager: process.env.USE_SECRETS_MANAGER === 'true'
  });
  
  // Log successful startup as audit event
  structuredLogger.logAudit('API_STARTUP', 'system', 'global', {
    port: PORT,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Handle server errors
server.on('error', (error) => {
  logger.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
});

module.exports = app;