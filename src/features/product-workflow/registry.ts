import membership from '@/data/generated/studio/product-families.json';
import type { OptionGroup, Product } from '@/lib/catalogue/types';
import { PRODUCT_FAMILIES } from './families';
import {
  isProductFamilyId,
  PRODUCT_FAMILY_IDS,
  type CatalogueOptionDefinition,
  type FamilyCapabilities,
  type InitialTool,
  type ProductFamilyDefinition,
  type ProductFamilyId,
  type ProductOptionDefinition,
  type SameDesignBehaviour,
  type SurfaceDefinition,
  type WorkspaceKind,
  type WorkspaceView,
} from './types';

/**
 * The product-family registry (Phase 4 M1): one place that says, for any catalogue product, which
 * family it belongs to and how its Studio should behave. Family behaviour comes from families.ts;
 * membership and per-product facts observed on the original (initial tool, surfaces, 3D, the
 * same-design switch) come from the generated product-families.json.
 */

interface ObservedFacts {
  tool: InitialTool;
  surfaces: string[];
  preview3d: boolean;
  sameDesignSwitch: boolean;
  entryQuantityTiers: number;
}

interface MembershipEntry {
  family: string;
  observed: ObservedFacts | null;
}

const MEMBERS = membership.products as Record<string, MembershipEntry>;

export function listFamilies(): ProductFamilyDefinition[] {
  return PRODUCT_FAMILY_IDS.map((id) => PRODUCT_FAMILIES[id]);
}

export function familyDefinition(id: ProductFamilyId): ProductFamilyDefinition {
  return PRODUCT_FAMILIES[id];
}

/** Slugs of every product the registry knows. */
export function registeredSlugs(): string[] {
  return Object.keys(MEMBERS);
}

/** The family of a catalogue product, or null when the registry doesn't know the product (never guessed). */
export function familyIdForSlug(slug: string): ProductFamilyId | null {
  const family = MEMBERS[slug]?.family;
  return isProductFamilyId(family) ? family : null;
}

export interface ProductWorkflow {
  /** The catalogue product's slug (the registry's key; ids live in the catalogue). */
  slug: string;
  family: ProductFamilyDefinition;
  /** Has "Design it" in the original. */
  customizable: boolean;
  initialStudio: { tool: InitialTool; workspace: WorkspaceKind; view: WorkspaceView };
  /** Printable surfaces in order (observed side tabs when known; single-surface products have one). */
  surfaces: SurfaceDefinition[];
  sameDesignBothSides: SameDesignBehaviour;
  /** 2D/3D preview in the original. */
  preview3d: boolean;
  entry: { orientation: ProductFamilyDefinition['entry']['orientation']; quantityTiers: number };
  /** The family's options that apply to this product. */
  options: ProductOptionDefinition[];
  capabilities: FamilyCapabilities;
  /** True when per-product facts come from the live survey (false: family defaults only). */
  observed: boolean;
}

/** Original side-tab labels → our surface ids. */
const SURFACE_IDS: Record<string, string> = {
  Front: 'front',
  Back: 'back',
  Flap: 'flap',
  Inside: 'inside',
  'Cover Front': 'cover-front',
  'Cover Back': 'cover-back',
  'Inside Page': 'inside-page',
  'Pocket Inside': 'pocket-inside',
};

function surfacesFor(family: ProductFamilyDefinition, observed: ObservedFacts | null): SurfaceDefinition[] {
  if (!observed) return [...family.surfaces];
  const labels = observed.surfaces;
  // Stamps show Front View / Back View photo tabs; their printable surfaces are front and back (Review).
  if (labels.length === 0 || labels.every((l) => /View$/.test(l))) {
    return labels.length === 0 ? [family.surfaces[0] ?? { id: 'front', label: 'Front' }] : [...family.surfaces];
  }
  return labels.map((label) => {
    const known = family.surfaces.find((s) => s.label === label || s.id === SURFACE_IDS[label]);
    if (known) return { ...known };
    const outside = /^Outside cover-(\d+)$/.exec(label);
    return { id: outside ? `outside-cover-${outside[1]}` : (SURFACE_IDS[label] ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '-')), label };
  });
}

