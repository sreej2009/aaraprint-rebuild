/**
 * Product workflow domain (Phase 4 M1): product families, their options and capabilities.
 *
 * Source of truth: AARAPRINT_CLONE_WORKFLOW_AUDIT.md (the live original, its recovered source and
 * our decisions). Everything here is data — no UI. Values the audit could not establish are
 * marked `unknown` rather than guessed.
 */

/** How a fact was established (audit labels). */
export type EvidenceLevel = 'live' | 'source' | 'inferred' | 'unknown';

export interface Evidence {
  level: EvidenceLevel;
  /** Short reference, e.g. "audit §6.1; live t-shirt XL ₹399 → ₹429". */
  note?: string;
}

export const PRODUCT_FAMILY_IDS = [
  'visiting-card',
  'stationery',
  'letterhead',
  'invitation',
  'envelope',
  'notebook',
  'folder',
  'mouse-pad',
  'round-mouse-pad',
  'stamp',
  'sign',
  'poster',
  'marketing-print',
  'label',
  'packaging',
  'apparel',
  'cap',
  'bag',
  'polo',
  'umbrella',
  'rainwear',
  'mug',
  'drinkware',
  'pen',
  'gift',
  'gift-frame',
] as const;
export type ProductFamilyId = (typeof PRODUCT_FAMILY_IDS)[number];

export function isProductFamilyId(value: unknown): value is ProductFamilyId {
  return typeof value === 'string' && (PRODUCT_FAMILY_IDS as readonly string[]).includes(value);
}

// ── Studio start ──────────────────────────────────────────────────────────────────────────────

/** The rail tool the Studio opens on. */
export type InitialTool = 'product-options' | 'text' | 'uploads';

/**
 * The editing workspace (audit §5.1):
 * - `photo-frame`  the product photo is the workspace; print area marked on it (no flat mode)
 * - `gift-frame`   product photo drawn in the canvas with Safety Area/Bleed and Apply size
 * - `perspective`  artwork warped onto the product face; On product / Flat artwork (or Seal design)
 * - `polo-stage`   drawn polo with feature overlays; 3D preview
 * - `flat`         the print area at print size with Safety Area and Bleed
 */
export type WorkspaceKind = 'photo-frame' | 'gift-frame' | 'perspective' | 'polo-stage' | 'flat';

/** A view the workspace can switch to. The first listed is the initial one. */
export type WorkspaceView = 'on-product' | 'flat-artwork' | 'seal-design' | 'garment' | 'print-area';

/** How the product itself is pictured around the artwork (data only in M1). */
export type ProductPictureKind =
  | 'umbrella-photo'
  | 'rainwear-photo'
  | 'drinkware-photo'
  | 'pen-photo'
  | 'mug-photo'
  | 'gift-photo'
  | 'round-pad-photo'
  | 'perspective-face'
  | 'stamp-photo'
  | 'polo-drawn'
  | 'none';

/** What Next → Review shows (audit §11). */
export type ReviewPreviewKind = 'on-product' | 'print-area';

// ── Surfaces ──────────────────────────────────────────────────────────────────────────────────

export interface SurfaceDefinition {
  /** Matches the design document's surface id (`front`, `back`, `flap`, `cover-front`…). */
  id: string;
  /** As the original labels it. */
  label: string;
}

export interface FrontBackBehaviour {
  /** Each surface has its own artwork. */
  artwork: 'independent';
  /** Physical choices (colour, size, lid…) apply to the whole product, not per side. */
  physicalChoices: 'shared';
  evidence: Evidence;
}

export interface SameDesignBehaviour {
  /** The "Same design on both sides" switch exists. */
  available: boolean;
  /** Initial state for a new design. */
  defaultOn: boolean;
  evidence: Evidence;
}

// ── Options ───────────────────────────────────────────────────────────────────────────────────

/**
 * What an option means, so future UI and commands can find "the colour" or "the size" without
 * knowing each product's catalogue group names.
 */
