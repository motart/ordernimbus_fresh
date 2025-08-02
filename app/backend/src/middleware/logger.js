const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create a write stream for access logs
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' }
);

// Custom token for user ID
morgan.token('user-id', (req) => req.user?.id || 'anonymous');
morgan.token('tenant-id', (req) => req.tenantId || 'none');

// Development logging
const developmentLogger = morgan('dev');

// Production logging
const productionLogger = morgan(
  ':remote-addr - :user-id [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms ":referrer" ":user-agent" tenant::tenant-id',
  { stream: accessLogStream }
);

// Combined logger
const logger = process.env.NODE_ENV === 'production' 
  ? productionLogger 
  : developmentLogger;

// Request logger middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined,
    headers: {
      'user-agent': req.headers['user-agent'],
      'x-tenant-id': req.headers['x-tenant-id']
    }
  });

  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] Response: ${res.statusCode} (${duration}ms)`);
    originalSend.call(this, data);
  };

  next();
};

module.exports = {
  logger,
  requestLogger
};