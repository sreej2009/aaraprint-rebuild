import {
  clampQuantity,
  DIMENSION_RANGE_MM,
  sameChoice,
  selectionOfVariant,
  STUDIO_CHOICE_KEY_PATTERN,
  STUDIO_VALUE_ID_PATTERN,
  type Orientation,
  type ProductConfiguration,
  type StudioChoice,
} from '@/features/product-workflow/configuration';
import { catalogueGroupForRole, familyIdForSlug, type ProductWorkflow } from '@/features/product-workflow/registry';
import type { StudioOptionDefinition } from '@/features/product-workflow/types';
import type { Product } from '@/lib/catalogue/types';
import { resolveVariant } from '@/lib/pricing';
import type { DesignDocument } from '../schema/types';
import { DesignCommandError } from './shared';

/**
 * Product configuration commands (Phase 4 M1). Pure, like every document command: same document
 * back when nothing changes; only `product` is replaced, the artwork is shared untouched. Commands
 * that change the catalogue selection re-resolve the variant and SKU in the same step, so the
 * document never names a variant that doesn't match its options (null when the combination
 * doesn't exist — never guessed).
 */

/** What the commands need from the catalogue product. */
export type CatalogueProduct = Pick<Product, 'slug' | 'optionGroups' | 'variants'>;

const HEX = /^#[0-9a-f]{6}$/i;

function withProduct(document: DesignDocument, product: Partial<DesignDocument['product']>): DesignDocument {
  return { ...document, product: { ...document.product, ...product } };
}

function withConfiguration(document: DesignDocument, configuration: Partial<ProductConfiguration>): DesignDocument {
  return withProduct(document, { configuration: { ...document.product.configuration, ...configuration } });
}

function assertSameProduct(document: DesignDocument, product: CatalogueProduct): void {
  if (product.slug !== document.product.slug) throw new DesignCommandError(`The design is for "${document.product.slug}", not "${product.slug}"`);
}

/** Options + the variant and SKU they resolve to. */
function selectOptions(document: DesignDocument, product: CatalogueProduct, options: Record<string, string>): DesignDocument {
  const variant = resolveVariant(product, options);
  return withProduct(document, {
    variantId: variant?.id ?? null,
    sku: variant?.sku ?? null,
    configuration: { ...document.product.configuration, options },
  });
}