/** Everything the Studio needs to know about one product's workflow, or null for unknown products. */
export function productWorkflow(slug: string): ProductWorkflow | null {
  const entry = MEMBERS[slug];
  if (!entry || !isProductFamilyId(entry.family)) return null;
  const family = PRODUCT_FAMILIES[entry.family];
  const observed = entry.observed;
  const surfaces = surfacesFor(family, observed);
  const preview3d = observed ? observed.preview3d : family.capabilities.preview3d;
  const sameDesignAvailable = observed ? observed.sameDesignSwitch : family.sameDesignBothSides.available;
  return {
    slug,
    family,
    customizable: observed !== null,
    initialStudio: { tool: observed?.tool ?? family.initialStudio.tool, workspace: family.initialStudio.workspace, view: family.initialStudio.views[0] ?? 'print-area' },
    surfaces,
    sameDesignBothSides: sameDesignAvailable
      ? { ...family.sameDesignBothSides, available: true, defaultOn: family.sameDesignBothSides.available ? family.sameDesignBothSides.defaultOn : true }
      : { available: false, defaultOn: false, evidence: observed ? { level: 'live', note: 'No switch on this product' } : family.sameDesignBothSides.evidence },
    preview3d,
    entry: { orientation: family.entry.orientation, quantityTiers: observed?.entryQuantityTiers ?? 0 },
    options: family.options.filter((option) => !option.products || option.products.includes(slug)),
    capabilities: {
      ...family.capabilities,
      preview3d,
      frontBack: surfaces.length > 1,
      sameDesignBothSides: sameDesignAvailable,
    },
    observed: observed !== null,
  };
}

// ── Binding catalogue options to a product's own option groups ───────────────────────────────

export interface BoundCatalogueOption {
  definition: CatalogueOptionDefinition;
  group: OptionGroup;
}

/**
 * The workflow's catalogue options bound to this product's option groups: named options take the
 * first matching group; an `all-other` option takes every group nothing else bound (one binding
 * per group). Groups with a single value are kept — they're still part of the variant.
 */
export function bindCatalogueOptions(workflow: Pick<ProductWorkflow, 'options'>, product: Pick<Product, 'optionGroups'>): BoundCatalogueOption[] {
  const catalogue = workflow.options.filter((o): o is CatalogueOptionDefinition => o.source === 'catalogue');
  const bound: BoundCatalogueOption[] = [];
  const used = new Set<string>();
  for (const definition of catalogue) {
    if (definition.groupNames === 'all-other') continue;
    const group = definition.groupNames.map((name) => product.optionGroups.find((g) => g.name === name && !used.has(g.id))).find(Boolean);
    if (group) {
      bound.push({ definition, group });
      used.add(group.id);
    }
  }
  const rest = catalogue.find((o) => o.groupNames === 'all-other');
  if (rest) {
    for (const group of product.optionGroups) if (!used.has(group.id)) bound.push({ definition: rest, group });
  }
  return bound;
}

/** The catalogue group playing a role (product colour, size…) for this product, if any. */
export function catalogueGroupForRole(workflow: Pick<ProductWorkflow, 'options'>, product: Pick<Product, 'optionGroups'>, role: ProductOptionDefinition['role']): OptionGroup | undefined {
  return bindCatalogueOptions(workflow, product).find((b) => b.definition.role === role)?.group;
}

/**
 * The workflow's options that apply to this catalogue product (Phase 4 M2). A family's options
 * can depend on what the product itself offers (audit §7, live):
 * - the substrate colour ("Fabric colour", "Paper colour"…) is shown when the product has no
 *   catalogue colour (jute tote, posters, labels);
 * - the custom colour ("saved as the colour to produce") goes with a catalogue colour (t-shirts,
 *   caps, backpacks).
 */
export function applicableOptions(workflow: Pick<ProductWorkflow, 'options'>, product: Pick<Product, 'optionGroups'>): ProductOptionDefinition[] {
  const hasColour = catalogueGroupForRole(workflow, product, 'product-colour') !== undefined;
  return workflow.options.filter((option) => {
    if (option.role === 'substrate-colour') return !hasColour;
    if (option.role === 'custom-product-colour') return hasColour;
    return true;
  });
}
