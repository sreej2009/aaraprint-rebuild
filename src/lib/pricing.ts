import type { OptionGroup, Product, Variant } from '@/lib/catalogue/types';

/** Selected value id per option group id. */
export type Selection = Record<string, string>;

const QUANTITY_GROUP = 'Quantity';

/** The default selection: the default variant's values, or the first value of each group. */
export function defaultSelection(product: Pick<Product, 'optionGroups' | 'variants'>): Selection {
  const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const selection: Selection = {};
  for (const group of product.optionGroups) {
    const fromVariant = variant ? group.values.find((value) => variant.optionValueIds.includes(value.id)) : undefined;
    const value = fromVariant ?? group.values[0];
    if (value) selection[group.id] = value.id;
  }
  return selection;
}

/** The variant (SKU) matching one value per option group, or undefined if the combination doesn't exist. */
export function resolveVariant(product: Pick<Product, 'optionGroups' | 'variants'>, selection: Selection): Variant | undefined {
  const wanted = product.optionGroups.map((group) => selection[group.id]);
  if (wanted.some((id) => id === undefined)) return undefined;
  const key = [...(wanted as string[])].sort().join('|');
  return product.variants.find((variant) => variant.optionValueIds.join('|') === key);
}

/** Price the original catalogue rule produces: base price plus every selected value's delta. */
export function computedPriceCents(product: Pick<Product, 'basePriceCents' | 'optionGroups'>, selection: Selection): number {
  return product.optionGroups.reduce((total, group) => {
    const value = group.values.find((v) => v.id === selection[group.id]);
    return total + (value?.priceDeltaCents ?? 0);
  }, product.basePriceCents);
}

export interface QuantityTier {
  valueId: string;
  label: string;
  quantity: number;
  totalCents: number;
  /** Per unit, in paise; may be fractional. */
  unitCents: number;
  /** Per-unit saving against the smallest tier, rounded down. */
  savingsPercent: number;
  available: boolean;
}

export function quantityGroup(product: Pick<Product, 'optionGroups'>): OptionGroup | undefined {
  return product.optionGroups.find((group) => group.name === QUANTITY_GROUP && group.values.every((v) => v.quantity));
}

/**
 * Every quantity tier priced with the other options as currently selected.
 * Powers the tier picker that replaces the original "quantity price breaks" table.
 */
export function quantityTiers(product: Pick<Product, 'optionGroups' | 'variants'>, selection: Selection): QuantityTier[] {
  const group = quantityGroup(product);
  if (!group) return [];
  const tiers = group.values.map((value) => {
    const variant = resolveVariant(product, { ...selection, [group.id]: value.id });
    const quantity = value.quantity ?? 1;
    const totalCents = variant?.priceCents ?? 0;
    return {
      valueId: value.id,
      label: value.label,
      quantity,
      totalCents,
      unitCents: totalCents / quantity,
      savingsPercent: 0,
      available: Boolean(variant) && variant?.stockStatus !== 'out_of_stock',
    };
  });
  const baseline = tiers.find((tier) => tier.available)?.unitCents ?? 0;
  for (const tier of tiers) {
    tier.savingsPercent = baseline > 0 && tier.unitCents < baseline ? Math.floor(((baseline - tier.unitCents) / baseline) * 100) : 0;
  }
  return tiers;
}
