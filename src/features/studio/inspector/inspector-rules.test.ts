import { describe, expect, it } from 'vitest';
import { demoDesign } from '../demo/demo-design';
import { mmToPx } from '../geometry/units';
import { createImageElement, createShapeElement, createTextElement } from '../schema/create';
import {
  arrangeOptions,
  canLockRatio,
  centredPatch,
  defaultRatioLock,
  elementTypeLabel,
  heightEditable,
  isCentred,
  layerAccessibleName,
  opacityFromPercent,
  opacityPercent,
  sizePatch,
  toMm,
  toPx,
} from './inspector-rules';

const ids = (() => {
  let n = 0;
  return (prefix = 'el') => `${prefix}_${(n += 1)}`;
})();
const card = { widthPx: 1050, heightPx: 600, dpi: 300 };
const rect = createShapeElement('rect', { x: 100, y: 100, width: 200, height: 100 }, {}, ids);
const line = createShapeElement('line', { x: 0, y: 0, width: 300, height: 6 }, {}, ids);
const text = createTextElement({ x: 0, y: 0, width: 400, height: 80 }, {}, ids);
const image = createImageElement({ kind: 'asset', assetId: 'a' }, { x: 0, y: 0, width: 300, height: 150 }, {}, ids);
const graphic = createImageElement({ kind: 'graphic', graphicId: 'badge' }, { x: 0, y: 0, width: 100, height: 100 }, {}, ids);

describe('unit conversion', () => {
  it('converts print px to mm and back at the product DPI, storing 0.01 px', () => {
    expect(toMm(1050, { dpi: 300 })).toBeCloseTo(88.9, 6);
    expect(toPx(88.9, { dpi: 300 })).toBe(1050);
    expect(toPx(20, { dpi: 300 })).toBe(236.22);
    expect(toPx(20, { dpi: 150 })).toBe(118.11);
    expect(toMm(toPx(12.3, { dpi: 72 }), { dpi: 72 })).toBeCloseTo(12.3, 2);
  });

  it('edits opacity in whole percent, clamped to 0–100', () => {
    expect(opacityPercent({ ...rect, opacity: 0.456 })).toBe(46);
    expect(opacityFromPercent(47)).toBe(0.47);
    expect(opacityFromPercent(150)).toBe(1);
    expect(opacityFromPercent(-5)).toBe(0);
  });
});

describe('size and proportions', () => {
  it('changes one side freely, or both when locked', () => {
    expect(sizePatch(rect, 'width', toMm(300, card), false, card)).toEqual({ width: 300 });
    expect(sizePatch(rect, 'width', toMm(300, card), true, card)).toEqual({ width: 300, height: 150 });
    expect(sizePatch(rect, 'height', toMm(50, card), true, card)).toEqual({ height: 50, width: 100 });
  });

  it('never goes below 2 mm, and never enlarges an element that is already smaller', () => {
    expect(sizePatch(rect, 'width', 0.5, false, card)).toEqual({ width: Math.round(mmToPx(2, 300) * 100) / 100 }); // 23.62 px
    expect(sizePatch(line, 'height', 0.1, false, card)).toEqual({ height: 6 });
  });

  it('offers the lock where it makes sense, starting locked for images', () => {
    expect([rect, image, graphic].map(canLockRatio)).toEqual([true, true, true]);
    expect([text, line].map(canLockRatio)).toEqual([false, false]);
    expect(sizePatch(line, 'width', toMm(600, card), true, card)).toEqual({ width: 600 }); // no lock for lines
    expect([rect, image].map(defaultRatioLock)).toEqual([false, true]);
    expect([text, rect].map(heightEditable)).toEqual([false, true]);
  });
});

describe('centring', () => {
  it('centres the box on the trim; rotation turns around the centre, so it stays centred', () => {
    expect(centredPatch(rect, card, 'horizontal')).toEqual({ x: 425 });
    expect(centredPatch({ ...rect, rotation: 30 }, card, 'vertical')).toEqual({ y: 250 });
    expect(isCentred({ ...rect, x: 425 }, card, 'horizontal')).toBe(true);
    expect(isCentred(rect, card, 'horizontal')).toBe(false);
  });
});

describe('layer order and names', () => {
  const front = demoDesign().surfaces[0]!;

  it('knows which moves would change anything; locked layers can’t move', () => {
    expect(arrangeOptions(front, 'el_band')).toEqual({ forward: true, backward: false });
    expect(arrangeOptions(front, 'el_hidden')).toEqual({ forward: false, backward: true });
    expect(arrangeOptions(front, 'el_star')).toEqual({ forward: true, backward: true });
    expect(arrangeOptions(front, 'el_badge')).toEqual({ forward: false, backward: false });
    expect(arrangeOptions(front, 'nope')).toEqual({ forward: false, backward: false });
  });

  it('names types and layers for screen readers', () => {
    expect([text, image, graphic, rect, line].map(elementTypeLabel)).toEqual(['Text', 'Image', 'Graphic', 'Rectangle', 'Line']);
    const doc = demoDesign();
    const badge = front.elements.find((e) => e.id === 'el_badge')!;
    expect(layerAccessibleName(badge, doc)).toBe('Since 2026, text, locked');
    expect(layerAccessibleName({ ...badge, hidden: true, locked: false }, doc)).toBe('Since 2026, text, hidden');
  });
});
