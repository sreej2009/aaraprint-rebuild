import { boundingRect, placementOf, type ElementBox, type Placement } from '../geometry/bounds';
import { printBoxes, type Point } from '../geometry/boxes';
import { shapeContains } from '../geometry/shapes';
import { ALL_HANDLES, boxContains, CORNER_HANDLES, isCorner, roundBox, type Handle } from '../geometry/transform';
import { mmToPx } from '../geometry/units';
import type { DesignElement, ElementPatch, SurfaceDesign, SurfacePrint } from '../schema/types';
import { isPickable } from '../store/selection';
import { guideGeometry, trimShapeFromPrint } from './drawing';

/**
 * How each kind of element can be transformed on the canvas, and how a transformed box maps back
 * to element fields (Plan §18.3):
 * - text: corners scale the text (font size follows); side handles change the box width only;
 * - circles: corners only, always round;
 * - lines and arrows: the end handles move that end freely (length and angle);
 * - images, graphics and shapes follow their proportion lock (the inspector's "Keep proportions";
 *   graphics, triangles, stars and polygons start locked): locked, only the corners show and keep
 *   proportions; unlocked, all eight show and are free. Shift does the opposite while held.
 */

/** Smallest box a resize can produce, as on the original site. */
export const MIN_SIZE_MM = 2;
/** Arrow keys move 0.5 mm; Shift + arrow 5 mm (Plan §18.6). */
export const NUDGE_MM = 0.5;
export const NUDGE_LARGE_MM = 5;
/** Duplicates land this far down and right of the original. */
export const DUPLICATE_OFFSET_MM = 3;

/** Lines and arrows: their box runs along the line, and the end handles move the ends. */
export function isLineLike(element: DesignElement): boolean {
  return element.type === 'shape' && (element.shape === 'line' || element.shape === 'arrow');
}

/** Circles stay circles: width and height always change together. */
export function alwaysKeepsRatio(element: DesignElement): boolean {
  return element.type === 'shape' && element.shape === 'circle';
}

/**
 * Whether the inspector offers a proportion lock: not for text (its height follows the text),
 * lines (their height is their thickness) or circles (always round).
 */
export function canLockRatio(element: DesignElement): boolean {
  return element.type !== 'text' && !(element.type === 'shape' && (element.shape === 'line' || element.shape === 'circle'));
}

/** Images, graphics and shapes that look wrong stretched start locked; rectangles, ellipses and arrows start free. */
export function defaultRatioLock(element: DesignElement): boolean {
  if (element.type === 'image') return true;
  return element.type === 'shape' && (element.shape === 'triangle' || element.shape === 'star' || element.shape === 'polygon');
}

/** The proportion lock in effect: the customer's choice (stored) or the default. */
export function ratioLocked(element: DesignElement, stored?: boolean): boolean {
  return alwaysKeepsRatio(element) || (canLockRatio(element) && (stored ?? defaultRatioLock(element)));
}

export function handlesFor(element: DesignElement, locked = ratioLocked(element)): readonly Handle[] {
  if (element.type === 'text') return ['nw', 'ne', 'se', 'sw', 'e', 'w'];
  if (element.type === 'shape' && element.shape === 'line') return ['e', 'w'];
  if (alwaysKeepsRatio(element)) return CORNER_HANDLES;
  return locked ? CORNER_HANDLES : ALL_HANDLES;
}

/** Whether dragging `handle` keeps the element's proportions (Shift reverses the lock). */
export function keepsRatio(element: DesignElement, handle: Handle, shiftKey: boolean, locked = ratioLocked(element)): boolean {
  if (!isCorner(handle)) return false;
  if (element.type === 'text') return true; // a corner scales the whole text block
  if (alwaysKeepsRatio(element)) return true;
  return locked !== shiftKey;
}

const HANDLE_ANGLES: Record<Handle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

/** The resize cursor that points along the handle's direction once the box is rotated. */
export function cursorFor(handle: Handle, rotation: number): (typeof RESIZE_CURSORS)[number] {
  const angle = (((HANDLE_ANGLES[handle] + rotation) % 180) + 180) % 180;
  return RESIZE_CURSORS[Math.round(angle / 45) % 4]!;
}

export function minSizePx(dpi: number): number {
  return mmToPx(MIN_SIZE_MM, dpi);
}

export function boxOf(element: DesignElement): ElementBox {
  return { x: element.x, y: element.y, width: element.width, height: element.height, rotation: element.rotation };
}

/** Element fields for a transformed box. `start` is the element when the gesture began. */
export function patchForBox(start: DesignElement, box: ElementBox, handle: Handle | null): ElementPatch {
  const next = roundBox(box);
  const patch: ElementPatch = { x: next.x, y: next.y, width: next.width, height: next.height, rotation: next.rotation };
  if (start.type === 'text' && handle && isCorner(handle)) {
    const scale = box.width / start.width;
    return { ...patch, fontSize: Math.round(start.fontSize * scale * 100) / 100 } as ElementPatch;
  }
  return patch;
}

// ----------------------------------------------------------------- Picking

/**
 * The element a click at `point` (design px) picks: the topmost visible, unlocked element whose
 * box contains it. Locked items are picked from Layers instead. Points outside the printed area
 * (the bleed outline) pick nothing: artwork there is clipped away. `slop` widens hairline boxes.
 */
export function elementAt(surface: SurfaceDesign, point: Point, slop = 0): DesignElement | null {
  const guides = guideGeometry(surface.print);
  if (!shapeContains(guides.bleedShape, guides.bleed, point, slop)) return null;
  for (let i = surface.elements.length - 1; i >= 0; i -= 1) {
    const element = surface.elements[i]!;
    if (isPickable(element) && boxContains(boxOf(element), point, slop)) return element;
  }
  return null;
}

// --------------------------------------------------------------- Placement

/** Where an element sits against the safe area and trim (rotated corners, the trim's own shape). */
export function placementFor(element: DesignElement, print: SurfacePrint): Placement {
  return placementOf(boxOf(element), printBoxes(print), trimShapeFromPrint(print));
}

export const PLACEMENT_MESSAGES: Record<Placement, string | null> = {
  inside: null,
  'outside-safe': 'Part of this layer is outside the safe area and may be trimmed.',
  'outside-trim': 'Part of this layer is past the trim edge and will be cut off.',
};

/** Axis-aligned bounds of an element in design px (rotation included). */
export function elementBounds(element: DesignElement) {
  return boundingRect(boxOf(element));
}
