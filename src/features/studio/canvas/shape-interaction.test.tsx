import { act, render } from '@testing-library/react';
import { useMemo, useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { demoDesign } from '../demo/demo-design';
import { printBoxes } from '../geometry/boxes';
import { mmToPx } from '../geometry/units';
import { useStudioShortcuts } from '../keyboard/use-studio-shortcuts';
import { createImageElement, createShapeElement } from '../schema/create';
import type { DesignDocument, ImageElement, ShapeElement } from '../schema/types';
import { createStudioStore, selectActiveSurface, StudioProvider, type StudioStore } from '../store';
import { createElementPointer } from './element-pointer';
import { createInteractionStore, InteractionStoreContext, type InteractionStore } from './interaction-store';
import { SelectionOverlay } from './selection-overlay';
import { useCanvasGestures } from './use-canvas-gestures';
import { ViewportStoreContext } from './viewport-context';
import { createViewportStore, type ViewportStore } from './viewport-store';

/**
 * Shapes and graphics on the canvas (M9) in jsdom: the M6 handles with the M9 rules — line ends
 * that move freely, circles that stay round, proportion locks the handles respect — and the
 * existing commands for duplicate, order, lock, hide and undo.
 */

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

/** The demo card, with a circle, a horizontal line and a graphic added on the front. */
function document(): DesignDocument {
  const doc = demoDesign();
  doc.surfaces[0]!.elements.push(
    createShapeElement('circle', { x: 400, y: 200, width: 100, height: 100 }, { id: 'el_circle', stroke: '#1b1f27', strokeWidth: 8 }),
    createShapeElement('line', { x: 300, y: 420, width: 300, height: 6 }, { id: 'el_line' }),
    createImageElement({ kind: 'graphic', graphicId: 'verified-seal' }, { x: 600, y: 330, width: 120, height: 120 }, { id: 'el_seal' }),
  );
  return doc;
}

function setup() {
  studio = createStudioStore({ document: document(), clock: () => 1_000 });
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
  area.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700, toJSON: () => ({}) });
  return { view, area };
}

const el = <T extends ShapeElement | ImageElement = ShapeElement>(id: string) => selectActiveSurface(studio.getState())!.elements.find((e) => e.id === id) as T;
const ids = () => selectActiveSurface(studio.getState())!.elements.map((e) => e.id);
const steps = () => studio.getState().history.past.length;
const scale = () => viewport.getState().viewport.scale;
function screen(x: number, y: number) {
  const v = viewport.getState().viewport;
  return { clientX: x * v.scale + v.x, clientY: y * v.scale + v.y };
}
function pointer(target: Element, type: string, init: Partial<PointerEventInit>) {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: 'mouse', pointerId: 1, ...init }));
  });
}
function drag(target: Element, from: { clientX: number; clientY: number }, to: { clientX: number; clientY: number }, init: Partial<PointerEventInit> = {}) {
  pointer(target, 'pointerdown', { ...from, ...init });
  for (let i = 1; i <= 4; i += 1) pointer(target, 'pointermove', { clientX: from.clientX + ((to.clientX - from.clientX) * i) / 4, clientY: from.clientY + ((to.clientY - from.clientY) * i) / 4, ...init });
  pointer(target, 'pointerup', { ...to, ...init });
}
const handle = (view: ReturnType<typeof render>, name: string) => view.container.querySelector(`[data-handle="${name}"]`)!;
const handleNames = (view: ReturnType<typeof render>) => [...view.container.querySelectorAll('[data-handle]')].map((h) => h.getAttribute('data-handle'));

describe('lines', () => {
  it('show their two end handles, however thin they are', () => {
    const { view } = setup();
    act(() => studio.getState().actions.select(['el_line']));
    expect(handleNames(view)).toEqual(['e', 'w', 'rotate']);
  });

  it('dragging an end moves only that end: length and angle change, the other end stays put', () => {
    const { view } = setup();
    act(() => studio.getState().actions.select(['el_line']));
    // Lift the right end (600, 423) up by 300 px: the left end (300, 423) is fixed.
    const from = screen(600, 423);
    drag(handle(view, 'e'), from, screen(600, 123));
    const line = el('el_line');
    expect(line.rotation).toBeCloseTo(315, 1); // 45° up snaps to 315°
    expect(line.width).toBeCloseTo(Math.hypot(300, 300), 0);
    expect(line.height).toBe(6); // thickness unchanged
    const a = (line.rotation * Math.PI) / 180;
    const left = { x: line.x + line.width / 2 - (Math.cos(a) * line.width) / 2, y: line.y + line.height / 2 - (Math.sin(a) * line.width) / 2 };
    expect(left.x).toBeCloseTo(300, 0);
    expect(left.y).toBeCloseTo(423, 0);
    expect(steps()).toBe(1);
    act(() => studio.getState().actions.undo());
    expect(el('el_line')).toMatchObject({ x: 300, y: 420, width: 300, rotation: 0 });
  });

  it('Shift snaps the angle to 15° steps', () => {
    const { view } = setup();
    act(() => studio.getState().actions.select(['el_line']));
    drag(handle(view, 'w'), screen(300, 423), screen(330, 340), { shiftKey: true });
    expect(el('el_line').rotation % 15).toBeCloseTo(0, 6);
  });
});

