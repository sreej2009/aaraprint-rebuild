import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during pre-rendering and the hydration render, true afterwards. Use it to apply
 * URL state (filters, ?variantId=) that the pre-rendered HTML could not know about,
 * without causing a hydration mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
