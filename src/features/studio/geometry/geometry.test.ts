import { describe, expect, it } from 'vitest';
import { boundingRect, boxCorners, placementOf, rotatePoint, type ElementBox } from './bounds';
import { bleedSizeMm, finishedSizeMm, printBoxes, type PrintGeometry } from './boxes';
import { dpiQuality, effectiveDpi } from './dpi';
import { clampRadius, offsetShape, shapeContains, tracePath, type PathTarget, type TrimShape } from './shapes';
import { formatMm, mmToPx, ptToPx, pxToMm, pxToPt, roundTo } from './units';

/** Classic visiting card: 1050 × 600 px at 300 DPI, 18 px bleed, 24 px safe zone. */
const card: PrintGeometry = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24 };
const rect: TrimShape = { kind: 'rectangle' };

describe('units', () => {
  it('converts print pixels to millimetres and back', () => {
    expect(pxToMm(1050, 300)).toBeCloseTo(88.9, 5);
    expect(pxToMm(600, 300)).toBeCloseTo(50.8, 5);
    expect(pxToMm(3508, 300)).toBeCloseTo(297, 0); // A4 long edge
    expect(mmToPx(3, 300)).toBeCloseTo(35.43, 2);
    expect(mmToPx(pxToMm(1234, 150), 150)).toBeCloseTo(1234, 8);
  });

  it('converts text sizes between pixels and points at any DPI', () => {
    expect(ptToPx(12, 300)).toBe(50);
    expect(ptToPx(12, 150)).toBe(25);
    expect(ptToPx(12, 100)).toBeCloseTo(16.667, 3);
    expect(pxToPt(50, 300)).toBe(12);
  });

  it('formats millimetres with one decimal', () => {
    expect(formatMm(88.9)).toBe('88.9 mm');
    expect(formatMm(3)).toBe('3 mm');
    expect(roundTo(1.25, 1)).toBe(1.3);
  });
});

describe('print boxes (canvas = finished size, decision D1)', () => {
  it('puts the trim at the origin, bleed outside and the safe zone inside', () => {
    expect(printBoxes(card)).toEqual({
      trim: { x: 0, y: 0, width: 1050, height: 600 },
      bleed: { x: -18, y: -18, width: 1086, height: 636 },
      safe: { x: 24, y: 24, width: 1002, height: 552 },
    });
  });

  it('reports the finished size and the artwork size with bleed', () => {
    const finished = finishedSizeMm(card);
    expect(finished.width).toBeCloseTo(88.9, 5);
    expect(finished.height).toBeCloseTo(50.8, 5);
    const withBleed = bleedSizeMm(card);
    expect(withBleed.width).toBeCloseTo(91.95, 2);
    expect(withBleed.height).toBeCloseTo(53.85, 2);
  });

  it('handles products without bleed and keeps the safe area valid for odd data', () => {
    const pen = printBoxes({ widthPx: 1200, heightPx: 240, dpi: 300, bleedPx: 0, safeZonePx: 20 });
    expect(pen.bleed).toEqual(pen.trim);
    const tiny = printBoxes({ widthPx: 100, heightPx: 40, dpi: 300, bleedPx: 0, safeZonePx: 60 });
    expect(tiny.safe.width).toBeGreaterThan(0);
    expect(tiny.safe.height).toBeGreaterThan(0);
  });
});

