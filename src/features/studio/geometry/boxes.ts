import { pxToMm } from './units';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrintGeometry {
  /** Finished size in print px (decision D1: the canvas is the trim size). */
  widthPx: number;
  heightPx: number;
  dpi: number;
  bleedPx: number;
  safeZonePx: number;
}

export interface PrintBoxes {
  /** The finished piece. Origin of the design coordinate system is its top-left corner. */
  trim: Rect;
  /** Trim plus bleed on every side; backgrounds extend to here. Equal to trim when bleed is 0. */
  bleed: Rect;
  /** Trim inset by the safe zone; important content stays inside. */
  safe: Rect;
}

export function printBoxes(spec: PrintGeometry): PrintBoxes {
  const { widthPx: w, heightPx: h } = spec;
  const bleed = Math.max(0, spec.bleedPx);
  // Never let the safe area collapse below a sliver, even with odd data.
  const safe = Math.min(Math.max(0, spec.safeZonePx), Math.floor(Math.min(w, h) / 2) - 1);
  return {
    trim: { x: 0, y: 0, width: w, height: h },
    bleed: { x: 0 - bleed, y: 0 - bleed, width: w + 2 * bleed, height: h + 2 * bleed }, // `0 - 0` avoids -0
    safe: { x: safe, y: safe, width: w - 2 * safe, height: h - 2 * safe },
  };
}

export function insetRect(rect: Rect, by: number): Rect {
  return { x: rect.x + by, y: rect.y + by, width: rect.width - 2 * by, height: rect.height - 2 * by };
}

export function rectCentre(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export interface SizeMm {
  width: number;
  height: number;
}

export function finishedSizeMm(spec: PrintGeometry): SizeMm {
  return { width: pxToMm(spec.widthPx, spec.dpi), height: pxToMm(spec.heightPx, spec.dpi) };
}

/** Size of the artwork including bleed — what a designer exports for print. */
export function bleedSizeMm(spec: PrintGeometry): SizeMm {
  const bleed = 2 * Math.max(0, spec.bleedPx);
  return { width: pxToMm(spec.widthPx + bleed, spec.dpi), height: pxToMm(spec.heightPx + bleed, spec.dpi) };
}
