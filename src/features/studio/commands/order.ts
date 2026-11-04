import type { DesignDocument } from '../schema/types';
import { elementIndex, withSurface } from './shared';

/** Move an element to `toIndex` in the stacking order (0 = bottom). */
export function moveElementTo(document: DesignDocument, surfaceId: string, elementId: string, toIndex: number): DesignDocument {
  return withSurface(document, surfaceId, (surface) => {
    const from = elementIndex(surface, elementId);
    const to = Math.max(0, Math.min(surface.elements.length - 1, Math.trunc(toIndex)));
    if (from === to) return surface;
    const elements = [...surface.elements];
    const [moved] = elements.splice(from, 1);
    elements.splice(to, 0, moved!);
    return { ...surface, elements };
  });
}

export type ArrangeAction = 'forward' | 'backward' | 'front' | 'back';

/** Bring forward / send backward one step, or all the way to the front / back. */
export function arrangeElement(document: DesignDocument, surfaceId: string, elementId: string, action: ArrangeAction): DesignDocument {
  const surface = document.surfaces.find((s) => s.id === surfaceId);
  const from = surface ? elementIndex(surface, elementId) : 0;
  const last = (surface?.elements.length ?? 1) - 1;
  const to = { forward: from + 1, backward: from - 1, front: last, back: 0 }[action];
  return moveElementTo(document, surfaceId, elementId, to);
}