export type OptionRole =
  | 'orientation'
  | 'quantity-tier'
  | 'order-quantity'
  | 'product-colour'
  | 'custom-product-colour'
  | 'size'
  | 'print-placement'
  | 'lid-type'
  | 'ink-colour'
  | 'preset-text'
  | 'stamp-size'
  | 'pockets'
  | 'envelope-size'
  | 'format-size'
  | 'fold'
  | 'substrate-colour'
  | 'part-colour'
  | 'feature'
  | 'feature-colour'
  | 'catalogue-other';

export type OptionValueType = 'choice' | 'colour' | 'dimensions' | 'count';

/**
 * Where an option's values come from and where it's chosen:
 * - `entry`     the required-options dialog before the Studio (orientation)
 * - `catalogue` one of the product's catalogue option groups (values and prices per product)
 * - `order`     the product page's quantity / "Batches" stepper
 * - `studio`    a Studio-only choice (values listed here)
 */
export type OptionSource = 'entry' | 'catalogue' | 'order' | 'studio';

export interface OptionBehaviour {
  /** A value must be chosen before the design can be ordered. */
  required: boolean;
  /** Changes the catalogue variant (SKU) that is ordered. */
  affectsVariant: boolean;
  /** Changes the price (through the variant or a Studio price adjustment). */
  affectsPrice: boolean;
  /** Stored in the design document (so it's autosaved, versioned and restored). */
  savedInDesign: boolean;
  /** Changing it is an undo step. */
  undoable: boolean;
  /** Changeable inside the Studio (vs. only on the product page / entry dialog). */
  editableInStudio: boolean;
  /** The original applies it only after "Confirm selection" / "Apply size". */
  requiresConfirm: boolean;
}

export interface StudioChoiceValue {
  id: string;
  label: string;
  /** Studio price adjustment in paise — repo convention `…Cents` (envelope and invitation formats). */
  priceDeltaCents?: number;
  /** For colours. */
  hex?: string;
  /** For formats that set the print size. */
  widthMm?: number;
  heightMm?: number;
}

/** Values of a Studio-only option: listed, or not established by the audit. */
export type StudioValues = { status: 'known'; values: readonly StudioChoiceValue[] } | { status: 'unknown'; note: string };

interface OptionDefinitionBase {
  /** Stable id within the family, e.g. `colour`, `envelope-size`, `part-colour:handle`. */
  id: string;
  label: string;
  role: OptionRole;
  type: OptionValueType;
  behaviour: OptionBehaviour;
  /** What the original did (when we deliberately differ, the decision is noted). */
  original: Evidence;
  /** Only these products (slugs) have the option; omitted = every product in the family. */
  products?: readonly string[];
}

export interface EntryOptionDefinition extends OptionDefinitionBase {
  source: 'entry';
  values: readonly StudioChoiceValue[];
  defaultValueId: string;
}

export interface CatalogueOptionDefinition extends OptionDefinitionBase {
  source: 'catalogue';
  /**
   * Catalogue option-group names this option binds to (first match on the product wins), or
   * `'all-other'` for every catalogue group not bound by another option of the family.
   */
  groupNames: readonly string[] | 'all-other';
}

export interface OrderOptionDefinition extends OptionDefinitionBase {
  source: 'order';
  min: number;
  max: number;
}

export interface StudioOptionDefinition extends OptionDefinitionBase {
  source: 'studio';
  values: StudioValues;
  /** Default value id; null = the photographed / original colour, or no default established. */
  defaultValueId: string | null;
  /** Colours: any `#rrggbb` may be entered as well as the presets. */
  allowCustomColour?: boolean;
  /**
   * Part colours: the physical parts that can be recoloured. Each part's choice is stored under
   * `<option id>:<part id>`. `'per-product'` = the parts differ by product (listed in the original
   * source, not yet imported).
   */
  parts?: readonly SurfaceDefinition[] | 'per-product';
  /** Dimensions: allowed range per side, in millimetres. */
  rangeMm?: { min: number; max: number };
}

