import {
  BIRTHDAY_INVITATION_SIZES,
  catalogueOption,
  COMPLIMENT_SLIP_SIZES,
  CORPORATE_INVITATION_SIZES,
  CUSTOM_PRODUCT_COLOUR,
  dimensions,
  ENVELOPE_SIZES,
  INVITATION_FOLDS,
  MUG_PALETTE,
  ORDER_QUANTITY,
  ORIENTATION,
  OTHER_PAGE_OPTIONS,
  OTHER_STUDIO_OPTIONS,
  partColours,
  PEN_PALETTE,
  POLO_FEATURE_PALETTE,
  POLO_FEATURES,
  POLO_SHIRT_PALETTE,
  PRODUCT_PART_PALETTE,
  QUANTITY_TIER,
  STUDIO_REFERENCE,
  studioFormat,
  SUBSTRATE_COLOUR,
  WEDDING_INVITATION_SIZES,
} from './options';
import type {
  ColourBehaviour,
  EntryRequirements,
  FamilyCapabilities,
  ProductFamilyDefinition,
  ProductFamilyId,
  ProductOptionDefinition,
  QuantityBehaviour,
  SizeBehaviour,
  StudioOptionDefinition,
  SurfaceDefinition,
} from './types';

/**
 * Every product family the original Aaraprint has (AARAPRINT_CLONE_WORKFLOW_AUDIT.md §5, §6, §7).
 * Which products belong to which family is generated data (product-families.json); how each
 * family behaves is defined here, once.
 */

const FRONT: SurfaceDefinition = { id: 'front', label: 'Front' };
const BACK: SurfaceDefinition = { id: 'back', label: 'Back' };
const FRONT_BACK = [FRONT, BACK] as const;

const QUANTITY: QuantityBehaviour = {
  tiers: 'catalogue-quantity-group',
  stepper: 'per-product',
  editableInStudio: false,
  evidence: { level: 'live', note: 'audit §3.1–§4: tiers in the dialog for 307 products; Batches × tier on the page' },
};

const entry = (effect: EntryRequirements['orientation']['effect'], note: string): EntryRequirements => ({
  orientation: { required: true, defaultValue: 'horizontal', effect, evidence: { level: effect === 'unknown' ? 'unknown' : 'live', note } },
  quantityTier: { rule: 'catalogue-quantity-group', evidence: { level: 'live', note: 'Quantity select ⇔ catalogue "Quantity" group with ≥ 2 tiers (532/532)' } },
});
const ENTRY_UNKNOWN = entry('unknown', 'Only cards (swap), posters and umbrellas (ignored) were driven vertical.');

const caps = (overrides: Partial<FamilyCapabilities>): FamilyCapabilities => ({
  flatArtwork: false,
  onProduct: false,
  perspective: false,
  apparelStage: false,
  wrap: false,
  frontBack: true,
  sameDesignBothSides: false,
  productColour: false,
  sizeSelection: false,
  quantityTiers: true,
  // "More" → QR code / Table / Quick edits, and Download proof, exist for every product (live).
  qr: true,
  tables: true,
  curvedText: false,
  preview3d: false,
  proof: true,
  ...overrides,
});

const NO_COLOUR: ColourBehaviour = { kinds: ['none'], evidence: { level: 'live', note: 'No colour choice in the original Studio' } };
const FIXED_SIZE: SizeBehaviour = { kind: 'fixed', resizesPrintArea: false, evidence: { level: 'live', note: 'No size choice in the original Studio' } };

const BASE_OPTIONS: readonly ProductOptionDefinition[] = [ORIENTATION, QUANTITY_TIER, ORDER_QUANTITY];

interface FamilyInput extends Omit<ProductFamilyDefinition, 'frontBack' | 'variantResolver' | 'quantity' | 'options' | 'unknowns'> {
  options?: readonly ProductOptionDefinition[];
  unknowns?: readonly string[];
  quantity?: QuantityBehaviour;
}

const family = (input: FamilyInput): ProductFamilyDefinition => ({
  ...input,
  quantity: input.quantity ?? QUANTITY,
  frontBack: {
    artwork: 'independent',
    physicalChoices: 'shared',
    evidence: { level: 'live', note: '"Physical choices stay shared while front and back artwork remain independent."' },
  },
  options: [...BASE_OPTIONS, ...(input.options ?? [])],
  variantResolver: 'catalogue-selection',
  unknowns: input.unknowns ?? [],
});

// ── Shared pieces of the "sign/poster group" (perspective products) ─────────────────────────

const perspectiveStart = (note: string) => ({ tool: 'product-options' as const, workspace: 'perspective' as const, views: ['on-product', 'flat-artwork'] as const, evidence: { level: 'live' as const, note } });

