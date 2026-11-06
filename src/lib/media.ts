/**
 * Media refs are paths relative to the media root, e.g.
 *   "products/pens-2d/classic-front.png"                      (Studio mockup)
 *   "product-media/visiting-cards/business-card-classic/1.jpg" (product photo)
 *   "models/polo-shirt.glb"                                    (3D model)
 * In development they are served from the recovered folders by tooling/local-media.ts;
 * in production from object storage / a CDN configured with VITE_MEDIA_BASE_URL.
 */
const MEDIA_BASE = (import.meta.env.VITE_MEDIA_BASE_URL ?? '/media').replace(/\/+$/, '');

/**
 * False when the site is published without the media library (`VITE_MEDIA_BASE_URL=none`, as on
 * the GitHub Pages preview, which can't host the recovered files): only external images (stock
 * photos) can be shown then, and everything else falls back to its placeholder.
 */
export const MEDIA_AVAILABLE = MEDIA_BASE !== 'none';

export function hasMedia(ref: string): boolean {
  return MEDIA_AVAILABLE || /^https?:\/\//i.test(ref);
}

export function mediaUrl(ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  return `${MEDIA_BASE}/${ref.replace(/^\/+/, '')}`;
}
