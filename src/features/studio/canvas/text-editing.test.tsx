import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { demoDesign } from '../demo/demo-design';
import { printBoxes } from '../geometry/boxes';
import { useStudioShortcuts } from '../keyboard/use-studio-shortcuts';
import type { TextElement } from '../schema/types';
import { TextEditSheet } from '../shell/text-edit-sheet';
import { createStudioStore, selectActiveSurface, StudioProvider, type StudioStore } from '../store';
import { fakeMeasure } from '../testing/text-measure';
import { createElementPointer } from './element-pointer';
import { createInteractionStore, InteractionStoreContext, type InteractionStore } from './interaction-store';
import { SelectionOverlay } from './selection-overlay';
import { SelectionToolbar } from './selection-toolbar';
import { TextEditOverlay } from './text-edit-overlay';
import { CanvasAnnouncer } from './canvas-announcer';
import { useCanvasGestures } from './use-canvas-gestures';
import { ViewportStoreContext } from './viewport-context';
import { createViewportStore, type ViewportStore } from './viewport-store';

/**
 * Editing text on the canvas (M8) in jsdom: the real stores, gesture hook, element pointer rules,
 * shortcuts and the in-place editor; and the phone sheet editor.
 */

let studio: StudioStore;
let viewport: ViewportStore;
let interaction: InteractionStore;

function Harness({ sheet = false }: { sheet?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const delegate = useMemo(() => createElementPointer({ studio, viewport, interaction }), []);
  useCanvasGestures(ref, viewport, delegate);
  useStudioShortcuts(studio, interaction);
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- stands in for the focusable canvas region
    <section aria-label="Design canvas" tabIndex={0} data-studio-keys="" data-studio-canvas="" data-testid="region">
      <div ref={ref} data-testid="canvas-area">
        <SelectionOverlay />
        <SelectionToolbar />
        {sheet ? <TextEditSheet /> : <TextEditOverlay />}
        <CanvasAnnouncer />
      </div>
      <button type="button">Elsewhere</button>
    </section>
  );
}

function setup(options: { sheet?: boolean } = {}) {
  studio = createStudioStore({ document: demoDesign(), measureText: fakeMeasure });
  viewport = createViewportStore({ showGuides: true });
  interaction = createInteractionStore();
  viewport.getState().actions.setArea({ width: 1000, height: 700 });
  viewport.getState().actions.setContent(printBoxes(demoDesign().surfaces[0]!.print).bleed, 300);
  const view = render(
    <TooltipProvider>
      <StudioProvider store={studio}>
        <ViewportStoreContext.Provider value={viewport}>
          <InteractionStoreContext.Provider value={interaction}>
            <Harness sheet={options.sheet ?? false} />
          </InteractionStoreContext.Provider>
        </ViewportStoreContext.Provider>
      </StudioProvider>
    </TooltipProvider>,
  );
  const area = view.getByTestId('canvas-area');
  area.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700, toJSON: () => ({}) });
  return { area, user: userEvent.setup() };
}

const el = (id = 'el_name') => selectActiveSurface(studio.getState())!.elements.find((e) => e.id === id) as TextElement | undefined;
const editing = () => studio.getState().editor.editingTextId;
const overlay = () => screen.queryByTestId('text-edit-overlay') as HTMLTextAreaElement | null;

function screenPoint(x: number, y: number) {
  const v = viewport.getState().viewport;
  return { clientX: x * v.scale + v.x, clientY: y * v.scale + v.y };
}

let clock = 10_000;
function pointer(target: Element, type: string, init: Partial<PointerEventInit>) {
  act(() => {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: 'mouse', pointerId: 1, ...init });
    Object.defineProperty(event, 'timeStamp', { value: clock });
    target.dispatchEvent(event);
  });
}

/** A click (press + release without moving) at a design point, `after` ms after the last one. */
function click(area: Element, x: number, y: number, { after = 100, pointerType = 'mouse' } = {}) {
  clock += after;
  const at = screenPoint(x, y);
  pointer(area, 'pointerdown', { ...at, pointerType });
  pointer(area, 'pointerup', { ...at, pointerType });
}

