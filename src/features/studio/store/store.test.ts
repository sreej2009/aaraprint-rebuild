import { describe, expect, it } from 'vitest';
import { updateElement } from '../commands';
import { createShapeElement, createTextElement, createImageElement } from '../schema/create';
import type { DesignDocument, TextElement } from '../schema/types';
import { deepFreeze, sampleDesign, sequentialIds, uploadAsset } from '../testing/fixtures';
import { createStudioStore, type StudioStore } from './create-store';
import { COALESCE_WINDOW_MS, HISTORY_LIMIT } from './history';
import {
  selectActiveSurface,
  selectCanRedo,
  selectCanUndo,
  selectElement,
  selectRedoLabel,
  selectSelectedElements,
  selectSurfaceCounts,
  selectUndoLabel,
} from './selectors';

/** A store over a deeply frozen sample design, with a controllable clock and predictable ids. */
function setup(document: DesignDocument = sampleDesign(), options: { historyLimit?: number } = {}) {
  let now = 1_000_000;
  const clock = { advance: (ms: number) => (now += ms) };
  const store = createStudioStore({ document: deepFreeze(document), clock: () => now, newId: sequentialIds(), ...options });
  const get = () => store.getState();
  const actions = get().actions;
  return { store, get, actions, clock };
}

const ids = (store: StudioStore, surface = 'front') => store.getState().document.surfaces.find((s) => s.id === surface)?.elements.map((e) => e.id);
const element = (store: StudioStore, id: string) => selectElement(id)(store.getState());
const box = { x: 100, y: 100, width: 200, height: 80 };

describe('initial state', () => {
  it('opens on the first surface with nothing selected and empty history', () => {
    const { get } = setup();
    expect(get().editor).toEqual({ activeSurfaceId: 'front', selectedIds: [], hoveredId: null, editingTextId: null });
    expect(get().history).toEqual({ past: [], future: [] });
    expect(selectCanUndo(get())).toBe(false);
    expect(selectCanRedo(get())).toBe(false);
    expect(get().changeCount).toBe(0);
  });

  it('can open on a given surface, ignoring unknown ones', () => {
    expect(createStudioStore({ document: sampleDesign(), surfaceId: 'back' }).getState().editor.activeSurfaceId).toBe('back');
    expect(createStudioStore({ document: sampleDesign(), surfaceId: 'flap' }).getState().editor.activeSurfaceId).toBe('front');
  });

  it('undo and redo with empty history change nothing', () => {
    const { get, actions } = setup();
    const before = get();
    expect(actions.undo()).toBe(false);
    expect(actions.redo()).toBe(false);
    expect(get()).toBe(before);
  });
});