const SAME_DESIGN_ON = {
  available: true,
  defaultOn: true,
  evidence: { level: 'source' as const, note: 'Switch ON when the back is empty or equals the front (10tigen5gn4-f.js); live: back mirrored the front on 6 sampled products. Present on 187 products.' },
};
const NO_SAME_DESIGN = { available: false, defaultOn: false, evidence: { level: 'live' as const, note: 'No switch in the original Studio' } };

const SUBSTRATE: ColourBehaviour = { kinds: ['substrate-colour'], evidence: { level: 'live', note: 'Paper/Sticker/Fabric colour, saved as a production reference' } };

const signGroup = (id: ProductFamilyId, name: string, description: string, size: SizeBehaviour, unknowns: readonly string[] = []): ProductFamilyDefinition =>
  family({
    id,
    name,
    description,
    initialStudio: perspectiveStart('Live: Product options panel; On product with a Flat artwork switch'),
    surfaces: FRONT_BACK,
    sameDesignBothSides: SAME_DESIGN_ON,
    productPicture: 'perspective-face',
    reviewPreview: 'on-product',
    entry: id === 'poster' ? entry('ignored', 'Live: poster vertical kept 30.5 × 45.7 cm') : ENTRY_UNKNOWN,
    colour: SUBSTRATE,
    size,
    options: [OTHER_STUDIO_OPTIONS, SUBSTRATE_COLOUR],
    capabilities: caps({ flatArtwork: true, onProduct: true, perspective: true, sameDesignBothSides: true, productColour: true, sizeSelection: size.kind !== 'fixed' }),
    unknowns: ['Perspective face geometry per product is in the original source (not yet imported)', ...unknowns],
  });

const CATALOGUE_SIZE_UNKNOWN: SizeBehaviour = { kind: 'catalogue-variant', resizesPrintArea: 'unknown', evidence: { level: 'inferred', note: 'Size is a catalogue option in the Studio panel (same panel as posters)' } };

// ── Apparel, caps and bags ───────────────────────────────────────────────────────────────────

const GARMENT_COLOUR = catalogueOption('colour', 'Colour', 'product-colour', ['Colour'], true, { level: 'live', note: '"The product is shown in the colour chosen, which is the colour ordered." Cap Navy → new variantId.' });
const GARMENT_SIZE = catalogueOption('size', 'Size', 'size', ['Size'], true, { level: 'live', note: 't-shirt XL ₹399 → ₹429, saved, undone by Undo' });
const PRINT_PLACEMENT = catalogueOption('print-placement', 'Print Placement', 'print-placement', ['Print Placement'], true, { level: 'live', note: 'Front & Back +₹150 → ₹579' });

const garment = (id: ProductFamilyId, name: string, description: string, extra: readonly ProductOptionDefinition[], colourKinds: ColourBehaviour['kinds']) =>
  family({
    id,
    name,
    description,
    initialStudio: perspectiveStart('Live: Product options; On product / Flat artwork'),
    surfaces: FRONT_BACK,
    sameDesignBothSides: SAME_DESIGN_ON,
    productPicture: 'perspective-face',
    reviewPreview: 'on-product',
    entry: ENTRY_UNKNOWN,
    colour: { kinds: colourKinds, evidence: { level: 'live', note: 'Variant colour + custom colour saved with the design' } },
    size: { kind: 'catalogue-variant', resizesPrintArea: false, evidence: { level: 'live', note: 't-shirt size changed the title and price, not the 33.8 × 40.6 cm print area' } },
    options: [GARMENT_COLOUR, GARMENT_SIZE, PRINT_PLACEMENT, OTHER_STUDIO_OPTIONS, CUSTOM_PRODUCT_COLOUR, ...extra],
    capabilities: caps({ flatArtwork: true, onProduct: true, perspective: true, apparelStage: true, sameDesignBothSides: true, productColour: true, sizeSelection: true }),
    unknowns: ['Garment tint/mask rendering per product', 'Undo of colour and print placement verified on samples only'],
  });

// ── Photo-frame families ─────────────────────────────────────────────────────────────────────

const photoStart = (note: string) => ({ tool: 'product-options' as const, workspace: 'photo-frame' as const, views: ['on-product'] as const, evidence: { level: 'live' as const, note } });

const MUG_PARTS: readonly SurfaceDefinition[] = [
  { id: 'body', label: 'Mug body' },
  { id: 'handle', label: 'Handle' },
  { id: 'interior', label: 'Inside & rim' },
];

