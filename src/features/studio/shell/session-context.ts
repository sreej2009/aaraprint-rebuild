import { createContext, useContext } from 'react';
import type { Product, Variant } from '@/lib/catalogue/types';
import type { PrintDescription } from '../profile/describe';
import type { StudioProfile } from '../profile/types';

/** Read-only facts about what's being designed, shared by every Studio component. */
export interface StudioSession {
  product: Product;
  profile: StudioProfile;
  variant: Variant | undefined;
  /** "500 cards · Full Colour" */
  variantLabel: string;
  print: PrintDescription;
  /** Link back to the product page with the same options. */
  productHref: string;
}

export const StudioSessionContext = createContext<StudioSession | null>(null);

export function useStudioSession(): StudioSession {
  const session = useContext(StudioSessionContext);
  if (!session) throw new Error('useStudioSession must be used inside the Studio.');
  return session;
}
