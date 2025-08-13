/**
 * Product Mapper
 * Converts between Shopify REST and GraphQL formats
 * Maintains backward compatibility with existing code
 */

/**
 * Extract numeric ID from GraphQL global ID
 * @param {string} gid - GraphQL ID like "gid://shopify/Product/123"
 * @returns {string} - Numeric ID like "123"
 */
function extractNumericId(gid) {
  if (!gid) return null;
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
}

/**
 * Convert GraphQL product to REST format
 * @param {object} gqlProduct - Product from GraphQL API
 * @returns {object} - Product in REST API format
 */
function graphQLProductToREST(gqlProduct) {
  if (!gqlProduct) return null;

  // Map variants
  const variants = (gqlProduct.variants?.edges || []).map(edge => {
    const variant = edge.node;
    return {
      id: extractNumericId(variant.id),
      product_id: extractNumericId(gqlProduct.id),
      title: variant.title,
      price: variant.price,
      sku: variant.sku || '',
      position: variant.position || 1,
      inventory_policy: variant.inventoryPolicy?.toLowerCase() || 'deny',
      compare_at_price: variant.compareAtPrice || null,
      fulfillment_service: variant.fulfillmentService || 'manual',
      inventory_management: variant.inventoryManagement?.toLowerCase() || null,
      option1: variant.selectedOptions?.[0]?.value || null,
      option2: variant.selectedOptions?.[1]?.value || null,
      option3: variant.selectedOptions?.[2]?.value || null,
      created_at: variant.createdAt,
      updated_at: variant.updatedAt,
      taxable: variant.taxable || true,
      barcode: variant.barcode || null,
      grams: variant.weight ? Math.round(variant.weight * 1000) : 0, // Convert kg to grams
      weight: variant.weight || 0,
      weight_unit: variant.weightUnit?.toLowerCase() || 'kg',
      inventory_item_id: variant.inventoryItem?.id ? extractNumericId(variant.inventoryItem.id) : null,
      inventory_quantity: variant.inventoryQuantity || 0,
      old_inventory_quantity: variant.inventoryQuantity || 0,
      requires_shipping: variant.requiresShipping !== false,
      admin_graphql_api_id: variant.id,
      image_id: variant.image?.id ? extractNumericId(variant.image.id) : null
    };
  });

  // Map images
  const images = (gqlProduct.images?.edges || []).map((edge, index) => {
    const image = edge.node;
    return {
      id: extractNumericId(image.id),
      product_id: extractNumericId(gqlProduct.id),
      position: index + 1,
      created_at: image.createdAt || gqlProduct.createdAt,
      updated_at: image.updatedAt || gqlProduct.updatedAt,
      alt: image.altText || null,
      width: image.width || null,
      height: image.height || null,
      src: image.url || image.src,
      variant_ids: [],
      admin_graphql_api_id: image.id
    };
  });

  // Map options
  const options = (gqlProduct.options || []).map(option => ({
    id: extractNumericId(option.id),
    product_id: extractNumericId(gqlProduct.id),
    name: option.name,
    position: option.position,
    values: option.values || []
  }));

  return {
    id: extractNumericId(gqlProduct.id),
    title: gqlProduct.title,
    body_html: gqlProduct.descriptionHtml || '',
    vendor: gqlProduct.vendor || '',
    product_type: gqlProduct.productType || '',
    created_at: gqlProduct.createdAt,
    handle: gqlProduct.handle,
    updated_at: gqlProduct.updatedAt,
    published_at: gqlProduct.publishedAt,
    template_suffix: gqlProduct.templateSuffix || null,
    published_scope: gqlProduct.publishedScope || 'web',
    tags: Array.isArray(gqlProduct.tags) ? gqlProduct.tags.join(', ') : (gqlProduct.tags || ''),
    status: gqlProduct.status?.toLowerCase() || 'active',
    admin_graphql_api_id: gqlProduct.id,
    variants,
    options,
    images,
    image: gqlProduct.featuredImage ? {
      id: extractNumericId(gqlProduct.featuredImage.id),
      product_id: extractNumericId(gqlProduct.id),
      position: 1,
      created_at: gqlProduct.createdAt,
      updated_at: gqlProduct.updatedAt,
      alt: gqlProduct.featuredImage.altText || null,
      width: gqlProduct.featuredImage.width || null,
      height: gqlProduct.featuredImage.height || null,
      src: gqlProduct.featuredImage.url,
      variant_ids: [],
      admin_graphql_api_id: gqlProduct.featuredImage.id
    } : null
  };
}

/**
 * Convert REST product to GraphQL input format
 * @param {object} restProduct - Product in REST API format
 * @returns {object} - Product input for GraphQL mutations
 */