/** Pens: body, clip, tip and a fourth part whose label depends on the pen (Click button, Trim, Cap, Grip). */
const PEN_PARTS: readonly SurfaceDefinition[] = [
  { id: 'body', label: 'Body' },
  { id: 'clip', label: 'Clip' },
  { id: 'tip', label: 'Tip' },
  { id: 'button1', label: 'Click button' },
];

const MUG_SIZES = [
  { id: '22.9x8.9', label: '22.9 × 8.9 cm', widthMm: 229, heightMm: 89 },
  { id: '25.4x8.9', label: '25.4 × 8.9 cm', widthMm: 254, heightMm: 89 },
];

const ROUND_PAD_SIZES = [
  { id: '20.3', label: '20.3 cm round', widthMm: 203, heightMm: 203 },
  { id: '25.4', label: '25.4 cm round', widthMm: 254, heightMm: 254 },
  { id: '30', label: '30 cm round', widthMm: 300, heightMm: 300 },
];

const giftColours = (products?: readonly string[]): StudioOptionDefinition =>
  partColours('per-product', PRODUCT_PART_PALETTE, { level: 'live', note: '"Choose a physical part to recolour." Parts differ by product (finish/edge, back fabric, spine & binding, stitched rim…).' }, products);

const GIFT_DIMENSIONS = dimensions('size', 'Size', { level: 'live', note: 'Presets + custom 1–100 cm, Keep proportions, Apply size; resizes the artwork on both sides. No price delta in the source; live price effect not exercised.' }, null);

// ── The families ─────────────────────────────────────────────────────────────────────────────