describe('circles and proportion locks', () => {
  it('circles only have corner handles and stay round', () => {
    const { view } = setup();
    act(() => studio.getState().actions.select(['el_circle']));
    expect(handleNames(view)).toEqual(['nw', 'ne', 'se', 'sw', 'rotate']);
    const s = scale();
    drag(handle(view, 'se'), screen(500, 300), { clientX: screen(500, 300).clientX + 80 * s, clientY: screen(500, 300).clientY + 10 * s });
    expect(el('el_circle').width).toBeCloseTo(el('el_circle').height, 6);
    expect(el('el_circle').width).toBeGreaterThan(100);
    // Shift can't make an ellipse of it either.
    drag(handle(view, 'se'), screen(500, 300), { clientX: screen(500, 300).clientX + 80 * s, clientY: screen(500, 300).clientY - 40 * s }, { shiftKey: true });
    expect(el('el_circle').width).toBeCloseTo(el('el_circle').height, 6);
  });

  it('graphics keep proportions; unlocking in the inspector frees the handles too', () => {
    const { view } = setup();
    act(() => studio.getState().actions.select(['el_seal']));
    expect(handleNames(view)).toEqual(['nw', 'ne', 'se', 'sw', 'rotate']);
    const s = scale();
    drag(handle(view, 'se'), screen(720, 450), { clientX: screen(720, 450).clientX + 60 * s, clientY: screen(720, 450).clientY });
    expect(el('el_seal').width).toBeCloseTo(el('el_seal').height, 6);
    act(() => interaction.getState().actions.setRatioLock('el_seal', false));
    expect(handleNames(view)).toHaveLength(9);
    const se = screen(el('el_seal').x + el('el_seal').width, el('el_seal').y + el('el_seal').height);
    drag(handle(view, 'se'), se, { clientX: se.clientX + 50 * s, clientY: se.clientY });
    expect(el('el_seal').width).toBeGreaterThan(el('el_seal').height + 40);
  });
});

describe('shape and graphic commands', () => {
  it('duplicate with a new id, offset, keeping every style and the graphic reference', () => {
    setup();
    act(() => {
      studio.getState().actions.updateElement<ShapeElement>('el_circle', { fill: '#b91c1c', opacity: 0.6, rotation: 20 });
      studio.getState().actions.duplicateElements(['el_circle'], mmToPx(3, 300));
    });
    // The copy is selected and sits directly above the original.
    const circleCopy = studio.getState().editor.selectedIds[0]!;
    expect(ids()[ids().indexOf('el_circle') + 1]).toBe(circleCopy);
    act(() => studio.getState().actions.duplicateElements(['el_seal'], mmToPx(3, 300)));
    const sealCopy = studio.getState().editor.selectedIds[0]!;
    expect(circleCopy).not.toBe('el_circle');
    expect(new Set(ids()).size).toBe(ids().length);
    expect(el(circleCopy)).toMatchObject({ shape: 'circle', fill: '#b91c1c', stroke: '#1b1f27', strokeWidth: 8, opacity: 0.6, rotation: 20, x: 400 + mmToPx(3, 300) });
    expect(el<ImageElement>(sealCopy)).toMatchObject({ type: 'image', source: { kind: 'graphic', graphicId: 'verified-seal' } });
    expect(JSON.stringify(studio.getState().document)).not.toMatch(/data:|base64/);
  });

  it('style changes, order, lock and hide are each one undo step; no-ops record nothing', () => {
    setup();
    const actions = () => studio.getState().actions;
    act(() => {
      actions().updateElement<ShapeElement>('el_circle', { fill: null });
      actions().updateElement<ShapeElement>('el_circle', { stroke: '#e8930c', strokeWidth: 12 });
      actions().updateElement<ShapeElement>('el_circle', { strokeWidth: 12 }); // unchanged
      actions().arrangeElement('el_circle', 'front');
    });
    expect(steps()).toBe(3);
    expect(ids().at(-1)).toBe('el_circle');
    act(() => actions().undo());
    act(() => actions().undo());
    expect(el('el_circle')).toMatchObject({ fill: null, stroke: '#1b1f27', strokeWidth: 8 });
    act(() => actions().undo());
    expect(el('el_circle').fill).toBe('#2f5bd3');

    act(() => actions().setLocked(['el_circle'], true));
    expect(actions().updateElement<ShapeElement>('el_circle', { fill: '#000000' })).toBe(false);
    expect(actions().removeElements(['el_circle'])).toBe(false);
    act(() => actions().setHidden(['el_seal'], true));
    expect(el('el_seal').hidden).toBe(true);
  });

  it('locked shapes show no handles and can’t be dragged on the canvas', () => {
    const { view, area } = setup();
    act(() => {
      studio.getState().actions.setLocked(['el_circle'], true);
      studio.getState().actions.select(['el_circle']);
    });
    expect(handleNames(view)).toEqual([]);
    drag(area, screen(450, 250), screen(520, 250));
    expect(el('el_circle').x).toBe(400);
  });
});
