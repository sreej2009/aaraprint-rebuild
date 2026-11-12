import type {
  CatalogueOptionDefinition,
  EntryOptionDefinition,
  Evidence,
  OptionBehaviour,
  OptionRole,
  OrderOptionDefinition,
  StudioChoiceValue,
  StudioOptionDefinition,
  SurfaceDefinition,
} from './types';

/**
 * Option building blocks shared by the family definitions (families.ts). Palettes and format
 * values are copied from the original's recovered source (`10tigen5gn4-f.js`, `3zkk7bvc_w-nw.js`)
 * and checked against the live site where the audit drove them; nothing here is estimated.
 */

// ── Behaviour presets (our model; the original's behaviour is recorded per option) ─────────────

/** A catalogue option chosen in the Studio: it sets the variant and the price (audit §6.1 kind A). */
export const STUDIO_VARIANT: OptionBehaviour = {
  required: true,
  affectsVariant: true,
  affectsPrice: true,
  savedInDesign: true,
  undoable: true,
  editableInStudio: true,
  requiresConfirm: false,
};

/** A catalogue option chosen on the product page only (still saved with the design). */
export const PAGE_VARIANT: OptionBehaviour = { ...STUDIO_VARIANT, editableInStudio: false };

/** A physical colour or feature chosen in the Studio: saved as a production reference (kind C). */
export const STUDIO_REFERENCE: OptionBehaviour = {
  required: false,
  affectsVariant: false,
  affectsPrice: false,
  savedInDesign: true,
  undoable: true,
  editableInStudio: true,
  requiresConfirm: false,
};

/**
 * A Studio format with its own price (envelope size, invitation size and fold — kind B). The
 * original showed the price but neither saved it nor ordered it; we save it and price it
 * (decision B1).
 */
export const STUDIO_PRICED_FORMAT: OptionBehaviour = { ...STUDIO_REFERENCE, affectsPrice: true, requiresConfirm: true };

/** Studio dimensions applied with "Apply size" (gifts, mugs); no price effect in the source. */
export const STUDIO_DIMENSIONS: OptionBehaviour = { ...STUDIO_REFERENCE, requiresConfirm: true };

// ── Shared options ────────────────────────────────────────────────────────────────────────────

export const ORIENTATION_VALUES: readonly StudioChoiceValue[] = [
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'vertical', label: 'Vertical' },
];

/** "Product Orientation*" in the required-options dialog (live, every customisable product). */
export const ORIENTATION: EntryOptionDefinition = {
  id: 'orientation',
  label: 'Product Orientation',
  role: 'orientation',
  type: 'choice',
  source: 'entry',
  values: ORIENTATION_VALUES,
  defaultValueId: 'horizontal',
  behaviour: { required: true, affectsVariant: false, affectsPrice: false, savedInDesign: true, undoable: true, editableInStudio: false, requiresConfirm: false },
  original: { level: 'live', note: 'Dialog on 532/532 products; resets to Horizontal each time it opens (source). Dropped from the Approve redirect.' },
};

/** The catalogue "Quantity" tier: part of the variant; chosen on the page or in the entry dialog. */
export const QUANTITY_TIER: CatalogueOptionDefinition = {
  id: 'quantity-tier',
  label: 'Quantity',
  role: 'quantity-tier',
  type: 'choice',
  source: 'catalogue',
  groupNames: ['Quantity'],
  behaviour: PAGE_VARIANT,
  original: { level: 'live', note: 'Entry dialog select when the group has ≥ 2 tiers (532/532 agree). "Quantity stays as selected on the product page."' },
};

/** How many of the variant are ordered: sets of the tier ("Batches") or units. */
export const ORDER_QUANTITY: OrderOptionDefinition = {
  id: 'order-quantity',
  label: 'Quantity',
  role: 'order-quantity',
  type: 'count',
  source: 'order',
  min: 1,
  max: 99,
  behaviour: { required: true, affectsVariant: false, affectsPrice: true, savedInDesign: true, undoable: true, editableInStudio: false, requiresConfirm: false },
  original: { level: 'source', note: 'Product-page stepper 1–99, labelled "Batches" for tiered products (live: ₹229 × 2 batches). Not carried into the Studio URL.' },
};

