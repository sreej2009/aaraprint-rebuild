import type { Rect } from '../geometry/boxes';
import type { Size } from '../geometry/fit';
import { centreOn, fitViewport, scaleForPercent, zoomAround, zoomPercent, ZOOM_STEPS, type Viewport } from '../geometry/viewport';
import type { SurfacePrint } from '../schema/types';

/**
 * Preview zoom and pan (Plan M14), pure. The preview has its own view, never the editor's: it
 * shows the finished piece (the trim box, bleed cut away) and starts fitted to the screen.
 * Percentages mean the same as in the editor: 100 % is real size (one printed inch = 96 CSS px).
 */

export const PREVIEW_MIN_PERCENT = 25;
export const PREVIEW_MAX_PERCENT = 400;
/** Choices in the zoom menu, besides Fit. */
export const PREVIEW_PRESETS = [50, 100, 200] as const;

export type PreviewZoom = { mode: 'fit' } | { mode: 'manual'; viewport: Viewport };

/**
 * What the preview zooms over: the finished piece (a side's print), or on the product the whole
 * photo, with a dpi that keeps 100 % at the artwork's real size (Phase 4 M1).
 */
export type PreviewSpace = Pick<SurfacePrint, 'widthPx' | 'heightPx' | 'dpi'>;

/** The finished piece in design px. */
export function trimRect(print: PreviewSpace): Rect {
  return { x: 0, y: 0, width: print.widthPx, height: print.heightPx };
}

/** Breathing room around the piece: less on phones, more on large screens. */
export function previewPadding(width: number): number {
  if (width < 480) return 20;
  if (width < 1024) return 32;
  return 56;
}

export function previewFit(available: Size, print: PreviewSpace): Viewport {
  return fitViewport(available, trimRect(print), previewPadding(available.width));
}

export interface PreviewLimits {
  minPercent: number;
  maxPercent: number;
}

/** 25–400 %, widened to include Fit (a banner fits at a few percent, a stamp at several hundred). */
export function previewLimits(fitPercent: number): PreviewLimits {
  return { minPercent: Math.min(PREVIEW_MIN_PERCENT, fitPercent), maxPercent: Math.max(PREVIEW_MAX_PERCENT, fitPercent) };
}

export function viewportFor(zoom: PreviewZoom, available: Size, print: PreviewSpace): Viewport {
  return zoom.mode === 'fit' ? previewFit(available, print) : clampPreviewPan(zoom.viewport, available, print);
}

export function percentOf(viewport: Viewport, print: PreviewSpace): number {
  return zoomPercent(viewport.scale, print.dpi);
}

/** True when the piece is bigger than the space, so it can be moved around. */
export function canPan(viewport: Viewport, available: Size, print: PreviewSpace): boolean {
  return print.widthPx * viewport.scale > available.width + 0.5 || print.heightPx * viewport.scale > available.height + 0.5;
}

/**
 * Keep the piece in view: centred along an axis where it fits, otherwise its edges may go no
 * further in than the padding (no panning the artwork off the screen).
 */
export function clampPreviewPan(viewport: Viewport, available: Size, print: PreviewSpace): Viewport {
  const margin = previewPadding(available.width);
  const axis = (offset: number, length: number, space: number) => {
    if (length <= space) return (space - length) / 2;
    return Math.min(margin, Math.max(space - length - margin, offset));
  };
  return {
    scale: viewport.scale,
    x: axis(viewport.x, print.widthPx * viewport.scale, available.width),
    y: axis(viewport.y, print.heightPx * viewport.scale, available.height),
  };
}

/** Zoom to `percent` (kept within the limits) around the middle of the space, or `anchor`. */
export function zoomToPercent(current: Viewport, percent: number, available: Size, print: PreviewSpace, anchor?: { x: number; y: number }): Viewport {
  const limits = previewLimits(percentOf(previewFit(available, print), print));
  const clamped = Math.min(limits.maxPercent, Math.max(limits.minPercent, percent));
  const scale = scaleForPercent(clamped, print.dpi);
  const next = current.scale > 0 ? zoomAround(current, scale, anchor ?? { x: available.width / 2, y: available.height / 2 }) : centreOn(available, trimRect(print), scale);
  return clampPreviewPan(next, available, print);
}

/** The next zoom step up or down, Fit included as a stop. */
export function stepPreviewPercent(percent: number, direction: 1 | -1, fitPercent: number): number {
  const limits = previewLimits(fitPercent);
  const stops = [...new Set([...ZOOM_STEPS.filter((s) => s >= PREVIEW_MIN_PERCENT), Math.round(fitPercent * 10) / 10])].sort((a, b) => a - b);
  const next = direction > 0 ? stops.find((s) => s > percent + 0.5) : [...stops].reverse().find((s) => s < percent - 0.5);
  return Math.min(limits.maxPercent, Math.max(limits.minPercent, next ?? (direction > 0 ? limits.maxPercent : limits.minPercent)));
}

export function panBy(viewport: Viewport, dx: number, dy: number, available: Size, print: PreviewSpace): Viewport {
  return clampPreviewPan({ ...viewport, x: viewport.x + dx, y: viewport.y + dy }, available, print);
}
