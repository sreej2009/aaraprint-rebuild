import { finishedSizeMm } from '../geometry/boxes';
import { roundTo } from '../geometry/units';
import type { StudioFamily } from '../profile/types';
import type { SurfacePrint } from '../schema/types';
import { sameFinishedSize } from './apply';
import type { StudioTemplate } from './types';

/**
 * Whether a template suits the side being designed (Plan M13). Predictable rather than clever:
 * - **exact**: made for this product family, same trim shape and the same finished size (within
 *   1 mm). Applied as laid out: same millimetres, positions, proportions, rotations and order.
 * - **adapted**: same family and trim shape, proportions within 20 %. Applied scaled uniformly so
 *   its safe area fits this product's safe area (see apply.ts). The product's size never changes.
 * - **none**: another product family, another trim shape (round vs. rectangular) or very
 *   different proportions. Shown with the reason; it can't be applied.
 */

export type FitLevel = 'exact' | 'adapted' | 'none';

export interface TemplateFit {
  level: FitLevel;
  /** For people: "Fits this product", "Fitted to 85 × 55 mm", "Made for visiting cards". */
  label: string;
}

const ASPECT_TOLERANCE = 0.2;

const FAMILY_NAMES: Record<StudioFamily, string> = {
  'visiting-card': 'visiting cards',
  stationery: 'stationery',
  stamp: 'stamps',
  'sign-poster': 'flyers and signs',
  'label-packaging': 'labels and packaging',
  bag: 'bags',
  apparel: 'clothing',
  polo: 'polos',
  rainwear: 'rainwear',
  umbrella: 'umbrellas',
  gift: 'gifts',
  mug: 'mugs',
  drinkware: 'drinkware',
  pen: 'pens',
  'round-pad': 'round pads',
};

/** ["sign-poster", "stationery"] → "flyers and signs, stationery". */
export function familyNames(families: readonly StudioFamily[]): string {
  return families.map((f) => FAMILY_NAMES[f]).join(', ');
}

const isRound = (print: SurfacePrint) => print.trim.shape === 'ellipse';
const sizeLabel = (print: SurfacePrint) => {
  const { width, height } = finishedSizeMm(print);
  return `${roundTo(width, 1)} × ${roundTo(height, 1)} mm`;
};

export function templateFit(template: StudioTemplate, family: StudioFamily, target: SurfacePrint): TemplateFit {
  const source = template.surfaces.front.print;
  if (!template.families.includes(family)) return { level: 'none', label: `Made for ${familyNames(template.families)}` };
  if (isRound(source) !== isRound(target)) return { level: 'none', label: isRound(source) ? 'Made for round products' : 'Made for products with straight edges' };
  const from = finishedSizeMm(source);
  const to = finishedSizeMm(target);
  const aspect = to.width / to.height / (from.width / from.height);
  if (Math.abs(Math.log(aspect)) > Math.log(1 + ASPECT_TOLERANCE)) return { level: 'none', label: `Made for a different shape (${sizeLabel(source)})` };
  if (sameFinishedSize(source, target)) return { level: 'exact', label: 'Fits this product' };
  return { level: 'adapted', label: `Fitted to ${sizeLabel(target)}` };
}
