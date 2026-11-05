import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Handle } from '../geometry/transform';

/**
 * What the pointer is doing to an element right now. Session state only: never saved, never
 * undone. The design itself changes through the Studio store as the gesture runs.
 */
export interface Gesture {
  kind: 'move' | 'resize' | 'rotate';
  elementId: string;
  handle: Handle | null;
  /** Put the element back where the gesture started (Escape, a second finger landing). */
  cancel(): void;
}

export interface InteractionState {
  gesture: Gesture | null;
  /** A one-off message for screen readers ("This layer is locked"); `id` repeats identical ones. */
  notice: { text: string; id: number } | null;
  /** Inspector proportion lock per element, where someone changed it (see `ratioLocked`). */
  ratioLocks: Readonly<Record<string, boolean>>;
  actions: {
    setGesture(gesture: Gesture | null): void;
    notify(text: string): void;
    setRatioLock(elementId: string, locked: boolean): void;
  };
}

export type InteractionStore = StoreApi<InteractionState>;

export function createInteractionStore(): InteractionStore {
  return createStore<InteractionState>()((set) => ({
    gesture: null,
    notice: null,
    ratioLocks: {},
    actions: {
      setGesture(gesture) {
        set({ gesture });
      },
      notify(text) {
        set((state) => ({ notice: { text, id: (state.notice?.id ?? 0) + 1 } }));
      },
      setRatioLock(elementId, locked) {
        set((state) => ({ ratioLocks: { ...state.ratioLocks, [elementId]: locked } }));
      },
    },
  }));
}

export const InteractionStoreContext = createContext<InteractionStore | null>(null);

export function useInteractionStoreApi(): InteractionStore {
  const store = useContext(InteractionStoreContext);
  if (!store) throw new Error('Canvas components must be rendered inside the Studio.');
  return store;
}

export function useInteraction<T>(selector: (state: InteractionState) => T): T {
  return useStore(useInteractionStoreApi(), selector);
}
