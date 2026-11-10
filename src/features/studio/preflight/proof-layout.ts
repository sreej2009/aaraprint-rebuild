import { printBoxes, type Rect } from '../geometry/boxes';
import type { TrimShape } from '../geometry/shapes';
import { trimShapeFromPrint } from '../canvas/drawing';
import type { SurfacePrint } from '../schema/types';

/**
 * The proof picture's layout (Plan M15), pure. A proof shows each chosen side whole — bleed
 * included — at print resolution (one print px per proof px), side by side, with the side's name
 * above and a footer saying what the picture is. Everything scales down together when the
 * picture would pass the browser's canvas limits: 16 MP (the iOS limit) and 16 384 px a side.
 *
 * Formula, in print px (L = the longest side of the largest bleed box):
 *   margin = gap = round(0.06 L), label band = round(0.08 L), footer = round(0.12 L)
 *   width  = 2 margin + Σ bleed widths + gap × (sides − 1)
 *   height = 2 margin + label band + tallest bleed height + footer
 *   scale  = min(1, √(16 000 000 / (width × height)), 16 384 / max(width, height))
 * and the proof is floor(width × scale) × floor(height × scale) px.
 */

export const PROOF_MAX_PIXELS = 16_000_000;
export const PROOF_MAX_EDGE = 16_384;

export interface ProofPanel {
  /** The side's bleed box in proof px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The trim box inside it, in proof px, and its shape (scaled). */
  trim: Rect;
  shape: TrimShape;
  bleed: number;
}

export interface ProofLayout {
  width: number;
  height: number;
  /** Proof px per print px (1 = full print resolution). */
  scale: number;
  scaled: boolean;
  margin: number;
  labelHeight: number;
  footerHeight: number;
  panels: ProofPanel[];
}

export function proofLayout(prints: readonly SurfacePrint[]): ProofLayout {
  if (prints.length === 0) throw new Error('A proof needs at least one side.');
  const boxes = prints.map((print) => printBoxes(print));
  const longest = Math.max(...boxes.map((b) => Math.max(b.bleed.width, b.bleed.height)));
  const margin = Math.round(longest * 0.06);
  const labelHeight = Math.round(longest * 0.08);
  const footerHeight = Math.round(longest * 0.12);
  const fullWidth = 2 * margin + boxes.reduce((sum, b) => sum + b.bleed.width, 0) + margin * (prints.length - 1);
  const fullHeight = 2 * margin + labelHeight + Math.max(...boxes.map((b) => b.bleed.height)) + footerHeight;
  const scale = Math.min(1, Math.sqrt(PROOF_MAX_PIXELS / (fullWidth * fullHeight)), PROOF_MAX_EDGE / Math.max(fullWidth, fullHeight));

  let x = margin;
  const panels = prints.map((print, i) => {
    const b = boxes[i]!;
    const shape = trimShapeFromPrint(print);
    const panel: ProofPanel = {
      x: x * scale,
      y: (margin + labelHeight) * scale,
      width: b.bleed.width * scale,
      height: b.bleed.height * scale,
      trim: { x: print.bleedPx * scale, y: print.bleedPx * scale, width: print.widthPx * scale, height: print.heightPx * scale },
      shape: shape.kind === 'rounded-rectangle' ? { kind: 'rounded-rectangle', radius: shape.radius * scale } : shape,
      bleed: print.bleedPx * scale,
    };
    x += b.bleed.width + margin;
    return panel;
  });

  return {
    width: Math.floor(fullWidth * scale),
    height: Math.floor(fullHeight * scale),
    scale,
    scaled: scale < 1,
    margin: margin * scale,
    labelHeight: labelHeight * scale,
    footerHeight: footerHeight * scale,
    panels,
  };
}

/** "Riya's card" + ["Front"] → "riyas-card-front-proof.png"; both sides → "riyas-card-proof.png". */
export function proofFileName(designName: string, sides: readonly string[] | 'all'): string {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  const base = slug(designName) || 'design';
  return sides === 'all' ? `${base}-proof.png` : `${base}-${sides.map(slug).join('-')}-proof.png`;
}
