import { lazy, type ComponentType } from 'react';
import type Konva from 'konva';
import type { Rect } from '../geometry/boxes';
import type { Size } from '../geometry/fit';
import type { Viewport } from '../geometry/viewport';
import type { PlacedArtwork } from '../product-view/product-view';
import type { SurfaceDesign } from '../schema/types';

/**
 * Where the preview's drawings come from. Konva arrives with the editor canvas, so the preview's
 * drawing loads as a separate chunk that shares it. Tests without a canvas (jsdom) swap in
 * stand-ins and a fixed size with `setPreviewRendererForTests`.
 */

export interface PreviewCanvasProps {
  surface: SurfaceDesign;
  width: number;
  height: number;
  viewport: Viewport;
  onStage?: (stage: Konva.Stage | null) => void;
}

export interface PreviewThumbnailProps {
  surface: SurfaceDesign;
  width: number;
  height: number;
}

/** On the product (Phase 4 M1): the photo, with the artwork drawn over it at `placed` (photo px). */
export interface ProductCanvasProps {
  surface: SurfaceDesign;
  /** The photo as taken, or recoloured with its mask (M3). */
  photo: HTMLImageElement | HTMLCanvasElement;
  photoSize: Size;
  /** Where the photo is drawn in the frame, and which part of it (pens and mugs, M4). */
  draw: { crop: Rect | null; at: Rect };
  placed: PlacedArtwork;
  width: number;
  height: number;
  viewport: Viewport;
  onStage?: (stage: Konva.Stage | null) => void;
}

/**
 * Review's print check view (Phase 4 M6): the side's whole print area — bleed included — with the
 * trim, bleed, safe zone and the elements worth checking outlined. Drawn over the bleed box, so
 * the viewport's space is `printSpace(print)` (preview-view.ts). Presentation only.
 */
export interface PrintCanvasProps extends PreviewCanvasProps {
  /** Elements to outline, and how strongly. */
  flagged: readonly { elementId: string; level: 'serious' | 'warning' }[];
}

export interface PreviewRenderer {
  Canvas: ComponentType<PreviewCanvasProps>;
  PrintCanvas: ComponentType<PrintCanvasProps>;
  ProductCanvas: ComponentType<ProductCanvasProps>;
  Thumbnail: ComponentType<PreviewThumbnailProps>;
  /** The space the preview gets, when it can't be measured (tests). */
  size: Size | null;
}

const browser: PreviewRenderer = {
  Canvas: lazy(() => import('./preview-canvas').then((m) => ({ default: m.PreviewCanvas }))),
  PrintCanvas: lazy(() => import('./preview-canvas').then((m) => ({ default: m.PrintAreaCanvas }))),
  ProductCanvas: lazy(() => import('./preview-canvas').then((m) => ({ default: m.ProductPreviewCanvas }))),
  Thumbnail: lazy(() => import('./preview-canvas').then((m) => ({ default: m.PreviewThumbnail }))),
  size: null,
};

let override: PreviewRenderer | null = null;

export function previewRenderer(): PreviewRenderer {
  return override ?? browser;
}

export function setPreviewRendererForTests(next: PreviewRenderer | null): void {
  override = next;
}
