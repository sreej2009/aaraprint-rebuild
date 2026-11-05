import { resizeSurface } from '../commands';
import type { DesignDocument } from '../schema/types';
import { demoDesign } from './demo-design';

/**
 * The demo card's artwork fitted onto a product's own sides, for `/products/:slug/design?sample=1`.
 * A preview aid until the shape and graphics tools (M9) and templates (M14) can add content (text
 * can be added since M8): it lets every product's canvas be tried with real elements. The product, print geometry, name and
 * ids of the blank design are kept; only the first two sides receive artwork.
 */
export function sampleDesignFor(blank: DesignDocument): DesignDocument {
  const demo = demoDesign();
  const surfaces = blank.surfaces.map((surface, index) => {
    const source = demo.surfaces[index];
    if (!source) return surface;
    const fitted = resizeSurface({ ...demo, surfaces: [source] }, source.id, surface.print, 'fit').surfaces[0]!;
    return { ...surface, background: { ...fitted.background }, elements: fitted.elements };
  });
  return { ...blank, assets: { ...demo.assets }, surfaces };
}
