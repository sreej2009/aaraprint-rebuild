import { describe, expect, it } from 'vitest';
import { demoDesign, DEMO_SHAPES } from '../demo/demo-design';
import { ALL_HANDLES, CORNER_HANDLES } from '../geometry/transform';
import { mmToPx } from '../geometry/units';
import { createImageElement, createShapeElement, createTextElement } from '../schema/create';
import type { SurfaceDesign } from '../schema/types';
import { cursorFor, elementAt, handlesFor, keepsRatio, minSizePx, patchForBox, placementFor, PLACEMENT_MESSAGES } from './transform-rules';

const ids = (() => {
  let n = 0;
  return (prefix = 'el') => `${prefix}_${(n += 1)}`;
})();
const text = createTextElement({ x: 100, y: 100, width: 400, height: 80 }, { fontSize: 60 }, ids);
const image = createImageElement({ kind: 'graphic', graphicId: 'badge' }, { x: 0, y: 0, width: 300, height: 200 }, {}, ids);
const rect = createShapeElement('rect', { x: 0, y: 0, width: 100, height: 100 }, {}, ids);
const line = createShapeElement('line', { x: 0, y: 0, width: 300, height: 6 }, {}, ids);

describe('transform rules per element type', () => {
  it('gives each type the right handles', () => {
    expect(handlesFor(text)).toEqual(['nw', 'ne', 'se', 'sw', 'e', 'w']);
    expect(handlesFor(image)).toEqual(CORNER_HANDLES);
    expect(handlesFor(line)).toEqual(['e', 'w']);
    expect(handlesFor(rect)).toEqual(ALL_HANDLES);
  });

  it('keeps proportions: text corners always, images unless Shift, shapes only with Shift', () => {
    expect(keepsRatio(text, 'se', false)).toBe(true);
    expect(keepsRatio(text, 'e', true)).toBe(false);
    expect(keepsRatio(image, 'nw', false)).toBe(true);
    expect(keepsRatio(image, 'nw', true)).toBe(false);
    expect(keepsRatio(rect, 'se', false)).toBe(false);
    expect(keepsRatio(rect, 'se', true)).toBe(true);
  });

  it('scales the font when a text corner is dragged; side handles only change the width', () => {
    const corner = patchForBox(text, { x: 100, y: 100, width: 600, height: 120, rotation: 0 }, 'se');
    expect(corner).toMatchObject({ width: 600, height: 120, fontSize: 90 });
    const side = patchForBox(text, { x: 100, y: 100, width: 500, height: 80, rotation: 0 }, 'e');
    expect(side).toEqual({ x: 100, y: 100, width: 500, height: 80, rotation: 0 });
  });

  it('rounds stored geometry to 0.01 px', () => {
    expect(patchForBox(rect, { x: 1.23456, y: 2, width: 99.999, height: 50, rotation: 12.3456 }, 'se')).toEqual({ x: 1.23, y: 2, width: 100, height: 50, rotation: 12.35 });
  });

  it('has a 2 mm minimum size, in print px', () => {
    expect(minSizePx(300)).toBeCloseTo(mmToPx(2, 300), 6);
    expect(minSizePx(300)).toBeCloseTo(23.62, 2);
  });

  it('points the resize cursor along the rotated handle', () => {
    expect(cursorFor('e', 0)).toBe('ew-resize');
    expect(cursorFor('se', 0)).toBe('nwse-resize');
    expect(cursorFor('e', 90)).toBe('ns-resize');
    expect(cursorFor('n', 45)).toBe('nesw-resize');
    expect(cursorFor('w', -45)).toBe('nesw-resize');
  });
});

describe('picking on the canvas', () => {
  const front = demoDesign().surfaces[0]!;

  it('picks the topmost visible, unlocked element under the point', () => {
    expect(elementAt(front, { x: 200, y: 110 })?.id).toBe('el_name');
    expect(elementAt(front, { x: 200, y: 520 })?.id).toBe('el_contact'); // contact text sits on the band
    expect(elementAt(front, { x: 1000, y: 600 })?.id).toBe('el_band');
  });

  it('never picks locked or hidden layers, and nothing outside the printed area', () => {
    expect(elementAt(front, { x: 120, y: 400 })).toBeNull(); // el_badge is locked
    expect(elementAt(front, { x: 120, y: 320 })).toBeNull(); // el_hidden is hidden
    expect(elementAt(front, { x: 500, y: 650 })).toBeNull(); // past the bleed: the band is clipped there
  });

  it('follows the bleed outline of round products', () => {
    const circle = DEMO_SHAPES.find((s) => s.value === 'circle')!.print;
    const round: SurfaceDesign = { ...front, print: circle, elements: [createShapeElement('rect', { x: -18, y: -18, width: 736, height: 736 }, { id: 'bg' })] };
    expect(elementAt(round, { x: 350, y: 350 })?.id).toBe('bg');
    expect(elementAt(round, { x: -10, y: -10 })).toBeNull(); // the square's corner is clipped away
  });

  it('widens hairlines by the slop', () => {
    const lineSurface: SurfaceDesign = { ...front, elements: [{ ...line, y: 300 }] };
    expect(elementAt(lineSurface, { x: 150, y: 310 })).toBeNull();
    expect(elementAt(lineSurface, { x: 150, y: 310 }, 10)?.id).toBe(line.id);
  });
});

describe('placement warnings', () => {
  const print = demoDesign().surfaces[0]!.print; // 1050 × 600, safe zone 24 px

  it('classifies inside, outside the safe area and past the trim', () => {
    expect(placementFor({ ...rect, x: 100, y: 100 }, print)).toBe('inside');
    expect(placementFor({ ...rect, x: 10, y: 100 }, print)).toBe('outside-safe');
    expect(placementFor({ ...rect, x: -5, y: 100 }, print)).toBe('outside-trim');
    // Rotation counts: a box inside the safe area can poke out once turned.
    expect(placementFor({ ...rect, x: 30, y: 30, rotation: 45 }, print)).toBe('outside-safe');
  });

  it('explains each warning in words', () => {
    expect(PLACEMENT_MESSAGES.inside).toBeNull();
    expect(PLACEMENT_MESSAGES['outside-safe']).toMatch(/outside the safe area and may be trimmed/);
    expect(PLACEMENT_MESSAGES['outside-trim']).toMatch(/past the trim edge and will be cut off/);
  });
});
