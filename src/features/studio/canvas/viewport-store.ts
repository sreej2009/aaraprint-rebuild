import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Point, Rect } from '../geometry/boxes';
import { workspacePadding, type Size } from '../geometry/fit';
import {
  centreOn,
  clampPan,
  clampPercent,
  fitViewport,
  scaleForPercent,
  stepPercent,
  zoomAround,
  zoomLimits,
  zoomPercent,
  type Viewport,
  type ZoomLimits,
} from '../geometry/viewport';

/**
 * Canvas view state: zoom, pan and guides. Kept apart from the Studio store because it changes on
 * every pointer move and is never part of the design or its undo history.
 *
 * `mode: 'fit'` keeps the sheet fitted as the window or panels resize; any manual zoom or pan
 * switches to `manual`, which keeps the point at the centre of the screen fixed on resize.
 *
 * Each side keeps its own view (M10): switching sides remembers where the one you leave was
 * zoomed and panned, and comes back to it. Views are session state, never part of the design.
 */
export interface ViewportState {
  /** Screen px available to the stage. */
  area: Size;
  /** The active side's bleed box in design px (what "fit" shows). */
  content: Rect | null;
  dpi: number;
  mode: 'fit' | 'manual';
  viewport: Viewport;
  showGuides: boolean;
  /** The side on screen, and the views of the others, as they were left. */
  surfaceId: string | null;
  saved: Readonly<Record<string, SavedView>>;
  actions: ViewportActions;
}

export interface SavedView {
  viewport: Viewport;
  mode: 'fit' | 'manual';
  area: Size;
  content: Rect;
  dpi: number;
}

export interface ViewportActions {
  setArea(area: Size): void;
  /** New side or product geometry. Re-fits when the content box changes. */
  setContent(content: Rect, dpi: number): void;
  /**
   * Show a side: remembers the current side's view, then restores the new side's (if it was
   * zoomed or panned and has the same geometry) or fits it.
   */
  showSurface(surfaceId: string, content: Rect, dpi: number): void;
  fit(): void;
  /** Zoom to a percentage of real size, around `anchor` (screen px; default: centre). */
  zoomTo(percent: number, anchor?: Point): void;
  zoomBy(factor: number, anchor?: Point): void;
  zoomStep(direction: 1 | -1): void;
  /** 100 % — real printed size. */
  actualSize(): void;
  panBy(dx: number, dy: number): void;
  /** Set directly (pinch gestures); clamped. */
  setViewport(viewport: Viewport): void;
  setShowGuides(show: boolean): void;
}

export type ViewportStore = StoreApi<ViewportState>;

const GUIDES_KEY = 'aaraprint:studio:guides';

function readGuidesPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(GUIDES_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeGuidesPreference(show: boolean): void {
  try {
    globalThis.localStorage?.setItem(GUIDES_KEY, show ? 'on' : 'off');
  } catch {
    /* private mode: keep the setting for this session only */
  }
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function fitScaleFor(state: Pick<ViewportState, 'area' | 'content'>): number {
  if (!state.content) return 0;
  return fitViewport(state.area, state.content, workspacePadding(state.area.width)).scale;
}

export function percentOf(state: Pick<ViewportState, 'viewport' | 'dpi'>): number {
  return zoomPercent(state.viewport.scale, state.dpi);
}

export function limitsOf(state: Pick<ViewportState, 'area' | 'content' | 'dpi'>): ZoomLimits {
  return zoomLimits(zoomPercent(fitScaleFor(state), state.dpi));
}

export function createViewportStore(initial: { showGuides?: boolean } = {}): ViewportStore {
  return createStore<ViewportState>()((set, get) => {
    const fitted = (area: Size, content: Rect): Viewport => fitViewport(area, content, workspacePadding(area.width));
    const ready = () => {
      const s = get();
      return s.content && s.area.width > 0 && s.area.height > 0 ? s.content : null;
    };
    const centre = (): Point => ({ x: get().area.width / 2, y: get().area.height / 2 });
    const apply = (viewport: Viewport) => {
      const content = ready();
      if (!content) return;
      set({ viewport: clampPan(viewport, get().area, content), mode: 'manual' });
    };

    const actions: ViewportActions = {
      setArea(area) {
        const state = get();
        if (state.area.width === area.width && state.area.height === area.height) return;
        if (!state.content || area.width <= 0 || area.height <= 0) {
          set({ area });
          return;
        }
        if (state.mode === 'fit' || state.area.width === 0) {
          set({ area, viewport: fitted(area, state.content), mode: 'fit' });
          return;
        }
        // Keep the design point at the old centre in the new centre.
        const oldCentre = { x: state.area.width / 2, y: state.area.height / 2 };
        const shifted = { ...state.viewport, x: state.viewport.x + area.width / 2 - oldCentre.x, y: state.viewport.y + area.height / 2 - oldCentre.y };
        set({ area, viewport: clampPan(shifted, area, state.content) });
      },

      setContent(content, dpi) {
        const state = get();
        const same = state.content && state.dpi === dpi && ['x', 'y', 'width', 'height'].every((k) => state.content![k as keyof Rect] === content[k as keyof Rect]);
        if (same) return;
        const hasArea = state.area.width > 0 && state.area.height > 0;
        set({ content, dpi, mode: 'fit', ...(hasArea ? { viewport: fitted(state.area, content) } : {}) });
      },

      showSurface(surfaceId, content, dpi) {
        const state = get();
        if (state.surfaceId === surfaceId) {
          actions.setContent(content, dpi);
          return;
        }
        const saved = { ...state.saved };
        if (state.surfaceId && state.content) saved[state.surfaceId] = { viewport: state.viewport, mode: state.mode, area: state.area, content: state.content, dpi: state.dpi };
        const view = saved[surfaceId];
        const hasArea = state.area.width > 0 && state.area.height > 0;
        const restorable = view && view.mode === 'manual' && view.dpi === dpi && sameRect(view.content, content) && view.area.width > 0;
        if (restorable && hasArea) {
          // The window may have resized meanwhile: keep the point that was at the centre there.
          const shifted = { ...view.viewport, x: view.viewport.x + (state.area.width - view.area.width) / 2, y: view.viewport.y + (state.area.height - view.area.height) / 2 };
          set({ surfaceId, saved, content, dpi, mode: 'manual', viewport: clampPan(shifted, state.area, content) });
          return;
        }
        set({ surfaceId, saved, content, dpi, mode: 'fit', ...(hasArea ? { viewport: fitted(state.area, content) } : {}) });
      },

      fit() {
        const content = ready();
        if (!content) return;
        set({ viewport: fitted(get().area, content), mode: 'fit' });
      },

      zoomTo(percent, anchor = centre()) {
        const state = get();
        if (!ready()) return;
        const scale = scaleForPercent(clampPercent(percent, limitsOf(state)), state.dpi);
        apply(zoomAround(state.viewport, scale, anchor));
      },

      zoomBy(factor, anchor) {
        actions.zoomTo(percentOf(get()) * factor, anchor);
      },

      zoomStep(direction) {
        const state = get();
        const fitPercent = zoomPercent(fitScaleFor(state), state.dpi);
        actions.zoomTo(stepPercent(percentOf(state), direction, fitPercent, limitsOf(state)));
      },

      actualSize() {
        const state = get();
        const content = ready();
        if (!content) return;
        const scale = scaleForPercent(clampPercent(100, limitsOf(state)), state.dpi);
        apply(centreOn(state.area, content, scale));
      },

      panBy(dx, dy) {
        const { viewport } = get();
        apply({ ...viewport, x: viewport.x + dx, y: viewport.y + dy });
      },

      setViewport(viewport) {
        apply(viewport);
      },

      setShowGuides(show) {
        writeGuidesPreference(show);
        set({ showGuides: show });
      },
    };

    return {
      area: { width: 0, height: 0 },
      content: null,
      dpi: 300,
      mode: 'fit',
      viewport: { scale: 1, x: 0, y: 0 },
      showGuides: initial.showGuides ?? readGuidesPreference(),
      surfaceId: null,
      saved: {},
      actions,
    };
  });
}
