import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import { createImageElement, createShapeElement, createTextElement } from '../schema/create';
import type { SurfaceDesign, SurfacePrint } from '../schema/types';
import { canPan, clampPreviewPan, panBy, percentOf, previewFit, previewLimits, stepPreviewPercent, trimRect, viewportFor, zoomToPercent } from './preview-view';
import { usePreviewReady } from './readiness';

/**
 * Preview view maths (M14): fitting the finished piece, zoom limits and steps, panning that never
 * loses the piece, and waiting for fonts and images before showing it.
 */

const CARD: SurfacePrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
const SCREEN = { width: 1200, height: 800 };

describe('fit and zoom', () => {
  it('fits the trimmed piece (not the bleed) inside the space, centred, with padding', () => {
    const fit = previewFit(SCREEN, CARD);
    expect(trimRect(CARD)).toEqual({ x: 0, y: 0, width: 1050, height: 600 });
    expect(fit.scale).toBeCloseTo((1200 - 112) / 1050, 5);
    expect(fit.x + (1050 * fit.scale) / 2).toBeCloseTo(600, 5);
    expect(fit.y + (600 * fit.scale) / 2).toBeCloseTo(400, 5);
    // Phones get less padding.
    expect(previewFit({ width: 390, height: 600 }, CARD).scale).toBeCloseTo((390 - 40) / 1050, 5);
  });

  it('zooms 25–400 %, widened to include Fit, in the editor’s percent of real size', () => {
    expect(previewLimits(120)).toEqual({ minPercent: 25, maxPercent: 400 });
    expect(previewLimits(4)).toEqual({ minPercent: 4, maxPercent: 400 }); // a banner fits at 4 %
    expect(previewLimits(700)).toEqual({ minPercent: 25, maxPercent: 700 }); // a stamp fits at 700 %
    const fit = previewFit(SCREEN, CARD);
    expect(percentOf(zoomToPercent(fit, 100, SCREEN, CARD), CARD)).toBeCloseTo(100, 5);
    expect(percentOf(zoomToPercent(fit, 5000, SCREEN, CARD), CARD)).toBeCloseTo(400, 5);
    expect(percentOf(zoomToPercent(fit, 1, SCREEN, CARD), CARD)).toBeCloseTo(25, 5);
    expect(stepPreviewPercent(100, 1, 120)).toBe(120); // Fit is a stop
    expect(stepPreviewPercent(120, 1, 120)).toBe(150);
    expect(stepPreviewPercent(25, -1, 120)).toBe(25);
    expect(stepPreviewPercent(400, 1, 120)).toBe(400);
  });

  it('Fit follows the space; a chosen zoom keeps its scale when the space changes', () => {
    expect(viewportFor({ mode: 'fit' }, { width: 600, height: 400 }, CARD)).toEqual(previewFit({ width: 600, height: 400 }, CARD));
    const manual = zoomToPercent(previewFit(SCREEN, CARD), 200, SCREEN, CARD);
    expect(viewportFor({ mode: 'manual', viewport: manual }, { width: 600, height: 400 }, CARD).scale).toBe(manual.scale);
  });
});

describe('panning', () => {
  it('only when the piece is bigger than the space; it stays centred along an axis that fits', () => {
    const fit = previewFit(SCREEN, CARD);
    expect(canPan(fit, SCREEN, CARD)).toBe(false);
    expect(panBy(fit, 300, 300, SCREEN, CARD)).toEqual(fit);
    const big = zoomToPercent(fit, 400, SCREEN, CARD); // 1344 × 768 px on a 1200 × 800 space
    expect(canPan(big, SCREEN, CARD)).toBe(true);
    expect(big.y).toBeCloseTo((800 - 600 * big.scale) / 2, 5); // fits vertically: centred
  });

  it('never moves an edge further in than the padding', () => {
    const big = zoomToPercent(previewFit(SCREEN, CARD), 400, SCREEN, CARD);
    expect(panBy(big, 5000, 0, SCREEN, CARD).x).toBe(56);
    expect(panBy(big, -5000, 0, SCREEN, CARD).x).toBeCloseTo(1200 - 1050 * big.scale - 56, 5);
    expect(clampPreviewPan({ ...big, x: 10 }, SCREEN, CARD).x).toBe(10);
  });
});

describe('getting ready', () => {
  afterEach(() => {
    setImageLoaderForTests(null);
    setGraphicsLibraryForTests(null);
  });

  const surface = (elements: SurfaceDesign['elements']): SurfaceDesign => ({ id: 'front', label: 'Front', print: CARD, background: { color: null }, elements });

  it('is ready at once for text and shapes (fonts fall back where they can’t load)', async () => {
    setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 0 } });
    const { result } = renderHook(() => usePreviewReady([surface([createTextElement({ x: 0, y: 0, width: 100, height: 20 }), createShapeElement('star', { x: 0, y: 0, width: 50, height: 50 })])]));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('waits for a graphic to load, and stops waiting after the time limit', async () => {
    let finish: (image: HTMLImageElement) => void = () => {};
    setImageLoaderForTests(() => new Promise((resolve) => (finish = resolve)));
    setGraphicsLibraryForTests({
      status: 'ready',
      library: { graphics: [{ id: 'seal', name: 'Seal', group: 'Badges', tags: [], width: 10, height: 10, url: '/seal.svg', rights: 'cleared' }], withheld: 0 },
    });
    const surfaces = [surface([createImageElement({ kind: 'graphic', graphicId: 'seal' }, { x: 0, y: 0, width: 10, height: 10 })])];
    const { result } = renderHook(() => usePreviewReady(surfaces));
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(false);
    finish({} as HTMLImageElement);
    await waitFor(() => expect(result.current).toBe(true));

    setImageLoaderForTests(() => new Promise(() => {}));
    const other = [surface([createImageElement({ kind: 'graphic', graphicId: 'seal-2' }, { x: 0, y: 0, width: 10, height: 10 })])];
    setGraphicsLibraryForTests({ status: 'loading' });
    const slow = renderHook(() => usePreviewReady(other, 100));
    expect(slow.result.current).toBe(false);
    await waitFor(() => expect(slow.result.current).toBe(true));
  });
});
