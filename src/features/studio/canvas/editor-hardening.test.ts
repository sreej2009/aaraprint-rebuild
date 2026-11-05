import { describe, expect, it } from 'vitest';
import { demoDesign } from '../demo/demo-design';
import { normaliseAngle, resizeBox, snapRotation } from '../geometry/transform';
import { createImageElement, createShapeElement, createTextElement } from '../schema/create';
import type { DesignElement } from '../schema/types';
import { validateDesign } from '../schema/validate';
import { createStudioStore } from '../store';
import { minSizePx, placementFor } from './transform-rules';

/**
 * Core editor hardening (M10): print warnings for every kind of element, rotated or not, and
 * geometry that can never become invalid however a resize or rotation is pushed.
 * Card: 1050 × 600 px trim, 24 px safe zone, 18 px bleed.
 */

const print = demoDesign().surfaces[0]!.print;
const box = { x: 300, y: 200, width: 200, height: 100 };
const kinds: DesignElement[] = [
  createTextElement(box, { id: 'el_text' }),
  ...(['rect', 'circle', 'ellipse', 'triangle', 'star', 'polygon', 'line', 'arrow'] as const).map((k) => createShapeElement(k, box, { id: `el_${k}` })),
  createImageElement({ kind: 'graphic', graphicId: 'phone' }, box, { id: 'el_graphic' }),
];

describe('print warnings', () => {
  it('flag every element type outside the safe area and past the trim, never one inside', () => {
    for (const e of kinds) {
      expect(placementFor(e, print), e.id).toBe('inside');
      expect(placementFor({ ...e, x: 10 }, print), e.id).toBe('outside-safe');
      expect(placementFor({ ...e, x: -40 }, print), e.id).toBe('outside-trim');
    }
  });

  it('use the rotated corners: turning an element near the edge can cross the safe area or the trim', () => {
    const near = createShapeElement('rect', { x: 24, y: 250, width: 400, height: 100 }, { id: 'el_near' }); // touching the safe edge
    expect(placementFor(near, print)).toBe('inside');
    expect(placementFor({ ...near, rotation: 20 }, print)).toBe('outside-safe');
    expect(placementFor({ ...near, rotation: 90 }, print)).toBe('inside');
    expect(placementFor({ ...near, y: 20, rotation: 30 }, print)).toBe('outside-trim');
  });

  it('follow every change at once: move, resize, rotate, property edits', () => {
    const studio = createStudioStore({ document: demoDesign() });
    const a = studio.getState().actions;
    const star = () => studio.getState().document.surfaces[0]!.elements.find((e) => e.id === 'el_star')!;
    expect(placementFor(star(), print)).toBe('inside');
    a.updateElement('el_star', { x: 1000 });
    expect(placementFor(star(), print)).toBe('outside-trim');
    a.updateElement('el_star', { x: 940 });
    expect(placementFor(star(), print)).toBe('outside-safe');
    a.updateElement('el_star', { x: 860, width: 300 });
    expect(placementFor(star(), print)).not.toBe('inside');
    a.undo();
    a.undo();
    a.undo(); // back where it started
    a.updateElement('el_star', { rotation: 45 });
    expect(placementFor(star(), print)).toBe('inside');
  });
});

describe('geometry stays valid', () => {
  const start = { x: 100, y: 100, width: 200, height: 100, rotation: 30 };
  const min = minSizePx(300);

  it('a resize never flips, never goes below 2 mm and never produces a non-number', () => {
    for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
      for (const pointer of [{ x: -5000, y: -5000 }, { x: 5000, y: 5000 }, { x: 200, y: 150 }, { x: Number.MAX_SAFE_INTEGER, y: 0 }]) {
        for (const keepRatio of [false, true]) {
          const b = resizeBox(start, handle, pointer, { keepRatio, fromCentre: false, minSize: min });
          expect([b.x, b.y, b.width, b.height, b.rotation].every(Number.isFinite), `${handle} ${JSON.stringify(pointer)}`).toBe(true);
          expect(b.width).toBeGreaterThan(0);
          expect(b.height).toBeGreaterThan(0);
          expect(b.width).toBeGreaterThanOrEqual(Math.min(min, start.width) - 1e-6);
          expect(b.rotation).toBe(30);
        }
      }
    }
  });

  it('angles stay 0–360 and snap as before', () => {
    expect([-30, 360, 720.5, 359.9999999999, 0.0000000001].map(normaliseAngle)).toEqual([330, 0, 0.5, 0, 0.0000000001]);
    expect(snapRotation(47)).toBe(45);
    expect(snapRotation(52)).toBe(52);
    expect(snapRotation(52, true)).toBe(45);
    expect(snapRotation(-89)).toBe(270);
  });

  it('the store refuses geometry that would make the design invalid', () => {
    const studio = createStudioStore({ document: demoDesign() });
    expect(() => studio.getState().actions.updateElement('el_star', { width: 0 })).toThrow(/positive size/);
    expect(() => studio.getState().actions.updateElement('el_star', { x: Number.NaN })).toThrow(/non-numeric/);
    expect(validateDesign(studio.getState().document)).toEqual([]);
  });
});
