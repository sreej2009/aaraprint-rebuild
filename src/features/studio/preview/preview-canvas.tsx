import type Konva from 'konva';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Group, Image as KonvaImage, Layer, Rect, Shape, Stage } from 'react-konva';
import { colorTokens } from '@/design-system/tokens';
import { Artwork } from '../canvas/artwork';
import { elementFrame, guideGeometry } from '../canvas/drawing';
import { ARTWORK_LAYER } from '../canvas/export';
import { fitViewport } from '../geometry/viewport';
import { appendPath, tracePath } from '../geometry/shapes';
import type { SurfaceDesign } from '../schema/types';
import { trimRect } from './preview-view';
import type { PreviewCanvasProps, PreviewThumbnailProps, PrintCanvasProps, ProductCanvasProps } from './renderer';

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
export function ProductPreviewCanvas({ surface, photo, draw, placed, width, height, viewport, onStage }: ProductCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  useEffect(() => {
    onStage?.(stageRef.current);
    return () => onStage?.(null);
  }, [onStage]);
  return (
    <Stage ref={stageRef} width={width} height={height} scaleX={viewport.scale} scaleY={viewport.scale} x={viewport.x} y={viewport.y} listening={false} className="studio-preview-stage studio-product-stage">
      <Layer name="product-photo" listening={false}>
        <KonvaImage image={photo} {...draw.at} crop={draw.crop ?? undefined} listening={false} perfectDrawEnabled={false} />
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
 * Review's print check view (Phase 4 M6): the side's whole print area with the artwork as it is
 * printed (clipped to the bleed, as in the editor), the bleed band tinted, the trim as a solid
 * line, the safe zone dashed and each element worth checking in a dotted outline. Lines keep their
 * screen width at any zoom and have a light halo so they show on any artwork. Read-only: none of
 * it is part of the design, saved or exported.
 */
export function PrintAreaCanvas({ surface, width, height, viewport, flagged, onStage }: PrintCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  useEffect(() => {
    onStage?.(stageRef.current);
    return () => onStage?.(null);
  }, [onStage]);
  const guides = useMemo(() => guideGeometry(surface.print), [surface.print]);
  const shift = Math.max(0, surface.print.bleedPx);
  const s = viewport.scale || 1;
  const halo = { stroke: 'rgba(255, 255, 255, 0.9)', strokeWidth: 4, strokeScaleEnabled: false, listening: false, perfectDrawEnabled: false } as const;
  const line = (stroke: string, width = 1.5) => ({ stroke, strokeWidth: width, strokeScaleEnabled: false, listening: false, perfectDrawEnabled: false }) as const;
  const outline = (shape: typeof guides.trimShape, rect: typeof guides.trim) => (ctx: Konva.Context, node: Konva.Shape) => {
    tracePath(ctx, shape, rect);
    ctx.fillStrokeShape(node);
  };
  const elements = new Map(surface.elements.map((e) => [e.id, e]));
  return (
    <Stage ref={stageRef} width={width} height={height} scaleX={s} scaleY={s} x={viewport.x} y={viewport.y} listening={false} className="studio-preview-stage studio-print-stage">
      <Layer name="print-paper" listening={false}>
        <Group x={shift} y={shift}>
          <Shape sceneFunc={outline(guides.bleedShape, guides.bleed)} fill={colorTokens.surface} shadowColor={colorTokens['surface-inverse']} shadowOpacity={0.14} shadowBlur={24 / s} shadowOffsetY={6 / s} perfectDrawEnabled={false} />
        </Group>
      </Layer>
      <Layer name={ARTWORK_LAYER} listening={false}>
        <Group x={shift} y={shift}>
          <Artwork surface={surface} clip="bleed" />
        </Group>
      </Layer>
      <Layer name="print-guides" listening={false}>
        <Group x={shift} y={shift}>
          {guides.hasBleed && (
            <>
              <Shape
                name="print-bleed-band"
                sceneFunc={(ctx, node) => {
                  ctx.beginPath();
                  appendPath(ctx, guides.bleedShape, guides.bleed);
                  appendPath(ctx, guides.trimShape, guides.trim);
                  ctx.fillStrokeShape(node);
                }}
                fill="rgba(229, 72, 77, 0.25)"
                fillRule="evenodd"
                listening={false}
                perfectDrawEnabled={false}
              />
              <Shape name="print-bleed" sceneFunc={outline(guides.bleedShape, guides.bleed)} {...line(colorTokens['guide-bleed'], 1)} />
            </>
          )}
          {guides.hasSafe && (
            <>
              <Shape sceneFunc={outline(guides.safeShape, guides.safe)} {...halo} dash={[8, 5]} />
              <Shape name="print-safe" sceneFunc={outline(guides.safeShape, guides.safe)} {...line(colorTokens['guide-safe'])} dash={[8, 5]} />
            </>
          )}
          <Shape sceneFunc={outline(guides.trimShape, guides.trim)} {...halo} />
          <Shape name="print-trim" sceneFunc={outline(guides.trimShape, guides.trim)} {...line(colorTokens['guide-trim'])} />
          {flagged.map(({ elementId, level }) => {
            const element = elements.get(elementId);
            if (!element || element.hidden) return null;
            const frame = elementFrame(element);
            return (
              <Group key={elementId} name="print-flag" x={frame.x} y={frame.y} offsetX={frame.offsetX} offsetY={frame.offsetY} rotation={frame.rotation} listening={false}>
                <Rect width={element.width} height={element.height} {...halo} dash={[2, 4]} />
                <Rect width={element.width} height={element.height} {...line(level === 'serious' ? colorTokens.danger : colorTokens.warning, 2)} dash={[2, 4]} />
              </Group>
            );
          })}
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
