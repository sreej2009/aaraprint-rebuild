import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { printBoxes } from '../geometry/boxes';
import { percentOf, createViewportStore, type ViewportStore } from './viewport-store';
import { useCanvasGestures } from './use-canvas-gestures';
import { useZoomShortcuts } from './use-zoom-shortcuts';

const card = printBoxes({ widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24 }).bleed;

function Harness({ store }: { store: ViewportStore }) {
  const ref = useRef<HTMLDivElement>(null);
  const cursor = useCanvasGestures(ref, store);
  useZoomShortcuts(store);
  return (
    <div ref={ref} data-testid="area" data-cursor={cursor ?? ''}>
      <input aria-label="Name" />
      <button type="button">Zoom in</button>
    </div>
  );
}

let store: ViewportStore;
function setup() {
  store = createViewportStore({ showGuides: true });
  store.getState().actions.setArea({ width: 1000, height: 700 });
  store.getState().actions.setContent(card, 300);
  const view = render(<Harness store={store} />);
  const area = view.getByTestId('area');
  // jsdom has no layout: the area sits at the page origin.
  area.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700, toJSON: () => ({}) });
  return { area, view };
}

function pointer(target: Element, type: string, init: Partial<PointerEventInit> & { pointerId: number }) {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', ...init }));
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('canvas gestures', () => {
  it('Ctrl + wheel zooms around the pointer; plain wheel pans', () => {
    const { area } = setup();
    const before = percentOf(store.getState());
    act(() => {
      area.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, ctrlKey: true, clientX: 300, clientY: 200, bubbles: true, cancelable: true }));
    });
    expect(percentOf(store.getState())).toBeGreaterThan(before);
    expect(store.getState().mode).toBe('manual');

    const { x, y } = store.getState().viewport;
    act(() => {
      area.dispatchEvent(new WheelEvent('wheel', { deltaX: 30, deltaY: 50, bubbles: true, cancelable: true }));
    });
    expect(store.getState().viewport.x).toBeCloseTo(x - 30, 6);
    expect(store.getState().viewport.y).toBeCloseTo(y - 50, 6);
  });

  it('prevents the page itself from scrolling or zooming', () => {
    const { area } = setup();
    const event = new WheelEvent('wheel', { deltaY: 10, ctrlKey: true, bubbles: true, cancelable: true });
    act(() => {
      area.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it('drags to pan with the mouse, showing a grab cursor', () => {
    const { area } = setup();
    store.getState().actions.zoomTo(300);
    const { x, y } = store.getState().viewport;
    expect(area.dataset.cursor).toBe('grab');
    pointer(area, 'pointerdown', { pointerId: 1, clientX: 400, clientY: 300 });
    expect(area.dataset.cursor).toBe('grabbing');
    pointer(area, 'pointermove', { pointerId: 1, clientX: 340, clientY: 330 });
    pointer(area, 'pointerup', { pointerId: 1, clientX: 340, clientY: 330 });
    expect(store.getState().viewport.x).toBeCloseTo(x - 60, 6);
    expect(store.getState().viewport.y).toBeCloseTo(y + 30, 6);
    expect(area.dataset.cursor).toBe('grab');
  });

  it('pans with one finger and pinch-zooms with two', () => {
    const { area } = setup();
    store.getState().actions.zoomTo(200);
    const touch = { pointerType: 'touch' as const };
    const start = store.getState().viewport;
    pointer(area, 'pointerdown', { pointerId: 1, clientX: 400, clientY: 300, ...touch });
    pointer(area, 'pointermove', { pointerId: 1, clientX: 420, clientY: 300, ...touch });
    expect(store.getState().viewport.x).toBeCloseTo(start.x + 20, 6);

    const beforePinch = percentOf(store.getState());
    pointer(area, 'pointerdown', { pointerId: 2, clientX: 520, clientY: 300, ...touch });
    pointer(area, 'pointermove', { pointerId: 2, clientX: 620, clientY: 300, ...touch }); // fingers spread 100 → 200 px
    expect(percentOf(store.getState())).toBeCloseTo(Math.min(beforePinch * 2, 400), 4);
    pointer(area, 'pointerup', { pointerId: 2, ...touch });
    pointer(area, 'pointerup', { pointerId: 1, ...touch });
  });

  it('leaves buttons over the canvas alone', () => {
    const { area } = setup();
    const before = store.getState().viewport;
    const button = area.querySelector('button')!;
    pointer(button, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    pointer(button, 'pointermove', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(store.getState().viewport).toBe(before);
    expect(area.dataset.cursor).toBe('grab');
  });

  it('ignores right-clicks', () => {
    const { area } = setup();
    const before = store.getState().viewport;
    pointer(area, 'pointerdown', { pointerId: 1, button: 2, clientX: 10, clientY: 10 });
    pointer(area, 'pointermove', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(store.getState().viewport).toBe(before);
  });
});

describe('zoom shortcuts', () => {
  const key = (init: KeyboardEventInit, target: EventTarget = window) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  it('zoom in and out, show real size, fit and toggle guides', () => {
    setup();
    const fitted = percentOf(store.getState());
    expect(key({ key: '=', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(percentOf(store.getState())).toBeGreaterThan(fitted);
    key({ key: '-', metaKey: true });
    key({ key: '-', metaKey: true });
    expect(percentOf(store.getState())).toBeLessThan(fitted);
    key({ key: '0', ctrlKey: true });
    expect(percentOf(store.getState())).toBeCloseTo(100, 6);
    key({ key: '!', code: 'Digit1', shiftKey: true });
    expect(store.getState().mode).toBe('fit');
    key({ key: ';', ctrlKey: true });
    expect(store.getState().showGuides).toBe(false);
  });

  it('do nothing while typing', () => {
    const { view } = setup();
    const input = view.getByRole('textbox', { name: 'Name' });
    const event = key({ key: '=', ctrlKey: true }, input);
    expect(event.defaultPrevented).toBe(false);
    expect(store.getState().mode).toBe('fit');
  });
});
