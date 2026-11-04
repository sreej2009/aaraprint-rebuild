import { describe, expect, it, vi } from 'vitest';
import { createImageElement, createShapeElement, createTextElement } from '../schema/create';
import type { SurfacePrint } from '../schema/types';
import { DEMO_SHAPES, demoDesign } from '../demo/demo-design';
import { drawingFor, elementFrame, fontCss, fontStyleFor, guideGeometry, starPoints } from './drawing';
import { artworkRegion, exportArtwork, ARTWORK_LAYER } from './export';

const box = { x: 100, y: 50, width: 200, height: 80 };

describe('element frames', () => {
  it('rotate around the box centre', () => {
    const frame = elementFrame(createShapeElement('rect', box, { rotation: 30, opacity: 0.5 }));
    expect(frame).toEqual({ x: 200, y: 90, offsetX: 100, offsetY: 40, rotation: 30, opacity: 0.5 });
  });
});

describe('element drawings', () => {
  it('maps text fields to canvas text', () => {
    const text = createTextElement(box, { text: 'Hello', fontFamily: 'Manrope', fontSize: 60, fontWeight: 700, italic: true, underline: true, letterSpacing: 0.1, align: 'center', lineHeight: 1.4, color: '#4b43d6' });
    expect(drawingFor(text)).toEqual({
      kind: 'text',
      text: 'Hello',
      width: 200,
      fontFamily: "'Manrope Variable', Manrope, sans-serif",
      fontSize: 60,
      fontStyle: 'italic 700',
      textDecoration: 'underline',
      fill: '#4b43d6',
      align: 'center',
      lineHeight: 1.4,
      letterSpacing: 6,
    });
    expect(fontCss('Inter')).toContain("'Inter Variable'");
    expect(fontCss("Fraunces'")).toBe("'Fraunces', sans-serif");
    expect(fontStyleFor(400, false)).toBe('400');
  });

  it('draws every shape inside its box', () => {
    const kinds = (['rect', 'ellipse', 'line', 'triangle', 'star', 'arrow'] as const).map((shape) => drawingFor(createShapeElement(shape, box, { cornerRadius: 500 })));
    expect(kinds.map((d) => d.kind)).toEqual(['rect', 'ellipse', 'polyline', 'polyline', 'polyline', 'arrow']);
    expect(kinds[0]).toMatchObject({ width: 200, height: 80, cornerRadius: 40 }); // radius clamped
    expect(kinds[1]).toMatchObject({ x: 100, y: 40, radiusX: 100, radiusY: 40 });
    expect(kinds[2]).toMatchObject({ points: [0, 40, 200, 40], closed: false });
    expect(kinds[3]).toMatchObject({ points: [100, 0, 200, 80, 0, 80], closed: true });
    for (const d of kinds) {
      if (d.kind !== 'polyline' && d.kind !== 'arrow') continue;
      const xs = d.points.filter((_, i) => i % 2 === 0);
      const ys = d.points.filter((_, i) => i % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.max(...xs)).toBeLessThanOrEqual(200 + 1e-9);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.max(...ys)).toBeLessThanOrEqual(80 + 1e-9);
    }
  });

  it('builds stars with the requested points, starting at the top', () => {
    const points = starPoints(5, 100, 100);
    expect(points).toHaveLength(20);
    expect(points[0]).toBeCloseTo(50, 10);
    expect(points[1]).toBeCloseTo(0, 10);
  });

  it('shows a frame for images until their source loads', () => {
    expect(drawingFor(createImageElement({ kind: 'asset', assetId: 'a' }, box))).toEqual({ kind: 'image-placeholder', width: 200, height: 80 });
  });

  it('draws every element of the demo design', () => {
    const elements = demoDesign().surfaces.flatMap((s) => s.elements);
    expect(elements.map((e) => drawingFor(e).kind)).toContain('text');
    expect(new Set(elements.map((e) => drawingFor(e).kind))).toEqual(new Set(['text', 'rect', 'ellipse', 'polyline', 'arrow', 'image-placeholder']));
  });
});

describe('guides', () => {
  const card: SurfacePrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };

  it('positions bleed outside and safe zone inside the trim', () => {
    const g = guideGeometry(card);
    expect(g.trim).toEqual({ x: 0, y: 0, width: 1050, height: 600 });
    expect(g.bleed).toEqual({ x: -18, y: -18, width: 1086, height: 636 });
    expect(g.safe).toEqual({ x: 24, y: 24, width: 1002, height: 552 });
    expect(g).toMatchObject({ hasBleed: true, hasSafe: true });
  });

  it('follows every trim shape', () => {
    const [rect, rounded, oval, circle] = DEMO_SHAPES.map((s) => guideGeometry(s.print));
    expect(rect?.trimShape).toEqual({ kind: 'rectangle' });
    expect(rounded?.trimShape).toEqual({ kind: 'rounded-rectangle', radius: 35 });
    expect(rounded?.bleedShape).toEqual({ kind: 'rounded-rectangle', radius: 53 }); // parallel to the trim
    expect(rounded?.safeShape).toEqual({ kind: 'rounded-rectangle', radius: 11 });
    expect(oval?.trimShape).toEqual({ kind: 'ellipse' });
    expect(oval?.trim).toEqual({ x: 0, y: 0, width: 1080, height: 660 });
    expect(circle?.trim).toEqual({ x: 0, y: 0, width: 700, height: 700 });
  });

  it('draws no bleed for products without it', () => {
    const g = guideGeometry({ ...card, bleedPx: 0 });
    expect(g.hasBleed).toBe(false);
    expect(g.bleed).toEqual(g.trim);
  });
});

describe('artwork export', () => {
  const card: SurfacePrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };

  it('reads the bleed box back at print resolution', () => {
    const region = artworkRegion({ scale: 0.5, x: 40, y: 30 }, card);
    expect(region).toEqual({ x: 31, y: 21, width: 543, height: 318, pixelRatio: 2 });
    expect(artworkRegion({ scale: 0.5, x: 40, y: 30 }, card, 0.5).pixelRatio).toBe(1);
  });

  it('exports only the artwork layer, never guides', () => {
    const toCanvas = vi.fn<() => HTMLCanvasElement>(() => document.createElement('canvas'));
    const findOne = vi.fn<(selector: string) => { toCanvas: typeof toCanvas } | null>((selector) => (selector === `.${ARTWORK_LAYER}` ? { toCanvas } : null));
    exportArtwork({ findOne }, { scale: 1, x: 0, y: 0 }, card);
    expect(findOne).toHaveBeenCalledWith('.artwork');
    expect(toCanvas).toHaveBeenCalledWith({ x: -18, y: -18, width: 1086, height: 636, pixelRatio: 1 });
    expect(() => exportArtwork({ findOne: () => null }, { scale: 1, x: 0, y: 0 }, card)).toThrow(/artwork layer/);
  });
});
