import { useEffect, useMemo, useRef } from 'react';
import { elementDisplayName } from '../naming';
import { useStudioStoreApi } from '../store';
import { useInteractionStoreApi } from './interaction-store';
import { startTextEdit, type TextEditResult, type TextEditSession } from './text-edit-session';

export interface TextEditControls {
  /** Start the session (on focus); later calls keep the running one. */
  begin(): void;
  update(text: string): void;
  commit(): TextEditResult | null;
  cancel(): TextEditResult | null;
  /** The text when this session began, or null when none is running. */
  original(): string | null;
}

/**
 * Drives a text-editing session from a textarea (canvas editor, phone sheet, inspector field) and
 * says what happened when it ends — never key by key. Leaving the component commits.
 */
export function useTextEdit(elementId: string, onEnd?: (result: TextEditResult) => void): TextEditControls {
  const studio = useStudioStoreApi();
  const interaction = useInteractionStoreApi();
  const session = useRef<TextEditSession | null>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  const controls = useMemo<TextEditControls>(() => {
    const ensure = () => (session.current ??= startTextEdit(studio, elementId));
    const finish = (how: 'commit' | 'cancel') => {
      const running = session.current;
      if (!running) return null;
      session.current = null;
      const result = how === 'commit' ? running.commit() : running.cancel();
      const notify = interaction.getState().actions.notify;
      if (result === 'removed') notify('Deleted the empty text box. Press Ctrl Z to undo.');
      else if (result === 'changed') {
        const element = studio.getState().document.surfaces.flatMap((s) => s.elements).find((e) => e.id === elementId);
        if (element) notify(`Text changed to “${elementDisplayName({ ...element, name: null }, studio.getState().document)}”.`);
      } else if (result === 'cancelled') notify('Text edit cancelled.');
      onEndRef.current?.(result);
      return result;
    };
    return {
      begin: () => void ensure(),
      update: (text) => ensure()?.update(text),
      commit: () => finish('commit'),
      cancel: () => finish('cancel'),
      original: () => session.current?.original ?? null,
    };
  }, [studio, interaction, elementId]);

  // Unmounting (selection moved on, the side changed) keeps what was typed.
  useEffect(() => () => void controls.commit(), [controls]);
  return controls;
}
