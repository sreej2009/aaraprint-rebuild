import { DUPLICATE_OFFSET_MM } from '../canvas/transform-rules';
import { printBoxes } from '../geometry/boxes';
import { mmToPx } from '../geometry/units';
import type { DesignAsset, DesignElement, ImageElement, SurfacePrint } from '../schema/types';

/**
 * Placing uploaded images and judging their print resolution (Plan M12).
 *
 * A raster file has pixels, not a print size. New images are sized as if printed at
 * `PLACEMENT_DPI` (150), but never wider than `PLACEMENT_MAX_SHARE` of the trim width and always
 * inside the safe area — so a small logo isn't blown up, and a camera photo doesn't cover the card.
 * The resolution shown later is the effective DPI at the size the customer chose.
 */

export const PLACEMENT_DPI = 150;
/** New images take at most this share of the trim width. */
export const PLACEMENT_MAX_SHARE = 0.35;
/** Effective DPI at or above: "Good". */
export const DPI_GOOD = 300;
/** At or above (below GOOD): "Acceptable"; below: "Low resolution". */
export const DPI_ACCEPTABLE = 150;

export type ResolutionLevel = 'good' | 'acceptable' | 'low';

export const RESOLUTION_LABELS: Record<ResolutionLevel, string> = { good: 'Good', acceptable: 'Acceptable', low: 'Low resolution' };

const round2 = (v: number) => Math.round(v * 100) / 100 || 0;

/** Where a new image goes: its pixels at 150 DPI, capped and fitted to the safe area, centred. */
export function imagePlacement(asset: Pick<DesignAsset, 'naturalWidth' | 'naturalHeight'>, print: SurfacePrint, existing: readonly DesignElement[] = []) {
  const { safe } = printBoxes(print);
  const ratio = asset.naturalWidth / asset.naturalHeight;
  let width = (asset.naturalWidth / PLACEMENT_DPI) * print.dpi;
  width = Math.min(width, print.widthPx * PLACEMENT_MAX_SHARE);
  let height = width / ratio;
  const fit = Math.min(1, safe.width / width, safe.height / height);
  width = Math.max(1, width * fit);
  height = Math.max(1, height * fit);
  const x = safe.x + (safe.width - width) / 2;
  const y = safe.y + (safe.height - height) / 2;
  const step = mmToPx(DUPLICATE_OFFSET_MM, print.dpi);
  let offset = 0;
  for (let i = 0; i < 20 && existing.some((e) => Math.abs(e.x - (x + offset)) < 0.5 && Math.abs(e.y - (y + offset)) < 0.5); i += 1) offset += step;
  return { x: round2(x + offset), y: round2(y + offset), width: round2(width), height: round2(height) };
}

/** Effective print DPI of an image at its size on the surface (the lower of width and height). */
export function effectiveDpi(element: Pick<ImageElement, 'width' | 'height'>, asset: Pick<DesignAsset, 'naturalWidth' | 'naturalHeight'>, print: Pick<SurfacePrint, 'dpi'>): number {
  const inchesWide = element.width / print.dpi;
  const inchesHigh = element.height / print.dpi;
  if (!(inchesWide > 0) || !(inchesHigh > 0)) return 0;
  return Math.round(Math.min(asset.naturalWidth / inchesWide, asset.naturalHeight / inchesHigh));
}

export function resolutionLevel(dpi: number): ResolutionLevel {
  if (dpi >= DPI_GOOD) return 'good';
  if (dpi >= DPI_ACCEPTABLE) return 'acceptable';
  return 'low';
}

/**
 * Replacing the file keeps the element where it is: same top-left corner, width, rotation and
 * everything else; the height follows the new image's proportions so it isn't stretched.
 */
export function replacementBox(element: Pick<ImageElement, 'width' | 'height'>, asset: Pick<DesignAsset, 'naturalWidth' | 'naturalHeight'>): { width: number; height: number } {
  return { width: element.width, height: round2(Math.max(0.01, element.width * (asset.naturalHeight / asset.naturalWidth))) };
}
