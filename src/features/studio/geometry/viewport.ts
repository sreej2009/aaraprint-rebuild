import type { Point, Rect } from './boxes';
import { fitScale, type Size } from './fit';

/**
 * Canvas viewport maths (pure). A viewport maps design px to screen px:
 *   screen = design × scale + (x, y)
 * Zoom is shown as a percentage of real size: at 100 % one printed inch is 96 CSS px, about the
 * printed size on a typical screen (Blueprint §11.1). The design units are print px at the DPI.
 */
export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export const CSS_PX_PER_INCH = 96;
export const MIN_ZOOM_PERCENT = 10;
export const MAX_ZOOM_PERCENT = 400;
/** − / + step through these, plus the fitted level. */
export const ZOOM_STEPS = [10, 25, 50, 75, 100, 150, 200, 300, 400] as const;

/** Screen px per design px at 100 % (real size). */
export function realSizeScale(dpi: number): number {
  return CSS_PX_PER_INCH / dpi;
}

export function zoomPercent(scale: number, dpi: number): number {
  return (scale / realSizeScale(dpi)) * 100;
}

export function scaleForPercent(percent: number, dpi: number): number {
  return (percent / 100) * realSizeScale(dpi);
}

export interface ZoomLimits {
  minPercent: number;
  maxPercent: number;
}

/**
 * 10–400 %, widened so "fit" is always reachable: a 1.5 m banner fits at ~10 % or less, and a
 * 17 mm stamp strip fits at more than 400 %.
 */
export function zoomLimits(fitPercent: number): ZoomLimits {
  return { minPercent: Math.min(MIN_ZOOM_PERCENT, fitPercent), maxPercent: Math.max(MAX_ZOOM_PERCENT, fitPercent) };
}

export function clampPercent(percent: number, limits: ZoomLimits): number {
  return Math.min(limits.maxPercent, Math.max(limits.minPercent, percent));
}

/** Viewport that shows the whole `content` box (design px), centred in `available`. */
export function fitViewport(available: Size, content: Rect, padding: number): Viewport {
  const scale = fitScale(available, content, padding);
  return centreOn(available, content, scale);
}

/** Viewport at `scale` with `content` centred. */
export function centreOn(available: Size, content: Rect, scale: number): Viewport {
  return {
    scale,
    x: (available.width - content.width * scale) / 2 - content.x * scale,
    y: (available.height - content.height * scale) / 2 - content.y * scale,
  };
}

/** Change the scale while keeping the design point under `anchor` (screen px) fixed. */
export function zoomAround(viewport: Viewport, scale: number, anchor: Point): Viewport {
  const designX = (anchor.x - viewport.x) / viewport.scale;
  const designY = (anchor.y - viewport.y) / viewport.scale;
  return { scale, x: anchor.x - designX * scale, y: anchor.y - designY * scale };
}

/** Next zoom level up or down from `percent`, including the fitted level as a stop. */
export function stepPercent(percent: number, direction: 1 | -1, fitPercent: number, limits: ZoomLimits): number {
  const stops = [...new Set([...ZOOM_STEPS, Math.round(fitPercent * 10) / 10])].sort((a, b) => a - b);
  const tolerance = 0.5;
  const next = direction > 0 ? stops.find((s) => s > percent + tolerance) : [...stops].reverse().find((s) => s < percent - tolerance);
  return clampPercent(next ?? (direction > 0 ? limits.maxPercent : limits.minPercent), limits);
}

/**
 * Keep at least `keep` screen px of the content on screen, so the sheet can't be panned out of
 * reach. When the content is smaller than the screen it can move freely within it.
 */
export function clampPan(viewport: Viewport, available: Size, content: Rect, keep = 80): Viewport {
  const left = content.x * viewport.scale + viewport.x;
  const top = content.y * viewport.scale + viewport.y;
  const width = content.width * viewport.scale;
  const height = content.height * viewport.scale;
  const keepX = Math.min(keep, width, available.width / 2);
  const keepY = Math.min(keep, height, available.height / 2);
  const dx = clampDelta(left, width, available.width, keepX);
  const dy = clampDelta(top, height, available.height, keepY);
  return dx === 0 && dy === 0 ? viewport : { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

function clampDelta(start: number, length: number, available: number, keep: number): number {
  const end = start + length;
  if (end < keep) return keep - end; // gone off the left/top
  if (start > available - keep) return available - keep - start; // gone off the right/bottom
  return 0;
}

/** Ctrl/⌘ + wheel and trackpad pinch: smooth zoom factor for a wheel delta. */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-pixels * 0.0025);
}

/**
 * Two-finger gesture: scale by the change in finger distance around their midpoint, and pan by
 * the midpoint's movement. `start` is the viewport when the second finger touched down.
 */
export function pinchViewport(start: Viewport, from: [Point, Point], to: [Point, Point], clampScale: (scale: number) => number): Viewport {
  const distance = (p: [Point, Point]) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) || 1;
  const mid = (p: [Point, Point]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
  const scale = clampScale(start.scale * (distance(to) / distance(from)));
  const fromMid = mid(from);
  const toMid = mid(to);
  const zoomed = zoomAround(start, scale, fromMid);
  return { ...zoomed, x: zoomed.x + (toMid.x - fromMid.x), y: zoomed.y + (toMid.y - fromMid.y) };
}

/** Design-space rectangle in screen px. */
export function toScreenRect(viewport: Viewport, rect: Rect): Rect {
  return { x: rect.x * viewport.scale + viewport.x, y: rect.y * viewport.scale + viewport.y, width: rect.width * viewport.scale, height: rect.height * viewport.scale };
}

/** "100%", "12%", "3.5%" — whole numbers except for very small zooms. */
export function formatZoom(percent: number): string {
  return percent < 10 ? `${Math.round(percent * 10) / 10}%` : `${Math.round(percent)}%`;
}
