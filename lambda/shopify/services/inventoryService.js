/**
 * Inventory Service
 * Handles all inventory operations using GraphQL or REST based on feature flag
 */

const ShopifyGraphQLClient = require('../gqlClient');
const queries = require('../queries');
const mutations = require('../mutations');
const { graphQLInventoryToREST, extractNumericId } = require('../mappers/productMapper');
const axios = require('axios');

// Feature flag - can be overridden by environment variable
const USE_GRAPHQL = process.env.USE_GRAPHQL_PRODUCTS !== 'false';
const SHOPIFY_API_VERSION = '2024-07';

class InventoryService {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.gqlClient = new ShopifyGraphQLClient(shop, accessToken);
    this.restBaseUrl = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}`;
  }

  /**
   * Fetch locations
   * @returns {Promise<array>} - Array of locations
   */
  async fetchLocations() {
    if (USE_GRAPHQL) {
      return this.fetchLocationsGraphQL();
    } else {
      return this.fetchLocationsREST();
    }
  }

  async fetchLocationsGraphQL() {
    const data = await this.gqlClient.execute(queries.LOCATIONS_QUERY, {
      first: 100
    });

    return data.locations.edges.map(edge => {
      const location = edge.node;
      return {
        id: extractNumericId(location.id),
        name: location.name,
        address1: location.address?.address1 || null,
        address2: location.address?.address2 || null,
        city: location.address?.city || null,
        province: location.address?.province || null,
        country: location.address?.country || null,
        zip: location.address?.zip || null,
        phone: location.phone || null,
        active: location.isActive,
        legacy: false,
        country_code: location.address?.countryCode || null,
        province_code: location.address?.provinceCode || null,
        admin_graphql_api_id: location.id
      };
    });
  }

  async fetchLocationsREST() {
    const response = await axios.get(
      `${this.restBaseUrl}/locations.json`,
      {
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.locations || [];
  }

  /**
   * Fetch inventory levels for specific locations
   * @param {array} locationIds - Array of location IDs
   * @param {object} options - Query options
   * @returns {Promise<array>} - Array of inventory levels
   */
  async fetchInventoryLevels(locationIds, options = {}) {
    if (USE_GRAPHQL) {
      return this.fetchInventoryLevelsGraphQL(locationIds, options);
    } else {
      return this.fetchInventoryLevelsREST(locationIds, options);
    }
  }

  async fetchInventoryLevelsGraphQL(locationIds, { limit = 250 } = {}) {
    // Convert numeric IDs to GIDs if needed
    const gids = locationIds.map(id => 
      id.startsWith('gid://') ? id : `gid://shopify/Location/${id}`
    );

    const allInventory = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage && allInventory.length < limit) {
      const data = await this.gqlClient.execute(queries.INVENTORY_LEVELS_QUERY, {
        locationIds: gids,
        first: Math.min(50, limit - allInventory.length),
        after: cursor
      });

      for (const edge of data.inventoryItems.edges) {
        const item = edge.node;
        for (const levelEdge of item.inventoryLevels.edges) {
          const level = levelEdge.node;
          allInventory.push({
            inventory_item_id: extractNumericId(item.id),
            location_id: extractNumericId(level.location.id),
            available: level.available,
            updated_at: level.updatedAt
          });
        }
      }

      hasNextPage = data.inventoryItems.pageInfo.hasNextPage;
      cursor = data.inventoryItems.pageInfo.endCursor;
    }

    return allInventory;
  }

  async fetchInventoryLevelsREST(locationIds, { limit = 250 } = {}) {
    const params = new URLSearchParams({
      location_ids: locationIds.join(','),
      limit: Math.min(limit, 250)
    });

    const response = await axios.get(
      `${this.restBaseUrl}/inventory_levels.json?${params}`,
      {
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.inventory_levels || [];
  }

  /**
   * Adjust inventory quantities
   * @param {array} adjustments - Array of adjustments
   * @returns {Promise<object>} - Adjustment result
   */
  async adjustInventoryQuantities(adjustments) {
    if (USE_GRAPHQL) {
      return this.adjustInventoryQuantitiesGraphQL(adjustments);
    } else {
      return this.adjustInventoryQuantitiesREST(adjustments);
    }
  }

  async adjustInventoryQuantitiesGraphQL(adjustments) {
    const input = {
      reason: "adjustment",
      name: "API Adjustment",
      changes: adjustments.map(adj => ({
        inventoryItemId: adj.inventory_item_id.startsWith('gid://') 
          ? adj.inventory_item_id 
          : `gid://shopify/InventoryItem/${adj.inventory_item_id}`,
        locationId: adj.location_id.startsWith('gid://') 
          ? adj.location_id 
          : `gid://shopify/Location/${adj.location_id}`,
        delta: adj.available_adjustment
      }))
    };

    const data = await this.gqlClient.execute(mutations.INVENTORY_ADJUST_MUTATION, {
      input
    });

    if (data.inventoryAdjustQuantities.userErrors && 
        data.inventoryAdjustQuantities.userErrors.length > 0) {
      this.gqlClient.handleUserErrors(data.inventoryAdjustQuantities.userErrors);
    }

    return data.inventoryAdjustQuantities.inventoryAdjustmentGroup;
  }

  async adjustInventoryQuantitiesREST(adjustments) {
    // REST API requires individual calls for each adjustment
    const results = [];

    for (const adjustment of adjustments) {
      const response = await axios.post(
        `${this.restBaseUrl}/inventory_levels/adjust.json`,
        {
          location_id: adjustment.location_id,
          inventory_item_id: adjustment.inventory_item_id,
          available_adjustment: adjustment.available_adjustment
        },
        {
          headers: {
            'X-Shopify-Access-Token': this.accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      results.push(response.data.inventory_level);
    }

    return results;
  }

  /**
   * Set inventory quantities (absolute values)
   * @param {array} quantities - Array of quantity settings
   * @returns {Promise<object>} - Set result
   */
  async setInventoryQuantities(quantities) {
    if (USE_GRAPHQL) {
      return this.setInventoryQuantitiesGraphQL(quantities);
    } else {
      return this.setInventoryQuantitiesREST(quantities);
    }
  }

  async setInventoryQuantitiesGraphQL(quantities) {
    const input = {
      reason: "correction",
      name: "API Set",
      quantities: quantities.map(q => ({
        inventoryItemId: q.inventory_item_id.startsWith('gid://') 
          ? q.inventory_item_id 
          : `gid://shopify/InventoryItem/${q.inventory_item_id}`,
        locationId: q.location_id.startsWith('gid://') 
          ? q.location_id 
          : `gid://shopify/Location/${q.location_id}`,
        quantity: q.available
      }))
    };

    const data = await this.gqlClient.execute(mutations.INVENTORY_SET_MUTATION, {
      input
    });

    if (data.inventorySetOnHandQuantities.userErrors && 
        data.inventorySetOnHandQuantities.userErrors.length > 0) {
      this.gqlClient.handleUserErrors(data.inventorySetOnHandQuantities.userErrors);
    }

    return data.inventorySetOnHandQuantities.inventoryAdjustmentGroup;
  }

  async setInventoryQuantitiesREST(quantities) {
    // REST API requires individual calls for each set operation
    const results = [];

    for (const quantity of quantities) {
      const response = await axios.post(
        `${this.restBaseUrl}/inventory_levels/set.json`,
        {
          location_id: quantity.location_id,
          inventory_item_id: quantity.inventory_item_id,
          available: quantity.available
        },
        {
          headers: {
            'X-Shopify-Access-Token': this.accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      results.push(response.data.inventory_level);
    }

    return results;
  }
}

module.exports = InventoryService;