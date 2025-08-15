/**
 * Shopify GraphQL Queries
 * API Version: 2024-10 (Updated to support new Product APIs)
 * Updated: December 2024 - Removed deprecated fields per Shopify's deprecation timeline
 */

const PRODUCTS_QUERY = `
  query ProductsWithVariants($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          status
          vendor
          productType
          createdAt
          updatedAt
          publishedAt
          tags
          descriptionHtml
          totalInventory
          tracksInventory
          onlineStoreUrl
          featuredImage {
            url
            altText
          }
          images(first: 10) {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                barcode
                weight
                weightUnit
                inventoryPolicy
                inventoryManagement
                fulfillmentService
                taxable
                requiresShipping
                selectedOptions {
                  name
                  value
                }
                image {
                  url
                  altText
                }
                inventoryItem {
                  id
                  tracked
                  inventoryLevels(first: 10) {
                    edges {
                      node {
                        id
                        available
                        location {
                          id
                          name
                        }
                      }
                    }
                  }
                }
                createdAt
                updatedAt
              }
            }
          }
          options {
            id
            name
            position
            values
          }
        }
      }
    }
  }
`;

const PRODUCT_BY_ID_QUERY = `
  query ProductById($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      vendor
      productType
      createdAt
      updatedAt
      publishedAt
      tags
      descriptionHtml
      totalInventory
      tracksInventory
      onlineStoreUrl
      featuredImage {
        url
        altText
      }
      images(first: 10) {
        edges {
          node {
            id
            url
            altText
          }
        }
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            price
            compareAtPrice
            barcode
            weight
            weightUnit
            inventoryPolicy
            inventoryManagement
            fulfillmentService
            taxable
            requiresShipping
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
            }
            inventoryItem {
              id
              tracked
              inventoryLevels(first: 10) {
                edges {
                  node {
                    id
                    available
                    location {
                      id
                      name
                    }
                  }
                }
              }
            }
            createdAt
            updatedAt
          }
        }
      }
      options {
        id
        name
        position
        values
      }
    }
  }
`;

const PRODUCT_BY_HANDLE_QUERY = `
  query ProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      status
      vendor
      productType
      createdAt
      updatedAt
      publishedAt
      tags
      descriptionHtml
      totalInventory
      tracksInventory
      onlineStoreUrl
      featuredImage {
        url
        altText
      }
      images(first: 10) {
        edges {
          node {
            id
            url
            altText
          }
        }
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            price
            compareAtPrice
            barcode
            weight
            weightUnit
            inventoryPolicy
            inventoryManagement
            fulfillmentService
            taxable
            requiresShipping
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
            }
            inventoryItem {
              id
              tracked
              inventoryLevels(first: 10) {
                edges {
                  node {
                    id
                    available
                    location {
                      id
                      name
                    }
                  }
                }
              }
            }
            createdAt
            updatedAt
          }
        }
      }
      options {
        id
        name
        position
        values
      }
    }
  }
`;

const INVENTORY_LEVELS_QUERY = `
  query InventoryLevels($locationIds: [ID!]!, $first: Int!, $after: String) {
    inventoryItems(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          tracked
          sku
          inventoryLevels(locationIds: $locationIds, first: 10) {
            edges {
              node {
                id
                available
                location {
                  id
                  name
                }
                updatedAt
              }
            }
          }
        }
      }
    }
  }
`;

const LOCATIONS_QUERY = `
  query Locations($first: Int!) {
    locations(first: $first) {
      edges {
        node {
          id
          name
          address {
            address1
            address2
            city
            province
            country
            zip
          }
          isActive
          isPrimary
          fulfillsOnlineOrders
        }
      }
    }
  }
`;

const SHOP_QUERY = `
  query GetShop {
    shop {
      id
      name
      email
      currencyCode
      primaryDomain {
        id
        host
        url
      }
      myshopifyDomain
      plan {
        displayName
        partnerDevelopment
        shopifyPlus
      }
      billingAddress {
        address1
        address2
        city
        province
        country
        zip
        phone
      }
      timezoneAbbreviation
      timezoneOffset
      timezoneOffsetMinutes
      weightUnit
      taxesIncluded
      taxShipping
      setupRequired
      checkoutApiSupported
      multiLocationEnabled
      createdAt
      updatedAt
    }
  }
`;

const ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          updatedAt
          displayFinancialStatus
          displayFulfillmentStatus
          returnStatus
          email
          phone
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
            }
          }
          totalTaxSet {
            shopMoney {
              amount
            }
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                quantity
                variant {
                  id
                  title
                  sku
                  price
                }
                product {
                  id
                  title
                }
                originalTotalSet {
                  shopMoney {
                    amount
                  }
                }
              }
            }
          }
          customer {
            id
            email
            firstName
            lastName
            phone
          }
          shippingAddress {
            address1
            address2
            city
            province
            country
            zip
            phone
            firstName
            lastName
          }
          billingAddress {
            address1
            address2
            city
            province
            country
            zip
            phone
            firstName
            lastName
          }
        }
      }
    }
  }
`;

module.exports = {
  PRODUCTS_QUERY,
  PRODUCT_BY_ID_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
  INVENTORY_LEVELS_QUERY,
  LOCATIONS_QUERY,
  SHOP_QUERY,
  ORDERS_QUERY
};