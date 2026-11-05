import { data, isRouteErrorResponse, useParams, type ShouldRevalidateFunctionArgs } from 'react-router';
import { loadStudio } from '@/features/studio/shell/load-studio';
import { StudioApp } from '@/features/studio/shell/studio-app';
import { StudioLoadError, StudioLoading, StudioNotFound, StudioUnsupported } from '@/features/studio/shell/studio-states';
import { seo } from '@/lib/seo';
import type { Route } from './+types/studio';

/**
 * Design Studio — `/products/:productSlug/design` (same URL as the original site).
 * Client-only: not pre-rendered, served by the SPA fallback; the editor needs the browser anyway.
 */
export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  const result = await loadStudio(params.productSlug, new URL(request.url), undefined, request.signal);
  if (result.status === 'not-found') throw data('Product not found', { status: 404 });
  return result;
}

/** Changing `?side=` or other query values never reloads the product or resets the editor. */
export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate;
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
  const name = loaderData?.status === 'ready' ? loaderData.product.name : loaderData?.status === 'unsupported' ? loaderData.productName : null;
  return seo({ title: name ? `Design your ${name}` : 'Design Studio', noindex: true });
};

export function HydrateFallback() {
  return <StudioLoading />;
}

export default function StudioRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.status === 'unsupported') return <StudioUnsupported productName={loaderData.productName} productHref={loaderData.productHref} />;
  const { product, profile, variantId, initialSurface, initialTool, sample } = loaderData;
  // A new product gets a fresh editing session.
  return <StudioApp key={product.slug} product={product} profile={profile} variantId={variantId} initialSurface={initialSurface} initialTool={initialTool} sample={sample} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { productSlug } = useParams();
  if (isRouteErrorResponse(error) && error.status === 404) return <StudioNotFound />;
  if (import.meta.env.DEV) console.error(error);
  return <StudioLoadError productHref={productSlug ? `/products/${productSlug}` : null} />;
}
