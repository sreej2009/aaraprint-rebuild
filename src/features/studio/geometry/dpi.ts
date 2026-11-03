/**
 * Effective resolution of an image placed on the design: how many source pixels land on each
 * printed inch. Element size is in design px (print px at `productDpi`). Uses the weaker axis,
 * so a stretched image reports its worst direction.
 */
export function effectiveDpi(
  source: { width: number; height: number },
  element: { width: number; height: number },
  productDpi: number,
): number {
  if (element.width <= 0 || element.height <= 0) return 0;
  return Math.min(source.width / element.width, source.height / element.height) * productDpi;
}

/** Warning below 75 % of the product DPI; "may look blurry" below 40 % (Blueprint §11.7). */
export const DPI_THRESHOLDS = { low: 0.75, poor: 0.4 } as const;

export type DpiQuality = 'good' | 'low' | 'poor';

export function dpiQuality(effective: number, productDpi: number): DpiQuality {
  const ratio = effective / productDpi;
  if (ratio < DPI_THRESHOLDS.poor) return 'poor';
  if (ratio < DPI_THRESHOLDS.low) return 'low';
  return 'good';
}
