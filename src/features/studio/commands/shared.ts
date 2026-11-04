import type { DesignDocument, DesignElement, SurfaceDesign } from '../schema/types';

/** Thrown when a command targets something that doesn't exist — a bug in the caller, not user error. */
export class DesignCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignCommandError';
  }
}

export function getSurface(document: DesignDocument, surfaceId: string): SurfaceDesign {
  const surface = document.surfaces.find((s) => s.id === surfaceId);
  if (!surface) throw new DesignCommandError(`Unknown surface "${surfaceId}"`);
  return surface;
}

export function elementIndex(surface: SurfaceDesign, elementId: string): number {
  const index = surface.elements.findIndex((e) => e.id === elementId);
  if (index < 0) throw new DesignCommandError(`Unknown element "${elementId}" on surface "${surface.id}"`);
  return index;
}

export function findElement(document: DesignDocument, elementId: string): { surface: SurfaceDesign; element: DesignElement } | null {
  for (const surface of document.surfaces) {
    const element = surface.elements.find((e) => e.id === elementId);
    if (element) return { surface, element };
  }
  return null;
}

/**
 * Replace one surface. Returns the same document when `update` returns the same surface, so
 * callers (and the undo history) can tell that nothing changed. Other surfaces keep their identity.
 */
export function withSurface(document: DesignDocument, surfaceId: string, update: (surface: SurfaceDesign) => SurfaceDesign): DesignDocument {
  const current = getSurface(document, surfaceId);
  const next = update(current);
  if (next === current) return document;
  return { ...document, surfaces: document.surfaces.map((s) => (s === current ? next : s)) };
}

export function assertNewElementIds(document: DesignDocument, ids: Iterable<string>): void {
  const existing = new Set(document.surfaces.flatMap((s) => s.elements.map((e) => e.id)));
  const seen = new Set<string>();
  for (const id of ids) {
    if (existing.has(id) || seen.has(id)) throw new DesignCommandError(`Element id "${id}" is already in use`);
    seen.add(id);
  }
}
