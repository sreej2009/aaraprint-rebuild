import { describe, expect, it } from 'vitest';
import { ALL_HANDLES, CORNER_HANDLES } from '../geometry/transform';
import { printBoxes } from '../geometry/boxes';
import { mmToPx, pxToPt } from '../geometry/units';
import { cornerRadiusMax, lineWidthPatch, pointsRange, sizePatch, strokeMaxPt, toStrokePt } from '../inspector/inspector-rules';
import { elementDisplayName } from '../naming';
import { createShapeElement } from '../schema/create';
import { SHAPE_KINDS, type ShapeElement, type SurfacePrint } from '../schema/types';
import { parseDesign, validateDesign } from '../schema/validate';
import { sampleDesign, sequentialIds } from '../testing/fixtures';
import { presetById, presetLineWidth, presetShape, SHAPE_PRESETS } from '../tools/shape-presets';
import { dashPattern, drawingFor, polygonPoints, starPoints } from './drawing';
import { alwaysKeepsRatio, canLockRatio, defaultRatioLock, handlesFor, keepsRatio, ratioLocked } from './transform-rules';

const box = { x: 0, y: 0, width: 200, height: 100 };
const shape = (kind: ShapeElement['shape'], fields: Partial<ShapeElement> = {}) => createShapeElement(kind, box, fields, () => `el_${kind}`);
const card: SurfacePrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
const banner: SurfacePrint = { widthPx: 7087, heightPx: 3543, dpi: 100, bleedPx: 0, safeZonePx: 79, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };

describe('shape model', () => {
  it('offers rectangle, circle, ellipse, line, triangle, star, polygon and arrow with print-friendly defaults', () => {
    expect(SHAPE_KINDS).toEqual(['rect', 'circle', 'ellipse', 'line', 'triangle', 'star', 'polygon', 'arrow']);
    expect(shape('rect')).toMatchObject({ fill: '#2f5bd3', stroke: null, strokeWidth: 0, cornerRadius: 0, innerRadius: 0.5, lineCap: 'round', dash: 'solid' });
    expect(shape('line')).toMatchObject({ fill: null, stroke: '#1b1f27', strokeWidth: 6 });
    expect(shape('star').points).toBe(5);
    expect(shape('polygon').points).toBe(6);
  });

  it('saves and reopens every shape field; designs made before M9 open with defaults', () => {
    const doc = sampleDesign();
    const styled = shape('line', { lineCap: 'square', dash: 'dashed', innerRadius: 0.3, opacity: 0.5, rotation: 30, name: 'Rule' });
    doc.surfaces[1]!.elements.push(styled, shape('star', { innerRadius: 0.8, points: 7, fill: null, stroke: '#b91c1c', strokeWidth: 8 }));
    expect(validateDesign(doc)).toEqual([]);
    const parsed = parseDesign(JSON.stringify(doc));
    expect(parsed).toMatchObject({ ok: true, document: doc });

    const old = JSON.parse(JSON.stringify(doc));
    for (const e of old.surfaces[1].elements) {
      delete e.innerRadius;
      delete e.lineCap;
      delete e.dash;
    }
    const reopened = parseDesign(old);
    expect(reopened.ok && reopened.document.surfaces[1]!.elements[0]).toMatchObject({ innerRadius: 0.5, lineCap: 'round', dash: 'solid' });
  });

  it('refuses invalid shape fields', () => {
    const doc = sampleDesign();
    doc.surfaces[1]!.elements.push({ ...shape('line'), lineCap: 'pointy' } as never, { ...shape('star'), innerRadius: 1.5 } as never);
    const parsed = parseDesign(JSON.stringify(doc));
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.errors.map((e) => e.path)).toEqual(['surfaces[1].elements[0].lineCap', 'surfaces[1].elements[1].innerRadius']);
  });

  it('names shapes by kind, polygons by their sides', () => {
    expect([shape('rect'), shape('circle'), shape('polygon'), shape('polygon', { points: 5 }), shape('polygon', { points: 7 })].map((e) => elementDisplayName(e))).toEqual([
      'Rectangle',
      'Circle',
      'Hexagon',
      'Pentagon',
      'Polygon',
    ]);
  });
});

