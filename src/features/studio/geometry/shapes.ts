import type { Point, Rect } from './boxes';

/** Trim outline of a print area. Circles on non-square canvases are ellipses. */
export type TrimShape = { kind: 'rectangle' } | { kind: 'rounded-rectangle'; radius: number } | { kind: 'ellipse' };

/** The subset of CanvasRenderingContext2D (and Konva.Context) needed to trace a shape. */
export interface PathTarget {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number): void;
  closePath(): void;
}

/** Corner radius that fits the rectangle. */
export function clampRadius(radius: number, rect: Rect): number {
  return Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
}

/**
 * The same shape moved inwards (positive) or outwards (negative) by `by` px: used for the safe
 * zone (inset) and the bleed edge (outset). Rounded corners keep a parallel radius.
 */
export function offsetShape(shape: TrimShape, by: number): TrimShape {
  if (shape.kind !== 'rounded-rectangle') return shape;
  return { kind: 'rounded-rectangle', radius: Math.max(0, shape.radius - by) };
}

/** Start a new path containing the shape (for clipping, filling or stroking). */
export function tracePath(target: PathTarget, shape: TrimShape, rect: Rect): void {
  target.beginPath();
  appendPath(target, shape, rect);
}

/** Add the shape as a closed sub-path of the current path (e.g. to cut one shape out of another). */
export function appendPath(target: PathTarget, shape: TrimShape, rect: Rect): void {
  const { x, y, width: w, height: h } = rect;
  if (shape.kind === 'ellipse') {
    // Start on the ellipse so no connecting line is drawn from a previous sub-path.
    target.moveTo(x + w, y + h / 2);
    target.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    const r = shape.kind === 'rounded-rectangle' ? clampRadius(shape.radius, rect) : 0;
    target.moveTo(x + r, y);
    target.arcTo(x + w, y, x + w, y + h, r);
    target.arcTo(x + w, y + h, x, y + h, r);
    target.arcTo(x, y + h, x, y, r);
    target.arcTo(x, y, x + w, y, r);
  }
  target.closePath();
}

/** Whether a point lies inside (or within `tolerance` px of) the shape drawn in `rect`. */
export function shapeContains(shape: TrimShape, rect: Rect, point: Point, tolerance = 0.5): boolean {
  const { x, y, width: w, height: h } = rect;
  if (shape.kind === 'ellipse') {
    const rx = w / 2 + tolerance;
    const ry = h / 2 + tolerance;
    const dx = point.x - (x + w / 2);
    const dy = point.y - (y + h / 2);
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }
  if (point.x < x - tolerance || point.x > x + w + tolerance || point.y < y - tolerance || point.y > y + h + tolerance) return false;
  if (shape.kind === 'rectangle') return true;
  const r = clampRadius(shape.radius, rect);
  // Only the four corner squares can be outside a rounded rectangle.
  const cx = Math.min(Math.max(point.x, x + r), x + w - r);
  const cy = Math.min(Math.max(point.y, y + r), y + h - r);
  return Math.hypot(point.x - cx, point.y - cy) <= r + tolerance;
}
