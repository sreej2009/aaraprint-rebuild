import { afterEach, describe, expect, it } from 'vitest';
import { printBoxes } from '../geometry/boxes';
import { workspacePadding } from '../geometry/fit';
import { toScreenRect } from '../geometry/viewport';
import { createViewportStore, limitsOf, percentOf } from './viewport-store';

const cardPrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24 };
const card = printBoxes(cardPrint).bleed;
const banner = printBoxes({ widthPx: 9000, heightPx: 3358, dpi: 150, bleedPx: 30, safeZonePx: 50 }).bleed;
const strip = printBoxes({ widthPx: 600, heightPx: 200, dpi: 300, bleedPx: 0, safeZonePx: 15 }).bleed;

function setup(area = { width: 1000, height: 700 }, content = card, dpi = 300) {
  const store = createViewportStore({ showGuides: true });
  const { actions } = store.getState();
  actions.setArea(area);
  actions.setContent(content, dpi);
  return { store, actions, get: () => store.getState() };
}

const percent = (s: ReturnType<typeof setup>) => percentOf(s.get());
const sheetOnScreen = (s: ReturnType<typeof setup>) => toScreenRect(s.get().viewport, s.get().content!);

afterEach(() => localStorage.clear());

describe('fitting', () => {
  it('fits the bleed box on load and stays fitted while the area resizes', () => {
    const s = setup();
    expect(s.get().mode).toBe('fit');
    const pad = workspacePadding(1000);
    expect(sheetOnScreen(s).x).toBeCloseTo(pad, 6);
    s.actions.setArea({ width: 600, height: 900 });
    expect(sheetOnScreen(s).x).toBeCloseTo(workspacePadding(600), 6);
    expect(sheetOnScreen(s).width).toBeCloseTo(600 - 2 * workspacePadding(600), 6);
  });

  it('waits for both the area and the content', () => {
    const store = createViewportStore();
    store.getState().actions.setContent(card, 300);
    expect(store.getState().viewport.scale).toBe(1);
    store.getState().actions.setArea({ width: 800, height: 600 });
    expect(store.getState().mode).toBe('fit');
    expect(toScreenRect(store.getState().viewport, card).x).toBeCloseTo(workspacePadding(800), 6);
  });

  it('keeps the view when switching to a side of the same size, re-fits for a different size', () => {
    const s = setup();
    s.actions.zoomTo(250);
    const zoomed = s.get().viewport;
    s.actions.setContent({ ...card }, 300); // back side: same geometry
    expect(s.get().viewport).toBe(zoomed);
    s.actions.setContent(strip, 300);
    expect(s.get().mode).toBe('fit');
  });

  it('handles very large and very small print areas', () => {
    const big = setup({ width: 600, height: 400 }, banner, 150); // 1.5 m banner in a small window
    expect(percent(big)).toBeLessThan(10);
    expect(limitsOf(big.get()).minPercent).toBeCloseTo(percent(big), 6);
    big.actions.zoomStep(-1);
    expect(percent(big)).toBeCloseTo(limitsOf(big.get()).minPercent, 6); // can't go below fit
    const small = setup({ width: 1400, height: 800 }, strip, 300);
    expect(percent(small)).toBeGreaterThan(100);
    expect(Number.isFinite(small.get().viewport.scale)).toBe(true);
  });
});

describe('zooming', () => {
  it('zooms to a percentage around the centre, clamped to the limits', () => {
    const s = setup();
    s.actions.zoomTo(200);
    expect(percent(s)).toBeCloseTo(200, 6);
    expect(s.get().mode).toBe('manual');
    s.actions.zoomTo(5000);
    expect(percent(s)).toBeCloseTo(400, 6);
    s.actions.zoomTo(1);
    expect(percent(s)).toBeCloseTo(10, 6);
  });

  it('steps in and out and returns to fit and real size', () => {
    const s = setup();
    const fitted = percent(s);
    s.actions.zoomStep(1);
    expect(percent(s)).toBeGreaterThan(fitted);
    s.actions.fit();
    expect(percent(s)).toBeCloseTo(fitted, 6);
    s.actions.actualSize();
    expect(percent(s)).toBeCloseTo(100, 6);
    const centre = sheetOnScreen(s);
    expect(centre.x + centre.width / 2).toBeCloseTo(500, 6);
  });

  it('zooms around a pointer position', () => {
    const s = setup();
    const before = s.get().viewport;
    const anchor = { x: 300, y: 200 };
    const design = { x: (anchor.x - before.x) / before.scale, y: (anchor.y - before.y) / before.scale };
    s.actions.zoomBy(1.5, anchor);
    const after = s.get().viewport;
    expect(design.x * after.scale + after.x).toBeCloseTo(anchor.x, 6);
  });
});

describe('panning', () => {
  it('pans, never losing the sheet, and keeps manual views centred on resize', () => {
    const s = setup();
    s.actions.zoomTo(300);
    const x = s.get().viewport.x;
    s.actions.panBy(-40, 25);
    expect(s.get().viewport.x).toBeCloseTo(x - 40, 6);
    s.actions.panBy(-100000, 0);
    expect(sheetOnScreen(s).x + sheetOnScreen(s).width).toBeGreaterThanOrEqual(79.99);
    s.actions.setArea({ width: 1200, height: 700 });
    expect(s.get().mode).toBe('manual');
  });
});

describe('guides', () => {
  it('remembers the preference on this device', () => {
    const s = setup();
    s.actions.setShowGuides(false);
    expect(s.get().showGuides).toBe(false);
    expect(createViewportStore().getState().showGuides).toBe(false);
    s.actions.setShowGuides(true);
    expect(createViewportStore().getState().showGuides).toBe(true);
  });
});
