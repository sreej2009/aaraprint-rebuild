import type { StudioProfile } from '../profile/types';
import { surfacePrintFromProfile } from './create';
import type { DesignDocument, SurfacePrint } from './types';

export type ProfileMismatch =
  | { kind: 'print-changed'; surfaceId: string; saved: SurfacePrint; current: SurfacePrint }
  | { kind: 'surface-missing'; surfaceId: string }
  | { kind: 'surface-unknown'; surfaceId: string };

export function samePrint(a: SurfacePrint, b: SurfacePrint): boolean {
  return (
    a.widthPx === b.widthPx &&
    a.heightPx === b.heightPx &&
    a.dpi === b.dpi &&
    a.bleedPx === b.bleedPx &&
    a.safeZonePx === b.safeZonePx &&
    a.trim.shape === b.trim.shape &&
    a.trim.cornerRadiusPx === b.trim.cornerRadiusPx
  );
}

/**
 * Differences between a saved design and the product's current Studio profile — for example when
 * the business corrects a print size (decision D2) or an option changes the physical size (Phase 4).
 * The Studio then offers to fit the design to the new size (see `resizeSurface`) instead of
 * silently changing it.
 */
export function compareWithProfile(document: DesignDocument, profile: StudioProfile): ProfileMismatch[] {
  const current = surfacePrintFromProfile(profile);
  const mismatches: ProfileMismatch[] = [];
  const sideIds = new Set(profile.sides.map((s) => s.id as string));
  for (const surface of document.surfaces) {
    if (!sideIds.has(surface.id)) mismatches.push({ kind: 'surface-unknown', surfaceId: surface.id });
    else if (!samePrint(surface.print, current)) mismatches.push({ kind: 'print-changed', surfaceId: surface.id, saved: surface.print, current });
  }
  for (const id of sideIds) {
    if (!document.surfaces.some((s) => s.id === id)) mismatches.push({ kind: 'surface-missing', surfaceId: id });
  }
  return mismatches;
}
