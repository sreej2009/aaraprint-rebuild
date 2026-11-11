import { hasMedia, mediaUrl } from '@/lib/media';
import type { Point, Rect } from '../geometry/boxes';
import type { Size } from '../geometry/fit';
import type { ProductViewKind, StudioPlacement, StudioProfile } from '../profile/types';
import type { PreviewSpace } from '../preview/preview-view';

/**
 * The "On the product" view (Phase 4 M1 Preview, M2 editing workspace): which products and sides
 * can show the design on a product photo, and where the artwork goes on it. Pure and read-only — a
 * visual layer. The design stays print-space data: nothing here is saved, exported or undone.
 *
 * Three coordinate spaces, kept apart:
 *   design  — print px, trim origin (the saved design; never changes meaning here)
 *   product — the photo's px (the original's placement boxes)
 *   screen  — CSS px (the editor's or Preview's viewport)
 * design → product is `designToProduct` (the placement: scale, then offset); the photo shown in
 * design space is `productBounds`. Editors keep working in design space throughout.
 *
 * A photo is only ever shown when its rights are cleared, it has the original's placement for that
 * exact photo, and the media library is published. Otherwise the Preview stays flat.
 */

export const PRODUCT_VIEW_KINDS: readonly ProductViewKind[] = ['umbrella', 'rainwear', 'drinkware-wrap'];

export type ProductViewUnavailable =
  /** Not an umbrella, rainwear or wrap-printed drinkware product. */
  | 'unsupported'
  /** The side has no product photo. */
  | 'no-mockup'
  /** The photo's usage rights aren't cleared (or aren't recorded). */
  | 'rights'
  /** No placement for this photo. */
  | 'no-placement'
  /** The placement or photo data doesn't make sense. */
  | 'invalid'
  /** The site is published without its media library (GitHub Pages). */
  | 'no-media';

export interface ProductView {
  kind: ProductViewKind;
  sideId: string;
  url: string;
  photo: Size;
  placement: StudioPlacement;
}

export type ProductViewResult = { ok: true; view: ProductView } | { ok: false; reason: ProductViewUnavailable };

/** Where the artwork lands on the photo, in photo px. `scale` is photo px per print px. */
export interface PlacedArtwork {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface MediaAccess {
  hasMedia(ref: string): boolean;
  mediaUrl(ref: string): string;
}

const LIBRARY: MediaAccess = { hasMedia, mediaUrl };

/** Library paths only (no other sites, no `..`): "products/umbrellas-rainwear-2d/umbrella-golf-front.webp". */
const SAFE_REF = /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_.-]*)*\.(?:png|webp)$/i;

function positive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** A box with real, positive numbers that lies wholly on the photo. */
export function isValidPlacement(box: unknown, photo: Size): box is StudioPlacement {
  if (!box || typeof box !== 'object') return false;
  const { centerX, centerY, maxWidth, maxHeight } = box as Record<string, unknown>;
  if (!positive(centerX) || !positive(centerY) || !positive(maxWidth) || !positive(maxHeight)) return false;
  return centerX - maxWidth / 2 >= 0 && centerY - maxHeight / 2 >= 0 && centerX + maxWidth / 2 <= photo.width && centerY + maxHeight / 2 <= photo.height;
}

/**
 * The original Studio's placement: the artwork (its finished size) fitted inside the box, keeping
 * its proportions, and centred on the box's centre. A flat rectangle — no warp or perspective.
 */
export function placeArtwork(box: StudioPlacement, artwork: Size): PlacedArtwork {
  const scale = Math.min(box.maxWidth / artwork.width, box.maxHeight / artwork.height);
  const width = artwork.width * scale;
  const height = artwork.height * scale;
  return { x: box.centerX - width / 2, y: box.centerY - height / 2, width, height, scale };
}

/** True for products that have an on-product preview at all (whether or not a photo can be shown). */
export function hasProductView(profile: StudioProfile): boolean {
  return profile.productView !== undefined && PRODUCT_VIEW_KINDS.includes(profile.productView);
}

/** Whether `sideId` can be shown on the product, and with which photo — or why not. */
export function productViewFor(profile: StudioProfile, sideId: string, media: MediaAccess = LIBRARY): ProductViewResult {
  if (!hasProductView(profile)) return { ok: false, reason: 'unsupported' };
  const side = profile.sides.find((s) => s.id === sideId);
  const mockup = side?.mockup;
  if (!side || !mockup) return { ok: false, reason: 'no-mockup' };
  // Cleared only: mockups carry no attribution line to show, and unconfirmed or unrecorded rights block.
  if (mockup.rights !== 'cleared') return { ok: false, reason: 'rights' };
  if (side.placement === undefined || side.placement === null) return { ok: false, reason: 'no-placement' };
  const photo = { width: mockup.width, height: mockup.height };
  if (typeof mockup.ref !== 'string' || !SAFE_REF.test(mockup.ref) || mockup.ref.includes('..') || !positive(photo.width) || !positive(photo.height)) return { ok: false, reason: 'invalid' };
  if (!isValidPlacement(side.placement, photo)) return { ok: false, reason: 'invalid' };
  if (!media.hasMedia(mockup.ref)) return { ok: false, reason: 'no-media' };
  return { ok: true, view: { kind: profile.productView!, sideId, url: media.mediaUrl(mockup.ref), photo, placement: side.placement } };
}

/**
 * The space the Preview zooms and pans in on the product: the whole photo, with a "dpi" chosen so
 * that 100 % still means the artwork at its real printed size, as in the flat preview.
 */
export function productSpace(view: ProductView, placed: PlacedArtwork, print: Pick<PreviewSpace, 'dpi'>): PreviewSpace {
  return { widthPx: view.photo.width, heightPx: view.photo.height, dpi: print.dpi * placed.scale };
}

/** A design point (print px) on the photo (photo px). */
export function designToProduct(point: Point, placed: PlacedArtwork): Point {
  return { x: placed.x + point.x * placed.scale, y: placed.y + point.y * placed.scale };
}

/** A photo point (photo px) in design space (print px): the inverse of `designToProduct`. */
export function productToDesign(point: Point, placed: PlacedArtwork): Point {
  return { x: (point.x - placed.x) / placed.scale, y: (point.y - placed.y) / placed.scale };
}

/**
 * The whole photo in design space (print px): where the editor draws it behind the artwork, and
 * what Fit shows on the product (M2). The print area sits inside it at the original's place.
 */
export function productBounds(view: ProductView, placed: PlacedArtwork): Rect {
  const origin = productToDesign({ x: 0, y: 0 }, placed);
  return { x: origin.x, y: origin.y, width: view.photo.width / placed.scale, height: view.photo.height / placed.scale };
}
