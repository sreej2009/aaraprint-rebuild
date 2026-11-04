import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Product } from '@/lib/catalogue/types';
import { describePrint } from '../profile/describe';
import type { StudioProfile } from '../profile/types';
import { createBlankDesign } from '../schema/create';
import { createStudioStore, selectActiveSurfaceId, StudioProvider, useStudio } from '../store';
import { StudioSessionContext, type StudioSession } from './session-context';
import { StudioShell } from './studio-shell';
import type { ToolId } from './tools';
import { StudioUiProvider } from './ui-provider';
import { resolveStudioVariant, variantSummary } from './variant';

export interface StudioAppProps {
  product: Product;
  profile: StudioProfile;
  variantId: string | null;
  initialSurface: string | null;
  initialTool: ToolId | null;
}

/**
 * One editing session: creates the Studio store for this product and provides it, with the
 * product facts and editor chrome state, to the shell. Remount (key by product) to start over.
 * Until local drafts arrive (M11) every visit starts from a blank design.
 */
export function StudioApp({ product, profile, variantId, initialSurface, initialTool }: StudioAppProps) {
  const [store] = useState(() =>
    createStudioStore({
      document: createBlankDesign(profile, { variantId: resolveStudioVariant(product, variantId)?.id ?? null }),
      ...(initialSurface ? { surfaceId: initialSurface } : {}),
    }),
  );
  const session = useMemo<StudioSession>(() => {
    const variant = resolveStudioVariant(product, variantId);
    const params = new URLSearchParams(variant ? { variantId: variant.id } : {});
    return {
      product,
      profile,
      variant,
      variantLabel: variantSummary(product, variant),
      print: describePrint(profile),
      productHref: `/products/${product.slug}${params.size ? `?${params}` : ''}`,
    };
  }, [product, profile, variantId]);

  return (
    <StudioProvider store={store}>
      <StudioSessionContext.Provider value={session}>
        <StudioUiProvider initialTool={initialTool}>
          <SideInUrl />
          <StudioShell />
        </StudioUiProvider>
      </StudioSessionContext.Provider>
    </StudioProvider>
  );
}

/** Keeps `?side=` in step with the active side (also after undo/redo), so links and reloads reopen it. */
function SideInUrl() {
  const active = useStudio(selectActiveSurfaceId);
  const first = useStudio((s) => s.document.surfaces[0]?.id);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const wanted = active === first ? null : active;
    if (params.get('side') === wanted) return;
    const next = new URLSearchParams(params);
    if (wanted) next.set('side', wanted);
    else next.delete('side');
    setParams(next, { replace: true, preventScrollReset: true });
  }, [active, first, params, setParams]);
  return null;
}
