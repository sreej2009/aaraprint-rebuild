import { lazy, type ComponentType } from 'react';
import type Konva from 'konva';
import type { Size } from '../geometry/fit';
import type { Viewport } from '../geometry/viewport';
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

export interface PreviewRenderer {
  Canvas: ComponentType<PreviewCanvasProps>;
  Thumbnail: ComponentType<PreviewThumbnailProps>;
  /** The space the preview gets, when it can't be measured (tests). */
  size: Size | null;
}

const browser: PreviewRenderer = {
  Canvas: lazy(() => import('./preview-canvas').then((m) => ({ default: m.PreviewCanvas }))),
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
