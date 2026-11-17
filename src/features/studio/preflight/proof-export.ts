import { lazy, type ComponentType } from 'react';
import { appendPath, offsetShape, tracePath } from '../geometry/shapes';
import type { SurfaceDesign } from '../schema/types';
import type { ProofFormat, ProofLayout } from './proof-layout';
import { pdfPageFor, proofPdf } from './proof-pdf';

/**
 * Making the proof PNG (Plan M15) in the browser. Each side's artwork is drawn by the editor's own
 * artwork nodes (proof-render.tsx, Konva `toCanvas` at proof resolution — vector shapes and text
 * are redrawn, images are drawn from their decoded files and never upscaled beyond their placed
 * size), then placed on a white page with the side names, a light bleed tint, the trim line and a
 * footer that says it is a proof, not a print-ready file.
 *
 * Phase 4 M6: the safe zone is drawn as a dashed line, footer lines shrink to fit the picture's
 * width, and the same picture can be delivered as a one-page PDF (proof-pdf.ts) at real size.
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

/** How the proof is delivered (M6): PNG or PDF, and the print DPI for the PDF's real-size page. */
export interface ProofDelivery {
  format: ProofFormat;
  dpi: number;
}

export interface ProofPipeline {
  Render: ComponentType<ProofRenderProps>;
  deliver(layout: ProofLayout, canvases: HTMLCanvasElement[], texts: ProofTexts, fileName: string, delivery: ProofDelivery): Promise<void>;
}

const INK = '#171c26';
const MUTED = '#5b6170';
/** The editor's bleed colour, lightly. */
const BLEED_TINT = 'rgba(230, 73, 99, 0.22)';
/** The editor's safe-zone colour. */
const SAFE = '#0b7f5c';
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
    if (panel.safe > 0) {
      // The safe zone: dashed, over a light edge, so it shows on any background.
      const safeRect = { x: panel.trim.x + panel.safe, y: panel.trim.y + panel.safe, width: panel.trim.width - 2 * panel.safe, height: panel.trim.height - 2 * panel.safe };
      const safeShape = offsetShape(panel.shape, panel.safe);
      ctx.setLineDash([line * 8, line * 5]);
      tracePath(ctx, safeShape, safeRect);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = line * 3;
      ctx.stroke();
      ctx.strokeStyle = SAFE;
      ctx.lineWidth = line;
      ctx.stroke();
      ctx.setLineDash([]);
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

  const top = Math.max(...layout.panels.map((p) => p.y + p.height)) + layout.margin * 0.45;
  const titleSize = Math.max(10, layout.footerHeight * 0.17);
  const lineSize = Math.max(8, layout.footerHeight * 0.13);
  const room = layout.width - 2 * layout.margin;
  // A line too long for the picture is drawn smaller, never cut off.
  const fit = (text: string, weight: number, size: number) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const width = ctx.measureText(text).width;
    if (width > room) ctx.font = `${weight} ${Math.max(6, (size * room) / width)}px ${FONT}`;
  };
  ctx.fillStyle = INK;
  fit(texts.title, 700, titleSize);
  ctx.fillText(texts.title, layout.margin, top + titleSize);
  ctx.fillStyle = MUTED;
  texts.lines.forEach((text, i) => {
    fit(text, 400, lineSize);
    ctx.fillText(text, layout.margin, top + titleSize + (i + 1) * lineSize * 1.35);
  });
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return canvasToBlob(canvas, 'image/png');
}

function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The proof couldn’t be encoded.'))), type, quality));
}

/** The proof picture as a one-page PDF at real size (M6). */
export async function canvasToPdf(canvas: HTMLCanvasElement, pxPerInch: number, texts: ProofTexts): Promise<Blob> {
  const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
  const page = pdfPageFor(canvas.width, canvas.height, pxPerInch);
  const bytes = proofPdf({ jpeg, widthPx: canvas.width, heightPx: canvas.height }, page, { title: texts.title, subject: texts.lines[0] ?? 'Proof' });
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
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
  async deliver(layout, canvases, texts, fileName, delivery) {
    const picture = composeProof(layout, canvases, texts);
    saveFile(delivery.format === 'pdf' ? await canvasToPdf(picture, delivery.dpi * layout.scale, texts) : await canvasToPng(picture), fileName);
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
