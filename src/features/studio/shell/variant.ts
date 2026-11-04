import { selectionForVariant } from '@/features/product/selection';
import type { Product, Variant } from '@/lib/catalogue/types';
import { quantityGroup } from '@/lib/pricing';

/** The variant from `?variantId=`, or the product's default when it's missing or unknown. */
export function resolveStudioVariant(product: Pick<Product, 'variants'>, variantId: string | null): Variant | undefined {
  return product.variants.find((v) => v.id === variantId) ?? product.variants.find((v) => v.isDefault) ?? product.variants[0];
}

/**
 * Short description of the chosen options for the top bar: "500 cards · Full Colour".
 * The quantity comes first; groups with a single value add nothing and are skipped.
 */
export function variantSummary(product: Pick<Product, 'optionGroups' | 'variants'>, variant: Variant | undefined): string {
  if (!variant) return '';
  const selection = selectionForVariant(product, variant.id) ?? {};
  const qty = quantityGroup(product);
  const groups = [...product.optionGroups].sort((a, b) => Number(b.id === qty?.id) - Number(a.id === qty?.id));
  return groups
    .filter((g) => g.values.length > 1)
    .map((g) => g.values.find((v) => v.id === selection[g.id])?.label)
    .filter((label): label is string => Boolean(label))
    .join(' · ');
}
