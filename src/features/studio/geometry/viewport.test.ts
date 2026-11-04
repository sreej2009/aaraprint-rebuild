import { describe, expect, it } from 'vitest';
import {
  centreOn,
  clampPan,
  fitViewport,
  formatZoom,
  pinchViewport,
  realSizeScale,
  scaleForPercent,
  stepPercent,
  toScreenRect,
  wheelZoomFactor,
  zoomAround,
  zoomLimits,
  zoomPercent,
} from './viewport';

/** Visiting card bleed box: 1086 × 636 print px starting at (−18, −18). */
const card = { x: -18, y: -18, width: 1086, height: 636 };
const area = { width: 1000, height: 700 };

describe('zoom percentages (relative to real printed size)', () => {
  it('maps 100 % to 96 CSS px per printed inch', () => {
    expect(realSizeScale(300)).toBeCloseTo(0.32, 10);
    expect(scaleForPercent(100, 300)).toBeCloseTo(0.32, 10);
    expect(zoomPercent(0.64, 300)).toBeCloseTo(200, 10);
    expect(zoomPercent(scaleForPercent(37.5, 150), 150)).toBeCloseTo(37.5, 10);
  });

  it('allows 10–400 %, widened so fit is always reachable', () => {
    expect(zoomLimits(120)).toEqual({ minPercent: 10, maxPercent: 400 });
    expect(zoomLimits(4.2)).toEqual({ minPercent: 4.2, maxPercent: 400 }); // 1.5 m banner
    expect(zoomLimits(470)).toEqual({ minPercent: 10, maxPercent: 470 }); // 17 mm stamp strip
  });

  it('formats percentages', () => {
    expect(formatZoom(187.6)).toBe('188%');
    expect(formatZoom(3.46)).toBe('3.5%');
  });
});

describe('fit and centre', () => {
  it('fits the bleed box with padding, centred, including its negative origin', () => {
    const v = fitViewport(area, card, 50);
    expect(v.scale).toBeCloseTo(900 / 1086, 10);
    const screen = toScreenRect(v, card);
    expect(screen.x).toBeCloseTo(50, 8);
    expect(screen.x + screen.width).toBeCloseTo(950, 8);
    expect(screen.y + screen.height / 2).toBeCloseTo(350, 8); // vertically centred
  });

  it('centres at any scale', () => {
    const v = centreOn(area, card, 2);
    const screen = toScreenRect(v, card);
    expect(screen.x + screen.width / 2).toBeCloseTo(500, 8);
    expect(screen.y + screen.height / 2).toBeCloseTo(350, 8);
  });
});

describe('zooming', () => {
  it('keeps the design point under the anchor fixed', () => {
    const v = { scale: 0.5, x: 100, y: 50 };
    const anchor = { x: 400, y: 300 };
    const before = { x: (anchor.x - v.x) / v.scale, y: (anchor.y - v.y) / v.scale };
    const zoomed = zoomAround(v, 1.25, anchor);
    expect(before.x * zoomed.scale + zoomed.x).toBeCloseTo(anchor.x, 8);
    expect(before.y * zoomed.scale + zoomed.y).toBeCloseTo(anchor.y, 8);
  });

  it('steps through the zoom ladder, stopping at the fitted level, within limits', () => {
    const limits = zoomLimits(188);
    expect(stepPercent(100, 1, 188, limits)).toBe(150);
    expect(stepPercent(150, 1, 188, limits)).toBe(188);
    expect(stepPercent(188, 1, 188, limits)).toBe(200);
    expect(stepPercent(188, -1, 188, limits)).toBe(150);
    expect(stepPercent(400, 1, 188, limits)).toBe(400);
    expect(stepPercent(10, -1, 188, limits)).toBe(10);
    // A banner fitting at 4 % can step down to it.
    expect(stepPercent(10, -1, 4, zoomLimits(4))).toBe(4);
  });

  it('turns wheel deltas into smooth zoom factors', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1, 10);
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48), 10); // line mode
  });

  it('pinches around the fingers’ midpoint and follows it', () => {
    const start = { scale: 1, x: 0, y: 0 };
    const pinched = pinchViewport(start, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 50, y: 100 }, { x: 250, y: 100 }], (s) => s);
    expect(pinched.scale).toBeCloseTo(2, 10);
    // The design point that was under the midpoint (150, 100) is still there.
    expect(150 * pinched.scale + pinched.x).toBeCloseTo(150, 8);
    const moved = pinchViewport(start, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 130, y: 140 }, { x: 230, y: 140 }], (s) => s);
    expect(moved).toEqual({ scale: 1, x: 30, y: 40 });
    const capped = pinchViewport(start, [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 1000, y: 0 }], (s) => Math.min(s, 4));
    expect(capped.scale).toBe(4);
  });
});

describe('panning limits', () => {
  it('keeps part of the sheet on screen', () => {
    const fitted = fitViewport(area, card, 50);
    const farLeft = clampPan({ ...fitted, x: -5000 }, area, card, 80);
    expect(toScreenRect(farLeft, card).x + toScreenRect(farLeft, card).width).toBeCloseTo(80, 8);
    const farDown = clampPan({ ...fitted, y: 5000 }, area, card, 80);
    expect(toScreenRect(farDown, card).y).toBeCloseTo(700 - 80, 8);
    expect(clampPan(fitted, area, card)).toBe(fitted); // already fine: unchanged
  });
});