function restProductToGraphQLInput(restProduct) {
  if (!restProduct) return null;

  const input = {
    title: restProduct.title,
    descriptionHtml: restProduct.body_html || '',
    vendor: restProduct.vendor || '',
    productType: restProduct.product_type || '',
    tags: Array.isArray(restProduct.tags) ? restProduct.tags : (restProduct.tags ? restProduct.tags.split(',').map(t => t.trim()) : []),
    status: restProduct.status ? restProduct.status.toUpperCase() : 'ACTIVE',
    handle: restProduct.handle
  };

  // Add ID for updates
  if (restProduct.id) {
    input.id = `gid://shopify/Product/${restProduct.id}`;
  }

  // Map variants if provided
  if (restProduct.variants && restProduct.variants.length > 0) {
    input.variants = restProduct.variants.map(variant => ({
      price: variant.price,
      sku: variant.sku || '',
      barcode: variant.barcode || '',
      weight: variant.weight || variant.grams ? variant.grams / 1000 : 0,
      weightUnit: variant.weight_unit ? variant.weight_unit.toUpperCase() : 'KILOGRAMS',
      inventoryPolicy: variant.inventory_policy ? variant.inventory_policy.toUpperCase() : 'DENY',
      inventoryManagement: variant.inventory_management ? variant.inventory_management.toUpperCase() : null,
      fulfillmentService: variant.fulfillment_service || 'MANUAL',
      requiresShipping: variant.requires_shipping !== false,
      taxable: variant.taxable !== false,
      compareAtPrice: variant.compare_at_price || null,
      options: [
        variant.option1,
        variant.option2,
        variant.option3
      ].filter(Boolean)
    }));
  }

  // Map options if provided
  if (restProduct.options && restProduct.options.length > 0) {
    input.options = restProduct.options.map(option => option.name);
  }

  // Map images if provided
  if (restProduct.images && restProduct.images.length > 0) {
    input.images = restProduct.images.map(image => ({
      altText: image.alt || '',
      src: image.src
    }));
  }

  return input;
}

/**
 * Convert GraphQL variant to REST format
 * @param {object} gqlVariant - Variant from GraphQL API
 * @param {string} productId - Parent product ID
 * @returns {object} - Variant in REST API format
 */
function graphQLVariantToREST(gqlVariant, productId) {
  if (!gqlVariant) return null;

  return {
    id: extractNumericId(gqlVariant.id),
    product_id: productId ? extractNumericId(productId) : null,
    title: gqlVariant.title,
    price: gqlVariant.price,
    sku: gqlVariant.sku || '',
    position: gqlVariant.position || 1,
    inventory_policy: gqlVariant.inventoryPolicy?.toLowerCase() || 'deny',
    compare_at_price: gqlVariant.compareAtPrice || null,
    fulfillment_service: gqlVariant.fulfillmentService || 'manual',
    inventory_management: gqlVariant.inventoryManagement?.toLowerCase() || null,
    option1: gqlVariant.selectedOptions?.[0]?.value || null,
    option2: gqlVariant.selectedOptions?.[1]?.value || null,
    option3: gqlVariant.selectedOptions?.[2]?.value || null,
    created_at: gqlVariant.createdAt,
    updated_at: gqlVariant.updatedAt,
    taxable: gqlVariant.taxable || true,
    barcode: gqlVariant.barcode || null,
    grams: gqlVariant.weight ? Math.round(gqlVariant.weight * 1000) : 0,
    weight: gqlVariant.weight || 0,
    weight_unit: gqlVariant.weightUnit?.toLowerCase() || 'kg',
    inventory_item_id: gqlVariant.inventoryItem?.id ? extractNumericId(gqlVariant.inventoryItem.id) : null,
    inventory_quantity: gqlVariant.inventoryQuantity || 0,
    old_inventory_quantity: gqlVariant.inventoryQuantity || 0,
    requires_shipping: gqlVariant.requiresShipping !== false,
    admin_graphql_api_id: gqlVariant.id,
    image_id: gqlVariant.image?.id ? extractNumericId(gqlVariant.image.id) : null
  };
}

/**
 * Convert REST variant to GraphQL input format
 * @param {object} restVariant - Variant in REST API format
 * @returns {object} - Variant input for GraphQL mutations
 */
function restVariantToGraphQLInput(restVariant) {
  if (!restVariant) return null;

  const input = {
    price: restVariant.price,
    sku: restVariant.sku || '',
    barcode: restVariant.barcode || '',
    weight: restVariant.weight || (restVariant.grams ? restVariant.grams / 1000 : 0),
    weightUnit: restVariant.weight_unit ? restVariant.weight_unit.toUpperCase() : 'KILOGRAMS',
    inventoryPolicy: restVariant.inventory_policy ? restVariant.inventory_policy.toUpperCase() : 'DENY',
    inventoryManagement: restVariant.inventory_management ? restVariant.inventory_management.toUpperCase() : null,
    fulfillmentService: restVariant.fulfillment_service || 'MANUAL',
    requiresShipping: restVariant.requires_shipping !== false,
    taxable: restVariant.taxable !== false,
    compareAtPrice: restVariant.compare_at_price || null
  };

  // Add ID for updates
  if (restVariant.id) {
    input.id = `gid://shopify/ProductVariant/${restVariant.id}`;
  }

  // Add options if provided
  if (restVariant.option1 || restVariant.option2 || restVariant.option3) {
    input.options = [
      restVariant.option1,
      restVariant.option2,
      restVariant.option3
    ].filter(Boolean);
  }

  return input;
}

/**
 * Convert GraphQL inventory level to REST format
 * @param {object} gqlInventory - Inventory from GraphQL API
 * @returns {object} - Inventory in REST API format
 */
function graphQLInventoryToREST(gqlInventory) {
  if (!gqlInventory) return null;

  return {
    inventory_item_id: extractNumericId(gqlInventory.id),
    location_id: gqlInventory.inventoryLevels?.edges?.[0]?.node?.location?.id 
      ? extractNumericId(gqlInventory.inventoryLevels.edges[0].node.location.id) 
      : null,
    available: gqlInventory.inventoryLevels?.edges?.[0]?.node?.available || 0,
    updated_at: gqlInventory.inventoryLevels?.edges?.[0]?.node?.updatedAt || new Date().toISOString()
  };
}

module.exports = {
  extractNumericId,
  graphQLProductToREST,
  restProductToGraphQLInput,
  graphQLVariantToREST,
  restVariantToGraphQLInput,
  graphQLInventoryToREST
};