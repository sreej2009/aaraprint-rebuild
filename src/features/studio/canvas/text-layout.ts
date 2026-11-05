import { fontsVersion } from '../assets/fonts';
import type { DesignDocument, SurfaceDesign, TextElement } from '../schema/types';

/**
 * Text box height follows the text (Plan §18.3): it's derived from the content, font, size,
 * weight, line height, letter spacing and box width, and stored in the document so selection,
 * picking, placement warnings and rotation all use the real box.
 *
 * The measurement itself is Konva's (canvas/konva-text-measure.ts), registered when the canvas
 * code loads, so this module stays free of Konva. The Studio store re-measures every text element
 * a command changes, inside the same undo step; when a web font finishes loading, the whole
 * design is re-measured (`relayoutDocument`).
 */

/** Height in print px of a text element's laid-out lines. */
export type TextMeasurer = (element: TextElement) => number;

let registered: TextMeasurer | null = null;
const listeners = new Set<() => void>();

/** Called by the canvas module once Konva has loaded. */
export function registerTextMeasurer(measure: TextMeasurer | null): void {
  if (registered === measure) return;
  registered = measure;
  for (const listener of listeners) listener();
}

export function textMeasurer(): TextMeasurer | null {
  return registered;
}

export function subscribeTextMeasurer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fields that change how text wraps and how tall it is. Colour, alignment and decoration don't. */
const LAYOUT_FIELDS = ['text', 'fontFamily', 'fontSize', 'fontWeight', 'italic', 'lineHeight', 'letterSpacing', 'width'] as const;

function layoutChanged(a: TextElement, b: TextElement): boolean {
  return LAYOUT_FIELDS.some((key) => a[key] !== b[key]);
}

const round2 = (value: number) => Math.round(value * 100) / 100 || 0;

// Measurements per element object; cleared whenever a font finishes loading.
let cache = new WeakMap<TextElement, number>();
let cacheVersion = -1;

export function measuredHeight(element: TextElement, measure: TextMeasurer): number {
  const version = fontsVersion();
  if (version !== cacheVersion) {
    cache = new WeakMap();
    cacheVersion = version;
  }
  let height = cache.get(element);
  if (height === undefined) {
    const raw = measure(element);
    // Never zero (an empty box still holds one line), never NaN.
    height = round2(Number.isFinite(raw) && raw > 0 ? raw : element.fontSize * element.lineHeight);
    cache.set(element, height);
  }
  return height;
}

/**
 * The element with a new height, keeping its top edge where it is on the page — also when it's
 * rotated (the box turns around its centre, which moves when the height changes).
 */
export function withTextHeight(element: TextElement, height: number): TextElement {
  const dh = height - element.height;
  if (Math.abs(dh) < 0.005) return element;
  const a = (element.rotation * Math.PI) / 180;
  return {
    ...element,
    height: round2(height),
    x: element.rotation ? round2(element.x - (Math.sin(a) * dh) / 2) : element.x,
    y: element.rotation ? round2(element.y - ((1 - Math.cos(a)) * dh) / 2) : element.y,
  };
}

function layoutSurface(previous: SurfaceDesign | undefined, surface: SurfaceDesign, measure: TextMeasurer, all: boolean): SurfaceDesign {
  const before = new Map(previous?.elements.map((e) => [e.id, e]));
  let changed = false;
  const elements = surface.elements.map((element) => {
    if (element.type !== 'text') return element;
    const old = before.get(element.id);
    if (!all && old === element) return element;
    if (!all && old?.type === 'text' && !layoutChanged(old, element)) return element;
    const next = withTextHeight(element, measuredHeight(element, measure));
    if (next !== element) changed = true;
    return next;
  });
  return changed ? { ...surface, elements } : surface;
}

/**
 * Re-measure the text elements a change added or re-flowed (by comparing `next` with `previous`).
 * Unchanged surfaces and elements keep their identity; returns `next` itself when no height moved.
 */
export function layoutChanges(previous: DesignDocument, next: DesignDocument, measure: TextMeasurer): DesignDocument {
  let changed = false;
  const surfaces = next.surfaces.map((surface) => {
    const old = previous.surfaces.find((s) => s.id === surface.id);
    if (old === surface) return surface;
    const laid = layoutSurface(old, surface, measure, false);
    if (laid !== surface) changed = true;
    return laid;
  });
  return changed ? { ...next, surfaces } : next;
}

/** Re-measure every text element (after a font loads, or when the measurer first arrives). */
export function relayoutDocument(document: DesignDocument, measure: TextMeasurer): DesignDocument {
  let changed = false;
  const surfaces = document.surfaces.map((surface) => {
    const laid = layoutSurface(undefined, surface, measure, true);
    if (laid !== surface) changed = true;
    return laid;
  });
  return changed ? { ...document, surfaces } : document;
}
