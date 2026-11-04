import type { DesignDocument, DesignElement, ElementPatch } from '../schema/types';
import { assertNewElementIds, DesignCommandError, elementIndex, getSurface, withSurface } from './shared';

/** Add an element on top (or at `index`, counted from the bottom). */
export function addElement(document: DesignDocument, surfaceId: string, element: DesignElement, index?: number): DesignDocument {
  assertNewElementIds(document, [element.id]);
  assertGeometry(element);
  if (element.type === 'image' && element.source.kind === 'asset' && !document.assets[element.source.assetId]) {
    throw new DesignCommandError(`Add the asset "${element.source.assetId}" before the image that uses it`);
  }
  return withSurface(document, surfaceId, (surface) => {
    const elements = [...surface.elements];
    elements.splice(clampIndex(index ?? elements.length, elements.length), 0, element);
    return { ...surface, elements };
  });
}

/** Change some fields of one element. No-op (same document) when every value is unchanged. */
export function updateElement<T extends DesignElement>(document: DesignDocument, surfaceId: string, elementId: string, patch: ElementPatch<T>): DesignDocument {
  return withSurface(document, surfaceId, (surface) => {
    const index = elementIndex(surface, elementId);
    const current = surface.elements[index] as DesignElement;
    const entries = Object.entries(patch).filter(([key, value]) => value !== undefined && !sameValue((current as unknown as Record<string, unknown>)[key], value));
    if (entries.length === 0) return surface;
    if ('id' in patch || 'type' in patch) throw new DesignCommandError('An element’s id and type can’t be changed');
    const next = { ...current, ...Object.fromEntries(entries) } as DesignElement;
    assertGeometry(next);
    if (next.type === 'image' && next.source.kind === 'asset' && !document.assets[next.source.assetId]) {
      throw new DesignCommandError(`Unknown asset "${next.source.assetId}"`);
    }
    const elements = [...surface.elements];
    elements[index] = next;
    return { ...surface, elements };
  });
}

export function removeElements(document: DesignDocument, surfaceId: string, elementIds: readonly string[]): DesignDocument {
  if (elementIds.length === 0) return document;
  return withSurface(document, surfaceId, (surface) => {
    for (const id of elementIds) elementIndex(surface, id); // throws for unknown ids
    const remove = new Set(elementIds);
    return { ...surface, elements: surface.elements.filter((e) => !remove.has(e.id)) };
  });
}

/** Copy an element directly above the original, offset by `offsetPx` on both axes. */
export function duplicateElement(document: DesignDocument, surfaceId: string, elementId: string, newElementId: string, offsetPx: number): DesignDocument {
  const surface = getSurface(document, surfaceId);
  const index = elementIndex(surface, elementId);
  const original = surface.elements[index] as DesignElement;
  const copy = { ...original, id: newElementId, x: original.x + offsetPx, y: original.y + offsetPx, locked: false } as DesignElement;
  return addElement(document, surfaceId, copy, index + 1);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Nested values (image source) compare by content.
  return typeof a === 'object' && typeof b === 'object' && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length, Math.trunc(index)));
}

function assertGeometry(element: DesignElement): void {
  const { x, y, width, height, rotation, opacity } = element;
  if (![x, y, width, height, rotation, opacity].every(Number.isFinite)) throw new DesignCommandError(`Element "${element.id}" has a non-numeric position or size`);
  if (width <= 0 || height <= 0) throw new DesignCommandError(`Element "${element.id}" must have a positive size`);
  if (opacity < 0 || opacity > 1) throw new DesignCommandError(`Element "${element.id}" opacity must be between 0 and 1`);
}