describe('shape drawings', () => {
  it('keep borders inside the box, so what is selected is what prints', () => {
    expect(drawingFor(shape('rect', { stroke: '#000000', strokeWidth: 10, cornerRadius: 30 }))).toMatchObject({ kind: 'rect', x: 5, y: 5, width: 190, height: 90, cornerRadius: 25, strokeWidth: 10 });
    expect(drawingFor(shape('ellipse', { stroke: '#000000', strokeWidth: 10 }))).toMatchObject({ kind: 'ellipse', x: 100, y: 50, radiusX: 95, radiusY: 45 });
    // A border can't be wider than half the shape.
    expect(drawingFor(shape('rect', { stroke: '#000000', strokeWidth: 500 }))).toMatchObject({ strokeWidth: 50, x: 25, width: 150, height: 50 });
    // No border colour: no border, whatever the width says.
    expect(drawingFor(shape('rect', { strokeWidth: 10 }))).toMatchObject({ x: 0, width: 200, strokeWidth: 0 });
  });

  it('draw circles round, even in a box that has been stretched', () => {
    expect(drawingFor(shape('circle'))).toMatchObject({ kind: 'ellipse', x: 100, y: 50, radiusX: 50, radiusY: 50 });
  });

  it('draw triangles, stars and polygons from deterministic points inside the box', () => {
    const inside = (points: number[]) => points.every((v, i) => v >= -1e-9 && v <= (i % 2 === 0 ? 200 : 100) + 1e-9);
    const triangle = drawingFor(shape('triangle', { stroke: '#000000', strokeWidth: 10 }));
    expect(triangle.kind === 'polyline' && triangle.points).toEqual([100, 5, 195, 95, 5, 95]);
    expect(starPoints(5, 200, 100)).toHaveLength(20);
    const star = starPoints(5, 200, 200, 0.3);
    expect(Math.hypot(star[2]! - 100, star[3]! - 100)).toBeCloseTo(30, 6); // inner points at 30 % of the outer radius
    expect(polygonPoints(6, 200, 100)).toHaveLength(12);
    expect(polygonPoints(6, 200, 100).slice(0, 2)).toEqual([100, 0]); // first corner at the top
    expect(inside(polygonPoints(8, 200, 100))).toBe(true);
    const drawn = drawingFor(shape('star', { points: 8, innerRadius: 0.7 }));
    expect(drawn.kind === 'polyline' && drawn.points).toHaveLength(32);
  });

  it('draw lines along the box middle with their width, ends and dashes', () => {
    const line = shape('line', { strokeWidth: 6, height: 6, lineCap: 'square', dash: 'dashed' });
    expect(drawingFor(line)).toMatchObject({ kind: 'polyline', points: [0, 3, 200, 3], closed: false, fill: null, strokeWidth: 6, lineCap: 'square', dash: [18, 12] });
    expect(drawingFor({ ...line, dash: 'dotted' })).toMatchObject({ lineCap: 'round', dash: [0.001, 12] }); // dots need round ends
    expect(dashPattern('solid', 6)).toBeUndefined();
    expect(drawingFor(shape('arrow', { lineCap: 'butt' }))).toMatchObject({ kind: 'arrow', lineCap: 'butt' });
  });
});

describe('proportions and handles', () => {
  it('lock graphics, triangles, stars and polygons by default; circles always', () => {
    expect(SHAPE_KINDS.map((k) => defaultRatioLock(shape(k)))).toEqual([false, false, false, false, true, true, true, false]);
    expect(SHAPE_KINDS.map((k) => canLockRatio(shape(k)))).toEqual([true, false, true, false, true, true, true, true]);
    expect(alwaysKeepsRatio(shape('circle'))).toBe(true);
    expect(ratioLocked(shape('star'), false)).toBe(false);
    expect(ratioLocked(shape('rect'), true)).toBe(true);
    expect(ratioLocked(shape('circle'), false)).toBe(true);
    expect(ratioLocked(shape('line'), true)).toBe(false);
  });

  it('show only corner handles while proportions are locked; Shift reverses the lock', () => {
    expect(handlesFor(shape('star'))).toEqual(CORNER_HANDLES);
    expect(handlesFor(shape('star'), false)).toEqual(ALL_HANDLES);
    expect(handlesFor(shape('rect'), true)).toEqual(CORNER_HANDLES);
    expect(handlesFor(shape('circle'), false)).toEqual(CORNER_HANDLES);
    expect(handlesFor(shape('line'))).toEqual(['e', 'w']);
    expect(keepsRatio(shape('star'), 'se', false)).toBe(true);
    expect(keepsRatio(shape('star'), 'se', true)).toBe(false);
    expect(keepsRatio(shape('rect'), 'se', false, true)).toBe(true);
    expect(keepsRatio(shape('circle'), 'se', true)).toBe(true);
    expect(keepsRatio(shape('rect'), 'e', true, true)).toBe(false);
  });

  it('type W or H: circles change both; locked shapes keep proportions', () => {
    expect(sizePatch(shape('circle', { width: 100, height: 100 }), 'width', (200 / 300) * 25.4, false, card)).toEqual({ width: 200, height: 200 });
    expect(sizePatch(shape('rect'), 'width', (400 / 300) * 25.4, false, card)).toEqual({ width: 400 });
    expect(sizePatch(shape('star'), 'width', (400 / 300) * 25.4, true, card)).toEqual({ width: 400, height: 200 });
  });
});

