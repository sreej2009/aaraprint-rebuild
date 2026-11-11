import { useContext, useMemo } from 'react';
import { useImage } from '../assets/image-cache';
import { useViewport, useViewportStoreApi } from '../canvas/viewport-context';
import type { Rect } from '../geometry/boxes';
import type { StudioProductColour, StudioProfile } from '../profile/types';
import type { SurfaceDesign } from '../schema/types';
import { StudioSessionContext } from '../shell/session-context';
import { chooseColour, placeArtwork, productBounds, productColoursOf, productViewFor, tintFor, type PlacedArtwork, type ProductColours, type ProductView } from './product-view';
import { latestTint, useTint } from './tint-renderer';

/**
 * The product photo for one side, shared by the Preview (M1) and the editing workspace (M2): the
 * same rights gate, placement, image cache and — since M3 — the same tint pipeline. Only the shown
 * side's photo (and mask) is requested, and only once the product view is wanted.
 *
 * `status`:
 *   'flat'        — not wanted (or not offered): show the flat print area
 *   'loading'     — wanted and allowed; the photo (or its first tint) is on its way
 *   'ready'       — the photo is ready to draw
 *   'unavailable' — wanted, but this side can't be shown (no photo or placement, or it failed to load)
 *
 * `tint`:
 *   'none'    — shown as photographed (no colour chosen, the photo is already that colour, or no mask)
 *   'applied' — recoloured with the mask
 *   'pending' — a new colour is being prepared; the photo's last tint (or the photo) stays on screen
 *   'failed'  — the tint couldn't be made; the photo is shown as photographed
 */
export interface ProductViewState {
  status: 'flat' | 'loading' | 'ready' | 'unavailable';
  view: ProductView | null;
  /** Where the artwork lands on the photo (photo px). */
  placed: PlacedArtwork | null;
  /** The photo in design space (print px). */
  bounds: Rect | null;
  photo: HTMLImageElement | HTMLCanvasElement | null;
  tint: 'none' | 'applied' | 'pending' | 'failed';
}

const FLAT: ProductViewState = { status: 'flat', view: null, placed: null, bounds: null, photo: null, tint: 'none' };
const UNAVAILABLE: ProductViewState = { ...FLAT, status: 'unavailable' };

/** True when some side can be shown on the product with its fabric mask: the colour choice is worth showing. */
export function useProductColourOffered(profile: StudioProfile | null, surfaces: readonly SurfaceDesign[]): boolean {
  const sideIds = surfaces.map((s) => s.id).join();
  return useMemo(() => {
    if (!profile || !productColoursOf(profile)) return false;
    return sideIds.split(',').some((id) => {
      const result = productViewFor(profile, id);
      return result.ok && result.view.mask !== null;
    });
  }, [profile, sideIds]);
}

/** True when some side of this design can be shown on the product (the choice is offered at all). */
export function useProductViewOffered(profile: StudioProfile | null, surfaces: readonly SurfaceDesign[]): boolean {
  const sideIds = surfaces.map((s) => s.id).join();
  return useMemo(() => profile !== null && sideIds.split(',').some((id) => productViewFor(profile, id).ok), [profile, sideIds]);
}

export function useProductView(profile: StudioProfile | null, surface: SurfaceDesign | undefined, wanted: boolean, colour: StudioProductColour | null = null): ProductViewState {
  const sideId = surface?.id;
  const result = useMemo(() => (wanted && profile && sideId ? productViewFor(profile, sideId) : null), [wanted, profile, sideId]);
  const view = result?.ok ? result.view : null;
  const image = useImage(view?.url ?? null);
  const width = surface?.print.widthPx ?? 0;
  const height = surface?.print.heightPx ?? 0;
  const placed = useMemo(() => (view && width > 0 && height > 0 ? placeArtwork(view.placement, { width, height }) : null), [view, width, height]);
  const bounds = useMemo(() => (view && placed ? productBounds(view, placed) : null), [view, placed]);
  const hex = view ? tintFor(view, colour) : null;
  const loaded = image?.status === 'loaded';
  const tinting = useTint(view?.mask && hex && loaded ? { photoUrl: view.url, maskUrl: view.mask.url, hex } : null);

  if (!wanted) return FLAT;
  if (!view || !placed || !bounds || image?.status === 'error') return UNAVAILABLE;
  if (!loaded) return { status: 'loading', view, placed, bounds, photo: null, tint: 'none' };
  const base = { status: 'ready' as const, view, placed, bounds };
  if (!tinting) return { ...base, photo: image.image, tint: 'none' };
  if (tinting.status === 'ready') return { ...base, photo: tinting.image, tint: 'applied' };
  if (tinting.status === 'error') return { ...base, photo: image.image, tint: 'failed' };
  // A new colour is being prepared: keep the photo's last tint (or the photo) on screen meanwhile.
  return { ...base, photo: latestTint(view.url) ?? image.image, tint: 'pending' };
}

export interface ProductColourChoice {
  colours: ProductColours | null;
  colour: StudioProductColour | null;
  choose(id: string): void;
}

/**
 * The product colour shown on the photo, shared by the canvas and the Preview: chosen in this
 * session (viewport store), else the variant's colour, else the product's default. View state only.
 */
export function useProductColour(profile: StudioProfile | null): ProductColourChoice {
  const store = useViewportStoreApi();
  const chosen = useViewport((s) => s.productColour);
  const variant = useContext(StudioSessionContext)?.variant;
  const colours = useMemo(() => (profile ? productColoursOf(profile) : null), [profile]);
  const colour = useMemo(() => (colours ? chooseColour(colours, chosen, variant?.optionValueIds) : null), [colours, chosen, variant]);
  return { colours, colour, choose: (id) => store.getState().actions.setProductColour(id) };
}
