import type { ReactNode } from 'react';
import { StudioStoreContext } from './context';
import type { StudioStore } from './create-store';

/** Makes one Studio session's store available to the editor. Create the store per product. */
export function StudioProvider({ store, children }: { store: StudioStore; children: ReactNode }) {
  return <StudioStoreContext.Provider value={store}>{children}</StudioStoreContext.Provider>;
}