export type ProductOptionDefinition = EntryOptionDefinition | CatalogueOptionDefinition | OrderOptionDefinition | StudioOptionDefinition;

// ── Behaviours ────────────────────────────────────────────────────────────────────────────────

export interface EntryRequirements {
  /** "Product Orientation*" is asked for every customisable product (live, 532/532). */
  orientation: {
    required: true;
    defaultValue: 'horizontal';
    /** What choosing vertical does in the Studio. */
    effect: 'swaps-print-area' | 'ignored' | 'chosen-again-in-studio' | 'unknown';
    evidence: Evidence;
  };
  /** A Quantity select appears exactly when the catalogue has a "Quantity" group with ≥ 2 tiers (live 532/532). */
  quantityTier: { rule: 'catalogue-quantity-group'; evidence: Evidence };
}

export type ColourBehaviourKind =
  /** The catalogue colour is the colour ordered (variant), shown on the product. */
  | 'variant-colour'
  /** Physical parts recoloured in the Studio; a production reference, not a variant. */
  | 'part-colours'
  /** The material colour where artwork leaves it bare; a production reference. */
  | 'substrate-colour'
  | 'none';

export interface ColourBehaviour {
  kinds: readonly ColourBehaviourKind[];
  evidence: Evidence;
}

export type SizeBehaviourKind =
  /** Size is a catalogue option: changes the variant and price (posters: canvas unchanged). */
  | 'catalogue-variant'
  /** Studio presets or custom cm, applied with "Apply size"; resizes the artwork. */
  | 'studio-dimensions'
  /** Studio format choice with "Confirm selection" (envelope, invitation); resizes the artwork. */
  | 'studio-format'
  | 'fixed';

export interface SizeBehaviour {
  kind: SizeBehaviourKind;
  /** Does a size change resize the print area in the Studio? */
  resizesPrintArea: boolean | 'unknown';
  evidence: Evidence;
}

export interface QuantityBehaviour {
  /** Quantity tiers come from the catalogue "Quantity" group (part of the variant). */
  tiers: 'catalogue-quantity-group';
  /** The stepper multiplies the tier ("Batches") or counts units. Per product: `Product.quantityStepper`. */
  stepper: 'per-product';
  /** The original Studio never changes quantity ("Quantity stays as selected on the product page"). */
  editableInStudio: false;
  evidence: Evidence;
}

/** Data-only feature flags for later milestones (nothing here switches behaviour in M1). */
export interface FamilyCapabilities {
  flatArtwork: boolean;
  onProduct: boolean;
  perspective: boolean;
  apparelStage: boolean;
  wrap: boolean;
  frontBack: boolean;
  sameDesignBothSides: boolean;
  productColour: boolean;
  sizeSelection: boolean;
  quantityTiers: boolean;
  qr: boolean;
  tables: boolean;
  curvedText: boolean;
  /** 2D/3D preview: per product (see `ProductWorkflow.preview3d`); true here = some members have it. */
  preview3d: boolean;
  proof: boolean;
}

export interface ProductFamilyDefinition {
  id: ProductFamilyId;
  name: string;
  /** One line on what the family is. */
  description: string;
  initialStudio: { tool: InitialTool; workspace: WorkspaceKind; views: readonly WorkspaceView[]; evidence: Evidence };
  /** Default printable surfaces; products may differ (see the registry's observed surfaces). */
  surfaces: readonly SurfaceDefinition[];
  frontBack: FrontBackBehaviour;
  sameDesignBothSides: SameDesignBehaviour;
  productPicture: ProductPictureKind;
  reviewPreview: ReviewPreviewKind;
  entry: EntryRequirements;
  colour: ColourBehaviour;
  size: SizeBehaviour;
  quantity: QuantityBehaviour;
  options: readonly ProductOptionDefinition[];
  capabilities: FamilyCapabilities;
  /** How the ordered variant is worked out (see pricing.ts). */
  variantResolver: 'catalogue-selection';
  /** Facts the audit could not establish for this family. */
  unknowns: readonly string[];
}
