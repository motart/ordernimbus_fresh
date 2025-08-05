// Test script to debug inventory upload
const fetch = require('node-fetch');

async function testInventoryUpload() {
  const apiUrl = 'http://localhost:3001';
  const userId = 'test-user-123';
  const storeId = 'test-store-456';
  
  // Sample inventory data matching our CSV format
  const csvData = [
    {
      sku: 'TEE-BLU-M',
      location: 'Warehouse A',
      qty: '150',
      available: '142',
      reserved: '8',
      incoming: '50'
    },
    {
      sku: 'SHOE-RUN-42',
      location: 'Warehouse A',
      qty: '75',
      available: '70',
      reserved: '5',
      incoming: '25'
    }
  ];
  
  // Column mappings from CSV
  const columnMappings = {
    'sku': 'sku',
    'location': 'location',
    'qty': 'quantity',
    'available': 'available',
    'reserved': 'reserved',
    'incoming': 'incoming'
  };
  
  console.log('Testing inventory upload...');
  console.log('CSV Data:', JSON.stringify(csvData, null, 2));
  console.log('Column Mappings:', JSON.stringify(columnMappings, null, 2));
  
  try {
    // Upload inventory
    const uploadResponse = await fetch(`${apiUrl}/api/data/upload-csv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'userId': userId
      },
      body: JSON.stringify({
        storeId: storeId,
        csvData: csvData,
        columnMappings: columnMappings,
        dataType: 'inventory'
      })
    });
    
    const uploadResult = await uploadResponse.json();
    console.log('\nUpload Response:', JSON.stringify(uploadResult, null, 2));
    
    // Now fetch inventory to see if it was stored
    const inventoryResponse = await fetch(`${apiUrl}/api/inventory?storeId=${storeId}`, {
      headers: {
        'userId': userId
      }
    });
    
    const inventoryResult = await inventoryResponse.json();
    console.log('\nInventory Response:', JSON.stringify(inventoryResult, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testInventoryUpload();