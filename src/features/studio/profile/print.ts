import { printBoxes, type PrintBoxes, type PrintGeometry } from '../geometry/boxes';
import type { TrimShape } from '../geometry/shapes';
import type { StudioProfile, StudioTrim } from './types';

export function printGeometry(profile: StudioProfile): PrintGeometry {
  const { widthPx, heightPx, dpi, bleedPx, safeZonePx } = profile.print;
  return { widthPx, heightPx, dpi, bleedPx, safeZonePx };
}

export function trimShapeOf(trim: StudioTrim): TrimShape {
  if (trim.shape === 'ellipse') return { kind: 'ellipse' };
  if (trim.shape === 'rounded-rectangle') return { kind: 'rounded-rectangle', radius: trim.cornerRadiusPx };
  return { kind: 'rectangle' };
}

export function profileBoxes(profile: StudioProfile): PrintBoxes {
  return printBoxes(printGeometry(profile));
}