describe('trim shapes', () => {
  const box = { x: 0, y: 0, width: 200, height: 100 };

  it('contains points for rectangles, rounded rectangles and ellipses', () => {
    expect(shapeContains(rect, box, { x: 0, y: 0 })).toBe(true);
    expect(shapeContains(rect, box, { x: 201, y: 50 })).toBe(false);

    const rounded: TrimShape = { kind: 'rounded-rectangle', radius: 20 };
    expect(shapeContains(rounded, box, { x: 1, y: 1 })).toBe(false); // cut-off corner
    expect(shapeContains(rounded, box, { x: 20, y: 0 })).toBe(true); // where the curve starts
    expect(shapeContains(rounded, box, { x: 100, y: 0 })).toBe(true);

    const ellipse: TrimShape = { kind: 'ellipse' };
    expect(shapeContains(ellipse, box, { x: 100, y: 50 })).toBe(true);
    expect(shapeContains(ellipse, box, { x: 0, y: 50 })).toBe(true);
    expect(shapeContains(ellipse, box, { x: 10, y: 10 })).toBe(false);
  });

  it('clamps and offsets corner radii', () => {
    expect(clampRadius(500, box)).toBe(50);
    expect(offsetShape({ kind: 'rounded-rectangle', radius: 35 }, 24)).toEqual({ kind: 'rounded-rectangle', radius: 11 });
    expect(offsetShape({ kind: 'rounded-rectangle', radius: 10 }, 24)).toEqual({ kind: 'rounded-rectangle', radius: 0 });
    expect(offsetShape({ kind: 'ellipse' }, 24)).toEqual({ kind: 'ellipse' });
  });

  it('traces a closed path on a canvas-like target', () => {
    const calls: string[] = [];
    const target = new Proxy({} as PathTarget, {
      get: (_t, name: string) => () => calls.push(name),
    });
    tracePath(target, { kind: 'rounded-rectangle', radius: 12 }, box);
    expect(calls).toEqual(['beginPath', 'moveTo', 'arcTo', 'arcTo', 'arcTo', 'arcTo', 'closePath']);
    calls.length = 0;
    tracePath(target, { kind: 'ellipse' }, box);
    expect(calls).toEqual(['beginPath', 'ellipse', 'closePath']);
  });
});

describe('element bounds', () => {
  it('rotates points around a centre', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(10, 10);
  });

  it('computes corners and the bounding box of a rotated element', () => {
    const box: ElementBox = { x: 0, y: 0, width: 100, height: 50, rotation: 90 };
    const bounds = boundingRect(box);
    expect(bounds.x).toBeCloseTo(25, 8);
    expect(bounds.y).toBeCloseTo(-25, 8);
    expect(bounds.width).toBeCloseTo(50, 8);
    expect(bounds.height).toBeCloseTo(100, 8);
    expect(boxCorners({ ...box, rotation: 0 })[2]).toEqual({ x: 100, y: 50 });
  });

  it('classifies placement against the safe zone and the trim', () => {
    const boxes = printBoxes(card);
    expect(placementOf({ x: 24, y: 24, width: 1002, height: 552, rotation: 0 }, boxes, rect)).toBe('inside');
    expect(placementOf({ x: 10, y: 100, width: 200, height: 100, rotation: 0 }, boxes, rect)).toBe('outside-safe');
    expect(placementOf({ x: -5, y: 100, width: 200, height: 100, rotation: 0 }, boxes, rect)).toBe('outside-trim');
    // Fits unrotated, but its rotated corners cross the safe zone.
    // Rotating 45° lifts its top corner to y ≈ 16: past the 24 px safe zone, still inside the trim.
    expect(placementOf({ x: 400, y: 90, width: 250, height: 100, rotation: 0 }, boxes, rect)).toBe('inside');
    expect(placementOf({ x: 400, y: 90, width: 250, height: 100, rotation: 45 }, boxes, rect)).toBe('outside-safe');
  });

  it('uses the trim shape: a box in the corner of a round card is cut off', () => {
    const round = printBoxes({ widthPx: 700, heightPx: 700, dpi: 300, bleedPx: 18, safeZonePx: 24 });
    const ellipse: TrimShape = { kind: 'ellipse' };
    expect(placementOf({ x: 250, y: 250, width: 200, height: 200, rotation: 0 }, round, ellipse)).toBe('inside');
    expect(placementOf({ x: 30, y: 30, width: 100, height: 100, rotation: 0 }, round, ellipse)).toBe('outside-trim');
  });
});

describe('effective DPI', () => {
  it('measures source pixels per printed inch on the weaker axis', () => {
    // A 600 px wide logo placed 50.8 mm (600 print px) wide on a 300 DPI card prints at 300 DPI.
    expect(effectiveDpi({ width: 600, height: 300 }, { width: 600, height: 300 }, 300)).toBe(300);
    expect(effectiveDpi({ width: 600, height: 300 }, { width: 1200, height: 600 }, 300)).toBe(150);
    expect(effectiveDpi({ width: 600, height: 300 }, { width: 600, height: 600 }, 300)).toBe(150);
    expect(effectiveDpi({ width: 600, height: 300 }, { width: 0, height: 10 }, 300)).toBe(0);
  });

  it('grades quality against the product DPI', () => {
    expect(dpiQuality(300, 300)).toBe('good');
    expect(dpiQuality(225, 300)).toBe('good');
    expect(dpiQuality(224, 300)).toBe('low');
    expect(dpiQuality(119, 300)).toBe('poor');
    expect(dpiQuality(120, 150)).toBe('good');
  });
});