/** Every catalogue group not bound by another option: chosen on the product page. */
export const OTHER_PAGE_OPTIONS: CatalogueOptionDefinition = {
  id: 'catalogue-other',
  label: 'Other product options',
  role: 'catalogue-other',
  type: 'choice',
  source: 'catalogue',
  groupNames: 'all-other',
  behaviour: PAGE_VARIANT,
  original: { level: 'live', note: 'Not shown in the original Studio panel for this family; chosen on the product page.' },
};

/**
 * Sign/poster group (signs, posters, labels, packaging, apparel, caps, bags): every catalogue
 * group except Quantity is chosen in the Studio and sets the variant (live: t-shirt Size and Print
 * Placement, poster Size, box Board Weight, cap Colour — Approve carried a new variantId).
 */
export const OTHER_STUDIO_OPTIONS: CatalogueOptionDefinition = {
  ...OTHER_PAGE_OPTIONS,
  label: 'Product options',
  behaviour: STUDIO_VARIANT,
  original: { level: 'live', note: '"Size, material, finish and printed-side choices update the SKU that is ordered. Quantity stays as selected on the product page."' },
};

export function catalogueOption(id: string, label: string, role: OptionRole, groupNames: readonly string[], inStudio: boolean, original: Evidence, products?: readonly string[]): CatalogueOptionDefinition {
  return {
    id,
    label,
    role,
    type: role === 'product-colour' || role === 'ink-colour' ? 'colour' : 'choice',
    source: 'catalogue',
    groupNames,
    behaviour: inStudio ? STUDIO_VARIANT : PAGE_VARIANT,
    original,
    ...(products ? { products } : {}),
  };
}

// ── Palettes (name and hex exactly as the original's source) ─────────────────────────────────

const palette = (pairs: readonly (readonly [string, string])[]): StudioChoiceValue[] =>
  pairs.map(([label, hex]) => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label, hex }));

/** Pen parts (`10tigen5gn4-f.js` ≈ 38 600). */
export const PEN_PALETTE = palette([
  ['White', '#ffffff'],
  ['Black', '#171717'],
  ['Silver', '#a0acb6'],
  ['Gold', '#c49a45'],
  ['Blue', '#2563eb'],
  ['Red', '#dc2626'],
  ['Green', '#16a34a'],
  ['Purple', '#9333ea'],
  ['Pink', '#ec4899'],
  ['Orange', '#ea580c'],
  ['Navy', '#172554'],
  ['Teal', '#0d9488'],
]);

/** Mug parts (`10tigen5gn4-f.js` ≈ 41 500). */
export const MUG_PALETTE = palette([
  ['White', '#f7f7f5'],
  ['Black', '#171717'],
  ['Silver', '#a8adb2'],
  ['Cream', '#f3ede1'],
  ['Navy', '#172554'],
  ['Blue', '#2563eb'],
  ['Red', '#dc2626'],
  ['Green', '#16a34a'],
  ['Teal', '#0d9488'],
  ['Purple', '#9333ea'],
  ['Pink', '#ec4899'],
  ['Orange', '#ea580c'],
]);

/** Gift and stamp-body parts (`10tigen5gn4-f.js` ≈ 311 600). */
export const PRODUCT_PART_PALETTE = palette([
  ['White', '#ffffff'],
  ['Cream', '#f3ede1'],
  ['Silver', '#a8adb2'],
  ['Black', '#171717'],
  ['Navy', '#1e3a5f'],
  ['Blue', '#2563eb'],
  ['Teal', '#0d9488'],
  ['Green', '#16a34a'],
  ['Red', '#dc2626'],
  ['Burgundy', '#7f1d1d'],
  ['Orange', '#ea580c'],
  ['Gold', '#d4af37'],
  ['Pink', '#ec4899'],
  ['Purple', '#9333ea'],
  ['Walnut', '#6b4423'],
  ['Oak', '#c9a26b'],
]);

