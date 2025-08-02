require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./src/config/swagger');

// Import middleware
const { errorHandler } = require('./src/middleware/errorHandler');
const { logger, requestLogger } = require('./src/middleware/logger');
const { sanitizeInput } = require('./src/middleware/validation');
const { generalLimiter } = require('./src/middleware/rateLimiter');

// Import routes
const authRoutes = require('./src/routes/auth.routes');
const forecastRoutes = require('./src/routes/forecast.routes');
const dataRoutes = require('./src/routes/data.routes');
const healthRoutes = require('./src/routes/health.routes');

const app = express();
const PORT = process.env.PORT || 3000;

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

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-API-Key'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(logger);
if (process.env.NODE_ENV === 'development') {
  app.use(requestLogger);
}

// Security: Input sanitization
app.use(sanitizeInput);

// General rate limiting
app.use(generalLimiter);

// Trust proxy (for accurate IP addresses behind load balancers)
app.set('trust proxy', true);

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'OrderNimbus API Documentation'
}));

// API Routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', forecastRoutes);
app.use('/api/v1', dataRoutes);

// Serve static files from React build (if exists)
if (process.env.SERVE_FRONTEND === 'true') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  // Catch all route - serve React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Resource not found',
      path: req.path,
      method: req.method
    }
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('Received shutdown signal, closing server gracefully...');
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║        OrderNimbus API Server v2.0            ║
║                                               ║
╠═══════════════════════════════════════════════╣
║  Environment: ${process.env.NODE_ENV || 'development'}                     ║
║  Port: ${PORT}                                ║
║  API Docs: http://localhost:${PORT}/api-docs    ║
║  Health: http://localhost:${PORT}/api/v1/health ║
╚═══════════════════════════════════════════════╝
  `);
  
  // Log important configurations
  console.log('Configuration:');
  console.log('- CORS enabled for:', process.env.ALLOWED_ORIGINS || 'localhost');
  console.log('- Rate limiting: Enabled');
  console.log('- Authentication:', process.env.USE_COGNITO === 'true' ? 'AWS Cognito' : 'Local JWT');
  console.log('- Database:', process.env.DYNAMODB_ENDPOINT || 'AWS DynamoDB');
  console.log('- Logging:', process.env.NODE_ENV === 'production' ? 'Production mode' : 'Development mode');
});

module.exports = app;