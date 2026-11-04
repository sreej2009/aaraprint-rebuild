import type { DesignElement, SurfaceDesign } from '../schema/types';
import type { StudioState } from './create-store';

/**
 * Narrow selectors so components re-render only when their slice changes. Selectors returning
 * arrays build new arrays; use them with `useShallow` (or compare ids) in components.
 */

export const selectDocument = (s: StudioState) => s.document;
export const selectActions = (s: StudioState) => s.actions;
export const selectActiveSurfaceId = (s: StudioState) => s.editor.activeSurfaceId;
export const selectSelectedIds = (s: StudioState) => s.editor.selectedIds;
export const selectHoveredId = (s: StudioState) => s.editor.hoveredId;
export const selectEditingTextId = (s: StudioState) => s.editor.editingTextId;
export const selectChangeCount = (s: StudioState) => s.changeCount;

export function selectActiveSurface(s: StudioState): SurfaceDesign | undefined {
  return s.document.surfaces.find((surface) => surface.id === s.editor.activeSurfaceId);
}

export function selectElement(id: string) {
  return (s: StudioState): DesignElement | undefined => selectActiveSurface(s)?.elements.find((e) => e.id === id);
}

export function selectSelectedElements(s: StudioState): DesignElement[] {
  const elements = selectActiveSurface(s)?.elements ?? [];
  return s.editor.selectedIds.map((id) => elements.find((e) => e.id === id)).filter((e): e is DesignElement => Boolean(e));
}

export const selectCanUndo = (s: StudioState) => s.history.past.length > 0;
export const selectCanRedo = (s: StudioState) => s.history.future.length > 0;
export const selectUndoLabel = (s: StudioState) => s.history.past.at(-1)?.label ?? null;
export const selectRedoLabel = (s: StudioState) => s.history.future.at(-1)?.label ?? null;

/** Element count per surface, for the side switcher. */
export function selectSurfaceCounts(s: StudioState): Record<string, number> {
  return Object.fromEntries(s.document.surfaces.map((surface) => [surface.id, surface.elements.length]));
}
