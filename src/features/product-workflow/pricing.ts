import type { Product, Variant } from '@/lib/catalogue/types';
import { quantityGroup, resolveVariant } from '@/lib/pricing';
import type { ProductConfiguration, StudioChoice } from './configuration';
import type { ProductWorkflow } from './registry';
import type { StudioOptionDefinition } from './types';

/**
 * Variant and price for a product configuration (Phase 4 M1). One rule everywhere — product page,
 * Studio, Review and later the cart:
 *
 *   unit price  = resolved variant price (quantity tier included) + saved Studio price adjustments
 *   total price = unit price × quantity
 *
 * Deliberately not the original's rules (see ORIGINAL_PRICING_BEHAVIOURS): its Studio showed base
 * price + deltas ignoring the tier, and its format options changed the shown price only.
 */

export type CatalogueForPricing = Pick<Product, 'optionGroups' | 'variants'>;

export interface PriceAdjustment {
  optionId: string;
  label: string;
  valueId: string;
  cents: number;
}

export type ResolvedPrice =
  | {
      status: 'priced';
      variant: Variant;
      variantId: string;
      sku: string;
      /** The variant's own price: one unit, or one set of the quantity tier. */
      variantPriceCents: number;
      adjustments: PriceAdjustment[];
      adjustmentsCents: number;
      unitPriceCents: number;
      quantity: number;
      totalPriceCents: number;
      /** Pieces in one set for tiered products ("500 cards" → 500), else null. */
      piecesPerUnit: number | null;
    }
  /** The selection doesn't name a variant (incomplete, or a combination that doesn't exist). */
  | { status: 'no-variant'; adjustments: PriceAdjustment[]; adjustmentsCents: number; quantity: number };

/** The variant named by the configuration's catalogue selection, or undefined. */
export function variantForConfiguration(product: CatalogueForPricing, configuration: Pick<ProductConfiguration, 'options'>): Variant | undefined {
  return resolveVariant(product, configuration.options);
}

/** Studio choices that carry a price (envelope and invitation formats), for the options that apply. */
export function studioAdjustments(workflow: Pick<ProductWorkflow, 'options'> | null, studio: Record<string, StudioChoice>): PriceAdjustment[] {
  if (!workflow) return [];
  const adjustments: PriceAdjustment[] = [];
  for (const option of workflow.options) {
    if (option.source !== 'studio' || !option.behaviour.affectsPrice) continue;
    const choice = studio[option.id];
    if (choice?.type !== 'choice') continue;
    const value = valuesOf(option).find((v) => v.id === choice.valueId);
    if (value?.priceDeltaCents) adjustments.push({ optionId: option.id, label: `${option.label}: ${value.label}`, valueId: value.id, cents: value.priceDeltaCents });
  }
  return adjustments;
}

export function resolvePrice(product: CatalogueForPricing, workflow: Pick<ProductWorkflow, 'options'> | null, configuration: ProductConfiguration): ResolvedPrice {
  const adjustments = studioAdjustments(workflow, configuration.studio);
  const adjustmentsCents = adjustments.reduce((sum, a) => sum + a.cents, 0);
  const quantity = configuration.quantity;
  const variant = variantForConfiguration(product, configuration);
  if (!variant) return { status: 'no-variant', adjustments, adjustmentsCents, quantity };
  const tierGroup = quantityGroup(product);
  const tier = tierGroup?.values.find((v) => v.id === configuration.options[tierGroup.id]);
  const unitPriceCents = variant.priceCents + adjustmentsCents;
  return {
    status: 'priced',
    variant,
    variantId: variant.id,
    sku: variant.sku,
    variantPriceCents: variant.priceCents,
    adjustments,
    adjustmentsCents,
    unitPriceCents,
    quantity,
    totalPriceCents: unitPriceCents * quantity,
    piecesPerUnit: tier?.quantity ?? null,
  };
}

function valuesOf(option: StudioOptionDefinition) {
  return option.values.status === 'known' ? option.values.values : [];
}
