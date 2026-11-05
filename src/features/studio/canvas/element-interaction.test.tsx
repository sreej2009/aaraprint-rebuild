import { act, render } from '@testing-library/react';
import { useMemo, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoDesign } from '../demo/demo-design';
import { printBoxes } from '../geometry/boxes';
import { mmToPx } from '../geometry/units';
import { useStudioShortcuts } from '../keyboard/use-studio-shortcuts';
import type { TextElement } from '../schema/types';
import { createStudioStore, selectActiveSurface, StudioProvider, type StudioStore } from '../store';
import { createElementPointer } from './element-pointer';
import { createInteractionStore, InteractionStoreContext, type InteractionStore } from './interaction-store';
import { SelectionOverlay } from './selection-overlay';
import { useCanvasGestures } from './use-canvas-gestures';
import { ViewportStoreContext } from './viewport-context';
import { createViewportStore, type ViewportStore } from './viewport-store';

/**
 * Canvas element interactions end to end in jsdom: the real stores, the M5 gesture hook with the
 * M6 element delegate, the selection overlay's handles and the editing shortcuts.
 */

let studio: StudioStore;
let viewport: ViewportStore;
let interaction: InteractionStore;
let now: number;

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const delegate = useMemo(() => createElementPointer({ studio, viewport, interaction }), []);
  useCanvasGestures(ref, viewport, delegate);
  useStudioShortcuts(studio, interaction);
  return (
    <div ref={ref} data-testid="canvas-area" data-studio-keys="">
      <SelectionOverlay />
      <input aria-label="Name" />
      <button type="button">Zoom in</button>
    </div>
  );
}

function setup() {
  now = 1_000;
  studio = createStudioStore({ document: demoDesign(), clock: () => now });
  viewport = createViewportStore({ showGuides: true });
  interaction = createInteractionStore();
  viewport.getState().actions.setArea({ width: 1000, height: 700 });
  viewport.getState().actions.setContent(printBoxes(demoDesign().surfaces[0]!.print).bleed, 300);
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
  // jsdom has no layout: the area sits at the page origin.
  area.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700, toJSON: () => ({}) });
  return { area, view };
}

/** Design px → screen px (the area is at the page origin). */
function screen(x: number, y: number) {
  const v = viewport.getState().viewport;
  return { clientX: x * v.scale + v.x, clientY: y * v.scale + v.y };
}

function pointer(target: Element, type: string, init: Partial<PointerEventInit> & { pointerId?: number }) {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: 'mouse', pointerId: 1, ...init }));
  });
}

/** Press at `from`, move in steps to `to`, release. Points in screen px. */
function drag(target: Element, from: { clientX: number; clientY: number }, to: { clientX: number; clientY: number }, init: Partial<PointerEventInit> = {}, steps = 4) {
  pointer(target, 'pointerdown', { ...from, ...init });
  for (let i = 1; i <= steps; i += 1) {
    pointer(target, 'pointermove', { clientX: from.clientX + ((to.clientX - from.clientX) * i) / steps, clientY: from.clientY + ((to.clientY - from.clientY) * i) / steps, ...init });
  }
  pointer(target, 'pointerup', { ...to, ...init });
}

