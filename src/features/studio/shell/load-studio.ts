import { catalogueApi, type CatalogueApi } from '@/lib/api/catalogue';
import type { Product } from '@/lib/catalogue/types';
import { studioApi, type StudioApi } from '../profile/api';
import type { StudioProfile } from '../profile/types';
import { fixturesRequested, withProductViewFixtures } from '../product-view/dev-fixtures';
import { isToolId, type ToolId } from './tools';
import { resolveStudioVariant } from './variant';

export type StudioLoad =
  | { status: 'not-found' }
  | { status: 'unsupported'; productName: string; productHref: string }
  | {
      status: 'ready';
      product: Product;
      profile: StudioProfile;
      variantId: string | null;
      initialSurface: string | null;
      initialTool: ToolId | null;
      /** `?sample=1`: start from the sample card instead of a blank design (preview aid, M6). */
      sample: boolean;
      /** `?design=`: continue this design saved in the browser (M11). */
      designId: string | null;
    };

/**
 * Everything the Studio route needs, from `/products/:slug/design?variantId=&side=&mode=&tool=&sample=`.
 * - Unknown products → not-found (404).
 * - Products without a Studio profile (printed as shown) → unsupported.
 * - Unknown variant / side / tool values fall back to defaults instead of failing.
 * Network and server errors propagate to the route's error boundary.
 */
export async function loadStudio(slug: string, url: URL, apis: { catalogue: CatalogueApi; studio: StudioApi } = { catalogue: catalogueApi, studio: studioApi }, signal?: AbortSignal): Promise<StudioLoad> {
  const [product, profile] = await Promise.all([apis.catalogue.getProduct(slug, signal), apis.studio.getProfile(slug, signal)]);
  if (!product) return { status: 'not-found' };
  if (!product.isCustomizable || !profile) {
    return { status: 'unsupported', productName: product.name, productHref: `/products/${product.slug}` };
  }
  const params = url.searchParams;
  // Development only: stand-in product photos on request (product-view/dev-fixtures.ts). Production
  // builds drop this branch, so real profiles are always used there.
  const shown = import.meta.env.DEV && fixturesRequested(url, sessionStore()) ? withProductViewFixtures(profile) : profile;
  const variant = resolveStudioVariant(product, params.get('variantId'));
  const side = params.get('side');
  const tool = params.get('tool');
  return {
    status: 'ready',
    product,
    profile: shown,
    variantId: variant?.id ?? null,
    initialSurface: profile.sides.some((s) => s.id === side) ? side : null,
    // The product page's "Upload your design" button links here with ?mode=upload.
    initialTool: params.get('mode') === 'upload' ? 'uploads' : isToolId(tool) ? tool : null,
    sample: params.get('sample') === '1',
    designId: /^[A-Za-z0-9_-]{1,80}$/.test(params.get('design') ?? '') ? params.get('design') : null,
  };
}

function sessionStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
