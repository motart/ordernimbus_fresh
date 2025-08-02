const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OrderNimbus API',
      version: '1.0.0',
      description: 'AI-Powered Sales Forecasting Platform API',
      contact: {
        name: 'OrderNimbus Support',
        email: 'support@ordernimbus.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Current environment'
      },
      {
        url: 'https://api.ordernimbus.com',
        description: 'Production'
      },
      {
        url: 'https://staging-api.ordernimbus.com',
        description: 'Staging'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  example: 'Error message'
                },
                details: {
                  type: 'array',
                  items: {
                    type: 'object'
                  }
                }
              }
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            },
            path: {
              type: 'string'
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string'
            },
            data: {
              type: 'object'
            }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              example: 20
            },
            offset: {
              type: 'integer',
              example: 0
            },
            hasMore: {
              type: 'boolean',
              example: true
            },
            total: {
              type: 'integer',
              example: 100
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            name: {
              type: 'string'
            },
            role: {
              type: 'string',
              enum: ['admin', 'user', 'viewer']
            },
            tenantId: {
              type: 'string',
              format: 'uuid'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Forecast: {
          type: 'object',
          properties: {
            forecastId: {
              type: 'string',
              format: 'uuid'
            },
            tenantId: {
              type: 'string',
              format: 'uuid'
            },
            productId: {
              type: 'string'
            },
            storeId: {
              type: 'string'
            },
            forecastPeriod: {
              type: 'integer',
              minimum: 1,
              maximum: 365
            },
            algorithm: {
              type: 'string',
              enum: ['arima', 'lstm', 'prophet', 'ensemble']
            },
            granularity: {
              type: 'string',
              enum: ['hourly', 'daily', 'weekly', 'monthly']
            },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'completed', 'failed']
            },
            results: {
              type: 'object',
              properties: {
                predictions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: {
                        type: 'string',
                        format: 'date'
                      },
                      predicted: {
                        type: 'number'
                      },
                      lowerBound: {
                        type: 'number'
                      },
                      upperBound: {
                        type: 'number'
                      },
                      confidence: {
                        type: 'number',
                        minimum: 0,
                        maximum: 1
                      }
                    }
                  }
                },
                metrics: {
                  type: 'object',
                  properties: {
                    mape: {
                      type: 'number'
                    },
                    rmse: {
                      type: 'number'
                    },
                    mae: {
                      type: 'number'
                    },
                    r2: {
                      type: 'number'
                    }
                  }
                }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        }
      },
      parameters: {
        tenantId: {
          name: 'tenantId',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid'
          },
          description: 'Tenant ID'
        },
        limit: {
          name: 'limit',
          in: 'query',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20
          },
          description: 'Number of items to return'
        },
        offset: {
          name: 'offset',
          in: 'query',
          schema: {
            type: 'integer',
            minimum: 0,
            default: 0
          },
          description: 'Number of items to skip'
        }
      },
      responses: {
        Unauthorized: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        Forbidden: {
          description: 'Forbidden',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        NotFound: {
          description: 'Not Found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        ValidationError: {
          description: 'Validation Error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        ServerError: {
          description: 'Internal Server Error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization'
      },
      {
        name: 'Forecasts',
        description: 'Sales forecast operations'
      },
      {
        name: 'Data',
        description: 'Data upload and management'
      },
      {
        name: 'Health',
        description: 'Health check endpoints'
      }
    ]
  },
  apis: ['./src/routes/*.js', './src/routes/*.routes.js'] // Path to the API routes
};

const specs = swaggerJsdoc(options);

module.exports = specs;