describe('shape style rules', () => {
  it('a line’s height is its width, keeping its centre', () => {
    expect(lineWidthPatch(shape('line', { y: 100, height: 6, strokeWidth: 6 }), 10)).toEqual({ strokeWidth: 10, height: 10, y: 98 });
  });

  it('bound borders, corners and points to what the shape can hold', () => {
    expect(strokeMaxPt({ width: 200, height: 100 }, card)).toBe(12); // 50 px at 300 DPI = 12 pt
    expect(toStrokePt(12.5, card)).toBe(3);
    expect(cornerRadiusMax({ width: 200, height: 100 })).toBe(50);
    expect(pointsRange(shape('star'))).toEqual({ min: 3, max: 20 });
    expect(pointsRange(shape('polygon'))).toEqual({ min: 3, max: 12 });
  });
});

describe('shape presets', () => {
  it('cover the Shapes tool, each adding its kind', () => {
    expect(SHAPE_PRESETS.map((p) => p.label)).toEqual(['Rectangle', 'Rounded rectangle', 'Circle', 'Ellipse', 'Triangle', 'Star', 'Hexagon', 'Line', 'Arrow']);
    expect(presetShape(presetById('rounded-rect'), card).cornerRadius).toBeGreaterThan(0);
    expect(presetShape(presetById('polygon'), card)).toMatchObject({ shape: 'polygon', points: 6 });
  });

  it('size shapes to the product: small on a card, large on a banner, always inside the safe area', () => {
    for (const print of [card, banner]) {
      const safe = printBoxes(print).safe;
      for (const preset of SHAPE_PRESETS) {
        const s = presetShape(preset, print, [], sequentialIds());
        expect(s.x, preset.id).toBeGreaterThanOrEqual(safe.x);
        expect(s.y).toBeGreaterThanOrEqual(safe.y);
        expect(s.x + s.width).toBeLessThanOrEqual(safe.x + safe.width + 0.01);
        expect(s.y + s.height).toBeLessThanOrEqual(safe.y + safe.height + 0.01);
        expect(s.x + s.width / 2).toBeCloseTo(safe.x + safe.width / 2, 1);
      }
    }
    const onCard = presetShape(presetById('circle'), card);
    const onBanner = presetShape(presetById('circle'), banner);
    expect(onCard.width).toBe(onCard.height);
    expect(onCard.width / card.dpi).toBeLessThan(onBanner.width / banner.dpi); // physically larger on the banner
  });

  it('give lines a quarter-point thickness that scales with the product; height = thickness', () => {
    const line = presetShape(presetById('line'), card);
    expect(line.height).toBe(line.strokeWidth);
    const pt = pxToPt(line.strokeWidth, card.dpi);
    expect(Math.abs(pt * 4 - Math.round(pt * 4))).toBeLessThan(0.01);
    expect(pxToPt(presetLineWidth(10, 300), 300)).toBeCloseTo(0.5, 1); // never thinner than ½ pt
    expect(pxToPt(presetShape(presetById('line'), banner).strokeWidth, banner.dpi)).toBeGreaterThan(pt);
  });

  it('step down and right instead of covering a shape added the same way', () => {
    const ids = sequentialIds();
    const first = presetShape(presetById('star'), card, [], ids);
    const second = presetShape(presetById('star'), card, [first], ids);
    expect(second.x - first.x).toBeCloseTo(mmToPx(3, 300), 1);
    expect(second.id).not.toBe(first.id);
  });
});