export const PRODUCT_FAMILIES: Readonly<Record<ProductFamilyId, ProductFamilyDefinition>> = {
  'visiting-card': family({
    id: 'visiting-card',
    name: 'Visiting cards',
    description: 'Business cards, card holders and card services — flat print area, front and back.',
    initialStudio: { tool: 'text', workspace: 'flat', views: ['print-area'], evidence: { level: 'live', note: 'No Product options tool; opens on Text with Safety Area and Bleed' } },
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'none',
    reviewPreview: 'print-area',
    entry: entry('swaps-print-area', 'Live: business-card-classic vertical → 5.1 × 8.9 cm'),
    colour: NO_COLOUR,
    size: { kind: 'fixed', resizesPrintArea: false, evidence: { level: 'live', note: 'Fixed size; vertical orientation swaps width and height' } },
    options: [OTHER_PAGE_OPTIONS],
    capabilities: caps({ flatArtwork: true, preview3d: true }),
    unknowns: ['Whether orientation swaps every card shape (oval, circle, leaf) — only the classic card was driven'],
  }),

  stationery: family({
    id: 'stationery',
    name: 'Stationery',
    description: 'Flat stationery and small printed items (tags, ID cards, certificates, keychains, mats…).',
    initialStudio: { tool: 'text', workspace: 'flat', views: ['print-area'], evidence: { level: 'live', note: 'Opens on Text' } },
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'none',
    reviewPreview: 'print-area',
    entry: ENTRY_UNKNOWN,
    colour: NO_COLOUR,
    size: FIXED_SIZE,
    options: [OTHER_PAGE_OPTIONS],
    capabilities: caps({ flatArtwork: true, preview3d: true }),
    unknowns: ['Orientation effect'],
  }),

  letterhead: family({
    id: 'letterhead',
    name: 'Letterheads',
    description: 'Letterheads and letterhead pads — opens on Uploads.',
    initialStudio: { tool: 'uploads', workspace: 'flat', views: ['print-area'], evidence: { level: 'live', note: 'Source: initial tool "uploads" when the slug contains "letterhead"; live 4/4' } },
    surfaces: [FRONT],
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'none',
    reviewPreview: 'print-area',
    entry: ENTRY_UNKNOWN,
    colour: NO_COLOUR,
    size: FIXED_SIZE,
    options: [OTHER_PAGE_OPTIONS],
    capabilities: caps({ flatArtwork: true, frontBack: false, preview3d: true }),
    unknowns: ['Orientation effect'],
  }),

  invitation: family({
    id: 'invitation',
    name: 'Invitations and cards',
    description: 'Invitations, announcements, vouchers and compliment slips with a Studio format panel.',
    initialStudio: { tool: 'product-options', workspace: 'flat', views: ['print-area'], evidence: { level: 'live', note: '"The design adjusts to your selected options." + Confirm selection' } },
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'none',
    reviewPreview: 'print-area',
    entry: entry('chosen-again-in-studio', 'Source: these products repeat Product orientation in the Studio format panel'),
    colour: NO_COLOUR,
    size: { kind: 'studio-format', resizesPrintArea: true, evidence: { level: 'live', note: 'Wedding: 15.2 × 22.9 + Folded + Confirm → 22.9 × 15.2 cm, ₹904; "designs are preserved and resized proportionally"' } },
    options: [
      OTHER_PAGE_OPTIONS,
      studioFormat('format-size', 'Size', 'format-size', WEDDING_INVITATION_SIZES, '5x7', ['invitation-wedding-classic'], { level: 'live', note: 'Price shown (+₹125) but not ordered or saved in the original (B1)' }),
      studioFormat('format-size', 'Size', 'format-size', BIRTHDAY_INVITATION_SIZES, null, ['invitation-birthday-fun'], { level: 'source', note: 'e5 in 10tigen5gn4-f.js' }),
      studioFormat('format-size', 'Size', 'format-size', CORPORATE_INVITATION_SIZES, null, ['invitation-corporate-event'], { level: 'source', note: 'e3 in 10tigen5gn4-f.js' }),
      studioFormat('format-size', 'Size', 'format-size', COMPLIMENT_SLIP_SIZES, 'dl', ['stationery-compliment-slips', 'stationery-note-cards-standard'], { level: 'source', note: 'e9 in 10tigen5gn4-f.js' }),
      studioFormat('format-size', 'Size', 'format-size', null, null, [
        'announcement-engagement',
        'announcement-grand-opening',
        'announcement-new-baby',
        'announcement-save-the-date',
        'invitation-baby-shower',
        'invitation-festival-greeting',
        'invite-moving-announcements',
        'invite-party-invitations',
        'invite-save-the-date',
        'invite-wedding-invitations',
        'invite-wedding-menu',
        'invite-wedding-programmes',
        'stationery-cash-vouchers',
      ], { level: 'source', note: 'CardOrientationProductOptions; values not extracted' }),
      studioFormat('fold', 'Fold', 'fold', INVITATION_FOLDS, 'flat', ['invitation-wedding-classic', 'invitation-corporate-event'], { level: 'live', note: 'Folded +₹180 (wedding, live)' }),
    ],
    capabilities: caps({ flatArtwork: true, sizeSelection: true, preview3d: true }),
    unknowns: ['Format sizes for the card-orientation products', 'Whether a format change is undoable on the folder/invitation panels'],
  }),

  envelope: family({
    id: 'envelope',
    name: 'Envelopes',
    description: 'Envelopes — front, back and flap.',
    initialStudio: { tool: 'product-options', workspace: 'flat', views: ['print-area'], evidence: { level: 'live', note: 'stationery-envelope-dl opens on Product options; stationery-envelopes-standard on Text (per product)' } },
    surfaces: [FRONT, BACK, { id: 'flap', label: 'Flap' }],
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'none',
    reviewPreview: 'print-area',
    entry: ENTRY_UNKNOWN,
    colour: NO_COLOUR,
    size: { kind: 'studio-format', resizesPrintArea: true, evidence: { level: 'live', note: '#10 + Confirm → 24.1 × 10.5 cm, ₹391; artwork resized proportionally' } },
    options: [
      OTHER_PAGE_OPTIONS,
      studioFormat('envelope-size', 'Size', 'envelope-size', ENVELOPE_SIZES, 'dl', ['stationery-envelope-dl'], {
        level: 'live',
        note: 'Original: price shown but variant unchanged, choice lost on reload, price not undone (B1). Ours: saved, priced, undoable.',
      }),
    ],
    capabilities: caps({ flatArtwork: true, sizeSelection: true, preview3d: true }),
    unknowns: ['Orientation effect'],
  }),

  notebook: family({
    id: 'notebook',
    name: 'Notebooks and books',
    description: 'Notebooks, diaries, booklets, bill books and desk calendars — covers and inside page.',
    initialStudio: { tool: 'text', workspace: 'flat', views: ['print-area'], evidence: { level: 'live', note: 'Opens on Text; page switcher with covers' } },
    surfaces: [
      { id: 'cover-front', label: 'Cover Front' },
      { id: 'cover-back', label: 'Cover Back' },
      { id: 'inside-page', label: 'Inside Page' },
    ],
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'none',
    reviewPreview: 'print-area',
    entry: ENTRY_UNKNOWN,
    colour: NO_COLOUR,
    size: FIXED_SIZE,
    options: [OTHER_PAGE_OPTIONS],
    capabilities: caps({ flatArtwork: true, preview3d: true }),
    unknowns: ['Spine/hinge guides', 'Orientation effect'],
  }),

  folder: family({
    id: 'folder',
    name: 'Folders',
    description: 'Presentation folders and files — covers and pocket panels.',
    initialStudio: { tool: 'product-options', workspace: 'flat', views: ['print-area'], evidence: { level: 'live', note: 'Pockets panel + Confirm selection' } },
    surfaces: [
      { id: 'cover-front', label: 'Cover Front' },
      { id: 'cover-back', label: 'Cover Back' },
      { id: 'pocket-inside', label: 'Pocket Inside' },
    ],
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'none',
    reviewPreview: 'print-area',
    entry: ENTRY_UNKNOWN,
    colour: NO_COLOUR,
    size: FIXED_SIZE,
    options: [
      {
        ...catalogueOption('pockets', 'Pockets', 'pockets', ['Pockets'], true, {
          level: 'live',
          note: 'Original: Double Pocket +₹80 shown after Confirm, variant unchanged, not saved (B1). Ours: the catalogue "Pockets" group sets the variant. Double → Pocket Left/Right Inside surfaces (source).',
        }),
        behaviour: { required: true, affectsVariant: true, affectsPrice: true, savedInDesign: true, undoable: true, editableInStudio: true, requiresConfirm: true },
      },
      OTHER_PAGE_OPTIONS,
    ],
    capabilities: caps({ flatArtwork: true, preview3d: true }),
    unknowns: ['Pocket glue zones'],
  }),

  'mouse-pad': family({
    id: 'mouse-pad',
    name: 'Mouse pads',
    description: 'Rectangular custom mouse pad — single flat surface.',
    initialStudio: { tool: 'text', workspace: 'flat', views: ['print-area'], evidence: { level: 'live', note: 'Opens on Text; no side tabs' } },
    surfaces: [FRONT],
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'none',
    reviewPreview: 'print-area',
    entry: ENTRY_UNKNOWN,
    colour: NO_COLOUR,
    size: FIXED_SIZE,
    options: [OTHER_PAGE_OPTIONS],
    capabilities: caps({ flatArtwork: true, frontBack: false, preview3d: true }),
  }),

  'round-mouse-pad': family({
    id: 'round-mouse-pad',
    name: 'Round mouse pads',
    description: 'Round photo mouse pad on its product photo.',
    initialStudio: { tool: 'product-options', workspace: 'gift-frame', views: ['on-product'], evidence: { level: 'live', note: 'Size + product colours (stitched rim, pad surface)' } },
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'round-pad-photo',
    reviewPreview: 'on-product',
    entry: ENTRY_UNKNOWN,
    colour: { kinds: ['part-colours'], evidence: { level: 'live', note: 'Stitched rim / Pad surface' } },
    size: { kind: 'studio-dimensions', resizesPrintArea: true, evidence: { level: 'live', note: '20.3 / 25.4 / 30 cm round + custom, Apply size' } },
    options: [
      OTHER_PAGE_OPTIONS,
      dimensions('size', 'Size', { level: 'live', note: 'Diameter presets + custom 1–100 cm' }, ROUND_PAD_SIZES),
      partColours(
        [
          { id: 'rim', label: 'Stitched rim' },
          { id: 'surface', label: 'Pad surface' },
        ],
        PRODUCT_PART_PALETTE,
        { level: 'live', note: 'Stitched rim colour' },
      ),
    ],
    capabilities: caps({ onProduct: true, productColour: true, sizeSelection: true }),
    unknowns: ['Price effect of Apply size', 'Part ids are ours (the original keys were not established)'],
  }),

  stamp: family({
    id: 'stamp',
    name: 'Stamps',
    description: 'Self-inking, date and seal stamps — ink colour, preset text, seal design.',
    initialStudio: {
      tool: 'product-options',
      workspace: 'perspective',
      views: ['on-product', 'seal-design'],
      evidence: { level: 'live', note: '"Choices here update the stamp photo straight away and are carried to your cart"; sample seal seeded' },
    },
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'stamp-photo',
    reviewPreview: 'on-product',
    entry: ENTRY_UNKNOWN,
    colour: { kinds: ['variant-colour', 'part-colours'], evidence: { level: 'live', note: 'Ink colour is a variant; stamp body colour is a part colour' } },
    size: { kind: 'catalogue-variant', resizesPrintArea: true, evidence: { level: 'source', note: 'Size/diameter groups resize the canvas (stampSizeInches)' } },
    options: [
      catalogueOption('ink-colour', 'Ink colour', 'ink-colour', ['Ink Colour'], true, { level: 'live', note: 'Blue → toast, new variantId; text prints in the ink colour (text colour picker hidden)' }),
      catalogueOption('preset-text', 'Preset Text', 'preset-text', ['Preset Text'], true, { level: 'live', note: 'Custom Text +₹30 → ₹329, new variantId' }),
      catalogueOption('stamp-size', 'Size', 'stamp-size', ['Diameter', 'Size', 'Impression Size'], true, { level: 'live', note: 'Diameter 2" +₹60 (round seal)' }),
      OTHER_STUDIO_OPTIONS,
      partColours([{ id: 'body', label: 'Stamp body' }], PRODUCT_PART_PALETTE, { level: 'live', note: 'Stamp body colour, 16 presets + custom; "physical finishes must be confirmed before ordering"' }),
    ],
    capabilities: caps({ onProduct: true, perspective: true, productColour: true, sizeSelection: true, curvedText: true }),
    unknowns: ['Seal geometry per stamp (source)', 'Front View/Back View are photo views; their mapping to print surfaces'],
  }),

  sign: signGroup('sign', 'Signs and banners', 'Signs, banners, standees and displays on their product photo.', CATALOGUE_SIZE_UNKNOWN),
  poster: signGroup('poster', 'Posters', 'Posters on their product photo.', {
    kind: 'catalogue-variant',
    resizesPrintArea: false,
    evidence: { level: 'live', note: '18×24 in +₹150 → ₹649 and a new variantId; print area stayed 30.5 × 45.7 cm' },
  }),
  'marketing-print': signGroup('marketing-print', 'Marketing print', 'Flyers, brochures, cards, table covers and other marketing materials.', CATALOGUE_SIZE_UNKNOWN),
  label: signGroup('label', 'Labels and stickers', 'Labels, stickers and tags on their product photo.', CATALOGUE_SIZE_UNKNOWN),
  packaging: signGroup('packaging', 'Packaging', 'Boxes, bags, tape, tissue and mailers on their product photo.', {
    kind: 'catalogue-variant',
    resizesPrintArea: 'unknown',
    evidence: { level: 'live', note: 'Tuck-top box Board Weight 400 GSM +₹50 in the Studio panel' },
  }),

  apparel: garment('apparel', 'Apparel', 'T-shirts, hoodies, shirts, jerseys and tracksuits on the garment photo.', [], ['variant-colour']),
  cap: garment('cap', 'Caps', 'Caps on their product photo.', [], ['variant-colour']),
  bag: garment('bag', 'Bags', 'Bags and totes on their product photo.', [SUBSTRATE_COLOUR], ['variant-colour', 'substrate-colour']),

  polo: family({
    id: 'polo',
    name: 'Polo T-shirts',
    description: 'Polos on a drawn polo stage with features and a 3D preview.',
    initialStudio: { tool: 'product-options', workspace: 'polo-stage', views: ['garment'], evidence: { level: 'live', note: '"Shirt colors" panel; 2D Edit / 3D Preview' } },
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'polo-drawn',
    reviewPreview: 'on-product',
    entry: ENTRY_UNKNOWN,
    colour: { kinds: ['variant-colour', 'part-colours'], evidence: { level: 'live', note: 'Catalogue colour on the page; body, collar & cuffs and feature colours in the Studio' } },
    size: { kind: 'catalogue-variant', resizesPrintArea: false, evidence: { level: 'inferred', note: 'Size is a page option; stage = 3.6 × the larger print side (source)' } },
    options: [
      catalogueOption('colour', 'Colour', 'product-colour', ['Colour'], false, { level: 'live', note: 'Product page option; not in the Studio panel' }),
      catalogueOption('size', 'Size', 'size', ['Size'], false, { level: 'live', note: 'Product page option' }),
      OTHER_PAGE_OPTIONS,
      { ...partColours([{ id: 'body', label: 'Body' }, { id: 'trim', label: 'Collar & cuffs' }], POLO_SHIRT_PALETTE, { level: 'live', note: 'Body and collar & cuffs colour + custom; Swap colors' }), id: 'shirt-colour', label: 'Shirt colours' },
      {
        id: 'feature-1',
        label: 'Extra feature 1',
        role: 'feature',
        type: 'choice',
        source: 'studio',
        values: { status: 'known', values: POLO_FEATURES },
        defaultValueId: null,
        behaviour: STUDIO_REFERENCE,
        original: { level: 'live', note: 'Product-specific defaults are pre-selected (6 Degree: reflective stripes + sleeve patch)' },
      },
      {
        id: 'feature-2',
        label: 'Extra feature 2',
        role: 'feature',
        type: 'choice',
        source: 'studio',
        values: { status: 'known', values: POLO_FEATURES },
        defaultValueId: null,
        behaviour: STUDIO_REFERENCE,
        original: { level: 'live', note: 'Second feature slot' },
      },
      { ...partColours([{ id: '1', label: 'Feature 1' }, { id: '2', label: 'Feature 2' }], POLO_FEATURE_PALETTE, { level: 'live', note: 'Reflective tape / stripe / patch colour + custom' }), id: 'feature-colour', label: 'Feature colours', role: 'feature-colour' },
    ],
    capabilities: caps({ onProduct: true, apparelStage: true, productColour: true, preview3d: true }),
    unknowns: ['Whether the original saved polo colours and features with the design', 'Per-product default features (source)'],
  }),

  umbrella: family({
    id: 'umbrella',
    name: 'Umbrellas',
    description: 'Umbrellas on their product photo; the canopy colour is the colour ordered.',
    initialStudio: photoStart('"Umbrella options — The colour you choose is the colour that is ordered."'),
    surfaces: [
      { id: 'front', label: 'Canopy panel' },
      { id: 'back', label: 'Inside panel' },
    ],
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'umbrella-photo',
    reviewPreview: 'on-product',
    entry: entry('ignored', 'Live: umbrella ignored orientation'),
    colour: { kinds: ['variant-colour'], evidence: { level: 'live', note: 'Red → new variantId at Approve; saved as umbrellaRainwear.colorLabel; undoable' } },
    size: FIXED_SIZE,
    options: [catalogueOption('colour', 'Canopy colour', 'product-colour', ['Canopy Colour'], true, { level: 'live', note: 'Masked canopy tint; frame, shaft, handle and tips as photographed' }), OTHER_PAGE_OPTIONS],
    capabilities: caps({ onProduct: true, productColour: true }),
  }),

  rainwear: family({
    id: 'rainwear',
    name: 'Rainwear',
    description: 'Raincoats, rainsuits, jackets and rain caps on their product photo.',
    initialStudio: photoStart('"Rainwear options — The colour you choose is the colour that is ordered."'),
    surfaces: [
      { id: 'front', label: 'Left chest' },
      { id: 'back', label: 'Upper back' },
    ],
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'rainwear-photo',
    reviewPreview: 'on-product',
    entry: ENTRY_UNKNOWN,
    colour: { kinds: ['variant-colour'], evidence: { level: 'live', note: 'Colour is ordered; zips, cords and linings as photographed' } },
    size: { kind: 'catalogue-variant', resizesPrintArea: false, evidence: { level: 'live', note: 'Size on the product page only' } },
    options: [
      catalogueOption('colour', 'Colour', 'product-colour', ['Colour'], true, { level: 'live', note: 'Studio Rainwear options' }),
      catalogueOption('size', 'Size', 'size', ['Size'], false, { level: 'live', note: 'Product page only' }),
      OTHER_PAGE_OPTIONS,
    ],
    capabilities: caps({ onProduct: true, productColour: true, sizeSelection: true }),
  }),

  mug: family({
    id: 'mug',
    name: 'Mugs',
    description: 'Mugs on their product photo with recolourable parts and a size choice.',
    initialStudio: photoStart('"Mug colors" + "Product options" (Size, Apply size)'),
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'mug-photo',
    reviewPreview: 'on-product',
    entry: ENTRY_UNKNOWN,
    colour: { kinds: ['part-colours'], evidence: { level: 'live', note: 'Body, handle, inside & rim; Red → Undo → Black' } },
    size: { kind: 'studio-dimensions', resizesPrintArea: true, evidence: { level: 'live', note: 'Presets need Apply size; clicking a preset alone changed nothing' } },
    options: [
      OTHER_PAGE_OPTIONS,
      partColours(MUG_PARTS, MUG_PALETTE, { level: 'live', note: '12 presets + custom; "shading and highlights remain visible"' }),
      dimensions('size', 'Size', { level: 'live', note: 'cm/in presets + custom; artwork scales with the size' }, MUG_SIZES),
    ],
    capabilities: caps({ onProduct: true, wrap: true, productColour: true, sizeSelection: true }),
    unknowns: ['Price effect of Apply size (none in source)'],
  }),

  drinkware: family({
    id: 'drinkware',
    name: 'Drinkware',
    description: 'Bottles, tumblers, flasks, glasses and travel mugs on their product photo.',
    initialStudio: photoStart('"Drinkware options — Physical choices stay shared while front and back artwork remain independent."'),
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'drinkware-photo',
    reviewPreview: 'on-product',
    entry: ENTRY_UNKNOWN,
    colour: { kinds: ['part-colours'], evidence: { level: 'live', note: 'Body and cap/lid colour; a body colour matching a catalogue colour folds into the variant in the source' } },
    size: { kind: 'catalogue-variant', resizesPrintArea: false, evidence: { level: 'live', note: 'Capacity on the product page' } },
    options: [
      catalogueOption('lid-type', 'Cap / lid type', 'lid-type', ['Lid Type'], true, { level: 'live', note: 'Flip +₹15 → ₹284, new variantId; Undo → ₹269; lid photo changes' }),
      OTHER_PAGE_OPTIONS,
      partColours(
        [
          { id: 'body', label: 'Bottle body colour' },
          { id: 'cap', label: 'Cap / lid colour' },
        ],
        null,
        { level: 'live', note: 'Presets differ by product (aluminium: Silver, Matte Black, Royal Blue) + custom; default "Original"' },
      ),
    ],
    capabilities: caps({ onProduct: true, wrap: true, productColour: true }),
    unknowns: ['Body/cap presets per product', 'Exact rule folding a body colour into the catalogue colour'],
  }),

  pen: family({
    id: 'pen',
    name: 'Pens',
    description: 'Pens on their product photo; parts recolourable on both sides.',
    initialStudio: photoStart('"Pen colors — Colors apply to both sides." "Design directly on the pen barrel."'),
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'pen-photo',
    reviewPreview: 'on-product',
    entry: ENTRY_UNKNOWN,
    colour: { kinds: ['part-colours'], evidence: { level: 'live', note: 'Body, clip, tip, click button' } },
    size: FIXED_SIZE,
    options: [OTHER_PAGE_OPTIONS, partColours(PEN_PARTS, PEN_PALETTE, { level: 'live', note: '12 presets + custom; the fourth part is Click button, Trim, Cap or Grip depending on the pen (source)' })],
    capabilities: caps({ onProduct: true, productColour: true }),
    unknowns: ['Parts of multicolour and fountain pens (source)'],
  }),

  gift: family({
    id: 'gift',
    name: 'Gifts',
    description: 'Calendars, acrylic blocks, frames, cushions, clocks, hampers and cases on their product photo.',
    initialStudio: perspectiveStart('Live: Product options (Size, Product colours); On product / Flat artwork; sample artwork seeded on many'),
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'perspective-face',
    reviewPreview: 'on-product',
    entry: ENTRY_UNKNOWN,
    colour: { kinds: ['part-colours'], evidence: { level: 'live', note: 'Product finish / edge colour' } },
    size: { kind: 'studio-dimensions', resizesPrintArea: true, evidence: { level: 'live', note: 'Presets + custom, Apply size' } },
    options: [OTHER_PAGE_OPTIONS, GIFT_DIMENSIONS, giftColours()],
    capabilities: caps({ flatArtwork: true, onProduct: true, perspective: true, productColour: true, sizeSelection: true }),
    unknowns: ['Size presets and colour parts per product (source)', 'Price effect of Apply size'],
  }),

  'gift-frame': family({
    id: 'gift-frame',
    name: 'Photo gifts',
    description: 'Coasters, magnets, photo frames, albums and canvas prints drawn on their product photo.',
    initialStudio: {
      tool: 'product-options',
      workspace: 'gift-frame',
      views: ['on-product'],
      evidence: { level: 'live', note: '"Change the print size and product finishes. Front and back artwork scales with the size; photos keep their proportions."' },
    },
    surfaces: FRONT_BACK,
    sameDesignBothSides: NO_SAME_DESIGN,
    productPicture: 'gift-photo',
    reviewPreview: 'on-product',
    entry: ENTRY_UNKNOWN,
    colour: { kinds: ['part-colours'], evidence: { level: 'live', note: 'Back fabric, spine & binding, cover…' } },
    size: { kind: 'studio-dimensions', resizesPrintArea: true, evidence: { level: 'live', note: 'Presets + custom 1–100 cm, Apply size' } },
    options: [OTHER_PAGE_OPTIONS, GIFT_DIMENSIONS, giftColours()],
    capabilities: caps({ onProduct: true, productColour: true, sizeSelection: true }),
    unknowns: ['Size presets and colour parts per product (source)', 'Price effect of Apply size'],
  }),
};

/** The original's pricing behaviours we deliberately do not copy (audit §6.2, §20 B1–B2). */
export const ORIGINAL_PRICING_BEHAVIOURS = [
  {
    id: 'studio-price-ignores-tier',
    original: 'The Studio top bar shows product base price + Studio deltas and ignores the selected variant: 500 visiting cards (₹629) showed ₹229.',
    ours: 'Unit price = the resolved variant price (quantity tier included) + saved Studio price adjustments.',
    decision: 'B2',
    evidence: { level: 'live' as const, note: 'tier-card note; 10tigen5gn4-f.js ≈ 462 238' },
  },
  {
    id: 'format-options-not-ordered',
    original: 'Envelope size, invitation size/fold and folder pockets change the shown price but not the variant ordered, are not saved, and Undo does not reset their price.',
    ours: 'Format choices are saved in the design and undoable; folder pockets set the catalogue variant, envelope and invitation formats add a saved price adjustment.',
    decision: 'B1',
    evidence: { level: 'live' as const, note: 'envelope ₹391 → reload ₹349; Approve kept the variantId' },
  },
] as const;
