import { lazy, type ComponentType } from 'react';
import { appendPath, offsetShape, tracePath } from '../geometry/shapes';
import type { SurfaceDesign } from '../schema/types';
import type { ProofLayout } from './proof-layout';

/**
 * Making the proof PNG (Plan M15) in the browser. Each side's artwork is drawn by the editor's own
 * artwork nodes (proof-render.tsx, Konva `toCanvas` at proof resolution — vector shapes and text
 * are redrawn, images are drawn from their decoded files and never upscaled beyond their placed
 * size), then placed on a white page with the side names, a light bleed tint, the trim line and a
 * footer that says it is a proof, not a print-ready file.
 */

export interface ProofRenderProps {
  surfaces: readonly SurfaceDesign[];
  layout: ProofLayout;
  /** One canvas per surface, in order, each `panel.width × panel.height` px. */
  onDone(canvases: HTMLCanvasElement[]): void;
  onError(error: unknown): void;
}

export interface ProofTexts {
  /** Above each panel: "Front", and a note such as "88.9 × 50.8 mm · 1.5 mm bleed". */
  sides: { label: string; note: string }[];
  title: string;
  lines: string[];
}

export interface ProofPipeline {
  Render: ComponentType<ProofRenderProps>;
  deliver(layout: ProofLayout, canvases: HTMLCanvasElement[], texts: ProofTexts, fileName: string): Promise<void>;
}

const INK = '#171c26';
const MUTED = '#5b6170';
/** The editor's bleed colour, lightly. */
const BLEED_TINT = 'rgba(230, 73, 99, 0.22)';
const FONT = `'Inter Variable', Inter, system-ui, sans-serif`;

/** The finished picture: page, names, artwork, bleed tint, trim line and footer. */
export function composeProof(layout: ProofLayout, canvases: readonly CanvasImageSource[], texts: ProofTexts): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser can’t draw the proof.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.textBaseline = 'alphabetic';

  const labelSize = Math.max(10, layout.labelHeight * 0.42);
  const noteSize = Math.max(8, layout.labelHeight * 0.26);
  const line = Math.max(1, Math.max(layout.width, layout.height) / 1600);
  layout.panels.forEach((panel, i) => {
    const text = texts.sides[i];
    if (text) {
      const baseline = panel.y - layout.labelHeight * 0.3;
      ctx.fillStyle = INK;
      ctx.font = `700 ${labelSize}px ${FONT}`;
      ctx.fillText(text.label, panel.x, baseline);
      const labelWidth = ctx.measureText(text.label).width;
      ctx.fillStyle = MUTED;
      ctx.font = `400 ${noteSize}px ${FONT}`;
      ctx.fillText(text.note, panel.x + labelWidth + labelSize * 0.6, baseline);
    }
    const image = canvases[i];
    if (image) ctx.drawImage(image, panel.x, panel.y, panel.width, panel.height);
    ctx.save();
    ctx.translate(panel.x, panel.y);
    if (panel.bleed > 0) {
      // Tint between the bleed edge and the trim: what is cut away.
      tracePath(ctx, offsetShape(panel.shape, -panel.bleed), { x: 0, y: 0, width: panel.width, height: panel.height });
      appendPath(ctx, panel.shape, panel.trim);
      ctx.fillStyle = BLEED_TINT;
      ctx.fill('evenodd');
    }
    // The trim line: dark over a light edge, so it shows on any background.
    tracePath(ctx, panel.shape, panel.trim);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = line * 3;
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.restore();
  });

  const top = Math.max(...layout.panels.map((p) => p.y + p.height)) + layout.margin * 0.7;
  const titleSize = Math.max(10, layout.footerHeight * 0.17);
  const lineSize = Math.max(8, layout.footerHeight * 0.13);
  ctx.fillStyle = INK;
  ctx.font = `700 ${titleSize}px ${FONT}`;
  ctx.fillText(texts.title, layout.margin, top + titleSize);
  ctx.fillStyle = MUTED;
  ctx.font = `400 ${lineSize}px ${FONT}`;
  texts.lines.forEach((text, i) => ctx.fillText(text, layout.margin, top + titleSize + (i + 1) * lineSize * 1.45));
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The proof couldn’t be encoded.'))), 'image/png'));
}

/** Hand the file to the browser's download, then let its URL go. */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const browser: ProofPipeline = {
  // Konva comes with the editor canvas; the proof's renderer shares that chunk.
  Render: lazy(() => import('./proof-render')),
  async deliver(layout, canvases, texts, fileName) {
    saveFile(await canvasToPng(composeProof(layout, canvases, texts)), fileName);
  },
};

let override: ProofPipeline | null = null;

export function proofPipeline(): ProofPipeline {
  return override ?? browser;
}

/** Tests without a canvas (jsdom): stand-in rendering and delivery. */
export function setProofPipelineForTests(next: ProofPipeline | null): void {
  override = next;
}