describe('undo/redo for each command', () => {
  /** Run `act`, then check undo returns the exact previous document and redo the exact next one. */
  function roundTrip(act: (s: ReturnType<typeof setup>) => boolean, prepare?: (s: ReturnType<typeof setup>) => void) {
    const s = setup();
    prepare?.(s);
    const before = s.get().document;
    expect(act(s)).toBe(true);
    const after = s.get().document;
    expect(after).not.toBe(before);
    expect(s.actions.undo()).toBe(true);
    expect(s.get().document).toBe(before);
    expect(s.actions.redo()).toBe(true);
    expect(s.get().document).toBe(after);
    return s;
  }

  it('add', () => {
    const s = roundTrip(({ actions }) => actions.addElement(createTextElement(box, { id: 'el_new' })));
    expect(ids(s.store)).toContain('el_new');
    expect(s.get().editor.selectedIds).toEqual(['el_new']);
  });

  it('add image (asset and element in one step)', () => {
    const s = roundTrip(({ actions }) => actions.addImage(uploadAsset('asset_photo'), createImageElement({ kind: 'asset', assetId: 'asset_photo' }, box, { id: 'el_photo' })));
    s.actions.undo();
    expect(s.get().document.assets.asset_photo).toBeUndefined();
    expect(ids(s.store)).not.toContain('el_photo');
  });

  it('edit', () => {
    const s = roundTrip(({ actions }) => actions.updateElement<TextElement>('el_name', { text: 'Arjun Mehta', fontSize: 90 }));
    expect(element(s.store, 'el_name')).toMatchObject({ text: 'Arjun Mehta', fontSize: 90 });
  });

  it('delete', () => {
    const s = roundTrip(({ actions }) => actions.removeElements(['el_name']));
    expect(ids(s.store)).toEqual(['el_band', 'el_logo']);
  });

  it('duplicate', () => {
    const s = roundTrip(({ actions }) => actions.duplicateElements(['el_name'], 35));
    expect(ids(s.store)).toEqual(['el_band', 'el_name', 'el_1', 'el_logo']);
    expect(s.get().editor.selectedIds).toEqual(['el_1']);
  });

  it('layer order', () => {
    const s = roundTrip(({ actions }) => actions.arrangeElement('el_band', 'front'));
    expect(ids(s.store)).toEqual(['el_name', 'el_logo', 'el_band']);
    roundTrip(({ actions }) => actions.moveElementTo('el_logo', 0));
  });

  it('move, lock, hide, rename, background, copy and clear', () => {
    expect.hasAssertions(); // checks run inside roundTrip()
    roundTrip(({ actions }) => actions.moveElements(['el_name', 'el_logo'], 10, -5));
    roundTrip(({ actions }) => actions.setLocked(['el_name'], true));
    roundTrip(({ actions }) => actions.setHidden(['el_logo'], true));
    roundTrip(({ actions }) => actions.renameElement('el_band', 'Brand band'));
    roundTrip(({ actions }) => actions.setBackground('#ffffff'));
    roundTrip(({ actions }) => actions.copySurface('front', 'back', 'replace'));
    roundTrip(({ actions }) => actions.clearSurface());
    roundTrip(({ actions }) => actions.renameDesign('Riya’s card'));
  });

  it('a long mixed sequence undoes back to the very first document and redoes to the last', () => {
    const { get, actions } = setup();
    const first = get().document;
    actions.addElement(createShapeElement('star', box, { id: 'el_star' }));
    actions.updateElement('el_star', { x: 400 });
    actions.duplicateElements(['el_star'], 35);
    actions.arrangeElement('el_star', 'back');
    actions.removeElements(['el_logo']);
    actions.setActiveSurface('back');
    actions.addElement(createTextElement(box, { id: 'el_thanks', text: 'Thank you' }));
    const last = get().document;
    expect(get().history.past).toHaveLength(6);
    while (actions.undo());
    expect(get().document).toBe(first);
    while (actions.redo());
    expect(get().document).toBe(last);
  });

  it('a new edit after undo discards the redo steps', () => {
    const { get, actions } = setup();
    actions.updateElement('el_name', { x: 70 });
    actions.updateElement('el_name', { x: 80 });
    actions.undo();
    expect(selectCanRedo(get())).toBe(true);
    actions.updateElement('el_name', { y: 90 });
    expect(selectCanRedo(get())).toBe(false);
    expect(selectElement('el_name')(get())).toMatchObject({ x: 70, y: 90 });
  });

  it('labels steps for tooltips', () => {
    const { get, actions } = setup();
    actions.moveElements(['el_name'], 5, 0);
    expect(selectUndoLabel(get())).toBe('Move “Riya Sharma”');
    actions.undo();
    expect(selectRedoLabel(get())).toBe('Move “Riya Sharma”');
    expect(selectUndoLabel(get())).toBeNull();
  });

  it('leaves the state untouched when a command throws', () => {
    const { get, actions } = setup();
    const before = get();
    const broken = (): never => {
      throw new Error('boom');
    };
    expect(() => actions.execute('Broken', broken)).toThrow('boom');
    expect(get()).toBe(before);
  });
});