function key(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

const el = (id: string) => selectActiveSurface(studio.getState())!.elements.find((e) => e.id === id)!;
const selected = () => studio.getState().editor.selectedIds;
const steps = () => studio.getState().history.past.length;
const scale = () => viewport.getState().viewport.scale;

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('selecting with the mouse', () => {
  it('clicking an element selects it without moving it; clicking empty canvas deselects', () => {
    const { area } = setup();
    pointer(area, 'pointerdown', screen(200, 110));
    pointer(area, 'pointerup', screen(200, 110));
    expect(selected()).toEqual(['el_name']);
    expect(steps()).toBe(0);
    pointer(area, 'pointerdown', screen(600, 300));
    pointer(area, 'pointerup', screen(600, 300));
    expect(selected()).toEqual([]);
  });

  it('never picks locked or hidden layers on the canvas', () => {
    const { area } = setup();
    const view = viewport.getState().viewport;
    drag(area, screen(120, 400), { ...screen(120, 400), clientX: screen(120, 400).clientX + 40 }); // el_badge is locked
    expect(selected()).toEqual([]);
    expect(el('el_badge').x).toBe(70);
    expect(viewport.getState().viewport.x).toBeCloseTo(view.x + 40, 6); // the drag panned instead
    pointer(area, 'pointerdown', screen(120, 320)); // el_hidden
    pointer(area, 'pointerup', screen(120, 320));
    expect(selected()).toEqual([]);
  });

  it('shows a hover outline over pickable elements', () => {
    const { area, view } = setup();
    pointer(area, 'pointermove', { ...screen(900, 150), buttons: 0 });
    expect(studio.getState().editor.hoveredId).toBe('el_logo');
    expect(view.getByTestId('hover-outline').dataset.elementId).toBe('el_logo');
    area.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    expect(studio.getState().editor.hoveredId).toBeNull();
  });
});

describe('moving', () => {
  it('drags an element by the pointer distance, as one undo step, keeping the view still', () => {
    const { area } = setup();
    const before = viewport.getState().viewport;
    const from = screen(200, 110);
    drag(area, from, { clientX: from.clientX + 60, clientY: from.clientY + 30 });
    expect(el('el_name').x).toBeCloseTo(70 + 60 / scale(), 1);
    expect(el('el_name').y).toBeCloseTo(70 + 30 / scale(), 1);
    expect(selected()).toEqual(['el_name']);
    expect(steps()).toBe(1);
    expect(studio.getState().history.past[0]!.label).toBe('Move “Riya Sharma”');
    expect(viewport.getState().viewport).toBe(before);

    studio.getState().actions.undo();
    expect(el('el_name')).toMatchObject({ x: 70, y: 70 });
    studio.getState().actions.redo();
    expect(el('el_name').x).toBeCloseTo(70 + 60 / scale(), 1);
  });

  it('stays one undo step even when the pointer rests longer than the 600 ms merge window', () => {
    const { area } = setup();
    const from = screen(200, 110);
    pointer(area, 'pointerdown', from);
    pointer(area, 'pointermove', { clientX: from.clientX + 20, clientY: from.clientY });
    now += 2_000;
    pointer(area, 'pointermove', { clientX: from.clientX + 40, clientY: from.clientY });
    pointer(area, 'pointerup', { clientX: from.clientX + 40, clientY: from.clientY });
    expect(steps()).toBe(1);
    // The gesture is sealed: the next drag is its own step.
    now += 100;
    drag(area, { clientX: from.clientX + 40, clientY: from.clientY }, { clientX: from.clientX + 80, clientY: from.clientY });
    expect(steps()).toBe(2);
  });

  it('Escape cancels a drag and leaves no undo step', () => {
    const { area } = setup();
    const from = screen(200, 110);
    pointer(area, 'pointerdown', from);
    pointer(area, 'pointermove', { clientX: from.clientX + 50, clientY: from.clientY + 50 });
    expect(el('el_name').x).not.toBe(70);
    key({ key: 'Escape' });
    expect(el('el_name')).toMatchObject({ x: 70, y: 70 });
    pointer(area, 'pointermove', { clientX: from.clientX + 90, clientY: from.clientY });
    pointer(area, 'pointerup', { clientX: from.clientX + 90, clientY: from.clientY });
    expect(el('el_name')).toMatchObject({ x: 70, y: 70 });
    expect(steps()).toBe(0);
  });

  it('empty canvas still pans, and buttons over the canvas are left alone', () => {
    const { area, view } = setup();
    const before = viewport.getState().viewport;
    drag(area, screen(600, 300), { ...screen(600, 300), clientX: screen(600, 300).clientX - 50 });
    expect(viewport.getState().viewport.x).toBeCloseTo(before.x - 50, 6);
    const button = view.getByRole('button', { name: 'Zoom in' });
    pointer(button, 'pointerdown', screen(200, 110));
    pointer(button, 'pointermove', screen(260, 140));
    expect(selected()).toEqual([]);
  });
});

describe('touch', () => {
  const touch = { pointerType: 'touch' as const };

  it('a tap selects; one finger on an unselected element pans instead of moving it', () => {
    const { area } = setup();
    pointer(area, 'pointerdown', { ...screen(200, 110), ...touch });
    pointer(area, 'pointerup', { ...screen(200, 110), ...touch });
    expect(selected()).toEqual(['el_name']);
    const before = viewport.getState().viewport;
    drag(area, screen(900, 150), { ...screen(900, 150), clientX: screen(900, 150).clientX + 40 }, touch); // the logo
    expect(el('el_logo').x).toBe(820);
    expect(viewport.getState().viewport.x).toBeCloseTo(before.x + 40, 6);
    expect(selected()).toEqual(['el_name']); // a pan isn't a tap
  });

  it('one finger drags the selected element; a second finger cancels the drag and pinches', () => {
    const { area } = setup();
    studio.getState().actions.select(['el_star']);
    const from = screen(905, 325);
    drag(area, from, { clientX: from.clientX + 30, clientY: from.clientY }, touch);
    expect(el('el_star').x).toBeCloseTo(860 + 30 / scale(), 1);
    expect(steps()).toBe(1);

    const start = screen(el('el_star').x + 45, 325);
    const beforeScale = scale();
    pointer(area, 'pointerdown', { ...start, ...touch, pointerId: 1 });
    pointer(area, 'pointermove', { clientX: start.clientX + 20, clientY: start.clientY, ...touch, pointerId: 1 });
    pointer(area, 'pointerdown', { clientX: start.clientX + 120, clientY: start.clientY, ...touch, pointerId: 2 });
    expect(el('el_star').x).toBeCloseTo(860 + 30 / beforeScale, 1); // back where this drag began
    pointer(area, 'pointermove', { clientX: start.clientX + 220, clientY: start.clientY, ...touch, pointerId: 2 });
    expect(scale()).toBeGreaterThan(beforeScale * 1.5);
    pointer(area, 'pointerup', { ...touch, pointerId: 2 });
    pointer(area, 'pointerup', { ...touch, pointerId: 1 });
    expect(steps()).toBe(1);
  });

  it('tapping empty canvas deselects', () => {
    const { area } = setup();
    studio.getState().actions.select(['el_name']);
    pointer(area, 'pointerdown', { ...screen(600, 300), ...touch });
    pointer(area, 'pointerup', { ...screen(600, 300), ...touch });
    expect(selected()).toEqual([]);
  });
});

describe('resize and rotate handles', () => {
  const handle = (view: ReturnType<typeof setup>['view'], name: string) => view.container.querySelector<HTMLElement>(`[data-handle="${name}"]`)!;

  it('shows the handles each type allows, and none on locked layers', () => {
    const { view } = setup();
    act(() => studio.getState().actions.select(['el_logo']));
    expect([...view.container.querySelectorAll('[data-handle]')].map((h) => h.getAttribute('data-handle'))).toEqual(['nw', 'ne', 'se', 'sw', 'rotate']);
    act(() => studio.getState().actions.select(['el_badge']));
    expect(view.container.querySelectorAll('[data-handle]')).toHaveLength(0);
    expect(view.getByTestId('locked-badge')).toBeInTheDocument();
  });

  it('an unlocked shape corner resizes freely; Shift keeps proportions', () => {
    const { view } = setup();
    act(() => {
      studio.getState().actions.updateElement('el_star', { rotation: 0 });
      studio.getState().actions.clearHistory();
      studio.getState().actions.select(['el_star']);
    });
    // Stars start with proportions locked (M9): corners only. Unlocked, all eight handles show.
    expect([...view.container.querySelectorAll('[data-handle]')].map((h) => h.getAttribute('data-handle'))).toEqual(['nw', 'ne', 'se', 'sw', 'rotate']);
    act(() => interaction.getState().actions.setRatioLock('el_star', false));
    expect(view.container.querySelectorAll('[data-handle]')).toHaveLength(9);
    const s = scale();
    const se = screen(950, 370);
    drag(handle(view, 'se'), se, { clientX: se.clientX + 60 * s, clientY: se.clientY + 20 * s });
    expect(el('el_star')).toMatchObject({ x: 860, y: 280 });
    expect(el('el_star').width).toBeCloseTo(150, 0);
    expect(el('el_star').height).toBeCloseTo(110, 0);
    expect(steps()).toBe(1);

    act(() => studio.getState().actions.undo());
    drag(handle(view, 'se'), se, { clientX: se.clientX + 60 * s, clientY: se.clientY + 20 * s }, { shiftKey: true });
    expect(el('el_star').width).toBeCloseTo(el('el_star').height, 1);
  });

  it('a text corner scales the font; a side handle only rewraps the width', () => {
    const { view } = setup();
    act(() => studio.getState().actions.select(['el_name']));
    const s = scale();
    const se = screen(690, 160);
    drag(handle(view, 'se'), se, { clientX: se.clientX + 310 * s, clientY: se.clientY + 45 * s });
    const scaled = el('el_name') as TextElement;
    expect(scaled.width).toBeCloseTo(930, 0);
    expect(scaled.fontSize).toBeCloseTo(75 * 1.5, 0);

    act(() => studio.getState().actions.undo());
    const e = screen(690, 115);
    drag(handle(view, 'e'), e, { clientX: e.clientX - 120 * s, clientY: e.clientY });
    const rewrapped = el('el_name') as TextElement;
    expect(rewrapped.width).toBeCloseTo(500, 0);
    expect(rewrapped).toMatchObject({ x: 70, fontSize: 75, height: 90 });
  });

  it('the rotation handle turns the element around its centre, snapping near 90°', () => {
    const { view } = setup();
    act(() => studio.getState().actions.select(['el_logo'])); // centre (900, 150)
    const rotate = handle(view, 'rotate');
    pointer(rotate, 'pointerdown', screen(900, 40));
    pointer(rotate, 'pointermove', screen(960, 60));
    pointer(rotate, 'pointermove', screen(1010, 147)); // ≈ 88°: snaps to 90
    pointer(rotate, 'pointerup', screen(1010, 147));
    expect(el('el_logo')).toMatchObject({ rotation: 90, x: 820, y: 70 });
    expect(steps()).toBe(1);
    expect(studio.getState().history.past[0]!.label).toBe('Rotate “logo.png”');
  });

  it('keeps handles out of the printable artwork: they are HTML, not canvas nodes', () => {
    const { view } = setup();
    act(() => studio.getState().actions.select(['el_star']));
    expect(view.getByTestId('selection-overlay')).toHaveAttribute('aria-hidden', 'true');
    expect(view.container.querySelector('canvas')).toBeNull();
  });
});

describe('keyboard', () => {
  it('arrow keys nudge 0.5 mm (Shift: 5 mm); a burst of presses is one undo step', () => {
    setup();
    studio.getState().actions.select(['el_star']);
    expect(key({ key: 'ArrowRight' }).defaultPrevented).toBe(true);
    key({ key: 'ArrowRight' });
    key({ key: 'ArrowDown', shiftKey: true });
    expect(el('el_star').x).toBeCloseTo(860 + 2 * mmToPx(0.5, 300), 1);
    expect(el('el_star').y).toBeCloseTo(280 + mmToPx(5, 300), 1);
    expect(steps()).toBe(1);
    now += 700;
    key({ key: 'ArrowLeft' });
    expect(steps()).toBe(2);
  });

  it('Delete and Backspace remove the selection; undo brings it back', () => {
    setup();
    studio.getState().actions.select(['el_star']);
    key({ key: 'Delete' });
    expect(selectActiveSurface(studio.getState())!.elements.some((e) => e.id === 'el_star')).toBe(false);
    studio.getState().actions.undo();
    expect(el('el_star')).toBeDefined();
    studio.getState().actions.select(['el_logo']);
    key({ key: 'Backspace' });
    expect(selectActiveSurface(studio.getState())!.elements.some((e) => e.id === 'el_logo')).toBe(false);
  });

  it('locked layers ignore nudges and Delete, and say why', () => {
    setup();
    studio.getState().actions.select(['el_badge']);
    key({ key: 'ArrowRight' });
    key({ key: 'Delete' });
    expect(el('el_badge')).toMatchObject({ x: 70, y: 380 });
    expect(steps()).toBe(0);
    expect(interaction.getState().notice?.text).toBe('“Since 2026” is locked. Unlock it to change it.');
  });

  it('Escape deselects; Ctrl D duplicates 3 mm away; Ctrl ] and Ctrl [ change the layer order', () => {
    setup();
    studio.getState().actions.select(['el_name']);
    key({ key: 'd', ctrlKey: true });
    const copy = selectActiveSurface(studio.getState())!.elements.at(studio.getState().document.surfaces[0]!.elements.findIndex((e) => e.id === 'el_name') + 1)!;
    expect(selected()).toEqual([copy.id]);
    expect(copy.x).toBeCloseTo(70 + mmToPx(3, 300), 6);
    key({ key: 'Escape' });
    expect(selected()).toEqual([]);

    studio.getState().actions.select(['el_band']);
    const order = () => selectActiveSurface(studio.getState())!.elements.map((e) => e.id);
    key({ key: ']', code: 'BracketRight', ctrlKey: true });
    expect(order().indexOf('el_band')).toBe(1);
    key({ key: '}', code: 'BracketRight', ctrlKey: true, shiftKey: true });
    expect(order().at(-1)).toBe('el_band');
    key({ key: '[', code: 'BracketLeft', metaKey: true });
    expect(order().at(-2)).toBe('el_band');
  });

  it('Ctrl Z / Ctrl Shift Z / Ctrl Y undo and redo', () => {
    setup();
    studio.getState().actions.select(['el_star']);
    key({ key: 'ArrowUp' });
    key({ key: 'z', ctrlKey: true });
    expect(el('el_star').y).toBe(280);
    key({ key: 'Z', ctrlKey: true, shiftKey: true });
    expect(el('el_star').y).toBeLessThan(280);
    key({ key: 'z', metaKey: true });
    key({ key: 'y', ctrlKey: true });
    expect(el('el_star').y).toBeLessThan(280);
  });

  it('is ignored while typing, and outside the canvas and layers list', () => {
    const { view } = setup();
    studio.getState().actions.select(['el_star']);
    const input = view.getByRole('textbox', { name: 'Name' });
    expect(key({ key: 'ArrowRight' }, input).defaultPrevented).toBe(false);
    expect(key({ key: 'Delete' }, input).defaultPrevented).toBe(false);
    expect(key({ key: 'z', ctrlKey: true }, input).defaultPrevented).toBe(false);
    expect(el('el_star').x).toBe(860);
    const outside = document.createElement('button');
    document.body.append(outside);
    expect(key({ key: 'ArrowRight' }, outside).defaultPrevented).toBe(false);
    outside.remove();
    expect(el('el_star').x).toBe(860);
  });
});

describe('front and back', () => {
  it('keep their own elements and selection; undo returns to the side it changes', () => {
    setup();
    studio.getState().actions.select(['el_name']);
    studio.getState().actions.setActiveSurface('back');
    expect(selected()).toEqual([]);
    studio.getState().actions.select(['el_ring']);
    key({ key: 'ArrowRight', shiftKey: true });
    expect(el('el_ring').x).toBeCloseTo(380 + mmToPx(5, 300), 1);
    studio.getState().actions.setActiveSurface('front');
    expect(el('el_name')).toMatchObject({ x: 70, y: 70 });
    expect(selected()).toEqual([]);
    studio.getState().actions.undo();
    expect(studio.getState().editor.activeSurfaceId).toBe('back');
    expect(el('el_ring').x).toBe(380);
  });
});
