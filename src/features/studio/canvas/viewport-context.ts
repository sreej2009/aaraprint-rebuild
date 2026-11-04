import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { ViewportState, ViewportStore } from './viewport-store';

export const ViewportStoreContext = createContext<ViewportStore | null>(null);

export function useViewportStoreApi(): ViewportStore {
  const store = useContext(ViewportStoreContext);
  if (!store) throw new Error('Canvas components must be rendered inside the Studio.');
  return store;
}

export function useViewport<T>(selector: (state: ViewportState) => T): T {
  return useStore(useViewportStoreApi(), selector);
}