/** Substrate colours of the sign/poster group (`SIGN_POSTER_COLOURS`, `3zkk7bvc_w-nw.js`). */
export const SUBSTRATE_PALETTE = palette([
  ['White', '#ffffff'],
  ['Cream', '#f3ead7'],
  ['Kraft', '#c8a47e'],
  ['Grey', '#8a8d93'],
  ['Black', '#1f1f21'],
  ['Navy', '#22305a'],
  ['Royal blue', '#1f56b0'],
  ['Red', '#b3262d'],
  ['Green', '#1f6a3d'],
  ['Yellow', '#f4c430'],
  ['Orange', '#ee6a1c'],
  ['Purple', '#5b2a86'],
]);

/** Polo body and collar/cuffs (`10tigen5gn4-f.js` ≈ 33 800, `J`). */
export const POLO_SHIRT_PALETTE = palette([
  ['White', '#ffffff'],
  ['Black', '#171717'],
  ['Navy', '#172554'],
  ['Maroon', '#7f1d1d'],
  ['Royal blue', '#2563eb'],
  ['Red', '#dc2626'],
  ['Bottle green', '#14532d'],
  ['Olive', '#556b2f'],
  ['Sky blue', '#38bdf8'],
  ['Pink', '#ec4899'],
  ['Grey', '#9ca3af'],
]);

/** Polo feature colours (reflective tape etc., `$`). */
export const POLO_FEATURE_PALETTE = palette([
  ['Hi-vis lime', '#d7f205'],
  ['Hi-vis orange', '#ff6a13'],
  ['Black', '#171717'],
  ['Navy', '#172554'],
  ['Royal blue', '#2563eb'],
  ['Red', '#dc2626'],
  ['Grey', '#9ca3af'],
  ['White', '#ffffff'],
]);

/** Polo features (live labels; source ids). */
export const POLO_FEATURES: readonly StudioChoiceValue[] = [
  { id: 'none', label: 'None' },
  { id: 'reflective', label: 'Reflective safety stripes' },
  { id: 'adidas-stripes', label: 'Shoulder stripes' },
  { id: 'pocket', label: 'Chest pocket' },
  { id: 'levis-tab', label: 'Side tab' },
  { id: 'piped-placket', label: 'Piped placket' },
  { id: 'candy-cuffs', label: 'Candy-stripe cuffs' },
  { id: 'sleeve-patch', label: 'Sleeve patch' },
];

// ── Stationery formats (`10tigen5gn4-f.js` ≈ 293 800–302 000; envelope and wedding live) ────────

const cm = (id: string, label: string, widthCm: number, heightCm: number, priceDeltaCents: number): StudioChoiceValue => ({
  id,
  label,
  widthMm: Math.round(widthCm * 10),
  heightMm: Math.round(heightCm * 10),
  priceDeltaCents,
});

export const ENVELOPE_SIZES: readonly StudioChoiceValue[] = [
  cm('dl', 'DL (22 cm × 11 cm)', 22, 11, 0),
  cm('number-10', '#10 (24.1 cm × 10.5 cm)', 24.1, 10.5, 4200),
  cm('c5', 'C5 (22.9 cm × 16.2 cm)', 22.9, 16.2, 6300),
  cm('19x12', '19 cm × 12 cm', 19, 12, 0),
  cm('14.6x11', '14.6 cm × 11 cm', 14.6, 11, 0),
];

export const WEDDING_INVITATION_SIZES: readonly StudioChoiceValue[] = [cm('5x7', '12.7 × 17.8 cm', 12.7, 17.8, 0), cm('6x9', '15.2 × 22.9 cm', 15.2, 22.9, 12500)];

export const BIRTHDAY_INVITATION_SIZES: readonly StudioChoiceValue[] = [
  cm('4x8', '10.2 × 20.3 cm', 10.2, 20.3, 0),
  cm('5x7', '12.7 × 17.8 cm', 12.7, 17.8, 3000),
  cm('5x5', '12.7 × 12.7 cm', 12.7, 12.7, 0),
];

