import { roundTo } from '../geometry/units';

/** Inspector number fields: one decimal, never "-0". */
export function formatNumber(value: number): string {
  const rounded = roundTo(value, 1);
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Accepts "12.5", "12,5" and " 12.5 mm". */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(',', '.').replace(/\s*(mm|°|deg)$/i, '');
  if (!/^-?\d*\.?\d+$/.test(cleaned) && !/^-?\d+\.?$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}
