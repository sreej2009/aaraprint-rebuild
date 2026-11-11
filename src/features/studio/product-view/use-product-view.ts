import { useMemo } from 'react';
import { useImage } from '../assets/image-cache';
import type { StudioProfile } from '../profile/types';
import type { SurfaceDesign } from '../schema/types';
import type { Rect } from '../geometry/boxes';
import { placeArtwork, productBounds, productViewFor, type PlacedArtwork, type ProductView } from './product-view';

/**
 * The product photo for one side, shared by the Preview (M1) and the editing workspace (M2): the
 * same rights gate, placement and image cache. Only the shown side's photo is requested, and only
 * once the product view is wanted.
 *
 * `status`:
 *   'flat'        — not wanted (or not offered): show the flat print area
 *   'loading'     — wanted and allowed; the photo is on its way
 *   'ready'       — the photo is loaded
 *   'unavailable' — wanted, but this side can't be shown (no photo or placement, or it failed to load)
 */
export interface ProductViewState {
  status: 'flat' | 'loading' | 'ready' | 'unavailable';
  view: ProductView | null;
  /** Where the artwork lands on the photo (photo px). */
  placed: PlacedArtwork | null;
  /** The photo in design space (print px). */
  bounds: Rect | null;
  photo: HTMLImageElement | null;
}

/** True when some side of this design can be shown on the product (the choice is offered at all). */
export function useProductViewOffered(profile: StudioProfile | null, surfaces: readonly SurfaceDesign[]): boolean {
  const sideIds = surfaces.map((s) => s.id).join();
  return useMemo(() => profile !== null && sideIds.split(',').some((id) => productViewFor(profile, id).ok), [profile, sideIds]);
}

export function useProductView(profile: StudioProfile | null, surface: SurfaceDesign | undefined, wanted: boolean): ProductViewState {
  const sideId = surface?.id;
  const result = useMemo(() => (wanted && profile && sideId ? productViewFor(profile, sideId) : null), [wanted, profile, sideId]);
  const view = result?.ok ? result.view : null;
  const image = useImage(view?.url ?? null);
  const width = surface?.print.widthPx ?? 0;
  const height = surface?.print.heightPx ?? 0;
  const placed = useMemo(() => (view && width > 0 && height > 0 ? placeArtwork(view.placement, { width, height }) : null), [view, width, height]);
  const bounds = useMemo(() => (view && placed ? productBounds(view, placed) : null), [view, placed]);
  if (!wanted) return { status: 'flat', view: null, placed: null, bounds: null, photo: null };
  if (!view || !placed || !bounds || image?.status === 'error') return { status: 'unavailable', view: null, placed: null, bounds: null, photo: null };
  if (image?.status === 'loaded') return { status: 'ready', view, placed, bounds, photo: image.image };
  return { status: 'loading', view, placed, bounds, photo: null };
}
