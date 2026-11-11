import type Konva from 'konva';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Group, Image as KonvaImage, Layer, Shape, Stage } from 'react-konva';
import { colorTokens } from '@/design-system/tokens';
import { Artwork } from '../canvas/artwork';
import { guideGeometry } from '../canvas/drawing';
import { ARTWORK_LAYER } from '../canvas/export';
import { fitViewport } from '../geometry/viewport';
import { tracePath } from '../geometry/shapes';
import type { SurfaceDesign } from '../schema/types';
import { trimRect } from './preview-view';
import type { PreviewCanvasProps, PreviewThumbnailProps, ProductCanvasProps } from './renderer';

/**
 * The preview's drawing (Plan M14), read-only and built from the design document with the same
 * artwork nodes as the editor (canvas/artwork.tsx) — no second renderer. It shows the finished
 * piece: clipped to the trim shape, with a soft shadow under it and nothing else — no guides,
 * bleed, handles, hover or selection, and nothing listens for pointer input.
 */
export function PreviewCanvas({ surface, width, height, viewport, onStage }: PreviewCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  useEffect(() => {
    onStage?.(stageRef.current);
    return () => onStage?.(null);
  }, [onStage]);
  return (
    <Stage ref={stageRef} width={width} height={height} scaleX={viewport.scale} scaleY={viewport.scale} x={viewport.x} y={viewport.y} listening={false} className="studio-preview-stage">
      <Layer name="preview-shadow" listening={false}>
        <PieceShadow surface={surface} scale={viewport.scale} />
      </Layer>
      <Layer name={ARTWORK_LAYER} listening={false}>
        <Artwork surface={surface} clip="trim" />
      </Layer>
    </Stage>
  );
}

/**
 * On the product (Phase 4 M1): the product photo with the artwork over it, drawn by the same
 * artwork nodes and clipped to the trim like the flat preview. The photo is a backdrop only — it
 * is never selectable, exported, saved or part of the design; nothing here listens for input.
 */
export function ProductPreviewCanvas({ surface, photo, photoSize, placed, width, height, viewport }: ProductCanvasProps) {
  return (
    <Stage width={width} height={height} scaleX={viewport.scale} scaleY={viewport.scale} x={viewport.x} y={viewport.y} listening={false} className="studio-preview-stage studio-product-stage">
      <Layer name="product-photo" listening={false}>
        <KonvaImage image={photo} width={photoSize.width} height={photoSize.height} listening={false} perfectDrawEnabled={false} />
      </Layer>
      <Layer name="product-artwork" listening={false}>
        <Group x={placed.x} y={placed.y} scaleX={placed.scale} scaleY={placed.scale}>
          <Artwork surface={surface} clip="trim" blank="none" />
        </Group>
      </Layer>
    </Stage>
  );
}

/**
 * A side at thumbnail size, for the side switcher. One small stage per side (a product has at most
 * a front and a back), redrawn only when that side changes.
 */
export const PreviewThumbnail = memo(function PreviewThumbnail({ surface, width, height }: PreviewThumbnailProps) {
  const viewport = useMemo(() => fitViewport({ width, height }, trimRect(surface.print), 3), [surface.print, width, height]);
  return (
    <Stage width={width} height={height} scaleX={viewport.scale} scaleY={viewport.scale} x={viewport.x} y={viewport.y} listening={false} className="studio-preview-thumbnail">
      <Layer listening={false}>
        <PieceShadow surface={surface} scale={viewport.scale} />
        <Artwork surface={surface} clip="trim" />
      </Layer>
    </Stage>
  );
});

function PieceShadow({ surface, scale }: { surface: SurfaceDesign; scale: number }) {
  const guides = useMemo(() => guideGeometry(surface.print), [surface.print]);
  return (
    <Shape
      sceneFunc={(ctx, shape) => {
        tracePath(ctx, guides.trimShape, guides.trim);
        ctx.fillStrokeShape(shape);
      }}
      fill={colorTokens.surface}
      shadowColor={colorTokens['surface-inverse']}
      shadowOpacity={0.18}
      shadowBlur={28 / scale}
      shadowOffsetY={8 / scale}
      perfectDrawEnabled={false}
    />
  );
}