describe('history limits and repeated edits', () => {
  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    const { get, actions } = setup();
    for (let i = 1; i <= 150; i += 1) actions.updateElement('el_name', { x: 100 + i });
    expect(get().history.past).toHaveLength(HISTORY_LIMIT);
    let undos = 0;
    while (actions.undo()) undos += 1;
    expect(undos).toBe(HISTORY_LIMIT);
    expect(selectElement('el_name')(get())?.x).toBe(150); // state after edit 50
  });

  it('honours a custom limit', () => {
    const { get, actions } = setup(undefined, { historyLimit: 3 });
    for (let i = 1; i <= 5; i += 1) actions.updateElement('el_name', { x: 100 + i });
    expect(get().history.past).toHaveLength(3);
  });

  it('treats no-op commands as nothing happened', () => {
    const { get, actions } = setup();
    const before = get();
    expect(actions.updateElement('el_name', { x: 60 })).toBe(false); // already 60
    expect(actions.moveElements(['el_name'], 0, 0)).toBe(false);
    expect(actions.arrangeElement('el_logo', 'forward')).toBe(false); // already on top
    expect(actions.setBackground('#f4f1ea')).toBe(false);
    expect(actions.removeElements([])).toBe(false);
    expect(actions.removeElements(['not-there'])).toBe(false);
    expect(actions.renameDesign(before.document.name)).toBe(false);
    expect(get().document).toBe(before.document);
    expect(get().history).toBe(before.history);
    expect(get().changeCount).toBe(0);
  });

  it('merges rapid edits with the same key into one step, and splits after a pause', () => {
    const { get, actions, clock } = setup();
    for (const text of ['A', 'Ar', 'Arj', 'Arju', 'Arjun']) {
      actions.updateElement<TextElement>('el_name', { text }, { coalesceKey: 'text:el_name' });
      clock.advance(200);
    }
    expect(get().history.past).toHaveLength(1);
    clock.advance(COALESCE_WINDOW_MS + 1);
    actions.updateElement<TextElement>('el_name', { text: 'Arjun M' }, { coalesceKey: 'text:el_name' });
    expect(get().history.past).toHaveLength(2);
    actions.undo();
    actions.undo();
    expect(selectElement('el_name')(get())).toMatchObject({ text: 'Riya Sharma' });
  });

  it('starts a new step after the selection changes', () => {
    const { get, actions } = setup();
    actions.nudgeSelection(1, 0); // nothing selected: no-op
    actions.select(['el_name']);
    actions.nudgeSelection(5, 0);
    actions.nudgeSelection(5, 0);
    expect(get().history.past).toHaveLength(1);
    actions.select(['el_logo']);
    actions.nudgeSelection(5, 0);
    expect(get().history.past).toHaveLength(2);
  });

  it('drops a merged step whose edits cancel out', () => {
    const { get, actions } = setup();
    actions.setBackground('#000000', { coalesceKey: 'background' });
    actions.setBackground('#f4f1ea', { coalesceKey: 'background' });
    expect(get().history.past).toHaveLength(0);
    expect(get().changeCount).toBe(2);
  });
});

