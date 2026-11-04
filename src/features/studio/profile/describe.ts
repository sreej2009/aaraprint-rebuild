import { bleedSizeMm, finishedSizeMm } from '../geometry/boxes';
import { pxToMm, roundTo } from '../geometry/units';
import { printGeometry } from './print';
import type { StudioProfile, TrimShapeKind } from './types';

/** Keeps numbers and units together ("1.7 mm" never breaks across lines). */
const NBSP = String.fromCharCode(0xa0);

/**
 * Customer-facing print facts for a Studio profile: "88.9 × 50.8 mm". Matches the product page's
 * print specs (mm below 10 cm, cm above).
 */
export function formatLength(mm: number): string {
  if (mm >= 100) {
    const cm = roundTo(mm / 10, 1);
    return `${cm}${NBSP}cm`;
  }
  return `${roundTo(mm, 1)}${NBSP}mm`;
}

export function formatSize(width: number, height: number): string {
  const unit = Math.max(width, height) >= 100 ? 'cm' : 'mm';
  const value = (mm: number) => (unit === 'cm' ? roundTo(mm / 10, 1) : roundTo(mm, 1));
  return `${value(width)}${NBSP}×${NBSP}${value(height)}${NBSP}${unit}`;
}

const SHAPE_LABELS: Record<TrimShapeKind, string> = {
  rectangle: 'Rectangle',
  'rounded-rectangle': 'Rounded corners',
  ellipse: 'Round',
};

export interface PrintDescription {
  finishedSize: string;
  /** Artwork size including bleed, or null when the product has no bleed. */
  withBleed: string | null;
  bleed: string | null;
  safeZone: string | null;
  dpi: string;
  shape: string;
  /** e.g. "Front and back". */
  sides: string;
}

export function describePrint(profile: StudioProfile): PrintDescription {
  const spec = printGeometry(profile);
  const finished = finishedSizeMm(spec);
  const bleed = bleedSizeMm(spec);
  const labels = profile.sides.map((s) => s.label);
  return {
    finishedSize: formatSize(finished.width, finished.height),
    withBleed: spec.bleedPx > 0 ? formatSize(bleed.width, bleed.height) : null,
    bleed: spec.bleedPx > 0 ? formatLength(pxToMm(spec.bleedPx, spec.dpi)) : null,
    safeZone: spec.safeZonePx > 0 ? formatLength(pxToMm(spec.safeZonePx, spec.dpi)) : null,
    dpi: `${spec.dpi}${NBSP}DPI`,
    shape: SHAPE_LABELS[profile.trim.shape],
    sides: labels.length === 2 ? `${labels[0]} and ${labels[1]?.toLowerCase()}` : labels.join(', '),
  };
}
