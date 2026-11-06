import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { SaveController, SaveState } from './save-controller';

/** The design's save controller (null while it starts, and outside the Studio). */
export const SaveControllerContext = createContext<SaveController | null>(null);

export function useSaveController(): SaveController | null {
  return useContext(SaveControllerContext);
}

const IDLE: SaveState = { status: 'idle', lastSavedAt: null, message: null, persisted: false, versions: [], savedFingerprint: null };
const placeholder = { getState: () => IDLE, subscribe: () => () => {}, getInitialState: () => IDLE, setState: () => {} } as unknown as SaveController['state'];

export function useSaveState<T>(selector: (state: SaveState) => T): T {
  return useStore(useSaveController()?.state ?? placeholder, selector);
}
