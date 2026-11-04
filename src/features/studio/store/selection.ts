import type { DesignDocument, DesignElement } from '../schema/types';

/** Selection rules, kept pure so they're easy to test and reuse. */

export type SelectMode = 'replace' | 'add' | 'toggle';

/** Combine the current selection with `ids` (shift-click adds, ctrl/⌘-click toggles). */
export function nextSelection(current: readonly string[], ids: readonly string[], mode: SelectMode): string[] {
  if (mode === 'replace') return unique(ids);
  if (mode === 'add') return unique([...current, ...ids]);
  const toggled = new Set(current);
  for (const id of ids) {
    if (toggled.has(id)) toggled.delete(id);
    else toggled.add(id);
  }
  // Keep the original order for ids that stay selected, then the newly added ones.
  return [...current.filter((id) => toggled.has(id)), ...unique(ids).filter((id) => toggled.has(id) && !current.includes(id))];
}

/** Drop ids that are no longer on the surface (deleted, undone, or on another side). */
export function pruneSelection(selection: readonly string[], document: DesignDocument, surfaceId: string): string[] {
  const surface = document.surfaces.find((s) => s.id === surfaceId);
  if (!surface) return [];
  const present = new Set(surface.elements.map((e) => e.id));
  const pruned = selection.filter((id) => present.has(id));
  return pruned.length === selection.length ? (selection as string[]) : pruned;
}

/** Elements a canvas click or "Select all" may pick: visible and unlocked. Layers can pick any. */
export function isPickable(element: DesignElement): boolean {
  return !element.hidden && !element.locked;
}

/** Fields a locked element still accepts: unlocking, showing/hiding and renaming its layer. */
export const LOCKED_EDITABLE_FIELDS = new Set(['locked', 'hidden', 'name']);

export function isAllowedOnLocked(patch: object): boolean {
  return Object.keys(patch).every((key) => LOCKED_EDITABLE_FIELDS.has(key));
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
