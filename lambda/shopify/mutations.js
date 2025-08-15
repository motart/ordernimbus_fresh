/**
 * Shopify GraphQL Mutations
 * API Version: 2024-10 (Updated for new Product APIs)
 */

const PRODUCT_CREATE_MUTATION = `
  mutation ProductCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        title
        handle
        status
        vendor
        productType
        createdAt
        updatedAt
        variants(first: 100) {
          edges {
            node {
              id
              title
              sku
              price
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        handle
        status
        vendor
        productType
        updatedAt
        variants(first: 100) {
          edges {
            node {
              id
              title
              sku
              price
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_DELETE_MUTATION = `
  mutation ProductDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_VARIANT_CREATE_MUTATION = `
  mutation ProductVariantCreate($productId: ID!, $variants: [ProductVariantInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants {
        id
        title
        sku
        price
        compareAtPrice
        barcode
        weight
        weightUnit
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_VARIANT_UPDATE_MUTATION = `
  mutation ProductVariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        title
        sku
        price
        compareAtPrice
        barcode
        weight
        weightUnit
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_VARIANT_DELETE_MUTATION = `
  mutation ProductVariantDelete($id: ID!) {
    productVariantDelete(id: $id) {
      deletedProductVariantId
      product {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const INVENTORY_ADJUST_MUTATION = `
  mutation InventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) {
      inventoryAdjustmentGroup {
        id
        createdAt
        reason
        changes {
          name
          delta
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const INVENTORY_SET_MUTATION = `
  mutation InventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetOnHandQuantities(input: $input) {
      inventoryAdjustmentGroup {
        id
        createdAt
        reason
        changes {
          name
          delta
          quantityAfterChange
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

module.exports = {
  PRODUCT_CREATE_MUTATION,
  PRODUCT_UPDATE_MUTATION,
  PRODUCT_DELETE_MUTATION,
  PRODUCT_VARIANT_CREATE_MUTATION,
  PRODUCT_VARIANT_UPDATE_MUTATION,
  PRODUCT_VARIANT_DELETE_MUTATION,
  INVENTORY_ADJUST_MUTATION,
  INVENTORY_SET_MUTATION
};