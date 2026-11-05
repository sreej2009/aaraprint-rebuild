import { useEffect } from 'react';
import type { InteractionStore } from '../canvas/interaction-store';
import { mmToPx } from '../geometry/units';
import { elementDisplayName } from '../naming';
import { selectActiveSurface, selectSelectedElements, type StudioStore } from '../store';
import { commandForKey, type StudioCommand } from './shortcuts';

/** Marks the parts of the page where selection shortcuts (arrows, Delete, Esc) apply. */
export const STUDIO_KEYS_ATTRIBUTE = 'data-studio-keys';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function inSelectionScope(target: EventTarget | null, allowBody: boolean): boolean {
  if (!(target instanceof Element)) return allowBody;
  if (target.closest(`[${STUDIO_KEYS_ATTRIBUTE}]`)) return true;
  return allowBody && (target === document.body || target === document.documentElement);
}

export interface StudioShortcutOptions {
  /**
   * Also apply selection shortcuts when nothing in particular has focus (the Studio page). Off on
   * pages where arrow keys should keep scrolling (the /design-system demo).
   */
  allowBody?: boolean;
}

/**
 * Editing shortcuts for the Studio (see keyboard/shortcuts.ts). While an element is being
 * dragged, Escape cancels the drag and other shortcuts wait until it ends.
 */
export function useStudioShortcuts(studio: StudioStore, interaction: InteractionStore, { allowBody = true }: StudioShortcutOptions = {}): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTyping(event.target)) return;
      const gesture = interaction.getState().gesture;
      if (gesture) {
        if (event.key === 'Escape') {
          gesture.cancel();
          event.preventDefault();
        }
        return;
      }
      const match = commandForKey(event);
      if (!match) return;
      if (match.scope === 'selection' && !inSelectionScope(event.target, allowBody)) return;
      if (run(studio, interaction, match.command)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [studio, interaction, allowBody]);
}

/** Apply one command. Returns whether the key was used (so the browser's default is skipped). */
export function run(studio: StudioStore, interaction: InteractionStore, command: StudioCommand): boolean {
  const state = studio.getState();
  const { actions } = state;
  const selected = selectSelectedElements(state);
  const dpi = selectActiveSurface(state)?.print.dpi ?? 300;
  const lockedNotice = () => {
    const [first] = selected;
    if (first?.locked) interaction.getState().actions.notify(`“${elementDisplayName(first, state.document)}” is locked. Unlock it to change it.`);
  };

  switch (command.kind) {
    case 'nudge':
      if (selected.length === 0) return false;
      if (!actions.nudgeSelection(mmToPx(command.dxMm, dpi), mmToPx(command.dyMm, dpi))) lockedNotice();
      return true;
    case 'delete':
      if (selected.length === 0) return false;
      if (!actions.removeSelection()) lockedNotice();
      return true;
    case 'deselect':
      if (state.editor.selectedIds.length === 0) return false;
      actions.clearSelection();
      return true;
    case 'duplicate':
      // Always swallowed: Ctrl D would otherwise bookmark the page.
      if (selected.length > 0) actions.duplicateSelection(mmToPx(command.offsetMm, dpi));
      return true;
    case 'arrange': {
      const [only] = selected;
      if (!only || selected.length !== 1) return false;
      if (!actions.arrangeElement(only.id, command.action)) lockedNotice();
      return true;
    }
    case 'undo':
      actions.undo();
      return true;
    case 'redo':
      actions.redo();
      return true;
  }
}
