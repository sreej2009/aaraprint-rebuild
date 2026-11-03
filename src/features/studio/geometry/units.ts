/** Unit conversion for print geometry. Design units are print pixels at the product's DPI. */

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH;
}

export function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi;
}

/** Text sizes are shown to customers in points, like a word processor. */
export function pxToPt(px: number, dpi: number): number {
  return (px / dpi) * PT_PER_INCH;
}

export function ptToPx(pt: number, dpi: number): number {
  return (pt / PT_PER_INCH) * dpi;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** "88.9 mm", "3 mm" — one decimal, trailing ".0" dropped. */
export function formatMm(mm: number): string {
  return `${roundTo(mm, 1)} mm`;
}