describe('memory efficiency', () => {
  it('100 history steps share every unchanged object', () => {
    const { get, actions } = setup();
    for (let i = 1; i <= HISTORY_LIMIT; i += 1) actions.updateElement('el_name', { x: 100 + i });
    const docs = get().history.past.flatMap((e) => [e.before.document, e.after.document]);
    const backs = new Set(docs.map((d) => d.surfaces[1]));
    const logos = new Set(docs.map((d) => d.surfaces[0]?.elements[2]));
    const names = new Set(docs.map((d) => d.surfaces[0]?.elements[1]));
    expect(backs.size).toBe(1);
    expect(logos.size).toBe(1);
    expect(names.size).toBe(HISTORY_LIMIT + 1); // only the edited element is new each step
    // Consecutive entries share their boundary document.
    const past = get().history.past;
    expect(past.slice(1).every((e, i) => e.before.document === past[i]?.after.document)).toBe(true);
  });

  it('never mutates a previous document (all input is deeply frozen)', () => {
    const original = sampleDesign();
    const snapshot = JSON.stringify(original);
    const { actions, get } = setup(original);
    actions.select(['el_name', 'el_logo']);
    actions.moveElements(['el_name', 'el_logo'], 10, 10);
    actions.duplicateSelection(35);
    actions.setHidden(['el_band'], true);
    actions.setLocked(['el_logo'], true);
    actions.arrangeElement('el_name', 'back');
    actions.copySurface('front', 'back', 'append');
    actions.clearSurface('front');
    actions.undo();
    actions.redo();
    for (const entry of get().history.past) deepFreeze(entry.after.document);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('selection and active surface', () => {
  it('selects, adds, toggles and clears; ignores ids on other surfaces', () => {
    const { get, actions } = setup();
    actions.select(['el_name']);
    actions.select(['el_logo'], 'add');
    expect(get().editor.selectedIds).toEqual(['el_name', 'el_logo']);
    actions.select(['el_name'], 'toggle');
    expect(get().editor.selectedIds).toEqual(['el_logo']);
    actions.select(['el_back_only', 'el_band']);
    expect(get().editor.selectedIds).toEqual(['el_band']);
    expect(selectSelectedElements(get()).map((e) => e.id)).toEqual(['el_band']);
    actions.clearSelection();
    expect(get().editor.selectedIds).toEqual([]);
  });

  it('selects all visible, unlocked elements', () => {
    const doc = updateElement(updateElement(sampleDesign(), 'front', 'el_band', { locked: true }), 'front', 'el_logo', { hidden: true });
    const { get, actions } = setup(doc);
    actions.selectAll();
    expect(get().editor.selectedIds).toEqual(['el_name']);
  });

  it('selection changes never touch the document or the history', () => {
    const { get, actions } = setup();
    const { document, history } = get();
    actions.select(['el_name', 'el_logo']);
    actions.setHovered('el_band');
    actions.setEditingText('el_name');
    actions.clearSelection();
    expect(get().document).toBe(document);
    expect(get().history).toBe(history);
    expect(get().changeCount).toBe(0);
    expect(JSON.stringify(get().document)).not.toMatch(/selected|hovered|editing|activeSurface/);
  });

  it('switching surface clears the selection; unknown surfaces are ignored', () => {
    const { get, actions } = setup();
    actions.select(['el_name']);
    actions.setActiveSurface('back');
    expect(get().editor).toMatchObject({ activeSurfaceId: 'back', selectedIds: [] });
    expect(selectActiveSurface(get())?.id).toBe('back');
    actions.setActiveSurface('inside');
    expect(get().editor.activeSurfaceId).toBe('back');
  });

  it('deleting removes elements from the selection, hover and text editing', () => {
    const { get, actions } = setup();
    actions.setEditingText('el_name');
    actions.setHovered('el_name');
    actions.select(['el_name', 'el_logo']);
    actions.removeSelection();
    expect(get().editor).toMatchObject({ selectedIds: [], hoveredId: null, editingTextId: null });
  });

  it('undo and redo restore the surface and selection of that step', () => {
    const { get, actions } = setup();
    actions.select(['el_name']);
    actions.setActiveSurface('back');
    actions.addElement(createTextElement(box, { id: 'el_thanks' }));
    actions.setActiveSurface('front');
    actions.select(['el_logo']);
    actions.undo();
    expect(get().editor).toMatchObject({ activeSurfaceId: 'back', selectedIds: [] });
    actions.redo();
    expect(get().editor).toMatchObject({ activeSurfaceId: 'back', selectedIds: ['el_thanks'] });
    actions.setActiveSurface('front');
    actions.select(['el_name']);
    actions.removeSelection();
    actions.undo();
    expect(get().editor).toMatchObject({ activeSurfaceId: 'front', selectedIds: ['el_name'] });
  });

  it('copying to another surface switches to it', () => {
    const { get, actions } = setup();
    actions.copySurface('front', 'back', 'replace');
    expect(get().editor.activeSurfaceId).toBe('back');
    expect(selectSurfaceCounts(get())).toEqual({ front: 3, back: 3 });
    actions.undo();
    expect(get().editor.activeSurfaceId).toBe('front');
  });

  it('text editing only applies to visible, unlocked text', () => {
    const { get, actions } = setup();
    actions.setEditingText('el_band');
    expect(get().editor.editingTextId).toBeNull();
    actions.setEditingText('el_name');
    expect(get().editor).toMatchObject({ editingTextId: 'el_name', selectedIds: ['el_name'] });
    actions.select(['el_logo']);
    expect(get().editor.editingTextId).toBeNull();
    actions.setLocked(['el_name'], true);
    actions.setEditingText('el_name');
    expect(get().editor.editingTextId).toBeNull();
  });
});

describe('locking and visibility', () => {
  function lockedName() {
    const s = setup();
    s.actions.setLocked(['el_name'], true);
    return s;
  }

  it('locked elements refuse moves, edits, reordering and deletion', () => {
    const { get, actions } = lockedName();
    const doc = get().document;
    expect(actions.updateElement('el_name', { x: 10 })).toBe(false);
    expect(actions.moveElements(['el_name'], 10, 0)).toBe(false);
    expect(actions.arrangeElement('el_name', 'front')).toBe(false);
    expect(actions.moveElementTo('el_name', 0)).toBe(false);
    expect(actions.removeElements(['el_name'])).toBe(false);
    expect(get().document).toBe(doc);
  });

  it('multi-element actions skip locked members', () => {
    const { get, actions } = lockedName();
    actions.select(['el_name', 'el_logo']);
    expect(actions.nudgeSelection(10, 0)).toBe(true);
    expect(selectElement('el_name')(get())?.x).toBe(60);
    expect(selectElement('el_logo')(get())?.x).toBe(810);
    actions.removeSelection();
    expect(get().document.surfaces[0]?.elements.map((e) => e.id)).toEqual(['el_band', 'el_name']);
  });

  it('locked elements can still be selected from layers, renamed, hidden, duplicated and unlocked', () => {
    const { get, actions } = lockedName();
    actions.select(['el_name']);
    expect(get().editor.selectedIds).toEqual(['el_name']);
    expect(actions.renameElement('el_name', '  Name  ')).toBe(true);
    expect(selectElement('el_name')(get())?.name).toBe('Name');
    expect(actions.setHidden(['el_name'], true)).toBe(true);
    expect(actions.setHidden(['el_name'], false)).toBe(true);
    expect(actions.duplicateElements(['el_name'], 35)).toBe(true);
    expect(selectSelectedElements(get())[0]).toMatchObject({ locked: false, text: 'Riya Sharma' });
    expect(actions.setLocked(['el_name'], false)).toBe(true);
    expect(actions.moveElements(['el_name'], 10, 0)).toBe(true);
    expect(selectUndoLabel(get())).toBe('Move “Name”');
  });

  it('hiding deselects; undo brings back the element and the selection', () => {
    const { get, actions } = setup();
    actions.select(['el_name', 'el_logo']);
    actions.setHidden(['el_logo'], true);
    expect(get().editor.selectedIds).toEqual(['el_name']);
    expect(selectElement('el_logo')(get())?.hidden).toBe(true);
    actions.undo();
    expect(selectElement('el_logo')(get())?.hidden).toBe(false);
    expect(get().editor.selectedIds).toEqual(['el_name', 'el_logo']);
  });

  it('clearing a name falls back to the automatic name', () => {
    const { get, actions } = setup();
    actions.renameElement('el_band', 'Band');
    actions.renameElement('el_band', '   ');
    expect(selectElement('el_band')(get())?.name).toBeNull();
  });
});

describe('document-level changes', () => {
  it('variant changes apply to every history step and are not undone', () => {
    const { get, actions } = setup();
    actions.updateElement('el_name', { x: 70 });
    actions.setVariant('variant_2');
    expect(get().document.product.variantId).toBe('variant_2');
    expect(selectCanUndo(get())).toBe(true);
    actions.undo();
    expect(get().document.product.variantId).toBe('variant_2');
    expect(selectElement('el_name')(get())?.x).toBe(60);
    const count = get().changeCount;
    actions.setVariant('variant_2');
    expect(get().changeCount).toBe(count);
  });

  it('replacing the document (restored draft) clears history and selection', () => {
    const { get, actions } = setup();
    actions.select(['el_name']);
    actions.updateElement('el_name', { x: 70 });
    const other = sampleDesign();
    actions.replaceDocument(other, 'back');
    expect(get().document).toBe(other);
    expect(get().history).toEqual({ past: [], future: [] });
    expect(get().editor).toEqual({ activeSurfaceId: 'back', selectedIds: [], hoveredId: null, editingTextId: null });
  });

  it('counts document changes for autosave: edits, undo, redo and loads', () => {
    const { get, actions } = setup();
    actions.updateElement('el_name', { x: 70 });
    actions.undo();
    actions.redo();
    actions.replaceDocument(sampleDesign());
    expect(get().changeCount).toBe(4);
    actions.clearHistory();
    expect(get().history.past).toEqual([]);
    expect(get().changeCount).toBe(4);
  });
});
