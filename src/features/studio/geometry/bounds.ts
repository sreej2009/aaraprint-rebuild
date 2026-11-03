import type { Point, PrintBoxes, Rect } from './boxes';
import { offsetShape, shapeContains, type TrimShape } from './shapes';

/** An element's unrotated box in design px, rotated by `rotation` degrees around its centre. */
export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export function rotatePoint(point: Point, centre: Point, degrees: number): Point {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
}

/** Corners in clockwise order from the (unrotated) top-left. */
export function boxCorners(box: ElementBox): [Point, Point, Point, Point] {
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const corners: [Point, Point, Point, Point] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
  if (box.rotation % 360 === 0) return corners;
  return corners.map((c) => rotatePoint(c, centre, box.rotation)) as [Point, Point, Point, Point];
}

/** Axis-aligned rectangle around a rotated box. */
export function boundingRect(box: ElementBox): Rect {
  const corners = boxCorners(box);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Where an element sits relative to the print area:
 * - `inside`: fully within the safe zone;
 * - `outside-safe`: within the trim, but past the safe zone (may be trimmed);
 * - `outside-trim`: partly or fully past the trim edge (will be cut off).
 * Trim shapes and element boxes are convex, so checking the four corners is exact.
 */
export type Placement = 'inside' | 'outside-safe' | 'outside-trim';

export function placementOf(box: ElementBox, boxes: PrintBoxes, trim: TrimShape): Placement {
  const corners = boxCorners(box);
  if (!corners.every((c) => shapeContains(trim, boxes.trim, c))) return 'outside-trim';
  const safeInset = boxes.safe.x - boxes.trim.x;
  const safeShape = offsetShape(trim, safeInset);
  if (!corners.every((c) => shapeContains(safeShape, boxes.safe, c))) return 'outside-safe';
  return 'inside';
}
