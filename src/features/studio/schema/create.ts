import { initialConfiguration, type Orientation } from '@/features/product-workflow/configuration';
import { familyIdForSlug, productWorkflow } from '@/features/product-workflow/registry';
import type { Product } from '@/lib/catalogue/types';
import { createId, type IdFactory } from '../ids';
import type { StudioProfile } from '../profile/types';
import {
  CURRENT_SCHEMA_VERSION,
  DESIGN_FORMAT,
  type DesignDocument,
  type ImageElement,
  type ImageSource,
  type ShapeElement,
  type ShapeKind,
  type SurfacePrint,
  type TextElement,
} from './types';

/** Explicit print geometry for a surface, copied from the product's Studio profile. */
export function surfacePrintFromProfile(profile: StudioProfile): SurfacePrint {
  const { widthPx, heightPx, dpi, bleedPx, safeZonePx } = profile.print;
  return { widthPx, heightPx, dpi, bleedPx, safeZonePx, trim: { shape: profile.trim.shape, cornerRadiusPx: profile.trim.cornerRadiusPx } };
}

export interface BlankDesignOptions {
  variantId?: string | null;
  /**
   * The catalogue product, so the configuration records the variant's own option values and SKU.
   * Without it the variant id is kept and the selection is filled in when the Studio has the product.
   */
  catalogue?: Pick<Product, 'optionGroups' | 'variants'> | null;
  /** From the required-options dialog (later milestone); null = not chosen. */
  orientation?: Orientation | null;
  name?: string;
  now?: Date;
  newId?: IdFactory;
}

/** An empty design with one surface per profile side (front and back in Phase 3). */
export function createBlankDesign(profile: StudioProfile, options: BlankDesignOptions = {}): DesignDocument {
  const newId = options.newId ?? createId;
  const now = (options.now ?? new Date()).toISOString();
  const print = surfacePrintFromProfile(profile);
  const variantId = options.variantId ?? null;
  const variant = variantId ? options.catalogue?.variants.find((v) => v.id === variantId) : undefined;
  return {
    format: DESIGN_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId('design'),
    name: options.name ?? `${profile.name} design`,
    product: {
      slug: profile.slug,
      productId: profile.productId,
      familyId: familyIdForSlug(profile.slug),
      variantId,
      sku: variant?.sku ?? null,
      configuration: initialConfiguration({
        workflow: productWorkflow(profile.slug),
        catalogue: options.catalogue ?? null,
        variant: variant ?? null,
        orientation: options.orientation ?? null,
      }),
    },
    surfaces: profile.sides.map((side) => ({
      id: side.id,
      label: side.label,
      print: { ...print, trim: { ...print.trim } },
      background: { color: null },
      elements: [],
    })),
    assets: {},
    meta: { createdAt: now, updatedAt: now, revision: 0 },
  };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const baseDefaults = { name: null, rotation: 0, opacity: 1, locked: false, hidden: false };

export function createTextElement(box: Box, fields: Partial<Omit<TextElement, 'type'>> = {}, newId: IdFactory = createId): TextElement {
  return {
    ...baseDefaults,
    text: 'Your text',
    fontFamily: 'Inter',
    fontSize: 50, // 12 pt at 300 DPI
    fontWeight: 400,
    italic: false,
    underline: false,
    color: '#1b1f27',
    align: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    placeholder: false,
    ...box,
    ...fields,
    id: fields.id ?? newId('el'),
    type: 'text',
  };
}

export function createShapeElement(shape: ShapeKind, box: Box, fields: Partial<Omit<ShapeElement, 'type' | 'shape'>> = {}, newId: IdFactory = createId): ShapeElement {
  const isLine = shape === 'line' || shape === 'arrow';
  return {
    ...baseDefaults,
    fill: isLine ? null : '#2f5bd3',
    stroke: isLine ? '#1b1f27' : null,
    strokeWidth: isLine ? 6 : 0,
    cornerRadius: 0,
    points: shape === 'polygon' ? 6 : 5,
    innerRadius: 0.5,
    lineCap: 'round',
    dash: 'solid',
    ...box,
    ...fields,
    id: fields.id ?? newId('el'),
    type: 'shape',
    shape,
  };
}

export function createImageElement(source: ImageSource, box: Box, fields: Partial<Omit<ImageElement, 'type' | 'source'>> = {}, newId: IdFactory = createId): ImageElement {
  return { ...baseDefaults, ...box, ...fields, id: fields.id ?? newId('el'), type: 'image', source };
}
