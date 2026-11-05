import { MIN_SIZE_MM } from '../canvas/transform-rules';
import { mmToPx, pxToMm } from '../geometry/units';
import { elementDisplayName } from '../naming';
import type { DesignDocument, DesignElement, ElementPatch, ShapeKind, SurfaceDesign, SurfacePrint } from '../schema/types';

/**
 * Inspector rules, kept pure: unit conversion between the fields (mm, °, %) and the document
 * (print px, degrees, 0–1), proportion locking, centring and layer-order availability.
 */

const SHAPE_LABELS: Record<ShapeKind, string> = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', triangle: 'Triangle', star: 'Star', arrow: 'Arrow' };

/** "Text", "Image", "Graphic", or the shape's name. */
export function elementTypeLabel(element: DesignElement): string {
  if (element.type === 'text') return 'Text';
  if (element.type === 'image') return element.source.kind === 'graphic' ? 'Graphic' : 'Image';
  return SHAPE_LABELS[element.shape];
}

/** Screen-reader name for a layer row: "Riya Sharma, text, hidden, locked". */
export function layerAccessibleName(element: DesignElement, document: DesignDocument): string {
  const parts = [elementDisplayName(element, document), elementTypeLabel(element).toLowerCase()];
  if (element.hidden) parts.push('hidden');
  if (element.locked) parts.push('locked');
  return parts.join(', ');
}

// ----------------------------------------------------------------- Units

/** Stored geometry is rounded to 0.01 print px. */
const round2 = (value: number) => Math.round(value * 100) / 100 || 0;

export function toMm(px: number, print: Pick<SurfacePrint, 'dpi'>): number {
  return pxToMm(px, print.dpi);
}

export function toPx(mm: number, print: Pick<SurfacePrint, 'dpi'>): number {
  return round2(mmToPx(mm, print.dpi));
}

/** Opacity is stored 0–1 and edited as a whole percentage. */
export function opacityPercent(element: DesignElement): number {
  return Math.round(element.opacity * 100);
}

export function opacityFromPercent(percent: number): number {
  return Math.round(Math.min(100, Math.max(0, percent))) / 100;
}

// ------------------------------------------------------- Size and ratio lock

/**
 * Whether the inspector offers a proportion lock: not for text (its height follows the text) or
 * lines (their height is a thickness).
 */
export function canLockRatio(element: DesignElement): boolean {
  return element.type !== 'text' && !(element.type === 'shape' && element.shape === 'line');
}

/** Images start locked, like their canvas handles; shapes start free. */
export function defaultRatioLock(element: DesignElement): boolean {
  return element.type === 'image';
}

/** Whether width / height can be typed (text height follows the text). */
export function heightEditable(element: DesignElement): boolean {
  return element.type !== 'text';
}

/**
 * The patch for typing a new width or height (mm). The box keeps its top-left corner. With the
 * lock on, the other side follows. Sizes never go below 2 mm — unless the element is already
 * smaller, in which case it may keep its size but never jumps up to the minimum.
 */
export function sizePatch(element: DesignElement, side: 'width' | 'height', valueMm: number, locked: boolean, print: Pick<SurfacePrint, 'dpi'>): ElementPatch {
  const minFor = (px: number) => Math.min(mmToPx(MIN_SIZE_MM, print.dpi), px);
  const current = element[side];
  const next = Math.max(toPx(valueMm, print), minFor(current), 0.01);
  if (!locked || !canLockRatio(element)) return { [side]: round2(next) };
  const scale = next / current;
  const other = side === 'width' ? 'height' : 'width';
  return { [side]: round2(next), [other]: round2(Math.max(element[other] * scale, 0.01)) };
}

// --------------------------------------------------------------- Centring

/** Centre the element on the finished piece (trim), horizontally or vertically. Rotation turns around the centre, so rotated elements centre too. */
export function centredPatch(element: DesignElement, print: Pick<SurfacePrint, 'widthPx' | 'heightPx'>, axis: 'horizontal' | 'vertical'): ElementPatch {
  return axis === 'horizontal' ? { x: round2((print.widthPx - element.width) / 2) } : { y: round2((print.heightPx - element.height) / 2) };
}

export function isCentred(element: DesignElement, print: Pick<SurfacePrint, 'widthPx' | 'heightPx'>, axis: 'horizontal' | 'vertical'): boolean {
  const patch = centredPatch(element, print, axis);
  return axis === 'horizontal' ? patch.x === element.x : patch.y === element.y;
}

// ------------------------------------------------------------ Layer order

/** Which layer-order moves would change anything. Elements are stored bottom to top. */
export function arrangeOptions(surface: SurfaceDesign, elementId: string): { forward: boolean; backward: boolean } {
  const index = surface.elements.findIndex((e) => e.id === elementId);
  const element = surface.elements[index];
  if (!element || element.locked) return { forward: false, backward: false };
  return { forward: index < surface.elements.length - 1, backward: index > 0 };
}