beforeEach(() => {
  clock = 10_000;
});

afterEach(() => {
  act(() => studio?.getState().actions.setEditingText(null));
});

describe('entering text editing', () => {
  it('double-click edits text; a single click only selects', () => {
    const { area } = setup();
    click(area, 100, 110); // el_name at x 70–690, y 70–160
    expect(studio.getState().editor.selectedIds).toEqual(['el_name']);
    expect(editing()).toBeNull();
    click(area, 102, 111, { after: 200 });
    expect(editing()).toBe('el_name');
    expect(overlay()).toHaveValue('Riya Sharma');
    expect(overlay()).toHaveFocus();
  });

  it('needs the two clicks close together, and never edits shapes', () => {
    const { area } = setup();
    click(area, 100, 110);
    click(area, 100, 110, { after: 900 });
    expect(editing()).toBeNull();
    click(area, 900, 320); // the star
    click(area, 900, 320);
    expect(editing()).toBeNull();
  });

  it('pressing again to drag right after selecting still drags', () => {
    const { area } = setup();
    click(area, 100, 110);
    clock += 100;
    const from = screenPoint(100, 110);
    pointer(area, 'pointerdown', from);
    pointer(area, 'pointermove', { clientX: from.clientX + 40, clientY: from.clientY });
    pointer(area, 'pointerup', { clientX: from.clientX + 40, clientY: from.clientY });
    expect(editing()).toBeNull();
    expect(el()!.x).toBeGreaterThan(70);
  });

  it('double-tap edits on touch: the first tap selects, the second taps the selected text', () => {
    const { area } = setup();
    click(area, 100, 110, { pointerType: 'touch' });
    expect(studio.getState().editor.selectedIds).toEqual(['el_name']);
    click(area, 104, 112, { pointerType: 'touch', after: 250 });
    expect(editing()).toBe('el_name');
  });

  it('Enter on the canvas edits the selected text; the toolbar has Edit text', async () => {
    const { user } = setup();
    act(() => studio.getState().actions.select(['el_name']));
    screen.getByTestId('region').focus();
    await user.keyboard('{Enter}');
    expect(editing()).toBe('el_name');
    act(() => studio.getState().actions.setEditingText(null));
    await user.click(screen.getByRole('button', { name: 'Edit text' }));
    expect(editing()).toBe('el_name');
    expect(screen.queryByTestId('selection-toolbar')).not.toBeInTheDocument(); // out of the way while typing
  });

  it('locked text is not edited; Enter says why', async () => {
    const { user } = setup();
    act(() => studio.getState().actions.select(['el_badge']));
    screen.getByTestId('region').focus();
    await user.keyboard('{Enter}');
    expect(editing()).toBeNull();
    expect(interaction.getState().notice?.text).toMatch(/locked/);
  });
});

