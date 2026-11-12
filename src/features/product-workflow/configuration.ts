import type { Product, Variant } from '@/lib/catalogue/types';
import type { ProductWorkflow } from './registry';

/**
 * The product configuration saved in every design (schema v3): what will be ordered, kept apart
 * from the artwork. Plain JSON, so it is autosaved, versioned, restored and undone with the rest
 * of the document. Mockups, photos and UI state are never stored here.
 */

export type Orientation = 'horizontal' | 'vertical';
export const ORIENTATIONS: readonly Orientation[] = ['horizontal', 'vertical'];

/** A Studio-only choice (keyed by registry option id, or `<option id>:<part id>` for parts). */
export type StudioChoice =
  /** A listed value (envelope size, fold, polo feature…). */
  | { type: 'choice'; valueId: string }
  /** A preset (`valueId`) or custom (`valueId: null`) colour. */
  | { type: 'colour'; valueId: string | null; hex: string }
  /** A size in millimetres: a preset (`presetId`) or custom (`presetId: null`). */
  | { type: 'dimensions'; widthMm: number; heightMm: number; presetId: string | null };

export interface ProductConfiguration {
  /**
   * Catalogue selection: option-group id → value id (colour, size, quantity tier, lid type…).
   * Together they name the variant. Empty = not chosen yet (e.g. a design from schema v2).
   */
  options: Record<string, string>;
  /** How many of the variant are ordered — sets of the tier for tiered products, else units. */
  quantity: number;
  /** From the required-options dialog; null = not chosen (designs made before it existed). */
  orientation: Orientation | null;
  /** Studio-only choices: part and substrate colours, formats, dimensions, features. */
  studio: Record<string, StudioChoice>;
  /** "Same design on both sides"; null when the product has no such switch or it is unknown. */
  sameDesignBothSides: boolean | null;
}

/** Studio choice keys: `envelope-size`, or `part-colour:handle` for one part. */
export const STUDIO_CHOICE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}(:[a-z0-9][a-z0-9.-]{0,39})?$/;
/** Studio value ids may contain dots ("14.6x11"). */
export const STUDIO_VALUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
/** Studio dimensions, per side (the original allows custom sizes of 1–100 cm). */
export const DIMENSION_RANGE_MM = { min: 10, max: 1000 } as const;

export const MIN_ORDER_QUANTITY = 1;
/** The original's stepper limit (1–99). */
export const MAX_ORDER_QUANTITY = 99;

export function emptyConfiguration(): ProductConfiguration {
  return { options: {}, quantity: 1, orientation: null, studio: {}, sameDesignBothSides: null };
}

/** Selection (group id → value id) of a catalogue variant. */
export function selectionOfVariant(product: Pick<Product, 'optionGroups'>, variant: Pick<Variant, 'optionValueIds'>): Record<string, string> {
  const selection: Record<string, string> = {};
  for (const group of product.optionGroups) {
    const value = group.values.find((v) => variant.optionValueIds.includes(v.id));
    if (value) selection[group.id] = value.id;
  }
  return selection;
}

export interface InitialConfigurationInput {
  workflow: Pick<ProductWorkflow, 'sameDesignBothSides'> | null;
  /** The catalogue product and the variant chosen on the product page, when known. */
  catalogue?: Pick<Product, 'optionGroups'> | null;
  variant?: Pick<Variant, 'optionValueIds'> | null;
  orientation?: Orientation | null;
  quantity?: number;
}

/** The configuration of a new design: the product page's variant, the family's switch default. */
export function initialConfiguration({ workflow, catalogue, variant, orientation = null, quantity = 1 }: InitialConfigurationInput): ProductConfiguration {
  return {
    options: catalogue && variant ? selectionOfVariant(catalogue, variant) : {},
    quantity: clampQuantity(quantity),
    orientation,
    studio: {},
    sameDesignBothSides: workflow?.sameDesignBothSides.available ? workflow.sameDesignBothSides.defaultOn : null,
  };
}

export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return MIN_ORDER_QUANTITY;
  return Math.min(MAX_ORDER_QUANTITY, Math.max(MIN_ORDER_QUANTITY, Math.round(quantity)));
}

export function sameChoice(a: StudioChoice | undefined, b: StudioChoice | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
