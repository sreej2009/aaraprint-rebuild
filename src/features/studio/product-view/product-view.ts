import { hasMedia, mediaUrl } from '@/lib/media';
import type { Point, Rect } from '../geometry/boxes';
import type { Size } from '../geometry/fit';
import type { ProductViewKind, StudioPlacement, StudioProductColour, StudioProfile } from '../profile/types';
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

export const PRODUCT_VIEW_KINDS: readonly ProductViewKind[] = ['umbrella', 'rainwear', 'drinkware-wrap', 'pen', 'mug'];

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
  /** The frame the placement is measured in ("photo px"): the photo itself, or a pen or mug frame (M4). */
  photo: Size;
  /** Where the photo is drawn in the frame, and which part of it (photo image px; null = all of it). */
  draw: { crop: Rect | null; at: Rect };
  placement: StudioPlacement;
  /**
   * The side's fabric mask (M3), only when its own rights are cleared, it is a library path, it is
   * the photo's size and the media library is published. Otherwise null: the photo is shown as taken.
   */
  mask: { url: string } | null;
  /** The colour the photo was taken in ("Black"), if known. */
  photoColour: string | null;
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
  const image = { width: mockup.width, height: mockup.height };
  if (typeof mockup.ref !== 'string' || !SAFE_REF.test(mockup.ref) || mockup.ref.includes('..') || !positive(image.width) || !positive(image.height)) return { ok: false, reason: 'invalid' };
  const framed = frameFor(side.photoFrame, image);
  if (!framed) return { ok: false, reason: 'invalid' };
  const { photo, draw } = framed;
  if (!isValidPlacement(side.placement, photo)) return { ok: false, reason: 'invalid' };
  if (!media.hasMedia(mockup.ref)) return { ok: false, reason: 'no-media' };
  const mask = mockup.mask;
  const maskOk =
    mask !== null &&
    typeof mask === 'object' &&
    mask.rights === 'cleared' &&
    typeof mask.ref === 'string' &&
    SAFE_REF.test(mask.ref) &&
    !mask.ref.includes('..') &&
    mask.width === image.width &&
    mask.height === image.height &&
    media.hasMedia(mask.ref);
  return {
    ok: true,
    view: {
      kind: profile.productView!,
      sideId,
      url: media.mediaUrl(mockup.ref),
      photo,
      draw,
      placement: side.placement,
      mask: maskOk ? { url: media.mediaUrl(mask.ref) } : null,
      photoColour: typeof side.photoColour === 'string' ? side.photoColour : null,
    },
  };
}

// ----------------------------------------------------------------- Colours (M3)

/** Products whose photo can be recoloured: umbrellas and rainwear. Not drinkware, mugs, pens or apparel. */
export const COLOUR_KINDS: readonly ProductViewKind[] = ['umbrella', 'rainwear'];

export interface ProductColours {
  options: StudioProductColour[];
  defaultId: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** The product's colours, validated: real #rrggbb values, names and unique ids. Null when there are none. */
export function productColoursOf(profile: StudioProfile): ProductColours | null {
  if (!hasProductView(profile) || !COLOUR_KINDS.includes(profile.productView!)) return null;
  const given = profile.productColours;
  if (!given || !Array.isArray(given.options)) return null;
  const seen = new Set<string>();
  const options = given.options.filter((o) => {
    const valid = o && typeof o.id === 'string' && o.id !== '' && !seen.has(o.id) && typeof o.label === 'string' && o.label.trim() !== '' && typeof o.hex === 'string' && HEX.test(o.hex);
    if (valid) seen.add(o.id);
    return valid;
  });
  if (!options.length) return null;
  return { options, defaultId: options.some((o) => o.id === given.defaultId) ? given.defaultId : options[0]!.id };
}

/**
 * The colour to show: the one chosen in this session; else the colour of the variant being designed
 * (as the original); else the product's default colour.
 */
export function chooseColour(colours: ProductColours, chosenId: string | null, variantValueIds: readonly string[] = []): StudioProductColour {
  return colours.options.find((o) => o.id === chosenId) ?? colours.options.find((o) => variantValueIds.includes(o.id)) ?? colours.options.find((o) => o.id === colours.defaultId)!;
}

const sameName = (a: string | null, b: string) => a !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The tint for a side in a colour: its hex, or null when the side is shown as photographed — the
 * photo is already that colour (as the original), or the side has no usable mask.
 */
export function tintFor(view: ProductView, colour: StudioProductColour | null): string | null {
  if (!colour || !view.mask || sameName(view.photoColour, colour.label)) return null;
  return colour.hex;
}

/** True when a colour is chosen that this side can't show (no usable mask, or the tint failed). */
export function colourUnavailable(view: ProductView | null, colour: StudioProductColour | null, tint: 'none' | 'applied' | 'pending' | 'failed'): boolean {
  if (!view || !colour || sameName(view.photoColour, colour.label)) return false;
  return tint === 'failed' || view.mask === null;
}

/** Shown on a side that can't take the chosen colour; the photo is shown as taken. */
export const COLOUR_UNAVAILABLE = 'Colour preview unavailable for this side.';

const isRect = (r: unknown): r is Rect => {
  if (!r || typeof r !== 'object') return false;
  const { x, y, width, height } = r as Record<string, unknown>;
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && positive(width) && positive(height);
};
const inside = (r: Rect, size: Size) => r.x + r.width <= size.width + 1e-9 && r.y + r.height <= size.height + 1e-9;

/**
 * The frame a side's placement is measured in, and how its photo is drawn into it (M4). Without a
 * frame (M1 photos) the frame is the photo. With one, it must make sense: positive sizes, the photo
 * (or its crop) inside the image and drawn inside the frame, and not stretched (proportions within
 * 1 %, as the original drew pen photos into their 2000 × 700 frame). Otherwise null: invalid.
 */
export function frameFor(frame: unknown, image: Size): { photo: Size; draw: { crop: Rect | null; at: Rect } } | null {
  if (frame === undefined || frame === null) return { photo: image, draw: { crop: null, at: { x: 0, y: 0, width: image.width, height: image.height } } };
  if (typeof frame !== 'object') return null;
  const { width, height, crop, at } = frame as Record<string, unknown>;
  if (!positive(width) || !positive(height) || !isRect(at) || !inside(at, { width, height })) return null;
  if (crop !== null && (!isRect(crop) || !inside(crop, image))) return null;
  const shown = crop ?? image;
  if (Math.abs(shown.width / shown.height / (at.width / at.height) - 1) > 0.01) return null;
  return { photo: { width, height }, draw: { crop: crop ?? null, at } };
}

/** Where the photo is drawn, in design px (print px), for the editor (M2/M4). */
export function photoRect(view: ProductView, placed: PlacedArtwork): Rect {
  const corner = productToDesign({ x: view.draw.at.x, y: view.draw.at.y }, placed);
  return { x: corner.x, y: corner.y, width: view.draw.at.width / placed.scale, height: view.draw.at.height / placed.scale };
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
