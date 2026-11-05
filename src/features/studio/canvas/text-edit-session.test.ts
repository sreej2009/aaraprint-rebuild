import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureFonts, resetFontsForTests } from '../assets/fonts';
import { demoDesign } from '../demo/demo-design';
import { elementDisplayName } from '../naming';
import type { TextElement } from '../schema/types';
import { parseDesign, validateDesign } from '../schema/validate';
import { createStudioStore, selectActiveSurface, type StudioStore } from '../store';
import { fakeMeasure } from '../testing/text-measure';
import { announcementFor } from './announcements';
import { startTextEdit, TEXT_EDIT_KEY } from './text-edit-session';

/**
 * Text editing through the Studio store (M8): every keystroke updates the design, a whole edit is
 * one undo step, Escape leaves no trace, and heights follow the text inside the same step.
 * Demo front: el_name "Riya Sharma" (Inter 75 px, box 620 px), el_badge locked, el_hidden hidden.
 */

let store: StudioStore;
let now: number;

afterEach(() => resetFontsForTests());

beforeEach(() => {
  now = 1_000;
  store = createStudioStore({ document: demoDesign(), clock: () => now, measureText: fakeMeasure });
});

const el = (id = 'el_name') => selectActiveSurface(store.getState())!.elements.find((e) => e.id === id) as TextElement | undefined;
const past = () => store.getState().history.past;
const actions = () => store.getState().actions;

/** Type `text` one character at a time, `gap` ms apart. */
function typeInto(id: string, text: string, gap = 250) {
  const session = startTextEdit(store, id)!;
  let value = el(id)!.text;
  for (const char of text) {
    now += gap;
    value += char;
    session.update(value);
  }
  return session;
}

describe('a text edit', () => {
  it('updates the design live and is one undo step however slowly it is typed', () => {
    const session = typeInto('el_name', ' Kapoor'); // 7 keys, 1.75 s: far past the 600 ms window
    expect(el()!.text).toBe('Riya Sharma Kapoor');
    expect(past()).toHaveLength(1);
    expect(past()[0]!.label).toBe('Edit text “Riya Sharma”');
    expect(session.commit()).toBe('changed');
    expect(past()).toHaveLength(1);

    actions().undo();
    expect(el()!.text).toBe('Riya Sharma');
    actions().redo();
    expect(el()!.text).toBe('Riya Sharma Kapoor');
  });

  it('keeps the next edit separate once committed', () => {
    typeInto('el_name', '!').commit();
    typeInto('el_name', '?').commit();
    expect(past().map((e) => e.label)).toEqual(['Edit text “Riya Sharma”', 'Edit text “Riya Sharma!”']);
  });

  it('cancels back to the original text without leaving an undo step', () => {
    const session = typeInto('el_name', ' typo');
    expect(session.cancel()).toBe('cancelled');
    expect(el()!.text).toBe('Riya Sharma');
    expect(past()).toHaveLength(0);
    expect(session.commit()).toBe('unchanged'); // already over
  });

  it('records nothing for an edit that changes nothing', () => {
    const session = startTextEdit(store, 'el_name')!;
    session.update('Riya Sharma');
    expect(session.commit()).toBe('unchanged');
    expect(past()).toHaveLength(0);
  });

  it('removes text left empty, in the same undo step', () => {
    const session = startTextEdit(store, 'el_name')!;
    session.update('Riya');
    session.update('');
    expect(session.commit()).toBe('removed');
    expect(el()).toBeUndefined();
    expect(past()).toHaveLength(1);
    expect(past()[0]!.label).toBe('Delete empty text');
    actions().undo();
    expect(el()!.text).toBe('Riya Sharma'); // the original, not an empty box
  });

  it('turns sample text into real text once it is changed, and back on cancel', () => {
    actions().updateElement<TextElement>('el_name', { placeholder: true });
    const session = typeInto('el_name', 'x');
    expect(el()!.placeholder).toBe(false);
    session.cancel();
    expect(el()!.placeholder).toBe(true);
  });

  it('refuses locked text, and stops when the text gets locked mid-edit', () => {
    expect(startTextEdit(store, 'el_badge')).toBeNull();
    expect(startTextEdit(store, 'el_logo')).toBeNull(); // not text
    expect(actions().updateElement<TextElement>('el_badge', { text: 'Since 1999' })).toBe(false);
    const session = typeInto('el_name', 'a');
    actions().setLocked(['el_name'], true);
    session.update('Riya Sharmaab');
    expect(el()!.text).toBe('Riya Sharmaa');
  });

  it('keeps a name the customer chose; automatic names follow the text', () => {
    typeInto('el_title', ' and illustrator').commit();
    expect(elementDisplayName(el('el_title')!)).toBe('Brand designer and illustrator');
    actions().renameElement('el_title', 'Job title');
    typeInto('el_title', '!').commit();
    expect(el('el_title')!.name).toBe('Job title');
    expect(elementDisplayName(el('el_title')!)).toBe('Job title');
  });

  it('is never announced key by key', () => {
    const before = store.getState();
    const session = typeInto('el_name', 'abc');
    expect(store.getState().history.past.at(-1)!.coalesceKey).toMatch(new RegExp(`^${TEXT_EDIT_KEY}`));
    expect(announcementFor(before, store.getState())).toBeNull();
    session.commit();
  });
});

