import { samePrint } from '../schema/compat';
import type { DesignDocument, DesignElement, SurfaceDesign, SurfacePrint } from '../schema/types';
import { assertNewElementIds, DesignCommandError, getSurface, withSurface } from './shared';

export function setBackground(document: DesignDocument, surfaceId: string, color: string | null): DesignDocument {
  if (color !== null && !/^#[0-9a-f]{6}$/i.test(color)) throw new DesignCommandError(`Invalid colour "${color}"`);
  const value = color?.toLowerCase() ?? null;
  return withSurface(document, surfaceId, (surface) => (surface.background.color === value ? surface : { ...surface, background: { color: value } }));
}

/** Remove every element and the background colour from one surface. */
export function clearSurface(document: DesignDocument, surfaceId: string): DesignDocument {
  return withSurface(document, surfaceId, (surface) =>
    surface.elements.length === 0 && surface.background.color === null ? surface : { ...surface, background: { color: null }, elements: [] },
  );
}

export type CopyMode = 'replace' | 'append';

/**
 * Copy one surface's artwork to another ("Same design on both sides").
 * `replace` overwrites the target, background included; `append` keeps the target's artwork and
 * adds the copies on top. Copies get new ids. If the surfaces differ in size, the copies are
 * fitted to the target (see `resizeSurface`).
 */
export function copySurface(document: DesignDocument, fromId: string, toId: string, mode: CopyMode, newId: () => string): DesignDocument {
  if (fromId === toId) throw new DesignCommandError('Copy needs two different surfaces');
  const from = getSurface(document, fromId);
  const to = getSurface(document, toId);
  const transform = samePrint(from.print, to.print) ? null : fitTransform(from.print, to.print);
  const copies = from.elements.map((e) => {
    const copy = { ...e, id: newId() };
    return transform ? transformElement(copy, transform) : copy;
  });
  assertNewElementIds(document, copies.map((c) => c.id));
  return withSurface(document, toId, (surface): SurfaceDesign =>
    mode === 'replace'
      ? { ...surface, background: { ...from.background }, elements: copies }
      : { ...surface, elements: [...surface.elements, ...copies] },
  );
}

export type ResizeMode =
  /** Scale the artwork uniformly to fit the new size, centred (most designs). */
  | 'fit'
  /** Keep every element's physical size and centre the artwork on the new size. */
  | 'keep-size';

/**
 * Give a surface new print geometry — when the business corrects a size or (Phase 4) an option
 * changes the physical size — and move the artwork with it so nothing is silently lost.
 */
export function resizeSurface(document: DesignDocument, surfaceId: string, print: SurfacePrint, mode: ResizeMode): DesignDocument {
  return withSurface(document, surfaceId, (surface) => {
    if (samePrint(surface.print, print)) return surface;
    const transform = mode === 'fit' ? fitTransform(surface.print, print) : keepSizeTransform(surface.print, print);
    return { ...surface, print: { ...print, trim: { ...print.trim } }, elements: surface.elements.map((e) => transformElement(e, transform)) };
  });
}

interface Transform {
  scale: number;
  dx: number;
  dy: number;
}

function fitTransform(from: SurfacePrint, to: SurfacePrint): Transform {
  const scale = Math.min(to.widthPx / from.widthPx, to.heightPx / from.heightPx);
  return { scale, dx: (to.widthPx - from.widthPx * scale) / 2, dy: (to.heightPx - from.heightPx * scale) / 2 };
}

function keepSizeTransform(from: SurfacePrint, to: SurfacePrint): Transform {
  const scale = to.dpi / from.dpi; // same millimetres at the new resolution
  return { scale, dx: (to.widthPx - from.widthPx * scale) / 2, dy: (to.heightPx - from.heightPx * scale) / 2 };
}

function transformElement<T extends DesignElement>(element: T, { scale, dx, dy }: Transform): T {
  const moved = { ...element, x: element.x * scale + dx, y: element.y * scale + dy, width: element.width * scale, height: element.height * scale };
  if (moved.type === 'text') return { ...moved, fontSize: moved.fontSize * scale };
  if (moved.type === 'shape') return { ...moved, strokeWidth: moved.strokeWidth * scale, cornerRadius: moved.cornerRadius * scale };
  return moved;
}
