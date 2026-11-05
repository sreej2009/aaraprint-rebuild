/**
 * Design document (schema version 2) — the only thing the Studio saves.
 *
 * - Application data, not Konva stage JSON: the canvas is rendered *from* this document.
 * - Every surface carries its own explicit print geometry (trim size, DPI, bleed, safe zone,
 *   trim shape), so products whose options change the physical size, and multi-surface products
 *   (envelope flap, folder pockets, notebook covers), fit without schema changes.
 * - Coordinates are print pixels at the surface's DPI, with the origin at the trim's top-left
 *   corner (decision D1). The bleed area has negative coordinates.
 * - Uploaded images are referenced by asset id; the bytes live in a blob store (IndexedDB now,
 *   cloud storage in Phase 6). Documents never embed base64 image data.
 * - Version 1 is the original site's format (imported in Phase 6). Version 2 is the first
 *   version of this app's format.
 */

export const DESIGN_FORMAT = 'aaraprint.design';
export const CURRENT_SCHEMA_VERSION = 2;

/** Lower-case slug, e.g. "front", "back", "flap", "cover-front". */
export type SurfaceId = string;

export type TrimShapeName = 'rectangle' | 'rounded-rectangle' | 'ellipse';

export interface SurfacePrint {
  /** Finished (trim) size in print px. */
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** Added outside the trim on every side. */
  bleedPx: number;
  /** Inset from the trim edge that important content should stay inside. */
  safeZonePx: number;
  trim: { shape: TrimShapeName; cornerRadiusPx: number };
}

export interface SurfaceBackground {
  /** `#rrggbb`, or null for the unprinted material (paper white, garment colour…). */
  color: string | null;
}

export interface SurfaceDesign {
  id: SurfaceId;
  label: string;
  print: SurfacePrint;
  background: SurfaceBackground;
  /** Bottom to top: the last element is drawn on top. */
  elements: DesignElement[];
}

interface BaseElement {
  id: string;
  /** Layer name chosen by the customer; null = derived from the content. */
  name: string | null;
  /** Unrotated box in print px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees clockwise around the box centre. */
  rotation: number;
  /** 0–1. */
  opacity: number;
  locked: boolean;
  /** Really hidden: not drawn and not printed (the original used opacity 0). */
  hidden: boolean;
}

export const FONT_WEIGHTS = [400, 500, 600, 700, 800] as const;
export type FontWeight = (typeof FONT_WEIGHTS)[number];
export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontFamily: string;
  /** Print px; shown to customers in pt. */
  fontSize: number;
  fontWeight: FontWeight;
  italic: boolean;
  underline: boolean;
  color: string;
  align: TextAlign;
  /** Multiple of the font size. */
  lineHeight: number;
  /** Multiple of the font size (em), so it scales with the text. */
  letterSpacing: number;
  /** Sample text from a template that must be replaced before ordering (Phase 4 preflight). */
  placeholder: boolean;
}

export const SHAPE_KINDS = ['rect', 'circle', 'ellipse', 'line', 'triangle', 'star', 'polygon', 'arrow'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const LINE_CAPS = ['butt', 'round', 'square'] as const;
export type LineCap = (typeof LINE_CAPS)[number];
export const LINE_DASHES = ['solid', 'dashed', 'dotted'] as const;
export type LineDash = (typeof LINE_DASHES)[number];

/**
 * A shape drawn in its box. Closed shapes keep their border inside the box. A circle always keeps
 * width = height (an ellipse is its own kind). A line runs along its box's middle, from the left
 * edge to the right edge (rotation turns it): its length is the width and its height is its
 * thickness, which is `strokeWidth`.
 */
export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  /** `#rrggbb`, or null for no fill. Lines have none. */
  fill: string | null;
  /** `#rrggbb`, or null for no border. */
  stroke: string | null;
  /** Print px; 0 = no border. A line's thickness. */
  strokeWidth: number;
  /** Print px; rectangles only. */
  cornerRadius: number;
  /** Stars: number of points. Polygons: number of sides. */
  points: number;
  /** Stars: inner radius as a fraction of the outer one (0.1–0.95). */
  innerRadius: number;
  /** Lines and arrows: how the ends look. */
  lineCap: LineCap;
  /** Lines: solid, dashed or dotted. */
  dash: LineDash;
}

export type ImageSource = { kind: 'asset'; assetId: string } | { kind: 'graphic'; graphicId: string };

export interface ImageElement extends BaseElement {
  type: 'image';
  source: ImageSource;
}

export type DesignElement = TextElement | ShapeElement | ImageElement;
export type ElementType = DesignElement['type'];

/** Where an uploaded file's bytes live. Never the bytes themselves. */
export type AssetStorage = { kind: 'local'; blobId: string } | { kind: 'remote'; path: string };

export const UPLOAD_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'] as const;
export type UploadMimeType = (typeof UPLOAD_MIME_TYPES)[number];

export interface DesignAsset {
  id: string;
  kind: 'upload';
  /** Original file name, for layer names and "Recent uploads". */
  name: string;
  mime: UploadMimeType;
  bytes: number;
  naturalWidth: number;
  naturalHeight: number;
  storage: AssetStorage;
}

export interface DesignProductRef {
  slug: string;
  productId: string;
  variantId: string | null;
}

export interface DesignMeta {
  /** ISO 8601. Set when the document is created and saved, never by editing commands. */
  createdAt: string;
  updatedAt: string;
  /** Incremented on every save; used for conflict detection. */
  revision: number;
}

export interface DesignDocument {
  format: typeof DESIGN_FORMAT;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  id: string;
  name: string;
  product: DesignProductRef;
  /** In display order (front first). */
  surfaces: SurfaceDesign[];
  /** Uploaded files referenced by image elements, keyed by asset id. */
  assets: Record<string, DesignAsset>;
  meta: DesignMeta;
}

/** Fields an element update may change (identity and type are fixed). */
export type ElementPatch<T extends DesignElement = DesignElement> = Partial<Omit<T, 'id' | 'type'>>;
