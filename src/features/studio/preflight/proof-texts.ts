import { finishedSizeMm } from '../geometry/boxes';
import { pxToMm, roundTo } from '../geometry/units';
import { formatSize } from '../profile/describe';
import type { DesignDocument, SurfaceDesign } from '../schema/types';
import type { ProofTexts } from './proof-export';
import type { ProofLayout } from './proof-layout';

/** The words on the proof: each side's name and size, and a footer saying what the picture is. */
export function proofTexts(document: DesignDocument, productName: string, surfaces: readonly SurfaceDesign[], layout: ProofLayout, warnings: number): ProofTexts {
  const print = surfaces[0]!.print;
  const mm = (px: number) => roundTo(pxToMm(px, print.dpi), 1);
  return {
    sides: surfaces.map((s) => {
      const size = finishedSizeMm(s.print);
      return { label: s.label, note: `${formatSize(size.width, size.height)} · ${s.print.bleedPx > 0 ? `${mm(s.print.bleedPx)} mm bleed` : 'no bleed'}` };
    }),
    title: `${document.name} — ${productName}`,
    lines: [
      'Proof only — not a print-ready file. Colours on screen and in print can differ.',
      print.bleedPx > 0 ? 'The dark line is the trim: the tinted edge outside it (bleed) is cut off.' : 'The dark line is the edge of the printed area.',
      layout.scaled ? `Scaled to ${Math.round(layout.scale * 100)}% to stay within browser limits (${Math.round(print.dpi * layout.scale)} DPI).` : `At full print resolution (${print.dpi} DPI).`,
      warnings === 0 ? 'Print check: no warnings.' : `Print check: ${warnings} ${warnings === 1 ? 'warning' : 'warnings'} — see the Studio’s print check.`,
    ],
  };
}