function sameSelection(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/** Choose catalogue option values (group id → value id) — several at once is one change. */
export function setProductOptions(document: DesignDocument, product: CatalogueProduct, values: Record<string, string>): DesignDocument {
  assertSameProduct(document, product);
  for (const [groupId, valueId] of Object.entries(values)) {
    const group = product.optionGroups.find((g) => g.id === groupId);
    if (!group) throw new DesignCommandError(`Unknown option group "${groupId}"`);
    if (!group.values.some((v) => v.id === valueId)) throw new DesignCommandError(`Unknown value "${valueId}" for "${group.name}"`);
  }
  const options = { ...document.product.configuration.options, ...values };
  if (sameSelection(options, document.product.configuration.options)) return document;
  return selectOptions(document, product, options);
}

export function setProductOption(document: DesignDocument, product: CatalogueProduct, groupId: string, valueId: string): DesignDocument {
  return setProductOptions(document, product, { [groupId]: valueId });
}

/** Re-resolve the variant and SKU from the saved options (e.g. after the catalogue changed). */
export function resolveProductVariant(document: DesignDocument, product: CatalogueProduct): DesignDocument {
  assertSameProduct(document, product);
  const { options } = document.product.configuration;
  if (Object.keys(options).length === 0) return document; // nothing chosen: keep what is saved
  const variant = resolveVariant(product, options);
  const variantId = variant?.id ?? null;
  const sku = variant?.sku ?? null;
  return variantId === document.product.variantId && sku === document.product.sku ? document : withProduct(document, { variantId, sku });
}

/**
 * Follow a variant chosen outside the Studio (the product page's `?variantId=`, or the variant a
 * schema-v2 design was saved with): its option values and SKU become the configuration. Also
 * records the family when it was unknown. Unknown variants leave the document as it is.
 */
export function syncProductVariant(document: DesignDocument, product: CatalogueProduct, variantId: string | null): DesignDocument {
  assertSameProduct(document, product);
  const familyId = document.product.familyId ?? familyIdForSlug(document.product.slug);
  const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
  if (!variant) return familyId === document.product.familyId ? document : withProduct(document, { familyId });
  // The variant's values win; any other saved choices (none today) are kept.
  const options = { ...document.product.configuration.options, ...selectionOfVariant(product, variant) };
  if (variant.id === document.product.variantId && variant.sku === document.product.sku && familyId === document.product.familyId && sameSelection(options, document.product.configuration.options)) {
    return document;
  }
  return withProduct(document, { familyId, variantId: variant.id, sku: variant.sku, configuration: { ...document.product.configuration, options } });
}

export function setOrderQuantity(document: DesignDocument, quantity: number): DesignDocument {
  if (!Number.isInteger(quantity) || clampQuantity(quantity) !== quantity) throw new DesignCommandError(`Quantity must be a whole number from 1 to 99, not ${quantity}`);
  return quantity === document.product.configuration.quantity ? document : withConfiguration(document, { quantity });
}

export function setOrientation(document: DesignDocument, orientation: Orientation): DesignDocument {
  if (orientation !== 'horizontal' && orientation !== 'vertical') throw new DesignCommandError(`Unknown orientation "${String(orientation)}"`);
  return orientation === document.product.configuration.orientation ? document : withConfiguration(document, { orientation });
}

export function setSameDesignBothSides(document: DesignDocument, on: boolean): DesignDocument {
  return on === document.product.configuration.sameDesignBothSides ? document : withConfiguration(document, { sameDesignBothSides: on });
}

/** Set (or, with null, clear) a Studio-only choice: a part or substrate colour, a format, a size, a feature. */
export function setStudioChoice(document: DesignDocument, key: string, choice: StudioChoice | null): DesignDocument {
  if (!STUDIO_CHOICE_KEY_PATTERN.test(key)) throw new DesignCommandError(`Invalid option id "${key}"`);
  if (choice) assertValidChoice(choice);
  const current = document.product.configuration.studio;
  if (sameChoice(current[key], choice ?? undefined)) return document;
  const studio = { ...current };
  if (choice) studio[key] = choice;
  else delete studio[key];
  return withConfiguration(document, { studio });
}

function assertValidChoice(choice: StudioChoice): void {
  if (choice.type === 'choice' && STUDIO_VALUE_ID_PATTERN.test(choice.valueId)) return;
  if (choice.type === 'colour' && HEX.test(choice.hex) && (choice.valueId === null || STUDIO_VALUE_ID_PATTERN.test(choice.valueId))) return;
  if (
    choice.type === 'dimensions' &&
    [choice.widthMm, choice.heightMm].every((mm) => Number.isFinite(mm) && mm >= DIMENSION_RANGE_MM.min && mm <= DIMENSION_RANGE_MM.max) &&
    (choice.presetId === null || STUDIO_VALUE_ID_PATTERN.test(choice.presetId))
  ) {
    return;
  }
  throw new DesignCommandError(`Invalid ${choice.type} value`);
}

/** Choose the product colour that is ordered (the family's "product colour" catalogue option). */
export function setProductColour(document: DesignDocument, product: CatalogueProduct, workflow: Pick<ProductWorkflow, 'options'>, valueId: string): DesignDocument {
  const group = catalogueGroupForRole(workflow, product, 'product-colour') ?? catalogueGroupForRole(workflow, product, 'ink-colour');
  if (!group) throw new DesignCommandError(`"${product.slug}" has no product colour option`);
  return setProductOption(document, product, group.id, valueId);
}

export type ProductSize = { valueId: string } | { widthMm: number; heightMm: number; presetId?: string | null };

/**
 * Choose the product size: a catalogue size value (changes the variant), or Studio dimensions for
 * families that size the product in the Studio (gifts, mugs). Resizing the artwork to match is a
 * later milestone; this records the choice.
 */
export function setProductSize(document: DesignDocument, product: CatalogueProduct, workflow: Pick<ProductWorkflow, 'options'>, size: ProductSize): DesignDocument {
  if ('valueId' in size) {
    const group = catalogueGroupForRole(workflow, product, 'size') ?? catalogueGroupForRole(workflow, product, 'stamp-size');
    if (!group) throw new DesignCommandError(`"${product.slug}" has no catalogue size option`);
    return setProductOption(document, product, group.id, size.valueId);
  }
  const option = workflow.options.find((o): o is StudioOptionDefinition => o.source === 'studio' && o.type === 'dimensions');
  if (!option) throw new DesignCommandError(`"${product.slug}" has no Studio size option`);
  return setStudioChoice(document, option.id, { type: 'dimensions', widthMm: size.widthMm, heightMm: size.heightMm, presetId: size.presetId ?? null });
}
