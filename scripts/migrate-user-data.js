#!/usr/bin/env node

/**
 * Script to migrate DynamoDB data from old userId to new userId
 * This handles the case where data was created with a different Cognito user
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-1' });

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = 'ordernimbus-production-main';

// User IDs
const OLD_USER_ID = '09a9895e-9061-702f-8ec2-7d5d35d0e8f3';
const NEW_USER_ID = 'f9b959fe-3081-7077-16fd-0f5384d3eb01'; // From current admin@ordernimbus.com

async function migrateUserData() {
  console.log('Starting user data migration...');
  console.log(`From: user_${OLD_USER_ID}`);
  console.log(`To: USER#${NEW_USER_ID}`);
  
  try {
    // Scan for all items with the old user ID
    const scanParams = {
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(pk, :oldPk)',
      ExpressionAttributeValues: {
        ':oldPk': `user_${OLD_USER_ID}`
      }
    };
    
    const scanResult = await dynamodb.scan(scanParams).promise();
    console.log(`Found ${scanResult.Items.length} items to migrate`);
    
    if (scanResult.Items.length === 0) {
      console.log('No items to migrate');
      return;
    }
    
    // Process each item
    for (const item of scanResult.Items) {
      const oldPk = item.pk;
      const sk = item.sk;
      
      // Create new item with updated pk format
      const newItem = {
        ...item,
        pk: `USER#${NEW_USER_ID}`,
        migratedFrom: oldPk,
        migratedAt: new Date().toISOString()
      };
      
      // Handle store items specially - update the format
      if (sk.startsWith('store_')) {
        newItem.sk = `STORE#${sk.replace('store_', '')}`;
        newItem.type = 'store';
        
        // Ensure we have an id field
        if (!newItem.id) {
          newItem.id = sk.replace('store_', '');
        }
      }
      // Handle order items
      else if (sk.startsWith('order_')) {
        newItem.sk = `ORDER#${sk.replace('order_', '')}`;
        newItem.type = 'order';
        
        if (!newItem.id) {
          newItem.id = sk.replace('order_', '');
        }
      }
      // Handle product items
      else if (sk.startsWith('product_')) {
        newItem.sk = `PRODUCT#${sk.replace('product_', '')}`;
        newItem.type = 'product';
        
        if (!newItem.id) {
          newItem.id = sk.replace('product_', '');
        }
      }
      // Handle inventory items
      else if (sk.startsWith('inventory_')) {
        newItem.sk = `INVENTORY#${sk.replace('inventory_', '')}`;
        newItem.type = 'inventory';
        
        if (!newItem.id) {
          newItem.id = sk.replace('inventory_', '');
        }
      }
      // Handle customer items
      else if (sk.startsWith('customer_')) {
        newItem.sk = `CUSTOMER#${sk.replace('customer_', '')}`;
        newItem.type = 'customer';
        
        if (!newItem.id) {
          newItem.id = sk.replace('customer_', '');
        }
      }
      
      console.log(`Migrating: ${oldPk}#${sk} -> ${newItem.pk}#${newItem.sk}`);
      
      // Write the new item
      await dynamodb.put({
        TableName: TABLE_NAME,
        Item: newItem
      }).promise();
      
      // Optional: Delete the old item (comment out if you want to keep originals)
      // await dynamodb.delete({
      //   TableName: TABLE_NAME,
      //   Key: { pk: oldPk, sk: sk }
      // }).promise();
    }
    
    console.log('Migration completed successfully!');
    
    // Verify the migration
    const verifyParams = {
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(pk, :newPk)',
      ExpressionAttributeValues: {
        ':newPk': `USER#${NEW_USER_ID}`
      }
    };
    
    const verifyResult = await dynamodb.scan(verifyParams).promise();
    console.log(`\nVerification: Found ${verifyResult.Items.length} migrated items`);
    
    // Show summary
    const stores = verifyResult.Items.filter(i => i.sk && i.sk.startsWith('STORE#')).length;
    const orders = verifyResult.Items.filter(i => i.sk && i.sk.startsWith('ORDER#')).length;
    const products = verifyResult.Items.filter(i => i.sk && i.sk.startsWith('PRODUCT#')).length;
    const inventory = verifyResult.Items.filter(i => i.sk && i.sk.startsWith('INVENTORY#')).length;
    const customers = verifyResult.Items.filter(i => i.sk && i.sk.startsWith('CUSTOMER#')).length;
    
    console.log('\nMigrated data summary:');
    console.log(`- Stores: ${stores}`);
    console.log(`- Orders: ${orders}`);
    console.log(`- Products: ${products}`);
    console.log(`- Inventory: ${inventory}`);
    console.log(`- Customers: ${customers}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateUserData();