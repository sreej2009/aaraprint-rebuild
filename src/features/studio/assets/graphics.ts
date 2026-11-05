import { useSyncExternalStore } from 'react';
import { ApiError, getJson } from '@/lib/api/http';
import { DUPLICATE_OFFSET_MM } from '../canvas/transform-rules';
import { printBoxes } from '../geometry/boxes';
import { mmToPx } from '../geometry/units';
import { canUseAsset, type RightsStatus } from '../profile/types';
import type { DesignElement, SurfacePrint } from '../schema/types';

/**
 * The Studio graphics library (Plan §18.5, decision D5): ready-made artwork customers can place.
 * Built by scripts/studio/extract-graphics.mjs into the mock API; only graphics whose usage rights
 * are confirmed are in it. Designs refer to a graphic by id; the artwork is a static SVG file
 * drawn as an image, never embedded in the document.
 */

export const GRAPHIC_GROUPS = ['Backgrounds', 'Icons', 'Illustrations', 'Badges'] as const;
export type GraphicGroup = (typeof GRAPHIC_GROUPS)[number];

export interface GraphicEntry {
  id: string;
  name: string;
  group: GraphicGroup;
  tags: string[];
  /** Natural size of the artwork (its proportions). */
  width: number;
  height: number;
  url: string;
  rights: RightsStatus;
  attribution?: string;
}

export interface GraphicsLibrary {
  graphics: GraphicEntry[];
  /** Graphics held back until their rights are confirmed. */
  withheld: number;
}

export type LibraryState = { status: 'loading' } | { status: 'ready'; library: GraphicsLibrary } | { status: 'error' };

const EMPTY: GraphicsLibrary = { graphics: [], withheld: 0 };

/** Only graphics that may be used, however the file was produced. */
export function usableLibrary(raw: GraphicsLibrary): GraphicsLibrary {
  const graphics = (raw.graphics ?? []).filter((g) => canUseAsset(g.rights) && /^[a-z0-9-]{1,60}$/.test(g.id) && g.width > 0 && g.height > 0);
  return { graphics, withheld: (raw.withheld ?? 0) + (raw.graphics?.length ?? 0) - graphics.length };
}

let state: LibraryState = { status: 'loading' };
let started = false;
const listeners = new Set<() => void>();

function setState(next: LibraryState) {
  state = next;
  for (const listener of listeners) listener();
}

const base = () => (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '');

/** Load the library once per page; `retry` after a failure. */
export function loadGraphicsLibrary(options: { retry?: boolean } = {}): void {
  if (started && !(options.retry && state.status === 'error')) return;
  started = true;
  setState({ status: 'loading' });
  getJson<GraphicsLibrary>(`${base()}/graphics.json`)
    .then((raw) => setState({ status: 'ready', library: usableLibrary(raw) }))
    .catch((error: unknown) => setState(error instanceof ApiError && error.status === 404 ? { status: 'ready', library: EMPTY } : { status: 'error' }));
}

export function useGraphicsLibrary(): LibraryState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      loadGraphicsLibrary();
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

/** The usable library entry for a graphic id, if the library has loaded and has it. */
export function graphicById(library: LibraryState, id: string): GraphicEntry | null {
  return library.status === 'ready' ? (library.library.graphics.find((g) => g.id === id) ?? null) : null;
}

/** Local search by name, group and tags; every word must match. */
export function searchGraphics(graphics: readonly GraphicEntry[], query: string): GraphicEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...graphics];
  return graphics.filter((g) => {
    const haystack = [g.name, g.group, ...g.tags].join(' ').toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/**
 * Where a new graphic goes: 30 % of the trim width (Plan §18.5), in its own proportions, shrunk to
 * fit the safe area if needed, centred in it — stepping down and right past one already there.
 */
export function graphicBox(entry: Pick<GraphicEntry, 'width' | 'height'>, print: SurfacePrint, existing: readonly DesignElement[] = []) {
  const { safe } = printBoxes(print);
  const ratio = entry.width / entry.height;
  let width = print.widthPx * 0.3;
  let height = width / ratio;
  const fit = Math.min(1, safe.width / width, safe.height / height);
  width *= fit;
  height *= fit;
  const round = (v: number) => Math.round(v * 100) / 100 || 0;
  const x = safe.x + (safe.width - width) / 2;
  const y = safe.y + (safe.height - height) / 2;
  const step = mmToPx(DUPLICATE_OFFSET_MM, print.dpi);
  let offset = 0;
  for (let i = 0; i < 20 && existing.some((e) => Math.abs(e.x - (x + offset)) < 0.5 && Math.abs(e.y - (y + offset)) < 0.5); i += 1) offset += step;
  return { x: round(x + offset), y: round(y + offset), width: round(width), height: round(height) };
}

/** Tests only. */
export function setGraphicsLibraryForTests(next: LibraryState | null): void {
  started = next !== null;
  state = next ?? { status: 'loading' };
  for (const listener of listeners) listener();
}