export const CORPORATE_INVITATION_SIZES: readonly StudioChoiceValue[] = [
  cm('4x8', '10.2 × 20.3 cm', 10.2, 20.3, 2000),
  cm('5x7', '12.7 × 17.8 cm', 12.7, 17.8, 0),
  cm('5.5x4.2', '13.9 × 10.7 cm', 13.9, 10.7, 0),
  cm('6x9', '15.2 × 22.9 cm', 15.2, 22.9, 23000),
];

export const COMPLIMENT_SLIP_SIZES: readonly StudioChoiceValue[] = [
  cm('dl', '21 × 9.9 cm', 9.9, 21, 0),
  cm('a6', '14.8 × 10.5 cm', 10.5, 14.8, 0),
  cm('note', '8.9 × 5.5 cm', 8.9, 5.5, 0),
];

/** Fold (live on the wedding invitation: Folded +₹180). */
export const INVITATION_FOLDS: readonly StudioChoiceValue[] = [
  { id: 'flat', label: 'Flat', priceDeltaCents: 0 },
  { id: 'folded', label: 'Folded', priceDeltaCents: 18000 },
];

// ── Builders for Studio-only options ──────────────────────────────────────────────────────────

export function partColours(parts: readonly SurfaceDefinition[] | 'per-product', values: readonly StudioChoiceValue[] | null, original: Evidence, products?: readonly string[]): StudioOptionDefinition {
  return {
    id: 'part-colour',
    label: 'Product colours',
    role: 'part-colour',
    type: 'colour',
    source: 'studio',
    values: values ? { status: 'known', values } : { status: 'unknown', note: 'Presets differ by product in the original; not yet imported.' },
    defaultValueId: null,
    allowCustomColour: true,
    parts,
    behaviour: STUDIO_REFERENCE,
    original,
    ...(products ? { products } : {}),
  };
}

/** Material colour where artwork leaves it bare ("Paper colour", "Sticker colour", "Fabric colour"…). */
export const SUBSTRATE_COLOUR: StudioOptionDefinition = {
  id: 'substrate-colour',
  label: 'Substrate colour',
  role: 'substrate-colour',
  type: 'colour',
  source: 'studio',
  values: { status: 'known', values: SUBSTRATE_PALETTE },
  defaultValueId: null,
  allowCustomColour: true,
  behaviour: STUDIO_REFERENCE,
  original: {
    level: 'live',
    note: '"Original" + 12 presets + custom; "saved with the design as a production reference". Label follows the material (Paper/Sticker/Fabric/Board… colour). Shown when the product has no catalogue colour.',
  },
};

/** A custom garment/bag colour: "saved with the design as the colour to produce" — not a variant. */
export const CUSTOM_PRODUCT_COLOUR: StudioOptionDefinition = {
  id: 'custom-product-colour',
  label: 'Custom colour',
  role: 'custom-product-colour',
  type: 'colour',
  source: 'studio',
  values: { status: 'known', values: [] },
  defaultValueId: null,
  allowCustomColour: true,
  behaviour: STUDIO_REFERENCE,
  original: { level: 'live', note: '"Custom colour: none" with a hex field; a custom colour is saved with the design as the colour to produce.' },
};

export function dimensions(id: string, label: string, original: Evidence, presets: readonly StudioChoiceValue[] | null): StudioOptionDefinition {
  return {
    id,
    label,
    role: 'size',
    type: 'dimensions',
    source: 'studio',
    values: presets ? { status: 'known', values: presets } : { status: 'unknown', note: 'Presets differ by product in the original source; not yet imported. Custom sizes 1–100 cm.' },
    defaultValueId: null,
    rangeMm: { min: 10, max: 1000 },
    behaviour: STUDIO_DIMENSIONS,
    original,
  };
}

export function studioFormat(id: string, label: string, role: OptionRole, values: readonly StudioChoiceValue[] | null, defaultValueId: string | null, products: readonly string[], original: Evidence): StudioOptionDefinition {
  return {
    id,
    label,
    role,
    type: 'choice',
    source: 'studio',
    values: values ? { status: 'known', values } : { status: 'unknown', note: 'Values exist in the original source but were not established by the audit.' },
    defaultValueId,
    behaviour: STUDIO_PRICED_FORMAT,
    original,
    products,
  };
}
