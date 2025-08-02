const express = require('express');
const router = express.Router();
const { dynamoDb } = require('../config/database');
const { DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

// Health check endpoint (no auth required)
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  };

  res.json(health);
});

// Detailed health check (for monitoring)
router.get('/detailed', async (req, res) => {
  const checks = {
    api: 'healthy',
    database: 'unknown',
    memory: 'healthy',
    timestamp: new Date().toISOString()
  };

  // Check database connectivity
  try {
    if (process.env.USERS_TABLE) {
      const command = new DescribeTableCommand({
        TableName: process.env.USERS_TABLE
      });
      await dynamoDb.send(command);
      checks.database = 'healthy';
    } else {
      checks.database = 'not-configured';
    }
  } catch (error) {
    checks.database = 'unhealthy';
    checks.databaseError = error.message;
  }

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const memoryThreshold = 1024 * 1024 * 1024; // 1GB
  
  if (memoryUsage.heapUsed > memoryThreshold) {
    checks.memory = 'warning';
    checks.memoryDetails = {
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`
    };
  }

  const overallStatus = 
    checks.api === 'healthy' && 
    (checks.database === 'healthy' || checks.database === 'not-configured') && 
    checks.memory === 'healthy' 
      ? 'healthy' 
      : 'degraded';

  res.status(overallStatus === 'healthy' ? 200 : 503).json({
    status: overallStatus,
    checks
  });
});

// Readiness check (for k8s/ECS)
router.get('/ready', async (req, res) => {
  // Check if the service is ready to accept traffic
  const ready = {
    ready: true,
    timestamp: new Date().toISOString()
  };

  // Add any initialization checks here
  if (process.env.REQUIRE_DB === 'true') {
    try {
      const command = new DescribeTableCommand({
        TableName: process.env.USERS_TABLE || 'ordernimbus-users'
      });
      await dynamoDb.send(command);
    } catch (error) {
      ready.ready = false;
      ready.reason = 'Database not ready';
    }
  }

  res.status(ready.ready ? 200 : 503).json(ready);
});

// Liveness check (for k8s/ECS)
router.get('/live', (req, res) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    pid: process.pid
  });
});

module.exports = router;