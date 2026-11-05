import Konva from 'konva';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Arrow, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva';
import { colorTokens } from '@/design-system/tokens';
import { ensureFonts, facesFor, useFontsVersion } from '../assets/fonts';
import { graphicById, useGraphicsLibrary } from '../assets/graphics';
import { useImage } from '../assets/image-cache';
import { appendPath, tracePath } from '../geometry/shapes';
import type { Viewport } from '../geometry/viewport';
import type { DesignElement, SurfaceDesign, TextElement } from '../schema/types';
import { drawingFor, elementFrame, guideGeometry, type Drawing, type GuideGeometry } from './drawing';
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
}

/**
 * The Design Studio canvas (React Konva). Three layers, bottom to top:
 * 1. workspace — the sheet's shadow; never exported, never interactive;
 * 2. artwork   — background and elements, clipped to the bleed outline: the printable content;
 * 3. guides    — bleed band, trim line and safe-zone line; never exported, never interactive.
 * Design units are print px; the stage transform (viewport) maps them to the screen.
 */
export default function CanvasStage({ surface, width, height, viewport, showGuides, editingId = null, onStage }: CanvasStageProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const guides = useMemo(() => guideGeometry(surface.print), [surface.print]);
  const fontsVersion = useFontsVersionFor(surface.elements);
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
            .filter((element) => !element.hidden && element.id !== editingId)
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
      return <Rect x={drawing.x} y={drawing.y} width={drawing.width} height={drawing.height} cornerRadius={drawing.cornerRadius} {...paint(drawing)} />;
    case 'ellipse':
      return <Ellipse x={drawing.x} y={drawing.y} radiusX={drawing.radiusX} radiusY={drawing.radiusY} {...paint(drawing)} />;
    case 'polyline':
      return <Line points={drawing.points} closed={drawing.closed} lineJoin="round" {...(drawing.lineCap ? { lineCap: drawing.lineCap } : {})} {...(drawing.dash ? { dash: drawing.dash } : {})} {...paint(drawing)} />;
    case 'arrow':
      return <Arrow points={drawing.points} pointerLength={drawing.pointerLength} pointerWidth={drawing.pointerWidth} lineCap={drawing.lineCap} {...paint(drawing)} />;
    case 'graphic':
      return <GraphicNode graphicId={drawing.graphicId} width={drawing.width} height={drawing.height} />;
    case 'image-placeholder':
      // Uploaded images arrive with M12; until then (and while a source loads) show a frame.
      return <ImagePlaceholder width={drawing.width} height={drawing.height} state="missing" />;
  }
}

/**
 * A library graphic, drawn from its SVG file (decoded once, shared by every copy). While it loads
 * a light frame stands in; if it can't be shown (not in the library, or the file failed) a crossed
 * frame does — the element stays in the design either way.
 */
function GraphicNode({ graphicId, width, height }: { graphicId: string; width: number; height: number }) {
  const library = useGraphicsLibrary();
  const entry = graphicById(library, graphicId);
  const image = useImage(entry?.url ?? null);
  if (image?.status === 'loaded') return <KonvaImage image={image.image} width={width} height={height} perfectDrawEnabled={false} />;
  const loading = library.status === 'loading' || image?.status === 'loading';
  return <ImagePlaceholder width={width} height={height} state={loading ? 'loading' : 'missing'} />;
}

function ImagePlaceholder({ width, height, state }: { width: number; height: number; state: 'loading' | 'missing' }) {
  if (state === 'loading') return <Rect name="graphic-loading" width={width} height={height} fill={colorTokens['surface-sunken']} opacity={0.6} perfectDrawEnabled={false} />;
  return (
    <>
      <Rect name="image-missing" width={width} height={height} fill={colorTokens['surface-sunken']} perfectDrawEnabled={false} />
      <Line points={[0, 0, width, height]} stroke={colorTokens['border-strong']} {...hairline} />
      <Line points={[width, 0, 0, height]} stroke={colorTokens['border-strong']} {...hairline} />
      <Rect width={width} height={height} stroke={colorTokens['border-strong']} dash={[6, 4]} {...hairline} />
    </>
  );
}

/**
 * Text is measured when drawn; if a web font arrives later the measurement is stale. Load the
 * faces this side uses, and re-key text nodes whenever a font finishes loading.
 */
function useFontsVersionFor(elements: readonly DesignElement[]): number {
  const version = useFontsVersion();
  // A string key, so typing that doesn't add new characters doesn't re-check the fonts.
  const key = useMemo(() => JSON.stringify(facesFor(elements.filter((e): e is TextElement => e.type === 'text'))), [elements]);
  useEffect(() => {
    void ensureFonts(JSON.parse(key) as ReturnType<typeof facesFor>);
  }, [key]);
  return version;
}
