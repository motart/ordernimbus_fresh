/**
 * Shop Service
 * Handles shop information queries using GraphQL
 */

const ShopifyGraphQLClient = require('../gqlClient');
const queries = require('../queries');
const { extractNumericId } = require('../mappers/productMapper');

const SHOPIFY_API_VERSION = '2024-07';

class ShopService {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.gqlClient = new ShopifyGraphQLClient(shop, accessToken);
  }

  /**
   * Fetch shop information
   * @returns {Promise<object>} - Shop data in REST format
   */
  async fetchShopInfo() {
    const data = await this.gqlClient.execute(queries.SHOP_QUERY);
    return this.graphQLShopToREST(data.shop);
  }

  /**
   * Convert GraphQL shop to REST format
   * @param {object} gqlShop - Shop from GraphQL API
   * @returns {object} - Shop in REST API format
   */
  graphQLShopToREST(gqlShop) {
    if (!gqlShop) return null;

    return {
      id: extractNumericId(gqlShop.id),
      name: gqlShop.name,
      email: gqlShop.email,
      domain: gqlShop.primaryDomain?.host || '',
      province: gqlShop.billingAddress?.province || '',
      country: gqlShop.billingAddress?.country || '',
      address1: gqlShop.billingAddress?.address1 || '',
      zip: gqlShop.billingAddress?.zip || '',
      city: gqlShop.billingAddress?.city || '',
      source: null,
      phone: gqlShop.billingAddress?.phone || '',
      latitude: null,
      longitude: null,
      primary_locale: 'en',
      address2: gqlShop.billingAddress?.address2 || '',
      created_at: gqlShop.createdAt,
      updated_at: gqlShop.updatedAt,
      country_code: gqlShop.billingAddress?.country || '',
      country_name: gqlShop.billingAddress?.country || '',
      currency: gqlShop.currencyCode,
      customer_email: gqlShop.email,
      timezone: gqlShop.timezoneAbbreviation || '',
      iana_timezone: gqlShop.timezoneAbbreviation || '',
      shop_owner: gqlShop.name,
      money_format: `${{amount}}`,
      money_with_currency_format: `${{amount}} ${gqlShop.currencyCode}`,
      weight_unit: gqlShop.weightUnit?.toLowerCase() || 'kg',
      province_code: gqlShop.billingAddress?.province || '',
      taxes_included: gqlShop.taxesIncluded || false,
      auto_configure_tax_inclusivity: null,
      tax_shipping: gqlShop.taxShipping || false,
      county_taxes: true,
      plan_display_name: gqlShop.plan?.displayName || '',
      plan_name: gqlShop.plan?.displayName?.toLowerCase() || '',
      has_discounts: true,
      has_gift_cards: true,
      myshopify_domain: gqlShop.myshopifyDomain,
      google_apps_domain: null,
      google_apps_login_enabled: null,
      money_in_emails_format: `${{amount}}`,
      money_with_currency_in_emails_format: `${{amount}} ${gqlShop.currencyCode}`,
      eligible_for_payments: true,
      requires_extra_payments_agreement: false,
      password_enabled: false,
      has_storefront: true,
      finances: true,
      primary_location_id: null,
      cookie_consent_level: 'implicit',
      visitor_tracking_consent_preference: 'allow_all',
      checkout_api_supported: gqlShop.checkoutApiSupported || false,
      multi_location_enabled: gqlShop.multiLocationEnabled || false,
      setup_required: gqlShop.setupRequired || false,
      pre_launch_enabled: false,
      enabled_presentment_currencies: [gqlShop.currencyCode],
      transactional_sms_disabled: false,
      marketing_sms_consent_enabled_at_checkout: false,
      admin_graphql_api_id: gqlShop.id
    };
  }
}

module.exports = ShopService;