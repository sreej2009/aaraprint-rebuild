import { useSyncExternalStore } from 'react';

/**
 * Studio layouts (Blueprint §11.1, §13.2–13.4):
 * - phone   < 768 px    top bar, full-screen canvas, bottom toolbar, tools in bottom sheets
 * - tablet  768–1023    tool rail, panel overlays the canvas, inspector in a drawer
 * - laptop  1024–1279   tool rail + docked panel, inspector in a drawer
 * - desktop ≥ 1280      rail + panel + workspace + docked inspector
 */
export type StudioLayout = 'phone' | 'tablet' | 'laptop' | 'desktop';

export const LAYOUT_QUERIES = {
  tablet: '(min-width: 768px)',
  laptop: '(min-width: 1024px)',
  desktop: '(min-width: 1280px)',
} as const;

function currentLayout(): StudioLayout {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
  if (window.matchMedia(LAYOUT_QUERIES.desktop).matches) return 'desktop';
  if (window.matchMedia(LAYOUT_QUERIES.laptop).matches) return 'laptop';
  if (window.matchMedia(LAYOUT_QUERIES.tablet).matches) return 'tablet';
  return 'phone';
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const lists = Object.values(LAYOUT_QUERIES).map((q) => window.matchMedia(q));
  for (const list of lists) list.addEventListener('change', onChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}

export function useStudioLayout(): StudioLayout {
  return useSyncExternalStore(subscribe, currentLayout, () => 'desktop');
}
