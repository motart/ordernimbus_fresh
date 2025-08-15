/**
 * Shopify GraphQL Client
 * API Version: 2024-07
 * 
 * Handles all GraphQL operations for Shopify Admin API
 * with automatic cost management and error handling
 */

const axios = require('axios');

const SHOPIFY_API_VERSION = '2024-10';
const THROTTLE_THRESHOLD = 50; // Back off when available points drop below this
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second

class ShopifyGraphQLClient {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.apiUrl = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    this.lastThrottleStatus = null;
  }

  /**
   * Execute a GraphQL query/mutation with automatic throttling
   * @param {string} query - GraphQL query or mutation
   * @param {object} variables - Query/mutation variables
   * @returns {Promise<object>} - GraphQL response data
   */
  async execute(query, variables = {}) {
    let retries = 0;
    let backoff = INITIAL_BACKOFF;

    while (retries < MAX_RETRIES) {
      try {
        const response = await axios.post(
          this.apiUrl,
          { query, variables },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': this.accessToken,
            },
          }
        );

        const { data, errors, extensions } = response.data;

        // Handle GraphQL errors
        if (errors && errors.length > 0) {
          const errorMessages = errors.map(e => e.message).join(', ');
          throw new Error(`GraphQL errors: ${errorMessages}`);
        }

        // Check throttle status and auto-throttle if needed
        if (extensions?.cost?.throttleStatus) {
          this.lastThrottleStatus = extensions.cost.throttleStatus;
          const { currentlyAvailable, maximumAvailable } = extensions.cost.throttleStatus;
          
          console.log(`GraphQL Cost: ${extensions.cost.actualQueryCost}/${extensions.cost.requestedQueryCost} | Available: ${currentlyAvailable}/${maximumAvailable}`);
          
          if (currentlyAvailable < THROTTLE_THRESHOLD) {
            const waitTime = Math.ceil((THROTTLE_THRESHOLD - currentlyAvailable) * 100);
            console.log(`Throttling: Only ${currentlyAvailable} points available. Waiting ${waitTime}ms...`);
            await this.sleep(waitTime);
          }
        }

        return data;
      } catch (error) {
        // Handle rate limiting (429) or server errors (5xx)
        if (error.response?.status === 429 || error.response?.status >= 500) {
          retries++;
          if (retries >= MAX_RETRIES) {
            throw error;
          }
          console.log(`Request failed (${error.response?.status}). Retry ${retries}/${MAX_RETRIES} after ${backoff}ms...`);
          await this.sleep(backoff);
          backoff *= 2; // Exponential backoff
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Handle user errors from mutations
   * @param {array} userErrors - User errors from mutation response
   * @throws {Error} if there are user errors
   */
  handleUserErrors(userErrors) {
    if (userErrors && userErrors.length > 0) {
      const errorMessages = userErrors.map(e => `${e.field}: ${e.message}`).join(', ');
      throw new Error(`Mutation failed: ${errorMessages}`);
    }
  }

  /**
   * Sleep helper for throttling
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current throttle status
   * @returns {object|null} Last known throttle status
   */
  getThrottleStatus() {
    return this.lastThrottleStatus;
  }
}

module.exports = ShopifyGraphQLClient;