import type { DesignDocument, SurfaceDesign } from '../schema/types';

/**
 * Front/back rules (Plan §18.8), kept pure. Sides come from the product's Studio profile; every
 * Phase 3 profile has a front and a back, but nothing here assumes two sides.
 */

/** Nothing to print on this side: no elements and no background colour. */
export function isSurfaceEmpty(surface: SurfaceDesign): boolean {
  return surface.elements.length === 0 && surface.background.color === null;
}

export function hasSides(document: DesignDocument): boolean {
  return document.surfaces.length > 1;
}

export interface CopyPlan {
  from: SurfaceDesign;
  to: SurfaceDesign;
  /** The target has artwork: ask whether to replace it or keep both. */
  needsChoice: boolean;
}

/** "Copy front to back": the first side onto the second. Null when there's nothing to copy. */
export function frontToBackPlan(document: DesignDocument): CopyPlan | null {
  const [from, to] = document.surfaces;
  if (!from || !to || isSurfaceEmpty(from)) return null;
  return { from, to, needsChoice: !isSurfaceEmpty(to) };
}

/** "3 items", "1 item", "its background colour". */
export function describeContents(surface: SurfaceDesign): string {
  const n = surface.elements.length;
  if (n === 0) return surface.background.color ? 'a background colour' : 'nothing';
  return `${n} ${n === 1 ? 'item' : 'items'}${surface.background.color ? ' and a background colour' : ''}`;
}
