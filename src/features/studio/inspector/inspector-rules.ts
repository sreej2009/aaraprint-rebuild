import { alwaysKeepsRatio, canLockRatio, MIN_SIZE_MM } from '../canvas/transform-rules';
import { mmToPx, ptToPx, pxToMm, pxToPt } from '../geometry/units';
import { elementDisplayName, SHAPE_NAMES } from '../naming';
import type { DesignDocument, DesignElement, ElementPatch, ShapeElement, SurfaceDesign, SurfacePrint, TextAlign } from '../schema/types';

/**
 * Inspector rules, kept pure: unit conversion between the fields (mm, °, %) and the document
 * (print px, degrees, 0–1), proportion locking, centring and layer-order availability.
 */


/** "Text", "Image", "Graphic", or the shape's name. */
export function elementTypeLabel(element: DesignElement): string {
  if (element.type === 'text') return 'Text';
  if (element.type === 'image') return element.source.kind === 'graphic' ? 'Graphic' : 'Image';
  return SHAPE_NAMES[element.shape];
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

/** Text sizes are stored in print px and shown in points (one decimal), like a word processor. */
export function toPt(px: number, print: Pick<SurfacePrint, 'dpi'>): number {
  return Math.round(pxToPt(px, print.dpi) * 10) / 10;
}

export function fromPt(pt: number, print: Pick<SurfacePrint, 'dpi'>): number {
  return round2(ptToPx(pt, print.dpi));
}

/** The largest text the schema accepts on this surface (4 × its height), in pt. */
export function maxFontPt(print: Pick<SurfacePrint, 'dpi' | 'heightPx'>): number {
  return Math.floor(pxToPt(print.heightPx * 4, print.dpi));
}

/** Smallest size offered; below this print is unreadable. */
export const MIN_FONT_PT = 1;

/** Line height is a multiple of the font size; letter spacing is in em (also a multiple of it). */
export const LINE_HEIGHT_RANGE = { min: 0.5, max: 3 } as const;
export const LETTER_SPACING_RANGE = { min: -0.5, max: 2 } as const;

export const ALIGN_LABELS: Record<TextAlign, string> = { left: 'Align left', center: 'Centre', right: 'Align right', justify: 'Justify' };

/** Quick colour picks for text and shapes: print-friendly darks, white for dark backgrounds and a few accents. */
export const COLOUR_PRESETS = [
  { hex: '#1b1f27', label: 'Ink' },
  { hex: '#4b5563', label: 'Slate grey' },
  { hex: '#ffffff', label: 'White' },
  { hex: '#2f2a7a', label: 'Deep indigo' },
  { hex: '#1d4ed8', label: 'Royal blue' },
  { hex: '#b91c1c', label: 'Red' },
  { hex: '#15803d', label: 'Green' },
  { hex: '#e8930c', label: 'Marigold' },
] as const;
export const TEXT_COLOUR_PRESETS = COLOUR_PRESETS;

// ---------------------------------------------------------------- Shapes

/** Border and line widths in pt: quarter points, from a hairline that still prints. */
export const STROKE_PT_RANGE = { lineMin: 0.25, max: 500 } as const;
/** A border added by picking a border colour. */
export const DEFAULT_BORDER_PT = 1;

/** Stroke widths are stored in print px and shown in pt to two decimals (0.25 pt steps). */
export function toStrokePt(px: number, print: Pick<SurfacePrint, 'dpi'>): number {
  return Math.round(pxToPt(px, print.dpi) * 100) / 100;
}

/** A border sits inside the shape, so it can be at most half the shape's shorter side. */
export function strokeMaxPt(element: Pick<DesignElement, 'width' | 'height'>, print: Pick<SurfacePrint, 'dpi'>): number {
  return Math.max(0.25, Math.floor(pxToPt(Math.min(element.width, element.height) / 2, print.dpi) * 4) / 4);
}

/** Rounder than half the shorter side would no longer be a rectangle. */
export function cornerRadiusMax(element: Pick<DesignElement, 'width' | 'height'>): number {
  return round2(Math.min(element.width, element.height) / 2);
}

/** Stars: 3–20 points. Polygons: 3–12 sides. */
export function pointsRange(element: ShapeElement): { min: number; max: number } {
  return element.shape === 'star' ? { min: 3, max: 20 } : { min: 3, max: 12 };
}

/**
 * A line's height is its thickness (derived, never typed): changing the width changes both,
 * keeping the line's centre — and so where it sits and how it turns — in place.
 */
export function lineWidthPatch(element: ShapeElement, widthPx: number): ElementPatch<ShapeElement> {
  const width = round2(Math.max(0.01, widthPx));
  return { strokeWidth: width, height: width, y: round2(element.y + (element.height - width) / 2) };
}

/** Opacity is stored 0–1 and edited as a whole percentage. */
export function opacityPercent(element: DesignElement): number {
  return Math.round(element.opacity * 100);
}

export function opacityFromPercent(percent: number): number {
  return Math.round(Math.min(100, Math.max(0, percent))) / 100;
}

// ------------------------------------------------------- Size and ratio lock

// Shared with the canvas handles, so the inspector lock and the handles always agree.
export { alwaysKeepsRatio, canLockRatio, defaultRatioLock, ratioLocked } from '../canvas/transform-rules';

/** Whether height can be typed: text height follows the text, a line's height is its width. */
export function heightEditable(element: DesignElement): boolean {
  return element.type !== 'text' && !(element.type === 'shape' && element.shape === 'line');
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
  if (!alwaysKeepsRatio(element) && (!locked || !canLockRatio(element))) return { [side]: round2(next) };
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
