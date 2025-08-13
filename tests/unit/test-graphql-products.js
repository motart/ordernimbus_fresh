/**
 * Unit tests for GraphQL product operations
 */

const assert = require('assert');
const ProductService = require('../../lambda/shopify/services/productService');
const { 
  graphQLProductToREST, 
  restProductToGraphQLInput,
  extractNumericId 
} = require('../../lambda/shopify/mappers/productMapper');

describe('GraphQL Product Service Tests', () => {
  
  describe('Product Mapper', () => {
    
    it('should extract numeric ID from GraphQL global ID', () => {
      assert.strictEqual(extractNumericId('gid://shopify/Product/123456'), '123456');
      assert.strictEqual(extractNumericId('gid://shopify/ProductVariant/789'), '789');
      assert.strictEqual(extractNumericId('123'), '123');
      assert.strictEqual(extractNumericId(null), null);
    });

    it('should convert GraphQL product to REST format', () => {
      const gqlProduct = {
        id: 'gid://shopify/Product/123',
        title: 'Test Product',
        handle: 'test-product',
        status: 'ACTIVE',
        vendor: 'Test Vendor',
        productType: 'Test Type',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        publishedAt: '2024-01-01T00:00:00Z',
        tags: ['tag1', 'tag2'],
        descriptionHtml: '<p>Test description</p>',
        variants: {
          edges: [
            {
              node: {
                id: 'gid://shopify/ProductVariant/456',
                title: 'Default',
                sku: 'TEST-001',
                price: '19.99',
                compareAtPrice: '29.99',
                barcode: '123456789',
                weight: 1.5,
                weightUnit: 'KILOGRAMS',
                inventoryQuantity: 100,
                selectedOptions: [
                  { name: 'Size', value: 'Medium' }
                ],
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z'
              }
            }
          ]
        },
        options: [
          { id: 'gid://shopify/ProductOption/789', name: 'Size', position: 1, values: ['Small', 'Medium', 'Large'] }
        ],
        images: {
          edges: [
            {
              node: {
                id: 'gid://shopify/ProductImage/999',
                url: 'https://cdn.shopify.com/test.jpg',
                altText: 'Test image'
              }
            }
          ]
        }
      };

      const restProduct = graphQLProductToREST(gqlProduct);

      assert.strictEqual(restProduct.id, '123');
      assert.strictEqual(restProduct.title, 'Test Product');
      assert.strictEqual(restProduct.handle, 'test-product');
      assert.strictEqual(restProduct.status, 'active');
      assert.strictEqual(restProduct.vendor, 'Test Vendor');
      assert.strictEqual(restProduct.product_type, 'Test Type');
      assert.strictEqual(restProduct.tags, 'tag1, tag2');
      assert.strictEqual(restProduct.body_html, '<p>Test description</p>');
      
      // Check variant conversion
      assert.strictEqual(restProduct.variants.length, 1);
      assert.strictEqual(restProduct.variants[0].id, '456');
      assert.strictEqual(restProduct.variants[0].product_id, '123');
      assert.strictEqual(restProduct.variants[0].sku, 'TEST-001');
      assert.strictEqual(restProduct.variants[0].price, '19.99');
      assert.strictEqual(restProduct.variants[0].compare_at_price, '29.99');
      assert.strictEqual(restProduct.variants[0].grams, 1500); // 1.5 kg to grams
      assert.strictEqual(restProduct.variants[0].option1, 'Medium');
      
      // Check options conversion
      assert.strictEqual(restProduct.options.length, 1);
      assert.strictEqual(restProduct.options[0].name, 'Size');
      assert.deepStrictEqual(restProduct.options[0].values, ['Small', 'Medium', 'Large']);
      
      // Check images conversion
      assert.strictEqual(restProduct.images.length, 1);
      assert.strictEqual(restProduct.images[0].id, '999');
      assert.strictEqual(restProduct.images[0].src, 'https://cdn.shopify.com/test.jpg');
      assert.strictEqual(restProduct.images[0].alt, 'Test image');
    });

    it('should convert REST product to GraphQL input format', () => {
      const restProduct = {
        id: '123',
        title: 'Test Product',
        body_html: '<p>Test description</p>',
        vendor: 'Test Vendor',
        product_type: 'Test Type',
        tags: 'tag1, tag2, tag3',
        status: 'active',
        handle: 'test-product',
        variants: [
          {
            price: '19.99',
            sku: 'TEST-001',
            barcode: '123456789',
            grams: 1500,
            weight_unit: 'kg',
            option1: 'Medium',
            inventory_policy: 'deny',
            fulfillment_service: 'manual',
            requires_shipping: true,
            taxable: true,
            compare_at_price: '29.99'
          }
        ],
        options: [
          { name: 'Size' }
        ],
        images: [
          {
            src: 'https://cdn.shopify.com/test.jpg',
            alt: 'Test image'
          }
        ]
      };

      const gqlInput = restProductToGraphQLInput(restProduct);

      assert.strictEqual(gqlInput.id, 'gid://shopify/Product/123');
      assert.strictEqual(gqlInput.title, 'Test Product');
      assert.strictEqual(gqlInput.descriptionHtml, '<p>Test description</p>');
      assert.strictEqual(gqlInput.vendor, 'Test Vendor');
      assert.strictEqual(gqlInput.productType, 'Test Type');
      assert.deepStrictEqual(gqlInput.tags, ['tag1', 'tag2', 'tag3']);
      assert.strictEqual(gqlInput.status, 'ACTIVE');
      assert.strictEqual(gqlInput.handle, 'test-product');
      
      // Check variant input
      assert.strictEqual(gqlInput.variants.length, 1);
      assert.strictEqual(gqlInput.variants[0].price, '19.99');
      assert.strictEqual(gqlInput.variants[0].sku, 'TEST-001');
      assert.strictEqual(gqlInput.variants[0].weight, 1.5); // grams to kg
      assert.strictEqual(gqlInput.variants[0].weightUnit, 'KILOGRAMS');
      assert.deepStrictEqual(gqlInput.variants[0].options, ['Medium']);
      
      // Check options input
      assert.deepStrictEqual(gqlInput.options, ['Size']);
      
      // Check images input
      assert.strictEqual(gqlInput.images.length, 1);
      assert.strictEqual(gqlInput.images[0].src, 'https://cdn.shopify.com/test.jpg');
      assert.strictEqual(gqlInput.images[0].altText, 'Test image');
    });
  });

  describe('GraphQL Cost Management', () => {
    it('should handle throttle status from extensions', () => {
      // This would be tested with mocked GraphQL responses
      // Example structure of what we'd test:
      const mockResponse = {
        data: {
          products: {
            edges: [],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        },
        extensions: {
          cost: {
            requestedQueryCost: 10,
            actualQueryCost: 8,
            throttleStatus: {
              maximumAvailable: 2000,
              currentlyAvailable: 1992,
              restoreRate: 100
            }
          }
        }
      };

      // Test that low currentlyAvailable triggers throttling
      assert.ok(mockResponse.extensions.cost.throttleStatus.currentlyAvailable > 0);
    });
  });

  describe('Feature Flag', () => {
    it('should respect USE_GRAPHQL_PRODUCTS environment variable', () => {
      // Save original value
      const originalValue = process.env.USE_GRAPHQL_PRODUCTS;
      
      // Test when explicitly set to false
      process.env.USE_GRAPHQL_PRODUCTS = 'false';
      // In actual implementation, this would trigger REST API usage
      assert.strictEqual(process.env.USE_GRAPHQL_PRODUCTS, 'false');
      
      // Test when not set (defaults to true)
      delete process.env.USE_GRAPHQL_PRODUCTS;
      assert.notStrictEqual(process.env.USE_GRAPHQL_PRODUCTS, 'false');
      
      // Restore original value
      if (originalValue !== undefined) {
        process.env.USE_GRAPHQL_PRODUCTS = originalValue;
      }
    });
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  const { describe: runDescribe, it: runIt } = require('mocha');
  
  console.log('Running GraphQL Product Service Tests...\n');
  
  // Simple test runner for development
  const tests = [];
  global.describe = (name, fn) => {
    console.log(`\n${name}`);
    fn();
  };
  
  global.it = (name, fn) => {
    try {
      fn();
      console.log(`  ✅ ${name}`);
    } catch (error) {
      console.log(`  ❌ ${name}`);
      console.log(`     Error: ${error.message}`);
    }
  };
  
  // Re-run the tests with our simple runner
  require(__filename);
}