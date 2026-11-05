import { pxToMm } from '../geometry/units';
import { elementDisplayName } from '../naming';
import { formatLength, formatSize } from '../profile/describe';
import type { DesignElement, SurfacePrint } from '../schema/types';
import { selectActiveSurface, type StudioState } from '../store';
import { TEXT_EDIT_KEY } from './text-edit-session';
import { PLACEMENT_MESSAGES, placementFor } from './transform-rules';

/**
 * What the canvas live region says after a change (Plan §18.7): the selection, where it is, and
 * what just happened — "Moved “Riya Sharma”. 12 mm from left, 8 mm from top, 52.5 × 7.6 mm."
 */

/** "12 mm from left, 8 mm from top, 52.5 × 7.6 mm, rotated 15°" — from the trim's top-left corner. */
export function describePosition(element: DesignElement, print: SurfacePrint): string {
  const mm = (px: number) => pxToMm(px, print.dpi);
  const parts = [`${formatLength(mm(element.x))} from left`, `${formatLength(mm(element.y))} from top`, formatSize(mm(element.width), mm(element.height))];
  if (element.rotation !== 0) parts.push(`rotated ${Math.round(element.rotation * 10) / 10}°`);
  return parts.join(', ');
}

/** Position, then "Locked." and any print warning. */
export function describeSelection(element: DesignElement, print: SurfacePrint): string {
  const status = element.locked ? ' Locked.' : element.hidden ? ' Hidden.' : '';
  const warning = PLACEMENT_MESSAGES[placementFor(element, print)];
  return `${describePosition(element, print)}.${status}${warning ? ` ${warning}` : ''}`;
}

const PAST_TENSE: Record<string, string> = {
  Move: 'Moved',
  Resize: 'Resized',
  Rotate: 'Rotated',
  Delete: 'Deleted',
  Duplicate: 'Duplicated',
  Edit: 'Changed',
  Change: 'Changed',
  Add: 'Added',
  Lock: 'Locked',
  Unlock: 'Unlocked',
  Hide: 'Hid',
  Show: 'Showed',
  Bring: 'Brought',
  Send: 'Sent',
  Reorder: 'Reordered',
  Rename: 'Renamed',
  Copy: 'Copied',
  Clear: 'Cleared',
  Centre: 'Centred',
  Align: 'Aligned',
};

/** "Move “Logo”" → "Moved “Logo”". */
export function pastTense(label: string): string {
  const [verb = '', ...rest] = label.split(' ');
  const past = PAST_TENSE[verb];
  return past ? [past, ...rest].join(' ') : label;
}

function onlySelected(state: StudioState): DesignElement | null {
  if (state.editor.selectedIds.length !== 1) return null;
  return selectActiveSurface(state)?.elements.find((e) => e.id === state.editor.selectedIds[0]) ?? null;
}

/** The message for going from `prev` to `next`, or null when there's nothing worth saying. */
export function announcementFor(prev: StudioState, next: StudioState): string | null {
  const surface = selectActiveSurface(next);
  const selected = onlySelected(next);
  const where = selected && surface ? ` ${describeSelection(selected, surface.print)}` : '';
  // Re-measured text after a font loaded: a correction, not something the customer did.
  if (next.relayoutCount !== prev.relayoutCount) return null;
  // Typing is never read out key by key; the editor says when the text is done.
  // (While a text edit runs its undo step is still open: its merge key is set until it ends.)
  if (next.history.past.at(-1)?.coalesceKey?.startsWith(TEXT_EDIT_KEY)) return null;

  if (next.history !== prev.history) {
    const { past, future } = next.history;
    // Undo moves the latest step to the redo stack (sealed, so compare its contents); redo moves it back.
    const undone = future.at(-1);
    if (undone && undone !== prev.history.future.at(-1) && undone.before === prev.history.past.at(-1)?.before) return `Undone: ${undone.label}.${where}`;
    const latest = past.at(-1);
    if (latest && latest === prev.history.future.at(-1)) return `Redone: ${latest.label}.${where}`;
    if (latest && next.document !== prev.document) {
      const undo = latest.label.startsWith('Delete') ? ' Press Ctrl Z to undo.' : '';
      return `${pastTense(latest.label)}.${undo}${where}`;
    }
  }

  const before = prev.editor.selectedIds;
  const after = next.editor.selectedIds;
  if (before.length === after.length && before.every((id, i) => id === after[i]) && prev.editor.activeSurfaceId === next.editor.activeSurfaceId) return null;
  if (selected) return `${quote(elementDisplayName(selected, next.document))} selected.${where}`;
  if (after.length > 1) return `${after.length} items selected.`;
  return before.length > 0 ? 'Nothing selected.' : null;
}

function quote(name: string): string {
  return `“${name}”`;
}
