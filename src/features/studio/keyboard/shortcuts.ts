import { DUPLICATE_OFFSET_MM, NUDGE_LARGE_MM, NUDGE_MM } from '../canvas/transform-rules';
import type { ArrangeAction } from '../commands';

/**
 * Editing shortcuts (Plan §18.6), as pure data so they're easy to test and to list in Help (M15).
 * View shortcuts (zoom, guides) live in canvas/use-zoom-shortcuts.ts.
 *
 * "Selection" shortcuts act on what's selected and only apply while the canvas (or the layers
 * list) has focus, so arrow keys and Delete keep their usual meaning in menus, radio groups and
 * panels. "Canvas" shortcuts need the canvas itself (Enter on a layer row selects it instead).
 * "Global" shortcuts work anywhere except while typing.
 */
export type StudioCommand =
  | { kind: 'nudge'; dxMm: number; dyMm: number }
  | { kind: 'delete' }
  | { kind: 'deselect' }
  | { kind: 'duplicate'; offsetMm: number }
  | { kind: 'arrange'; action: ArrangeAction }
  | { kind: 'edit-text' }
  | { kind: 'undo' }
  | { kind: 'redo' };

export type ShortcutScope = 'selection' | 'canvas' | 'global';

export interface KeyLike {
  key: string;
  code?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function commandForKey(event: KeyLike): { command: StudioCommand; scope: ShortcutScope } | null {
  const mod = event.ctrlKey || event.metaKey;
  if (event.altKey) return null; // Alt + arrows reorder layers (M7)

  if (!mod) {
    const arrow = ARROWS[event.key];
    if (arrow) {
      const step = event.shiftKey ? NUDGE_LARGE_MM : NUDGE_MM;
      return { scope: 'selection', command: { kind: 'nudge', dxMm: arrow[0] * step, dyMm: arrow[1] * step } };
    }
    if (event.shiftKey) return null;
    if (event.key === 'Delete' || event.key === 'Backspace') return { scope: 'selection', command: { kind: 'delete' } };
    if (event.key === 'Escape') return { scope: 'selection', command: { kind: 'deselect' } };
    if (event.key === 'Enter') return { scope: 'canvas', command: { kind: 'edit-text' } };
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === 'z') return { scope: 'global', command: event.shiftKey ? { kind: 'redo' } : { kind: 'undo' } };
  if (key === 'y' && !event.shiftKey) return { scope: 'global', command: { kind: 'redo' } };
  if (key === 'd' && !event.shiftKey) return { scope: 'global', command: { kind: 'duplicate', offsetMm: DUPLICATE_OFFSET_MM } };
  // Ctrl ] / Ctrl [ one layer; with Shift, all the way (the key reads } / { then).
  const bracket = event.code === 'BracketRight' || key === ']' || key === '}' ? 1 : event.code === 'BracketLeft' || key === '[' || key === '{' ? -1 : 0;
  if (bracket === 1) return { scope: 'global', command: { kind: 'arrange', action: event.shiftKey ? 'front' : 'forward' } };
  if (bracket === -1) return { scope: 'global', command: { kind: 'arrange', action: event.shiftKey ? 'back' : 'backward' } };
  return null;
}

/** For Help (M15) and tooltips. */
export const SHORTCUT_LIST: { keys: string; action: string }[] = [
  { keys: 'Arrow keys', action: `Move ${NUDGE_MM} mm` },
  { keys: 'Shift + arrow keys', action: `Move ${NUDGE_LARGE_MM} mm` },
  { keys: 'Delete / Backspace', action: 'Delete' },
  { keys: 'Esc', action: 'Deselect' },
  { keys: 'Enter', action: 'Edit the selected text' },
  { keys: 'Ctrl D', action: 'Duplicate' },
  { keys: 'Ctrl ] / Ctrl [', action: 'Bring forward / Send backward' },
  { keys: 'Ctrl Shift ] / Ctrl Shift [', action: 'Bring to front / Send to back' },
  { keys: 'Ctrl Z', action: 'Undo' },
  { keys: 'Ctrl Shift Z / Ctrl Y', action: 'Redo' },
];
