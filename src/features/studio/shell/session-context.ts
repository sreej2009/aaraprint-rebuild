import { createContext, useContext } from 'react';
import type { ResolvedPrice } from '@/features/product-workflow/pricing';
import type { Product, Variant } from '@/lib/catalogue/types';
import type { StudioWorkspace } from '../workspace/workspace';
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
  /** Leave this design (it stays saved) and start a new blank one (M11). */
  startNewDesign?: () => void;
  /** The workspace for this design's product family (M4); absent in tests that don't need it. */
  workspace?: StudioWorkspace;
  /** The design's price (M1 resolver: variant with tier + Studio adjustments). */
  price?: ResolvedPrice;
}

export const StudioSessionContext = createContext<StudioSession | null>(null);

export function useStudioSession(): StudioSession {
  const session = useContext(StudioSessionContext);
  if (!session) throw new Error('useStudioSession must be used inside the Studio.');
  return session;
}

/** The unit price the design is ordered at (variant with any Studio adjustments), or null. */
export function unitPriceCents(price: ResolvedPrice | undefined, fallback: number | null): number | null {
  if (!price) return fallback;
  return price.status === 'priced' ? price.unitPriceCents : null;
}
