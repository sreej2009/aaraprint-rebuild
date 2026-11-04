import { printBoxes, type Rect } from '../geometry/boxes';
import { toScreenRect, type Viewport } from '../geometry/viewport';
import type { SurfacePrint } from '../schema/types';

/** Layer names. Only the artwork layer is ever exported; guides and workspace never are. */
export const ARTWORK_LAYER = 'artwork';
export const GUIDES_LAYER = 'guides';
export const WORKSPACE_LAYER = 'workspace';

export interface ExportRegion extends Rect {
  pixelRatio: number;
}

/**
 * Where to read the printable artwork from the stage: the bleed box in screen px, and the pixel
 * ratio that turns it back into `resolution` × print px (1 = full print resolution).
 */
export function artworkRegion(viewport: Viewport, print: SurfacePrint, resolution = 1): ExportRegion {
  const screen = toScreenRect(viewport, printBoxes(print).bleed);
  return { ...screen, pixelRatio: resolution / viewport.scale };
}

/** Anything with Konva's `findOne` and `toCanvas` — a Konva.Stage in practice. */
interface ExportableStage {
  findOne(selector: string): { toCanvas(config: ExportRegion): HTMLCanvasElement } | undefined | null;
}

/**
 * The printable artwork of the visible side (bleed included), without guides, at `resolution` ×
 * print px. Proof downloads (M15) build on this; print-ready files are rendered server-side later.
 */
export function exportArtwork(stage: ExportableStage, viewport: Viewport, print: SurfacePrint, resolution = 1): HTMLCanvasElement {
  const layer = stage.findOne(`.${ARTWORK_LAYER}`);
  if (!layer) throw new Error('The artwork layer is missing.');
  return layer.toCanvas(artworkRegion(viewport, print, resolution));
}