describe('editing state', () => {
  it('edits only visible, unlocked text, selecting it', () => {
    actions().setEditingText('el_name');
    expect(store.getState().editor).toMatchObject({ editingTextId: 'el_name', selectedIds: ['el_name'] });
    for (const id of ['el_badge', 'el_hidden', 'el_star']) {
      actions().setEditingText(null);
      actions().setEditingText(id);
      expect(store.getState().editor.editingTextId, id).toBeNull();
    }
  });

  it('ends when another element is selected, the side changes or the text is deleted', () => {
    actions().setEditingText('el_name');
    actions().select(['el_star']);
    expect(store.getState().editor.editingTextId).toBeNull();
    actions().setEditingText('el_name');
    actions().removeElements(['el_name']);
    expect(store.getState().editor.editingTextId).toBeNull();
    actions().undo();
    actions().setEditingText('el_name');
    actions().setActiveSurface('back');
    expect(store.getState().editor.editingTextId).toBeNull();
  });
});

describe('automatic text height', () => {
  it('follows the text, font, size, spacing and width — in the same undo step', () => {
    const start = el()!.height;
    actions().updateElement<TextElement>('el_name', { width: 200 }, { label: 'Resize' });
    expect(el()!.height).toBe(Math.round(fakeMeasure(el()!) * 100) / 100);
    expect(el()!.height).toBeGreaterThan(start);
    expect(el()!.fontSize).toBe(75); // the font size never changes with the width
    expect(past()).toHaveLength(1);
    actions().undo();
    expect(el()).toMatchObject({ width: 620, height: start });

    for (const patch of [{ fontSize: 200 }, { lineHeight: 2 }, { letterSpacing: 0.6 }, { fontFamily: 'Fraunces', fontWeight: 700 as const }, { text: 'Riya\nSharma' }]) {
      actions().updateElement<TextElement>('el_name', patch);
      expect(el()!.height, JSON.stringify(patch)).toBe(Math.round(fakeMeasure(el()!) * 100) / 100);
      actions().undo();
    }
  });

  it('keeps colour separate from opacity, each with its own undo step', () => {
    actions().updateElement<TextElement>('el_name', { color: '#b91c1c' }, { label: 'Change text colour of “Riya Sharma”' });
    actions().updateElement('el_name', { opacity: 0.75 }, { label: 'Change opacity “Riya Sharma”' });
    expect(el()).toMatchObject({ color: '#b91c1c', opacity: 0.75 });
    actions().undo();
    expect(el()).toMatchObject({ color: '#b91c1c', opacity: 1 });
    actions().undo();
    expect(el()).toMatchObject({ color: '#171c26', opacity: 1 });
  });

  it('corrects stale heights after a font loads: no undo step, no announcement, history included', async () => {
    let tall = false;
    const s = createStudioStore({ document: demoDesign(), clock: () => now, measureText: (e) => fakeMeasure(e) * (tall ? 2 : 1) });
    const height = (id = 'el_name') => (selectActiveSurface(s.getState())!.elements.find((e) => e.id === id) as TextElement).height;
    expect(s.getState().actions.relayoutText()).toBe(true); // the demo's heights were never measured
    s.getState().actions.updateElement<TextElement>('el_name', { text: 'Riya Sharma Kapoor' });
    const short = height();
    tall = true;
    // A web font finishing loading clears the measurements.
    await ensureFonts([{ family: 'Fraunces', weight: 400, italic: false, text: 'a' }], { check: () => false, load: async () => [{} as FontFace] });
    const prev = s.getState();
    expect(s.getState().actions.relayoutText()).toBe(true);
    expect(height()).toBe(short * 2);
    expect(s.getState().history.past).toHaveLength(1);
    expect(s.getState().relayoutCount).toBe(2);
    expect(announcementFor(prev, s.getState())).toBeNull();
    expect(s.getState().actions.relayoutText()).toBe(false); // already right
    s.getState().actions.undo();
    expect(height()).toBe(Math.round(fakeMeasure({ ...(demoDesign().surfaces[0]!.elements[1] as TextElement) }) * 2 * 100) / 100);
  });
});

describe('saving text', () => {
  it('round-trips every text property through JSON and the validator', () => {
    actions().updateElement<TextElement>('el_name', {
      text: 'Arjun\nMehta',
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: 600,
      italic: true,
      underline: true,
      color: '#b91c1c',
      align: 'justify',
      lineHeight: 1.5,
      letterSpacing: -0.05,
      fontSize: 90,
      width: 300,
    });
    const doc = store.getState().document;
    expect(validateDesign(doc)).toEqual([]);
    const parsed = parseDesign(JSON.stringify(doc));
    expect(parsed).toMatchObject({ ok: true, document: doc });
  });

  it('opens designs with fonts the Studio does not offer, unchanged', () => {
    actions().updateElement<TextElement>('el_name', { fontFamily: 'Arial' });
    const parsed = parseDesign(JSON.stringify(store.getState().document));
    expect(parsed.ok && (parsed.document.surfaces[0]!.elements[1] as TextElement).fontFamily).toBe('Arial');
  });
});
