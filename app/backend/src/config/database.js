const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined
});

const dynamoDb = DynamoDBDocumentClient.from(client);

module.exports = { dynamoDb };