describe('the in-place editor', () => {
  it('matches the text: font, size at the zoom, spacing, alignment, colour and rotation', () => {
    setup();
    act(() => {
      studio.getState().actions.updateElement<TextElement>('el_name', { rotation: 15, align: 'center', letterSpacing: 0.1, italic: true });
      studio.getState().actions.setEditingText('el_name');
    });
    const scale = viewport.getState().viewport.scale;
    const style = overlay()!.style;
    expect(style.fontFamily).toContain('Inter Variable');
    expect(parseFloat(style.fontSize)).toBeCloseTo(75 * scale, 3);
    expect(parseFloat(style.letterSpacing)).toBeCloseTo(7.5 * scale, 3);
    expect(style.fontWeight).toBe('700');
    expect(style.fontStyle).toBe('italic');
    expect(style.textAlign).toBe('center');
    expect(style.transform).toBe('rotate(15deg)');
    expect(parseFloat(style.width)).toBeCloseTo(620 * scale, 3);
    expect(screen.queryByTestId('selection-handles')).not.toBeInTheDocument();
  });

  it('typing updates the design live; arrows, Delete and Backspace edit the text, not the layer', async () => {
    const { user } = setup();
    act(() => studio.getState().actions.setEditingText('el_name'));
    const x = el()!.x;
    await user.keyboard('{End} Kapoor{ArrowLeft}{ArrowLeft}{Backspace}{Delete}{Home}');
    expect(el()!.text).toBe('Riya Sharma Kapr');
    expect(el()!.x).toBe(x);
    expect(studio.getState().history.past).toHaveLength(1);
  });

  it('Enter adds a line and the height follows; Ctrl Enter keeps the text and returns to the canvas', async () => {
    const { user } = setup();
    act(() => studio.getState().actions.setEditingText('el_name'));
    const height = el()!.height;
    await user.keyboard('{End}{Enter}Designer');
    expect(el()!.text).toBe('Riya Sharma\nDesigner');
    expect(el()!.height).toBeGreaterThan(height);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(editing()).toBeNull();
    expect(screen.getByTestId('region')).toHaveFocus();
    expect(studio.getState().history.past.map((e) => e.label)).toEqual(['Edit text “Riya Sharma”']);
    act(() => studio.getState().actions.undo());
    expect(el()!.text).toBe('Riya Sharma');
  });

  it('Escape restores the text, leaves no undo step and says so', async () => {
    const { user } = setup();
    act(() => studio.getState().actions.setEditingText('el_name'));
    await user.keyboard('{Control>}a{/Control}Someone else');
    expect(el()!.text).toBe('Someone else');
    await user.keyboard('{Escape}');
    expect(el()!.text).toBe('Riya Sharma');
    expect(editing()).toBeNull();
    expect(studio.getState().history.past).toHaveLength(0);
    expect(studio.getState().editor.selectedIds).toEqual(['el_name']); // Escape doesn't also deselect
    expect(interaction.getState().notice?.text).toBe('Text edit cancelled.');
  });

  it('clicking elsewhere keeps the text; clearing it removes the text box', async () => {
    const { user } = setup();
    act(() => studio.getState().actions.setEditingText('el_title'));
    await user.keyboard('{Control>}a{/Control}Illustrator');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(el('el_title')!.text).toBe('Illustrator');
    expect(editing()).toBeNull();
    expect(interaction.getState().notice?.text).toBe('Text changed to “Illustrator”.');

    act(() => studio.getState().actions.setEditingText('el_title'));
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(el('el_title')).toBeUndefined();
    expect(interaction.getState().notice?.text).toMatch(/Deleted the empty text box/);
    act(() => studio.getState().actions.undo());
    expect(el('el_title')!.text).toBe('Illustrator');
  });

  it('selects sample text so typing replaces it', () => {
    setup();
    act(() => {
      studio.getState().actions.updateElement<TextElement>('el_name', { placeholder: true });
      studio.getState().actions.setEditingText('el_name');
    });
    expect([overlay()!.selectionStart, overlay()!.selectionEnd]).toEqual([0, 'Riya Sharma'.length]);
  });
});

describe('the phone sheet editor', () => {
  it('edits in a labelled field; Done keeps the text in one undo step, Cancel restores it', async () => {
    const { user } = setup({ sheet: true });
    act(() => studio.getState().actions.setEditingText('el_name'));
    const field = await screen.findByRole('textbox', { name: 'Text content' });
    expect(screen.getByRole('dialog', { name: 'Edit text' })).toBeInTheDocument();
    expect(field).toHaveFocus();
    await user.keyboard(' Kapoor');
    expect(el()!.text).toBe('Riya Sharma Kapoor'); // live on the canvas above
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(studio.getState().history.past).toHaveLength(1);

    act(() => studio.getState().actions.setEditingText('el_name'));
    await screen.findByRole('textbox', { name: 'Text content' });
    await user.keyboard(' Jr');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(el()!.text).toBe('Riya Sharma Kapoor');
    expect(studio.getState().history.past).toHaveLength(1);
  });

  it('Escape cancels too', async () => {
    const { user } = setup({ sheet: true });
    act(() => studio.getState().actions.setEditingText('el_name'));
    await screen.findByRole('textbox', { name: 'Text content' });
    await user.keyboard('xyz{Escape}');
    expect(el()!.text).toBe('Riya Sharma');
    expect(editing()).toBeNull();
  });
});
