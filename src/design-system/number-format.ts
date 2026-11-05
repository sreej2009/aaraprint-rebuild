/** Number text for NumberField: parsing what people type and showing values without noise. */

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor || 0; // never -0
}

/** One decimal by default, no trailing ".0", never "-0". */
export function formatNumber(value: number, decimals = 1): string {
  return String(roundTo(value, decimals));
}

/** Accepts "12.5", "12,5", " 12.5 mm", "-3", "45°", "80 %", "1.2×", "0.05 em", "−0.1" (minus sign). */
export function parseNumber(text: string): number | null {
  const cleaned = text
    .trim()
    .replace(',', '.')
    .replace(/^−/, '-')
    .replace(/\s*(mm|cm|°|deg|%|pt|px|em|×|x)$/i, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}
