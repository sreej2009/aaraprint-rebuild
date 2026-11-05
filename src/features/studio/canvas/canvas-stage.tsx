import Konva from 'konva';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Arrow, Ellipse, Group, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva';
import { colorTokens } from '@/design-system/tokens';
import { appendPath, tracePath } from '../geometry/shapes';
import type { Viewport } from '../geometry/viewport';
import type { DesignElement, SurfaceDesign } from '../schema/types';
import { drawingFor, elementFrame, guideGeometry, type Drawing, type GuideGeometry } from './drawing';
import { ARTWORK_LAYER, GUIDES_LAYER, WORKSPACE_LAYER } from './export';

// Sharp on high-density screens without the memory cost of 3× canvases on phones.
if (typeof window !== 'undefined') Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

export interface CanvasStageProps {
  surface: SurfaceDesign;
  width: number;
  height: number;
  viewport: Viewport;
  showGuides: boolean;
  /** Called with the Konva stage once mounted (exports, tests); null on unmount. */
  onStage?: (stage: Konva.Stage | null) => void;
}

/**
 * The Design Studio canvas (React Konva). Three layers, bottom to top:
 * 1. workspace — the sheet's shadow; never exported, never interactive;
 * 2. artwork   — background and elements, clipped to the bleed outline: the printable content;
 * 3. guides    — bleed band, trim line and safe-zone line; never exported, never interactive.
 * Design units are print px; the stage transform (viewport) maps them to the screen.
 */
export default function CanvasStage({ surface, width, height, viewport, showGuides, onStage }: CanvasStageProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const guides = useMemo(() => guideGeometry(surface.print), [surface.print]);
  const fontsVersion = useFontsVersion(surface.elements);
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
      </Layer>

      <Layer name={ARTWORK_LAYER} listening={false}>
        <Group name="artwork-clip" clipFunc={(ctx) => tracePath(ctx, guides.bleedShape, guides.bleed)}>
          <Rect name="background" {...guides.bleed} fill={surface.background.color ?? colorTokens.surface} listening={false} perfectDrawEnabled={false} />
          {surface.elements
            .filter((element) => !element.hidden)
            .map((element) => (
              <ElementNode key={`${element.id}:${fontsVersion}`} element={element} />
            ))}
        </Group>
      </Layer>

      <Layer name={GUIDES_LAYER} listening={false} visible={showGuides}>
        <GuideShapes guides={guides} />
      </Layer>
    </Stage>
  );
}

// ------------------------------------------------------------------- Guides

const hairline = { strokeWidth: 1, strokeScaleEnabled: false, perfectDrawEnabled: false, listening: false } as const;

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

// ----------------------------------------------------------------- Elements

/** Re-renders only when its own element changes (commands keep unchanged elements identical). */
const ElementNode = memo(function ElementNode({ element }: { element: DesignElement }) {
  return (
    <Group id={element.id} name={`element element-${element.type}`} {...elementFrame(element)}>
      <DrawingNode drawing={drawingFor(element)} />
    </Group>
  );
});

function DrawingNode({ drawing }: { drawing: Drawing }) {
  const paint = (d: { fill: string | null; stroke: string | null; strokeWidth: number }) => ({
    ...(d.fill ? { fill: d.fill } : {}),
    ...(d.stroke && d.strokeWidth > 0 ? { stroke: d.stroke, strokeWidth: d.strokeWidth } : {}),
    perfectDrawEnabled: false,
  });
  switch (drawing.kind) {
    case 'text': {
      const { kind: _kind, ...text } = drawing;
      return <Text {...text} wrap="word" verticalAlign="top" perfectDrawEnabled={false} />;
    }
    case 'rect':
      return <Rect width={drawing.width} height={drawing.height} cornerRadius={drawing.cornerRadius} {...paint(drawing)} />;
    case 'ellipse':
      return <Ellipse x={drawing.x} y={drawing.y} radiusX={drawing.radiusX} radiusY={drawing.radiusY} {...paint(drawing)} />;
    case 'polyline':
      return <Line points={drawing.points} closed={drawing.closed} lineJoin="round" {...paint(drawing)} />;
    case 'arrow':
      return <Arrow points={drawing.points} pointerLength={drawing.pointerLength} pointerWidth={drawing.pointerWidth} {...paint(drawing)} />;
    case 'image-placeholder':
      // Images arrive with uploads (M12) and graphics (M9); until their source loads, show a frame.
      return (
        <>
          <Rect width={drawing.width} height={drawing.height} fill={colorTokens['surface-sunken']} perfectDrawEnabled={false} />
          <Line points={[0, 0, drawing.width, drawing.height]} stroke={colorTokens['border-strong']} {...hairline} />
          <Line points={[drawing.width, 0, 0, drawing.height]} stroke={colorTokens['border-strong']} {...hairline} />
          <Rect width={drawing.width} height={drawing.height} stroke={colorTokens['border-strong']} dash={[6, 4]} {...hairline} />
        </>
      );
  }
}

/**
 * Text is measured when drawn; if a web font arrives later the measurement is stale. Re-key text
 * nodes once the fonts used on this side have loaded.
 */
function useFontsVersion(elements: readonly DesignElement[]): number {
  const [version, setVersion] = useState(0);
  const families = [...new Set(elements.flatMap((e) => (e.type === 'text' ? [e.fontFamily] : [])))].sort().join('|');
  useEffect(() => {
    if (!families || typeof document === 'undefined' || !document.fonts) return;
    let cancelled = false;
    const specs = families.split('|').flatMap((family) => [`400 16px '${family} Variable'`, `400 16px '${family}'`]);
    void Promise.all(specs.map((spec) => document.fonts.load(spec).catch(() => []))).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [families]);
  return version;
}
