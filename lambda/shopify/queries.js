/**
 * Shopify GraphQL Queries
 * API Version: 2024-07
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
                inventoryQuantity
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
            inventoryQuantity
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
            inventoryQuantity
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

module.exports = {
  PRODUCTS_QUERY,
  PRODUCT_BY_ID_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
  INVENTORY_LEVELS_QUERY,
  LOCATIONS_QUERY
};