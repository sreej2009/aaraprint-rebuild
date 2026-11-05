import { describe, expect, it } from 'vitest';
import { demoDesign } from '../demo/demo-design';
import { createStudioStore, type StudioState } from '../store';
import { announcementFor, describePosition, pastTense } from './announcements';

const nbsp = (text: string | null) => text?.replaceAll(String.fromCharCode(0xa0), ' ') ?? null;

function track() {
  let now = 0;
  const store = createStudioStore({ document: demoDesign(), clock: () => (now += 1000) });
  let prev: StudioState = store.getState();
  const said: (string | null)[] = [];
  store.subscribe((next) => {
    said.push(nbsp(announcementFor(prev, next)));
    prev = next;
  });
  return { store, said, last: () => said.at(-1) ?? null };
}

describe('canvas announcements', () => {
  it('names the selection and says where it is, from the trim’s top-left corner', () => {
    const { store, last } = track();
    store.getState().actions.select(['el_name']);
    expect(last()).toBe('“Riya Sharma” selected. 5.9 mm from left, 5.9 mm from top, 52.5 × 7.6 mm.');
    store.getState().actions.select(['el_star']);
    expect(last()).toBe('“Star” selected. 72.8 mm from left, 23.7 mm from top, 7.6 × 7.6 mm, rotated 12°.');
    store.getState().actions.clearSelection();
    expect(last()).toBe('Nothing selected.');
  });

  it('mentions locked layers and print warnings', () => {
    const { store, last } = track();
    store.getState().actions.select(['el_badge']);
    expect(last()).toMatch(/^“Since 2026” selected\. .* Locked\.$/);
    store.getState().actions.select(['el_band']);
    expect(last()).toMatch(/Part of this layer is past the trim edge and will be cut off\.$/);
  });

  it('says what changed, and offers undo after deleting', () => {
    const { store, last } = track();
    store.getState().actions.select(['el_star']);
    store.getState().actions.nudgeSelection(59.06, 0);
    expect(last()).toBe('Moved “Star”. 77.8 mm from left, 23.7 mm from top, 7.6 × 7.6 mm, rotated 12°.');
    store.getState().actions.removeSelection();
    expect(last()).toBe('Deleted “Star”. Press Ctrl Z to undo.');
  });

  it('announces undo and redo with the step’s name', () => {
    const { store, last } = track();
    store.getState().actions.select(['el_star']);
    store.getState().actions.nudgeSelection(59.06, 0);
    store.getState().actions.undo();
    expect(last()).toMatch(/^Undone: Move “Star”\. 72\.8 mm from left/);
    store.getState().actions.redo();
    expect(last()).toMatch(/^Redone: Move “Star”\. 77\.8 mm from left/);
    // A new edit after an undo clears the redo stack: that's an edit, not a redo.
    store.getState().actions.undo();
    store.getState().actions.nudgeSelection(0, 59.06);
    expect(last()).toMatch(/^Moved “Star”\./);
  });

  it('stays quiet when nothing a listener cares about changed', () => {
    const { store, last } = track();
    store.getState().actions.setHovered('el_name');
    expect(last()).toBeNull();
  });

  it('formats positions and verbs', () => {
    const print = demoDesign().surfaces[0]!.print;
    const name = demoDesign().surfaces[0]!.elements[1]!;
    expect(nbsp(describePosition({ ...name, x: -18, rotation: 0 }, print))).toBe('-1.5 mm from left, 5.9 mm from top, 52.5 × 7.6 mm');
    expect(pastTense('Bring forward “Logo”')).toBe('Brought forward “Logo”');
    expect(pastTense('Something new')).toBe('Something new');
  });
});
