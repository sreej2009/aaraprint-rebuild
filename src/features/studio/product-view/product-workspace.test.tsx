import { act, render } from '@testing-library/react';
import { useMemo, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElementPointer } from '../canvas/element-pointer';
import { createInteractionStore, InteractionStoreContext, type InteractionStore } from '../canvas/interaction-store';
import { SelectionOverlay } from '../canvas/selection-overlay';
import { useCanvasGestures } from '../canvas/use-canvas-gestures';
import { ViewportStoreContext } from '../canvas/viewport-context';
import { createViewportStore, percentOf, type ViewportStore } from '../canvas/viewport-store';
import { sampleDesignFor } from '../demo/sample-design';
import { printBoxes, type Rect } from '../geometry/boxes';
import { useStudioShortcuts } from '../keyboard/use-studio-shortcuts';
import type { StudioProfile } from '../profile/types';
import { createBlankDesign } from '../schema/create';
import { createStudioStore, selectActiveSurface, StudioProvider, type StudioStore } from '../store';
import { readProfile } from '../testing/catalogue-fixtures';
import { designToProduct, placeArtwork, productBounds, productViewFor } from './product-view';

/**
 * Editing on the product (Phase 4 M2) with the real stores, gestures, selection overlay and
 * shortcuts: the workspace only changes what the view fits and pans over (the whole photo, in
 * design px). Every edit still lands in print px, exactly as on the flat sheet.
 */

const profile = readProfile('umbrella-golf');
/** The real profile with a cleared stand-in photo (same size and placements). */
const cleared: StudioProfile = { ...profile, sides: profile.sides.map((s) => ({ ...s, mockup: { ...s.mockup!, ref: `studio-fixtures/umbrella-${s.id}.png`, rights: 'cleared' } })) };
const AREA = { width: 1000, height: 700 };

let studio: StudioStore;
let viewport: ViewportStore;
let interaction: InteractionStore;

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const delegate = useMemo(() => createElementPointer({ studio, viewport, interaction }), []);
  useCanvasGestures(ref, viewport, delegate);
  useStudioShortcuts(studio, interaction);
  return (
    <div ref={ref} data-testid="canvas-area" data-studio-keys="">
      <SelectionOverlay />
    </div>
  );
}

function photoBounds(sideId: 'front' | 'back'): { bounds: Rect; placed: ReturnType<typeof placeArtwork> } {
  const result = productViewFor(cleared, sideId, { hasMedia: () => true, mediaUrl: (r) => r });
  if (!result.ok) throw new Error(result.reason);
  const placed = placeArtwork(result.view.placement, { width: 1800, height: 2400 });
  return { bounds: productBounds(result.view, placed), placed };
}

function setup() {
  studio = createStudioStore({ document: sampleDesignFor(createBlankDesign(cleared)), clock: () => 1_000 });
  viewport = createViewportStore({ showGuides: true });
  interaction = createInteractionStore();
  viewport.getState().actions.setArea(AREA);
  const view = render(
    <StudioProvider store={studio}>
      <ViewportStoreContext.Provider value={viewport}>
        <InteractionStoreContext.Provider value={interaction}>
          <Harness />
        </InteractionStoreContext.Provider>
      </ViewportStoreContext.Provider>
    </StudioProvider>,
  );
  const area = view.getByTestId('canvas-area');
  area.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: AREA.width, bottom: AREA.height, width: AREA.width, height: AREA.height, toJSON: () => ({}) });
  return { area, view };
}

/** What the workspace does when "On the product" is chosen: fit and pan over the photo. */
function onProduct(sideId: 'front' | 'back' = 'front') {
  act(() => viewport.getState().actions.showSurface(sideId, photoBounds(sideId).bounds, 300));
}
function flat(sideId: 'front' | 'back' = 'front') {
  const surface = studio.getState().document.surfaces.find((s) => s.id === sideId)!;
  act(() => viewport.getState().actions.showSurface(sideId, printBoxes(surface.print).bleed, 300));
}

const toScreen = (x: number, y: number) => {
  const v = viewport.getState().viewport;
  return { clientX: x * v.scale + v.x, clientY: y * v.scale + v.y };
};

function pointer(target: Element, type: string, init: Partial<PointerEventInit>) {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: 'mouse', pointerId: 1, ...init }));
  });
}

function drag(target: Element, from: { clientX: number; clientY: number }, dx: number, dy: number) {
  pointer(target, 'pointerdown', from);
  for (let i = 1; i <= 4; i += 1) pointer(target, 'pointermove', { clientX: from.clientX + (dx * i) / 4, clientY: from.clientY + (dy * i) / 4 });
  pointer(target, 'pointerup', { clientX: from.clientX + dx, clientY: from.clientY + dy });
}

