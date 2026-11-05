import { describe, expect, it } from 'vitest';
import { boxCorners, type ElementBox } from './bounds';
import { boxContains, handleDirection, moveBox, normaliseAngle, resizeBox, rotationFromPointer, roundBox, snapRotation } from './transform';

const box: ElementBox = { x: 100, y: 100, width: 200, height: 100, rotation: 0 };
const free = { keepRatio: false, fromCentre: false, minSize: 24 };

/** Rounded to 1e-6, so boxes compare exactly despite float noise. */
function near(b: ElementBox): ElementBox {
  const r = (v: number) => Math.round(v * 1e6) / 1e6 || 0;
  return { x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height), rotation: r(b.rotation) };
}

describe('resizeBox', () => {
  it('drags a corner, keeping the opposite corner in place', () => {
    expect(near(resizeBox(box, 'se', { x: 350, y: 260 }, free))).toMatchObject({ x: 100, y: 100, width: 250, height: 160 });
    expect(near(resizeBox(box, 'nw', { x: 50, y: 80 }, free))).toMatchObject({ x: 50, y: 80, width: 250, height: 120 });
  });

  it('drags a side on one axis only', () => {
    expect(near(resizeBox(box, 'e', { x: 400, y: 999 }, free))).toMatchObject({ x: 100, y: 100, width: 300, height: 100 });
    expect(near(resizeBox(box, 'n', { x: -50, y: 40 }, free))).toMatchObject({ x: 100, y: 40, width: 200, height: 160 });
  });

  it('keeps proportions on a corner when asked, following the pointer along the diagonal', () => {
    const r = resizeBox(box, 'se', { x: 500, y: 300 }, { ...free, keepRatio: true });
    expect(r.width / r.height).toBeCloseTo(2, 6);
    expect(near(r)).toMatchObject({ x: 100, y: 100, width: 400, height: 200 });
    // Side handles ignore keepRatio.
    expect(near(resizeBox(box, 'e', { x: 400, y: 150 }, { ...free, keepRatio: true }))).toMatchObject({ width: 300, height: 100 });
  });

  it('resizes around the centre with Alt', () => {
    expect(near(resizeBox(box, 'e', { x: 350, y: 150 }, { ...free, fromCentre: true }))).toMatchObject({ x: 50, y: 100, width: 300, height: 100 });
  });

  it('never flips or shrinks below the minimum, and never grows a smaller box up to it', () => {
    expect(near(resizeBox(box, 'se', { x: 0, y: 0 }, free))).toMatchObject({ x: 100, y: 100, width: 24, height: 24 });
    const hairline: ElementBox = { x: 0, y: 0, width: 200, height: 6, rotation: 0 };
    expect(near(resizeBox(hairline, 'e', { x: 150, y: 3 }, free))).toMatchObject({ width: 150, height: 6 });
    expect(near(resizeBox(hairline, 'se', { x: 150, y: 2 }, free))).toMatchObject({ width: 150, height: 6 });
  });

  it('keeps the opposite corner fixed on a rotated box', () => {
    const rotated = { ...box, rotation: 30 };
    const [, , , sw] = boxCorners(rotated); // opposite of ne
    const next = resizeBox(rotated, 'ne', { x: 420, y: 20 }, free);
    const [, , , sw2] = boxCorners(next);
    expect(sw2.x).toBeCloseTo(sw.x, 6);
    expect(sw2.y).toBeCloseTo(sw.y, 6);
    expect(next.rotation).toBe(30);
  });
});

describe('rotation', () => {
  it('snaps to 0/45/90… within 5°, and to 15° steps with Shift', () => {
    expect(snapRotation(3)).toBe(0);
    expect(snapRotation(-4)).toBe(0);
    expect(snapRotation(357)).toBe(0);
    expect(snapRotation(48)).toBe(45);
    expect(snapRotation(51)).toBe(51);
    expect(snapRotation(51, true)).toBe(45);
    expect(snapRotation(53, true)).toBe(60);
  });

  it('turns by the angle swept around the centre, wherever the handle was grabbed', () => {
    // Centre (200, 150). From straight above to straight right = +90°.
    expect(rotationFromPointer(box, { x: 200, y: 50 }, { x: 300, y: 150 })).toBeCloseTo(90, 6);
    expect(rotationFromPointer({ ...box, rotation: 20 }, { x: 200, y: 50 }, { x: 100, y: 150 })).toBeCloseTo(290, 6);
    const angle = (deg: number) => ({ x: 200 + 100 * Math.cos((deg * Math.PI) / 180), y: 150 + 100 * Math.sin((deg * Math.PI) / 180) });
    expect(rotationFromPointer(box, angle(0), angle(27))).toBeCloseTo(27, 6);
    expect(rotationFromPointer(box, angle(0), angle(27), true)).toBeCloseTo(30, 6);
  });

  it('normalises to 0 ≤ angle < 360', () => {
    expect(normaliseAngle(-90)).toBe(270);
    expect(normaliseAngle(720)).toBe(0);
    expect(normaliseAngle(359.99999999999)).toBe(0);
  });
});

describe('boxes', () => {
  it('moves and rounds for storage', () => {
    expect(near(moveBox(box, 5.5, -2))).toMatchObject({ x: 105.5, y: 98 });
    expect(roundBox({ x: 1.23456, y: -0.004, width: 10, height: 20.005, rotation: 359.999 })).toEqual({ x: 1.23, y: 0, width: 10, height: 20.01, rotation: 0 });
  });

  it('hit-tests rotated boxes, with a minimum thickness for hairlines', () => {
    const rotated = { ...box, rotation: 90 }; // now 100 wide, 200 tall around (200, 150)
    expect(boxContains(rotated, { x: 200, y: 60 })).toBe(true);
    expect(boxContains(rotated, { x: 290, y: 150 })).toBe(false);
    const line: ElementBox = { x: 0, y: 100, width: 300, height: 2, rotation: 0 };
    expect(boxContains(line, { x: 150, y: 106 })).toBe(false);
    expect(boxContains(line, { x: 150, y: 106 }, 8)).toBe(true);
  });

  it('names handles by direction', () => {
    expect(handleDirection('nw')).toEqual({ x: -1, y: -1 });
    expect(handleDirection('e')).toEqual({ x: 1, y: 0 });
  });
});
