/**
 * Product workflow domain (Phase 4 M1): product families, options, capabilities, the product
 * configuration saved in designs, and variant/price resolution. Data and pure functions only.
 */
export * from './types';
export { PRODUCT_FAMILIES, ORIGINAL_PRICING_BEHAVIOURS } from './families';
export { bindCatalogueOptions, catalogueGroupForRole, familyDefinition, familyIdForSlug, listFamilies, productWorkflow, registeredSlugs, type BoundCatalogueOption, type ProductWorkflow } from './registry';
export {
  clampQuantity,
  emptyConfiguration,
  initialConfiguration,
  MAX_ORDER_QUANTITY,
  MIN_ORDER_QUANTITY,
  ORIENTATIONS,
  sameChoice,
  selectionOfVariant,
  type InitialConfigurationInput,
  type Orientation,
  type ProductConfiguration,
  type StudioChoice,
} from './configuration';
export { resolvePrice, studioAdjustments, variantForConfiguration, type CatalogueForPricing, type PriceAdjustment, type ResolvedPrice } from './pricing';
