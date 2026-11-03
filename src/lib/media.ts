/**
 * Media refs are paths relative to the media root, e.g.
 *   "products/pens-2d/classic-front.png"                      (Studio mockup)
 *   "product-media/visiting-cards/business-card-classic/1.jpg" (product photo)
 *   "models/polo-shirt.glb"                                    (3D model)
 * In development they are served from the recovered folders by tooling/local-media.ts;
 * in production from object storage / a CDN configured with VITE_MEDIA_BASE_URL.
 */
const MEDIA_BASE = (import.meta.env.VITE_MEDIA_BASE_URL ?? '/media').replace(/\/+$/, '');

export function mediaUrl(ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  return `${MEDIA_BASE}/${ref.replace(/^\/+/, '')}`;
}
