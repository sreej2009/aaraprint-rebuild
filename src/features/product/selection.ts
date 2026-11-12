import { swatchFor } from '@/lib/catalogue/colours';
import type { OptionGroup, PrintConfig, Product } from '@/lib/catalogue/types';
import { quantityGroup, resolveVariant, type Selection } from '@/lib/pricing';

export type GroupDisplay = 'tiers' | 'swatches' | 'chips' | 'select';

/** How an option group is presented on the product page. */
export function displayFor(product: Pick<Product, 'optionGroups'>, group: OptionGroup): GroupDisplay {
  if (quantityGroup(product)?.id === group.id) return 'tiers';
  if (/colou?r|shade/i.test(group.name) && group.values.every((v) => swatchFor(v.label))) return 'swatches';
  if (group.values.length > 8) return 'select';
  return 'chips';
}

/** Why a value can't be chosen with the rest of the selection, or undefined if it can. */
export function unavailableReason(product: Pick<Product, 'optionGroups' | 'variants'>, selection: Selection, groupId: string, valueId: string): string | undefined {
  const variant = resolveVariant(product, { ...selection, [groupId]: valueId });
  if (!variant) return 'Not available with your other choices';
  if (variant.stockStatus === 'out_of_stock') return 'Out of stock';
  return undefined;
}

/** Selection for a `?variantId=` deep link, if it exists. */
export function selectionForVariant(product: Pick<Product, 'optionGroups' | 'variants'>, variantId: string | null): Selection | null {
  if (!variantId) return null;
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) return null;
  const selection: Selection = {};
  for (const group of product.optionGroups) {
    const value = group.values.find((v) => variant.optionValueIds.includes(v.id));
    if (value) selection[group.id] = value.id;
  }
  return selection;
}

/** Singular unit for per-unit prices, from tier labels such as "250 cards" → "card". */
export function unitLabel(product: Pick<Product, 'optionGroups'>): string {
  const label = quantityGroup(product)?.values[0]?.label ?? '';
  const word = label.replace(/^[\d,\s]+/, '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!word) return 'piece';
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes)$/.test(word)) return word.slice(0, -2);
  return word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

// ------------------------------------------------------------- Print specs

const MM_PER_INCH = 25.4;
const toMm = (px: number, dpi: number) => (px / dpi) * MM_PER_INCH;

function formatMm(mm: number): string {
  if (mm >= 100) return `${(mm / 10).toFixed(mm % 10 === 0 ? 0 : 1)} cm`;
  return `${Number(mm.toFixed(1))} mm`;
}

export interface PrintSpecRow {
  label: string;
  value: string;
}

const PRINT_TYPE: Record<PrintConfig['category'], string> = {
  flat_print: 'Flat print',
  apparel: 'Garment print or embroidery',
  wrap: 'Wrap-around print',
};

const TRIM: Record<PrintConfig['trimShape'], string> = {
  rectangle: 'Rectangle',
  'rounded-rectangle': 'Rounded corners',
  circle: 'Circle',
};

/** Human-readable print specifications, plus the raw pixel values for designers. */
export function printSpecs(print: PrintConfig): { customer: PrintSpecRow[]; designer: PrintSpecRow[] } {
  const width = toMm(print.canvasWidthPx, print.dpi);
  const height = toMm(print.canvasHeightPx, print.dpi);
  const sizeLabel = print.category === 'flat_print' ? 'Finished size' : 'Print area';
  const customer: PrintSpecRow[] = [
    { label: sizeLabel, value: `${formatMm(width)} × ${formatMm(height)}` },
    { label: 'Print type', value: PRINT_TYPE[print.category] },
    { label: 'Shape', value: TRIM[print.trimShape] },
  ];
  if (print.bleedPx > 0) customer.push({ label: 'Bleed', value: `${formatMm(toMm(print.bleedPx, print.dpi))} beyond each edge — extend backgrounds into it` });
  if (print.safeZonePx > 0) customer.push({ label: 'Safe zone', value: `Keep text ${formatMm(toMm(print.safeZonePx, print.dpi))} inside the edge` });
  customer.push({ label: 'Image quality', value: `Upload artwork at ${print.dpi} DPI or more at final size` });
  const designer: PrintSpecRow[] = [
    { label: 'Canvas', value: `${print.canvasWidthPx} × ${print.canvasHeightPx} px` },
    { label: 'Resolution', value: `${print.dpi} DPI` },
    { label: 'Bleed', value: `${print.bleedPx} px` },
    { label: 'Safe zone', value: `${print.safeZonePx} px` },
  ];
  return { customer, designer };
}
