import Konva from 'konva';
import { useEffect, useMemo, useRef } from 'react';
import { Image as KonvaImage, Layer, Shape, Stage } from 'react-konva';
import { colorTokens } from '@/design-system/tokens';
import type { Rect } from '../geometry/boxes';
import { appendPath, tracePath } from '../geometry/shapes';
import type { Viewport } from '../geometry/viewport';
import type { SurfaceDesign } from '../schema/types';
import { Artwork } from './artwork';
import { guideGeometry, hairline, type GuideGeometry } from './drawing';
import { ARTWORK_LAYER, GUIDES_LAYER, WORKSPACE_LAYER } from './export';
import { measureTextHeight } from './konva-text-measure';
import { registerTextMeasurer } from './text-layout';

// Sharp on high-density screens without the memory cost of 3× canvases on phones.
if (typeof window !== 'undefined') Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
// Text heights in the design are measured the way this canvas lays text out.
registerTextMeasurer(measureTextHeight);

export interface CanvasStageProps {
  surface: SurfaceDesign;
  width: number;
  height: number;
  viewport: Viewport;
  showGuides: boolean;
  /** Text being edited in place: the HTML editor shows it instead (canvas/text-edit-overlay.tsx). */
  editingId?: string | null;
  /** Called with the Konva stage once mounted (exports, tests); null on unmount. */
  onStage?: (stage: Konva.Stage | null) => void;
  /**
   * Editing on the product (Phase 4 M2): the product photo, drawn behind the artwork at `rect`
   * (design px; for mugs only `crop`, the side's half of the paired photo — M4), inside `bounds`
   * (the whole photo in design px, so the print area lands on the original's placement). The photo
   * is null while it loads. A backdrop only: not an element, not selectable, never exported.
   */
  product?: { photo: HTMLImageElement | HTMLCanvasElement | null; bounds: Rect; rect: Rect; crop: Rect | null } | null;
}

/**
 * The Design Studio canvas (React Konva). Three layers, bottom to top:
 * 1. workspace — the sheet's shadow, or on the product (M2) the product photo; never exported,
 *    never interactive;
 * 2. artwork   — background and elements, clipped to the bleed outline: the printable content;
 * 3. guides    — bleed band, trim line and safe-zone line; never exported, never interactive.
 * Design units are print px; the stage transform (viewport) maps them to the screen.
 */
export default function CanvasStage({ surface, width, height, viewport, showGuides, editingId = null, onStage, product = null }: CanvasStageProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const guides = useMemo(() => guideGeometry(surface.print), [surface.print]);
  const s = viewport.scale;

  useEffect(() => {
    onStage?.(stageRef.current);
    return () => onStage?.(null);
  }, [onStage]);

  return (
    // Not listening: picking and transforms use the document geometry (canvas/transform-rules.ts)
    // and the HTML selection overlay, so Konva keeps no hit graph.
    <Stage ref={stageRef} width={width} height={height} scaleX={s} scaleY={s} x={viewport.x} y={viewport.y} listening={false} className="studio-stage">
      <Layer name={WORKSPACE_LAYER} listening={false}>
        {product ? (
          product.photo && <KonvaImage name="product-mockup" image={product.photo} {...product.rect} crop={product.crop ?? undefined} listening={false} perfectDrawEnabled={false} />
        ) : (
          <Shape
            sceneFunc={(ctx, shape) => {
              tracePath(ctx, guides.bleedShape, guides.bleed);
              ctx.fillStrokeShape(shape);
            }}
            fill={colorTokens.surface}
            shadowColor={colorTokens['surface-inverse']}
            shadowOpacity={0.14}
            shadowBlur={24 / s}
            shadowOffsetY={6 / s}
            perfectDrawEnabled={false}
          />
        )}
      </Layer>

      <Layer name={ARTWORK_LAYER} listening={false}>
        {/* On the product, an empty background lets the product show through (as in the Preview). */}
        <Artwork surface={surface} clip="bleed" editingId={editingId} blank={product ? 'none' : 'paper'} />
      </Layer>

      <Layer name={GUIDES_LAYER} listening={false} visible={showGuides}>
        <GuideShapes guides={guides} />
      </Layer>
    </Stage>
  );
}

// ------------------------------------------------------------------- Guides

function GuideShapes({ guides }: { guides: GuideGeometry }) {
  return (
    <>
      {guides.hasBleed && (
        <>
          {/* The bleed band (outside the trim) is washed out: it will be cut off. */}
          <Shape
            name="guide-bleed-band"
            sceneFunc={(ctx, shape) => {
              ctx.beginPath();
              appendPath(ctx, guides.bleedShape, guides.bleed);
              appendPath(ctx, guides.trimShape, guides.trim);
              ctx.fillStrokeShape(shape);
            }}
            fill="rgba(253, 236, 238, 0.6)"
            fillRule="evenodd"
            perfectDrawEnabled={false}
          />
          <Shape name="guide-bleed" sceneFunc={outline(guides.bleedShape, guides.bleed)} stroke={colorTokens['guide-bleed']} {...hairline} />
        </>
      )}
      <Shape name="guide-trim" sceneFunc={outline(guides.trimShape, guides.trim)} stroke={colorTokens['guide-trim']} {...hairline} />
      {guides.hasSafe && <Shape name="guide-safe" sceneFunc={outline(guides.safeShape, guides.safe)} stroke={colorTokens['guide-safe']} dash={[6, 4]} {...hairline} />}
    </>
  );
}

function outline(shapeDef: GuideGeometry['trimShape'], rect: GuideGeometry['trim']) {
  return (ctx: Konva.Context, shape: Konva.Shape) => {
    tracePath(ctx, shapeDef, rect);
    ctx.fillStrokeShape(shape);
  };
}
