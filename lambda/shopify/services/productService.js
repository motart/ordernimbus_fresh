/**
 * Product Service
 * Handles all product operations using GraphQL or REST based on feature flag
 */

const ShopifyGraphQLClient = require('../gqlClient');
const queries = require('../queries');
const mutations = require('../mutations');
const { graphQLProductToREST, restProductToGraphQLInput } = require('../mappers/productMapper');
const axios = require('axios');

// Feature flag - set to true to always use GraphQL
const USE_GRAPHQL = true; // Always use GraphQL, can be overridden only by explicitly setting process.env.USE_GRAPHQL_PRODUCTS to 'false'
const SHOPIFY_API_VERSION = '2024-10'; // Updated to support new Product APIs

class ProductService {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.gqlClient = new ShopifyGraphQLClient(shop, accessToken);
    this.restBaseUrl = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}`;
  }

  /**
   * Fetch products with pagination
   * @param {object} options - Query options
   * @param {number} options.limit - Number of products to fetch (default 50)
   * @param {string} options.after - Cursor for pagination
   * @param {string} options.query - Search query
   * @returns {Promise<object>} - Products and pagination info
   */
  async fetchProductsPage({ limit = 50, after = null, query = null } = {}) {
    if (USE_GRAPHQL) {
      return this.fetchProductsPageGraphQL({ limit, after, query });
    } else {
      return this.fetchProductsPageREST({ limit, after, query });
    }
  }

  async fetchProductsPageGraphQL({ limit, after, query }) {
    const data = await this.gqlClient.execute(queries.PRODUCTS_QUERY, {
      first: Math.min(limit, 250),
      after,
      query
    });

    const products = data.products.edges.map(edge => 
      graphQLProductToREST(edge.node)
    );

    return {
      products,
      pageInfo: {
        hasNextPage: data.products.pageInfo.hasNextPage,
        endCursor: data.products.pageInfo.endCursor
      }
    };
  }

  async fetchProductsPageREST({ limit, after, query }) {
    const params = new URLSearchParams({
      limit: Math.min(limit, 250)
    });

    if (after) {
      params.append('page_info', after);
    }

    if (query) {
      // REST API doesn't support structured queries like GraphQL
      // We'll filter client-side or use title parameter
      params.append('title', query);
    }

    const response = await axios.get(
      `${this.restBaseUrl}/products.json?${params}`,
      {
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    // Extract pagination from Link header
    const linkHeader = response.headers.link || '';
    const hasNextPage = linkHeader.includes('rel="next"');
    let endCursor = null;

    if (hasNextPage) {
      const match = linkHeader.match(/page_info=([^>&]*)[>&]/);
      endCursor = match ? match[1] : null;
    }

    return {
      products: response.data.products || [],
      pageInfo: {
        hasNextPage,
        endCursor
      }
    };
  }

  /**
   * Fetch all products (handles pagination automatically)
   * @param {object} options - Query options
   * @param {number} options.maxProducts - Maximum products to fetch
   * @returns {Promise<array>} - Array of all products
   */
  async fetchAllProducts({ maxProducts = 10000 } = {}) {
    const allProducts = [];
    let hasNextPage = true;
    let cursor = null;
    const pageSize = 250; // Maximum allowed by Shopify

    while (hasNextPage && allProducts.length < maxProducts) {
      const { products, pageInfo } = await this.fetchProductsPage({
        limit: pageSize,
        after: cursor
      });

      allProducts.push(...products);
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;

      // Respect maxProducts limit
      if (allProducts.length >= maxProducts) {
        return allProducts.slice(0, maxProducts);
      }
    }

    return allProducts;
  }

  /**
   * Fetch a single product by ID
   * @param {string} productId - Product ID (numeric or GID)
   * @returns {Promise<object>} - Product data
   */
  async fetchProductById(productId) {
    if (USE_GRAPHQL) {
      return this.fetchProductByIdGraphQL(productId);
    } else {
      return this.fetchProductByIdREST(productId);
    }
  }

  async fetchProductByIdGraphQL(productId) {
    // Ensure we have a proper GID
    const gid = productId.startsWith('gid://') 
      ? productId 
      : `gid://shopify/Product/${productId}`;

    const data = await this.gqlClient.execute(queries.PRODUCT_BY_ID_QUERY, {
      id: gid
    });

    if (!data.product) {
      throw new Error(`Product not found: ${productId}`);
    }

    return graphQLProductToREST(data.product);
  }

  async fetchProductByIdREST(productId) {
    // Extract numeric ID if GID provided
    const numericId = productId.replace(/^gid:\/\/shopify\/Product\//, '');

    const response = await axios.get(
      `${this.restBaseUrl}/products/${numericId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.product;
  }

  /**
   * Fetch a product by handle
   * @param {string} handle - Product handle
   * @returns {Promise<object>} - Product data
   */
  async fetchProductByHandle(handle) {
    if (USE_GRAPHQL) {
      const data = await this.gqlClient.execute(queries.PRODUCT_BY_HANDLE_QUERY, {
        handle
      });

      if (!data.productByHandle) {
        throw new Error(`Product not found with handle: ${handle}`);
      }

      return graphQLProductToREST(data.productByHandle);
    } else {
      // REST API doesn't have direct handle lookup, need to search
      const response = await axios.get(
        `${this.restBaseUrl}/products.json?handle=${handle}`,
        {
          headers: {
            'X-Shopify-Access-Token': this.accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data.products || response.data.products.length === 0) {
        throw new Error(`Product not found with handle: ${handle}`);
      }

      return response.data.products[0];
    }
  }

  /**
   * Create a new product
   * @param {object} productData - Product data in REST format
   * @returns {Promise<object>} - Created product
   */
  async createProduct(productData) {
    if (USE_GRAPHQL) {
      return this.createProductGraphQL(productData);
    } else {
      return this.createProductREST(productData);
    }
  }

  async createProductGraphQL(productData) {
    const input = restProductToGraphQLInput(productData);
    
    const data = await this.gqlClient.execute(mutations.PRODUCT_CREATE_MUTATION, {
      input
    });

    if (data.productCreate.userErrors && data.productCreate.userErrors.length > 0) {
      this.gqlClient.handleUserErrors(data.productCreate.userErrors);
    }

    return graphQLProductToREST(data.productCreate.product);
  }

  async createProductREST(productData) {
    const response = await axios.post(
      `${this.restBaseUrl}/products.json`,
      { product: productData },
      {
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.product;
  }

  /**
   * Update an existing product
   * @param {string} productId - Product ID
   * @param {object} updates - Product updates in REST format
   * @returns {Promise<object>} - Updated product
   */
  async updateProduct(productId, updates) {
    if (USE_GRAPHQL) {
      return this.updateProductGraphQL(productId, updates);
    } else {
      return this.updateProductREST(productId, updates);
    }
  }

  async updateProductGraphQL(productId, updates) {
    // Ensure we have the ID in the updates
    updates.id = productId;
    const input = restProductToGraphQLInput(updates);
    
    const data = await this.gqlClient.execute(mutations.PRODUCT_UPDATE_MUTATION, {
      input
    });

    if (data.productUpdate.userErrors && data.productUpdate.userErrors.length > 0) {
      this.gqlClient.handleUserErrors(data.productUpdate.userErrors);
    }

    return graphQLProductToREST(data.productUpdate.product);
  }

  async updateProductREST(productId, updates) {
    const numericId = productId.replace(/^gid:\/\/shopify\/Product\//, '');

    const response = await axios.put(
      `${this.restBaseUrl}/products/${numericId}.json`,
      { product: updates },
      {
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.product;
  }

  /**
   * Delete a product
   * @param {string} productId - Product ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteProduct(productId) {
    if (USE_GRAPHQL) {
      return this.deleteProductGraphQL(productId);
    } else {
      return this.deleteProductREST(productId);
    }
  }

  async deleteProductGraphQL(productId) {
    const gid = productId.startsWith('gid://') 
      ? productId 
      : `gid://shopify/Product/${productId}`;

    const data = await this.gqlClient.execute(mutations.PRODUCT_DELETE_MUTATION, {
      input: { id: gid }
    });

    if (data.productDelete.userErrors && data.productDelete.userErrors.length > 0) {
      this.gqlClient.handleUserErrors(data.productDelete.userErrors);
    }

    return true;
  }

  async deleteProductREST(productId) {
    const numericId = productId.replace(/^gid:\/\/shopify\/Product\//, '');

    await axios.delete(
      `${this.restBaseUrl}/products/${numericId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': this.accessToken
        }
      }
    );

    return true;
  }

  /**
   * Get current GraphQL throttle status
   * @returns {object|null} Throttle status
   */
  getThrottleStatus() {
    return this.gqlClient.getThrottleStatus();
  }
}

module.exports = ProductService;