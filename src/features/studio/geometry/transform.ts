import { rotatePoint, type ElementBox } from './bounds';
import type { Point } from './boxes';

/**
 * Pure maths for moving, resizing and rotating one element box (design px). The canvas gestures,
 * keyboard and inspector all go through these, so behaviour is the same everywhere and testable
 * without a canvas.
 */

/** Resize handles, named by compass direction in the box's own (unrotated) frame. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const CORNER_HANDLES = ['nw', 'ne', 'se', 'sw'] as const satisfies readonly Handle[];
export const SIDE_HANDLES = ['n', 'e', 's', 'w'] as const satisfies readonly Handle[];
export const ALL_HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function isCorner(handle: Handle): boolean {
  return handle.length === 2;
}

/** −1, 0 or 1 on each axis: where the handle sits on the box. */
export function handleDirection(handle: Handle): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  return {
    x: handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0,
    y: handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0,
  };
}

export function boxCentre(box: ElementBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function moveBox(box: ElementBox, dx: number, dy: number): ElementBox {
  return { ...box, x: box.x + dx, y: box.y + dy };
}

export interface ResizeOptions {
  /** Scale both sides together (corner handles only). */
  keepRatio: boolean;
  /** Resize around the centre instead of the opposite edge (Alt). */
  fromCentre: boolean;
  /** Smallest size in design px. A box already smaller than this may keep its size, never jump up. */
  minSize: number;
}

/**
 * The box after dragging `handle` to `pointer` (design px). The opposite edge or corner stays put
 * (or the centre, with `fromCentre`), also for rotated boxes; boxes never flip inside out.
 */
export function resizeBox(start: ElementBox, handle: Handle, pointer: Point, { keepRatio, fromCentre, minSize }: ResizeOptions): ElementBox {
  const dir = handleDirection(handle);
  const centre = boxCentre(start);
  // The pointer in the box's own frame, relative to its centre.
  const local = rotatePoint(pointer, centre, -start.rotation);
  const lx = local.x - centre.x;
  const ly = local.y - centre.y;
  const minWidth = Math.min(minSize, start.width);
  const minHeight = Math.min(minSize, start.height);

  const span = (along: number, direction: number, half: number) => (fromCentre ? 2 * direction * along : direction * along + half);
  let width = dir.x === 0 ? start.width : span(lx, dir.x, start.width / 2);
  let height = dir.y === 0 ? start.height : span(ly, dir.y, start.height / 2);

  if (keepRatio && isCorner(handle)) {
    // Project onto the diagonal, so the corner follows the pointer smoothly.
    const s = (width * start.width + height * start.height) / (start.width ** 2 + start.height ** 2);
    const scale = Math.max(s, minWidth / start.width, minHeight / start.height);
    width = start.width * scale;
    height = start.height * scale;
  } else {
    width = Math.max(width, minWidth);
    height = Math.max(height, minHeight);
  }

  // Where the new centre sits, in the box frame: the fixed edge plus half the new size.
  const offset = fromCentre
    ? { x: 0, y: 0 }
    : {
        x: dir.x === 0 ? 0 : -dir.x * (start.width / 2) + dir.x * (width / 2),
        y: dir.y === 0 ? 0 : -dir.y * (start.height / 2) + dir.y * (height / 2),
      };
  const newCentre = rotatePoint({ x: centre.x + offset.x, y: centre.y + offset.y }, centre, start.rotation);
  return { x: newCentre.x - width / 2, y: newCentre.y - height / 2, width, height, rotation: start.rotation };
}

/** 0 ≤ degrees < 360. */
export function normaliseAngle(degrees: number): number {
  // Angles already in range stay untouched: wrapping them would add float noise (12.35 → 12.350000000000023).
  const value = degrees >= 0 && degrees < 360 ? degrees : ((degrees % 360) + 360) % 360;
  return 360 - value < 1e-9 ? 0 : value;
}

export const ROTATION_SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;
/** Within this many degrees of a snap angle, rotation snaps to it. */
export const ROTATION_SNAP_TOLERANCE = 5;
/** Shift + rotate moves in steps of this many degrees. */
export const ROTATION_STEP = 15;

/** Snap to 0/45/90… within 5°; with `steps` (Shift), round to 15° steps. */
export function snapRotation(degrees: number, steps = false): number {
  const angle = normaliseAngle(degrees);
  if (steps) return normaliseAngle(Math.round(angle / ROTATION_STEP) * ROTATION_STEP);
  for (const snap of [...ROTATION_SNAP_ANGLES, 360]) {
    if (Math.abs(angle - snap) <= ROTATION_SNAP_TOLERANCE) return normaliseAngle(snap);
  }
  return angle;
}

/**
 * The rotation after dragging the rotation handle from `from` to `to` (design px): the box turns by
 * the angle the pointer swept around its centre, wherever the handle was grabbed.
 */
export function rotationFromPointer(start: ElementBox, from: Point, to: Point, steps = false): number {
  const c = boxCentre(start);
  const swept = Math.atan2(to.y - c.y, to.x - c.x) - Math.atan2(from.y - c.y, from.x - c.x);
  return snapRotation(start.rotation + (swept * 180) / Math.PI, steps);
}

/**
 * Whether `point` lies on the box (rotated). `minHalf` widens very thin boxes (lines) so they stay
 * easy to hit: each half-side is at least this many design px.
 */
export function boxContains(box: ElementBox, point: Point, minHalf = 0): boolean {
  const c = boxCentre(box);
  const local = rotatePoint(point, c, -box.rotation);
  return Math.abs(local.x - c.x) <= Math.max(box.width / 2, minHalf) && Math.abs(local.y - c.y) <= Math.max(box.height / 2, minHalf);
}

/** Round geometry for storage: 0.01 print px is far below anything a printer can show. */
export function roundBox(box: ElementBox): ElementBox {
  const r = (v: number) => Math.round(v * 100) / 100 || 0; // never -0
  return { x: r(box.x), y: r(box.y), width: r(box.width), height: r(box.height), rotation: normaliseAngle(r(box.rotation)) };
}
