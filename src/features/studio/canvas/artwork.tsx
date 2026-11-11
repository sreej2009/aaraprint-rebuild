import { memo, useEffect, useMemo } from 'react';
import { Arrow, Ellipse, Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva';
import { colorTokens } from '@/design-system/tokens';
import { ensureFonts, facesFor, useFontsVersion } from '../assets/fonts';
import { graphicById, useGraphicsLibrary } from '../assets/graphics';
import { useAssetImage } from '../assets/asset-library';
import { useImage } from '../assets/image-cache';
import { tracePath } from '../geometry/shapes';
import type { DesignElement, SurfaceDesign, TextElement } from '../schema/types';
import { drawingFor, elementFrame, guideGeometry, hairline, type Drawing } from './drawing';

/**
 * A side's printable artwork as Konva nodes — its background and visible elements, bottom to top —
 * drawn straight from the design document. Shared by the editor canvas (clipped to the bleed, so
 * the bleed can be checked) and the preview (clipped to the trim, as the finished piece looks).
 * Nothing editor-only lives here: no guides, handles, hover or selection.
 */
export function Artwork({
  surface,
  clip,
  editingId = null,
  blank = 'paper',
}: {
  surface: SurfaceDesign;
  clip: 'bleed' | 'trim';
  editingId?: string | null;
  /** Without a background colour: white paper, or (on a product photo) nothing, so the product shows. */
  blank?: 'paper' | 'none';
}) {
  const guides = useMemo(() => guideGeometry(surface.print), [surface.print]);
  const fontsVersion = useFontsVersionFor(surface.elements);
  const outline = clip === 'bleed' ? { shape: guides.bleedShape, rect: guides.bleed } : { shape: guides.trimShape, rect: guides.trim };
  return (
    <Group name="artwork-clip" clipFunc={(ctx) => tracePath(ctx, outline.shape, outline.rect)}>
      {(surface.background.color !== null || blank === 'paper') && (
        <Rect name="background" {...guides.bleed} fill={surface.background.color ?? colorTokens.surface} listening={false} perfectDrawEnabled={false} />
      )}
      {surface.elements
        .filter((element) => !element.hidden && element.id !== editingId)
        .map((element) => (
          <ElementNode key={`${element.id}:${fontsVersion}`} element={element} />
        ))}
    </Group>
  );
}

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
      return (
        <Line
          points={drawing.points}
          closed={drawing.closed}
          lineJoin="round"
          {...(drawing.lineCap ? { lineCap: drawing.lineCap } : {})}
          {...(drawing.dash ? { dash: drawing.dash } : {})}
          {...paint(drawing)}
        />
      );
    case 'arrow':
      return <Arrow points={drawing.points} pointerLength={drawing.pointerLength} pointerWidth={drawing.pointerWidth} lineCap={drawing.lineCap} {...paint(drawing)} />;
    case 'graphic':
      return <GraphicNode graphicId={drawing.graphicId} width={drawing.width} height={drawing.height} />;
    case 'upload':
      return <UploadNode assetId={drawing.assetId} width={drawing.width} height={drawing.height} />;
  }
}

/**
 * An uploaded image (M12), drawn from its file in this browser (decoded once, shared by every
 * element that uses it). A light frame while it loads; a crossed frame if the file isn't here —
 * the element stays either way, so it can be replaced.
 */
function UploadNode({ assetId, width, height }: { assetId: string; width: number; height: number }) {
  const image = useAssetImage(assetId);
  if (image?.status === 'loaded') return <KonvaImage image={image.image} width={width} height={height} perfectDrawEnabled={false} />;
  return <ImagePlaceholder width={width} height={height} state={image?.status === 'loading' ? 'loading' : 'missing'} />;
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
