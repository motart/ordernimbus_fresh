// Simple test script to debug inventory upload
const http = require('http');

const testData = {
  storeId: 'demo_store_brickmortar_1735875523865',
  csvData: [
    {
      sku: 'TEE-BLU-M',
      location: 'Warehouse A',
      qty: '150',
      available: '142',
      reserved: '8',
      incoming: '50'
    }
  ],
  columnMappings: {
    'sku': 'sku',
    'location': 'location',
    'qty': 'quantity',
    'available': 'available',
    'reserved': 'reserved',
    'incoming': 'incoming'
  },
  dataType: 'inventory'
};

const postData = JSON.stringify(testData);

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/data/upload-csv',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'userId': 'GBzON4p7b5PdD3dmJP9qTjzQdOv1'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', res.statusCode);
    console.log('Body:', data);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();