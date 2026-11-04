import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { StudioState, StudioStore } from './create-store';

export const StudioStoreContext = createContext<StudioStore | null>(null);

export function useStudioStoreApi(): StudioStore {
  const store = useContext(StudioStoreContext);
  if (!store) throw new Error('Studio components must be rendered inside <StudioProvider>.');
  return store;
}

/** Subscribe to a slice of the Studio state. */
export function useStudio<T>(selector: (state: StudioState) => T): T {
  return useStore(useStudioStoreApi(), selector);
}

/** Stable action functions; never cause a re-render. */
export function useStudioActions(): StudioState['actions'] {
  return useStore(useStudioStoreApi(), (s) => s.actions);
}
