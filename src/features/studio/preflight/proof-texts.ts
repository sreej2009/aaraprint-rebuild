import { finishedSizeMm } from '../geometry/boxes';
import { pxToMm, roundTo } from '../geometry/units';
import { formatSize } from '../profile/describe';
import type { DesignDocument, SurfaceDesign } from '../schema/types';
import type { ProofTexts } from './proof-export';
import type { ProofLayout } from './proof-layout';

/** What is ordered with the design (Phase 4 M6), for the proof's identity line; each part only when known. */
export interface ProofIdentity {
  options?: string | null;
  sku?: string | null;
  quantity?: number | null;
}

/**
 * The words on the proof: each side's name, size, bleed and safe zone, and a footer saying what the
 * picture is, what it is for (product, design, options, SKU) and what its lines mean.
 */
export function proofTexts(document: DesignDocument, productName: string, surfaces: readonly SurfaceDesign[], layout: ProofLayout, warnings: number, identity: ProofIdentity = {}): ProofTexts {
  const print = surfaces[0]!.print;
  const mm = (px: number, dpi: number) => roundTo(pxToMm(px, dpi), 1);
  const ordered = [identity.options, identity.sku ? `SKU ${identity.sku}` : null, identity.quantity ? `Quantity ${identity.quantity}` : null].filter((p): p is string => Boolean(p));
  const guides = surfaces.some((s) => s.print.safeZonePx > 0) ? ' The dashed line is the safe zone.' : '';
  return {
    sides: surfaces.map((s) => {
      const size = finishedSizeMm(s.print);
      const parts = [formatSize(size.width, size.height), s.print.bleedPx > 0 ? `${mm(s.print.bleedPx, s.print.dpi)} mm bleed` : 'no bleed'];
      if (s.print.safeZonePx > 0) parts.push(`${mm(s.print.safeZonePx, s.print.dpi)} mm safe zone`);
      return { label: s.label, note: parts.join(' · ') };
    }),
    title: `${document.name} — ${productName}`,
    lines: [
      'Proof only — not a print-ready file. Colours on screen and in print can differ.',
      ...(ordered.length > 0 ? [ordered.join(' · ')] : []),
      (print.bleedPx > 0 ? 'The dark line is the trim: the tinted edge outside it (bleed) is cut off.' : 'The dark line is the edge of the printed area.') + guides,
      layout.scaled ? `Scaled to ${Math.round(layout.scale * 100)}% to stay within browser limits (${Math.round(print.dpi * layout.scale)} DPI).` : `At full print resolution (${print.dpi} DPI).`,
      warnings === 0 ? 'Print check: no warnings.' : `Print check: ${warnings} ${warnings === 1 ? 'warning' : 'warnings'} — see the Studio’s print check.`,
    ],
  };
}
