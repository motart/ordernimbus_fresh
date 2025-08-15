/**
 * Order Service
 * Handles all order operations using GraphQL
 */

const ShopifyGraphQLClient = require('../gqlClient');
const queries = require('../queries');
const { extractNumericId } = require('../mappers/productMapper');

// Always use GraphQL for orders
const SHOPIFY_API_VERSION = '2024-10'; // Updated for new Product APIs;

class OrderService {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.gqlClient = new ShopifyGraphQLClient(shop, accessToken);
  }

  /**
   * Fetch orders with pagination
   * @param {object} options - Query options
   * @param {number} options.limit - Number of orders to fetch (default 50)
   * @param {string} options.after - Cursor for pagination
   * @param {Date} options.sinceDate - Fetch orders created after this date
   * @returns {Promise<object>} - Orders and pagination info
   */
  async fetchOrdersPage({ limit = 50, after = null, sinceDate = null } = {}) {
    // Build query filter
    let query = '';
    if (sinceDate) {
      const dateStr = sinceDate.toISOString().split('T')[0];
      query = `created_at:>'${dateStr}'`;
    }

    const data = await this.gqlClient.execute(queries.ORDERS_QUERY, {
      first: Math.min(limit, 250),
      after,
      query: query || null
    });

    const orders = data.orders.edges.map(edge => 
      this.graphQLOrderToREST(edge.node)
    );

    return {
      orders,
      pageInfo: {
        hasNextPage: data.orders.pageInfo.hasNextPage,
        endCursor: data.orders.pageInfo.endCursor
      }
    };
  }

  /**
   * Fetch all orders for a date range
   * @param {object} options - Query options
   * @param {Date} options.sinceDate - Start date
   * @param {number} options.maxOrders - Maximum orders to fetch
   * @returns {Promise<array>} - Array of all orders
   */
  async fetchAllOrders({ sinceDate = null, maxOrders = 10000 } = {}) {
    const allOrders = [];
    let hasNextPage = true;
    let cursor = null;
    const pageSize = 250;

    while (hasNextPage && allOrders.length < maxOrders) {
      const { orders, pageInfo } = await this.fetchOrdersPage({
        limit: pageSize,
        after: cursor,
        sinceDate
      });

      allOrders.push(...orders);
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;

      if (allOrders.length >= maxOrders) {
        return allOrders.slice(0, maxOrders);
      }
    }

    return allOrders;
  }

  /**
   * Convert GraphQL order to REST format
   * @param {object} gqlOrder - Order from GraphQL API
   * @returns {object} - Order in REST API format
   */
  graphQLOrderToREST(gqlOrder) {
    if (!gqlOrder) return null;

    // Map line items
    const lineItems = (gqlOrder.lineItems?.edges || []).map(edge => {
      const item = edge.node;
      return {
        id: extractNumericId(item.id),
        product_id: item.product ? extractNumericId(item.product.id) : null,
        variant_id: item.variant ? extractNumericId(item.variant.id) : null,
        title: item.title,
        quantity: item.quantity,
        price: item.variant?.price || '0',
        sku: item.variant?.sku || '',
        variant_title: item.variant?.title || '',
        vendor: null,
        fulfillment_service: 'manual',
        product_exists: item.product !== null,
        fulfillable_quantity: item.quantity,
        grams: 0,
        total_discount: '0.00',
        fulfillment_status: null,
        tax_lines: [],
        origin_location: null,
        destination_location: null
      };
    });

    // Map customer
    const customer = gqlOrder.customer ? {
      id: extractNumericId(gqlOrder.customer.id),
      email: gqlOrder.customer.email,
      first_name: gqlOrder.customer.firstName,
      last_name: gqlOrder.customer.lastName,
      phone: gqlOrder.customer.phone,
      admin_graphql_api_id: gqlOrder.customer.id
    } : null;

    // Map addresses
    const mapAddress = (addr) => addr ? {
      first_name: addr.firstName || '',
      last_name: addr.lastName || '',
      address1: addr.address1 || '',
      address2: addr.address2 || '',
      phone: addr.phone || '',
      city: addr.city || '',
      zip: addr.zip || '',
      province: addr.province || '',
      country: addr.country || '',
      province_code: addr.provinceCode || '',
      country_code: addr.countryCode || ''
    } : null;

    return {
      id: extractNumericId(gqlOrder.id),
      name: gqlOrder.name,
      email: gqlOrder.email || '',
      created_at: gqlOrder.createdAt,
      updated_at: gqlOrder.updatedAt,
      closed_at: gqlOrder.closedAt || null,
      confirmed: true,
      total_price: gqlOrder.totalPriceSet?.shopMoney?.amount || '0.00',
      subtotal_price: gqlOrder.subtotalPriceSet?.shopMoney?.amount || '0.00',
      total_tax: gqlOrder.totalTaxSet?.shopMoney?.amount || '0.00',
      taxes_included: false,
      currency: gqlOrder.totalPriceSet?.shopMoney?.currencyCode || 'USD',
      financial_status: gqlOrder.displayFinancialStatus?.toLowerCase() || 'pending',
      fulfillment_status: gqlOrder.displayFulfillmentStatus?.toLowerCase() || null,
      return_status: gqlOrder.returnStatus?.toLowerCase() || null,
      processing_method: 'direct',
      source_name: 'web',
      line_items: lineItems,
      customer,
      billing_address: mapAddress(gqlOrder.billingAddress),
      shipping_address: mapAddress(gqlOrder.shippingAddress),
      fulfillments: [],
      refunds: [],
      payment_details: null,
      shipping_lines: [],
      tax_lines: [],
      tags: '',
      note: null,
      note_attributes: [],
      discount_codes: [],
      admin_graphql_api_id: gqlOrder.id
    };
  }
}

module.exports = OrderService;