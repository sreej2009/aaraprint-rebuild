import * as cmd from '../commands';
import { describeElements } from '../naming';
import type { TextElement } from '../schema/types';
import { MAX_TEXT_LENGTH } from '../schema/validate';
import { selectActiveSurface, type StudioStore } from '../store';

/** Merge keys of text edits start with this (announcements stay quiet while one runs). */
export const TEXT_EDIT_KEY = 'text-edit:';

export type TextEditResult = 'changed' | 'unchanged' | 'removed' | 'cancelled';

/**
 * One text-editing session — the canvas editor, the phone sheet or the inspector's Content field.
 * Every keystroke updates the design (so the canvas, inspector and layer name follow live), and
 * all of them merge into one undo step, like a drag: however long the typing takes, undo puts the
 * whole edit back. Cancelling (Escape) restores the original text and leaves no undo step.
 * Committing empty text deletes the text box, in the same undo step.
 */
export interface TextEditSession {
  readonly elementId: string;
  /** The text when editing began. */
  readonly original: string;
  update(text: string): void;
  commit(): TextEditResult;
  cancel(): TextEditResult;
}

let counter = 0;

/** Null when the element isn't an editable (unlocked) text element on the active side. */
export function startTextEdit(studio: StudioStore, elementId: string): TextEditSession | null {
  const state = studio.getState();
  const surface = selectActiveSurface(state);
  const element = surface?.elements.find((e) => e.id === elementId);
  if (!surface || element?.type !== 'text' || element.locked) return null;
  const surfaceId = surface.id;
  const key = `${TEXT_EDIT_KEY}${(counter += 1)}`;
  const original = { text: element.text, placeholder: element.placeholder };
  const label = `Edit text ${describeElements([element], state.document)}`;
  let finished = false;

  const current = (): TextElement | null => {
    const s = studio.getState();
    if (s.editor.activeSurfaceId !== surfaceId) return null;
    const e = selectActiveSurface(s)?.elements.find((el) => el.id === elementId);
    return e?.type === 'text' ? e : null;
  };
  const apply = (patch: Partial<TextElement>) => studio.getState().actions.updateElement<TextElement>(elementId, patch, { coalesceKey: key, gesture: true, label });
  const end = (result: TextEditResult): TextEditResult => {
    finished = true;
    studio.getState().actions.sealHistory();
    return result;
  };

  return {
    elementId,
    original: original.text,

    update(value) {
      if (finished) return;
      const text = value.slice(0, MAX_TEXT_LENGTH);
      if (current()?.text === text) return;
      // Template sample text stops being a placeholder once it's been changed.
      apply({ text, placeholder: original.placeholder && text === original.text });
    },

    commit() {
      if (finished) return 'unchanged';
      const element = current();
      if (element && element.text.trim() === '' && !element.locked) {
        // An empty text box would print nothing and be hard to find again: remove it.
        studio.getState().actions.execute('Delete empty text', (d) => cmd.removeElements(d, surfaceId, [elementId]), { coalesceKey: key, gesture: true, surfaceId });
        return end('removed');
      }
      return end(element && element.text !== original.text ? 'changed' : 'unchanged');
    },

    cancel() {
      if (finished) return 'cancelled';
      const element = current();
      if (element && (element.text !== original.text || element.placeholder !== original.placeholder)) apply({ text: original.text, placeholder: original.placeholder });
      return end('cancelled');
    },
  };
}