const surface = () => selectActiveSurface(studio.getState())!;
const firstText = () => surface().elements.find((e) => e.type === 'text' && !e.hidden && !e.locked)!;
const centreOf = (e: { x: number; y: number; width: number; height: number }) => toScreen(e.x + e.width / 2, e.y + e.height / 2);

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('fit and zoom on the product', () => {
  it('Fit shows the whole photo; the print area sits at the original placement on it', () => {
    setup();
    flat();
    const flatPercent = percentOf(viewport.getState());
    onProduct();
    const v = viewport.getState().viewport;
    const { bounds, placed } = photoBounds('front');
    // The whole photo is on screen, not cropped.
    expect(bounds.x * v.scale + v.x).toBeGreaterThanOrEqual(-0.5);
    expect(bounds.y * v.scale + v.y).toBeGreaterThanOrEqual(-0.5);
    expect((bounds.x + bounds.width) * v.scale + v.x).toBeLessThanOrEqual(AREA.width + 0.5);
    expect((bounds.y + bounds.height) * v.scale + v.y).toBeLessThanOrEqual(AREA.height + 0.5);
    // One transform for photo and artwork: the trim corners land where the placement puts them on the photo.
    const photoScale = v.scale / placed.scale;
    for (const [x, y] of [
      [0, 0],
      [1800, 2400],
    ]) {
      const onPhoto = designToProduct({ x: x!, y: y! }, placed);
      const viaPhoto = { clientX: (bounds.x + onPhoto.x / placed.scale) * v.scale + v.x, clientY: (bounds.y + onPhoto.y / placed.scale) * v.scale + v.y };
      expect(viaPhoto.clientX).toBeCloseTo(toScreen(x!, y!).clientX, 6);
      expect(viaPhoto.clientY).toBeCloseTo(toScreen(x!, y!).clientY, 6);
    }
    expect(photoScale).toBeGreaterThan(0);
    // The photo is much bigger than the print area, so Fit is further out than on the flat sheet.
    expect(percentOf(viewport.getState())).toBeLessThan(flatPercent);
    expect(viewport.getState().mode).toBe('fit');
  });

  it('zoom and pan move photo and artwork together; 100 % is still real size; Fit comes back', () => {
    setup();
    onProduct();
    act(() => viewport.getState().actions.zoomTo(100));
    expect(percentOf(viewport.getState())).toBeCloseTo(100, 6);
    expect(viewport.getState().viewport.scale).toBeCloseTo(96 / 300, 9);
    const before = viewport.getState().viewport;
    act(() => viewport.getState().actions.panBy(-120, 45));
    expect(viewport.getState().viewport).toEqual({ scale: before.scale, x: before.x - 120, y: before.y + 45 });
    act(() => viewport.getState().actions.zoomTo(10));
    act(() => viewport.getState().actions.fit());
    expect(viewport.getState().mode).toBe('fit');
    // Nothing about the view is in the design or its history.
    expect(studio.getState().history.past).toHaveLength(0);
  });

  it('front and back each fit their own photo; switching back to flat fits the sheet again', () => {
    setup();
    onProduct('front');
    const front = viewport.getState().content;
    onProduct('back');
    expect(viewport.getState().content).not.toEqual(front);
    expect(viewport.getState().content).toEqual(photoBounds('back').bounds);
    flat('back');
    expect(viewport.getState().content).toEqual(printBoxes(surface().print).bleed);
  });
});

describe('editing on the product stays in print px', () => {
  it('a drag moves the element by the screen distance ÷ zoom, in print px, as one undo step', () => {
    const { area } = setup();
    onProduct();
    const text = firstText();
    const scale = viewport.getState().viewport.scale;
    drag(area, centreOf(text), 40, 24);
    const moved = surface().elements.find((e) => e.id === text.id)!;
    expect(moved.x).toBeCloseTo(text.x + 40 / scale, 0);
    expect(moved.y).toBeCloseTo(text.y + 24 / scale, 0);
    expect(moved.width).toBe(text.width);
    expect(studio.getState().history.past).toHaveLength(1);
    act(() => studio.getState().actions.undo());
    expect(surface().elements.find((e) => e.id === text.id)).toMatchObject({ x: text.x, y: text.y });
  });

  it('arrow keys nudge the selection 0.5 mm in print px, whatever the zoom', () => {
    setup();
    onProduct();
    const text = firstText();
    act(() => studio.getState().actions.select([text.id]));
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    // 0.5 mm at 300 DPI.
    expect(surface().elements.find((e) => e.id === text.id)!.x).toBeCloseTo(text.x + (0.5 / 25.4) * 300, 1); // positions are kept to 0.01 px
  });

  it('the photo is not pickable: pressing on it selects nothing, and dragging it pans the view', () => {
    const { area } = setup();
    onProduct();
    act(() => studio.getState().actions.select([firstText().id]));
    const { bounds } = photoBounds('front');
    // A point on the photo well away from the print area (its lower part, the umbrella's handle).
    const onPhoto = toScreen(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.9);
    const before = studio.getState().document;
    pointer(area, 'pointerdown', onPhoto);
    pointer(area, 'pointerup', onPhoto);
    expect(studio.getState().editor.selectedIds).toEqual([]);
    const view = viewport.getState().viewport;
    drag(area, onPhoto, 30, 0);
    expect(studio.getState().editor.selectedIds).toEqual([]);
    expect(viewport.getState().viewport.x).toBeCloseTo(view.x + 30, 6);
    expect(studio.getState().document).toBe(before);
  });
});
