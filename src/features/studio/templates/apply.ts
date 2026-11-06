import { transformElement, type Transform } from '../commands';
import { assertNewElementIds, DesignCommandError, getSurface, withSurface } from '../commands/shared';
import { finishedSizeMm, printBoxes } from '../geometry/boxes';
import type { DesignDocument, DesignElement, SurfaceDesign, SurfacePrint } from '../schema/types';
import { isTwoSided, TEMPLATE_SIDES, type StudioTemplate, type TemplateSide } from './types';

/**
 * Applying a template (Plan M13): a pure M2-style command, `(document, …) => document`, so the
 * store runs it as one undo step however many sides and elements it touches.
 *
 * - Every element is a copy with a fresh id; the template's own ids are never used in designs.
 * - **Same size** (within 1 mm): elements keep their millimetres, positions, proportions,
 *   rotations and order (only the DPI is converted).
 * - **Other size** (see compat.ts): the template's safe area is scaled uniformly into this
 *   side's safe area and centred, so everything that was safe stays safe. Rectangles that ran to
 *   or past an edge (background bands) still do. The product's own size never changes.
 * - **replace** swaps the side's elements and background for the template's.
 *   **add** keeps them and puts the template's elements on top; the side's background stays,
 *   and the template's is used only if the side has none.
 */

export type ApplyMode = 'replace' | 'add';

export interface ApplyTarget {
  /** The design surface that receives the template. */
  surfaceId: string;
  /** Which side of the template goes there. */
  side: TemplateSide;
}

/** Which template side goes on which design side: just the active side, or front to front and back to back. */
export function templateTargets(template: StudioTemplate, document: DesignDocument, activeSurfaceId: string, scope: 'side' | 'both'): ApplyTarget[] {
  if (scope === 'both' && isTwoSided(template)) {
    return TEMPLATE_SIDES.filter((side) => document.surfaces.some((s) => s.id === side)).map((side) => ({ surfaceId: side, side }));
  }
  // A two-sided template puts its matching side here; a one-sided one puts its only side on any side.
  const side: TemplateSide = activeSurfaceId === 'back' && template.surfaces.back ? 'back' : 'front';
  return [{ surfaceId: activeSurfaceId, side }];
}

const SIZE_TOLERANCE_MM = 1;

export function sameFinishedSize(a: SurfacePrint, b: SurfacePrint): boolean {
  const from = finishedSizeMm(a);
  const to = finishedSizeMm(b);
  return Math.abs(from.width - to.width) <= SIZE_TOLERANCE_MM && Math.abs(from.height - to.height) <= SIZE_TOLERANCE_MM;
}

/** How the template's artwork maps onto the target side (print px to print px). */
export function placementTransform(from: SurfacePrint, to: SurfacePrint): Transform & { adapted: boolean } {
  if (sameFinishedSize(from, to)) {
    const scale = to.dpi / from.dpi; // same millimetres at the target's resolution
    return { scale, dx: (to.widthPx - from.widthPx * scale) / 2, dy: (to.heightPx - from.heightPx * scale) / 2, adapted: false };
  }
  const a = printBoxes(from).safe;
  const b = printBoxes(to).safe;
  const scale = Math.min(b.width / a.width, b.height / a.height);
  return { scale, dx: b.x + (b.width - a.width * scale) / 2 - a.x * scale, dy: b.y + (b.height - a.height * scale) / 2 - a.y * scale, adapted: true };
}

function placeElement(element: DesignElement, from: SurfacePrint, to: SurfacePrint, transform: Transform & { adapted: boolean }, id: string): DesignElement {
  const moved = transformElement({ ...element, id }, transform);
  if (!transform.adapted || moved.type !== 'shape' || moved.shape !== 'rect' || element.rotation % 360 !== 0) return moved;
  // A band that ran to (or into the bleed past) an edge keeps doing so at the new proportions.
  let left = moved.x;
  let right = moved.x + moved.width;
  let top = moved.y;
  let bottom = moved.y + moved.height;
  if (element.x <= 0) left = element.x < 0 ? -to.bleedPx : 0;
  if (element.x + element.width >= from.widthPx) right = element.x + element.width > from.widthPx ? to.widthPx + to.bleedPx : to.widthPx;
  if (element.y <= 0) top = element.y < 0 ? -to.bleedPx : 0;
  if (element.y + element.height >= from.heightPx) bottom = element.y + element.height > from.heightPx ? to.heightPx + to.bleedPx : to.heightPx;
  return { ...moved, x: left, y: top, width: right - left, height: bottom - top };
}

/** The template side's elements placed on `target`, each with a new id. */
export function placeTemplateSide(template: StudioTemplate, side: TemplateSide, target: SurfacePrint, newId: () => string): DesignElement[] {
  const source = template.surfaces[side];
  if (!source) throw new DesignCommandError(`Template "${template.id}" has no ${side}`);
  const transform = placementTransform(source.print, target);
  return source.elements.map((element) => placeElement(element, source.print, target, transform, newId()));
}

export function applyTemplate(document: DesignDocument, template: StudioTemplate, targets: readonly ApplyTarget[], mode: ApplyMode, newId: () => string): DesignDocument {
  if (targets.length === 0) return document;
  const placed = targets.map((target) => {
    const surface = getSurface(document, target.surfaceId);
    return { target, background: template.surfaces[target.side]!.background, elements: placeTemplateSide(template, target.side, surface.print, newId) };
  });
  assertNewElementIds(
    document,
    placed.flatMap((p) => p.elements.map((e) => e.id)),
  );
  return placed.reduce(
    (doc, { target, background, elements }) =>
      withSurface(doc, target.surfaceId, (surface): SurfaceDesign =>
        mode === 'replace'
          ? { ...surface, background: { ...background }, elements }
          : { ...surface, background: surface.background.color === null ? { ...background } : surface.background, elements: [...surface.elements, ...elements] },
      ),
    document,
  );
}
