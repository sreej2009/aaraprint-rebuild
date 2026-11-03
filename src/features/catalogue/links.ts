export function productHref(slug: string): string {
  return `/products/${slug}`;
}

export function designHref(slug: string, variantId: string | undefined, mode?: 'upload'): string {
  const params = new URLSearchParams();
  if (variantId) params.set('variantId', variantId);
  if (mode) params.set('mode', mode);
  const qs = params.toString();
  return `/products/${slug}/design${qs ? `?${qs}` : ''}`;
}
