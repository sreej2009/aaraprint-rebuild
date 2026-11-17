import { fontByFamily } from '../assets/fonts';
import { effectiveDpi, resolutionLevel, type ResolutionLevel } from '../assets/image-placement';
import { guideGeometry } from '../canvas/drawing';
import { boxOf, placementFor } from '../canvas/transform-rules';
import { boundingRect, boxCorners } from '../geometry/bounds';
import { shapeContains } from '../geometry/shapes';
import { boxContains } from '../geometry/transform';
import { pxToMm, roundTo } from '../geometry/units';
import { elementDisplayName } from '../naming';
import type { DesignAsset, DesignDocument, DesignElement, SurfaceDesign, SurfacePrint } from '../schema/types';

/**
 * Print checks (Plan M15): advice computed from the design document and the product's print
 * geometry, never stored in the design and never blocking anything (what blocks approval is
 * approval/approval.ts). Reuses the editor's own rules: the safe-zone and trim test the canvas
 * already shows (canvas/transform-rules.ts `placementFor`, rotated corners against the trim shape)
 * and the M12 resolution bands (≥ 300 DPI good, 150–299 acceptable, below 150 low).
 *
 * Phase 4 M6 adds, keeping the M15 kinds and levels:
 * - where each element sits against the safe zone, trim and bleed (`artwork`, per side);
 * - its resolution where it can be worked out: an uploaded photo's effective DPI from its file's
 *   pixels and its printed size; text, shapes, library graphics and SVG files are vectors, so no
 *   DPI applies, and a file whose pixel size isn't known has none to show;
 * - past-the-bleed wording;
 * - a note instead of a warning for a background that covers the whole piece;
 * - a note for template sample text.
 */

export type IssueKind =
  | 'empty-design'
  | 'empty-side'
  | 'outside-trim'
  | 'outside-safe'
  | 'bleed-background'
  | 'low-resolution'
  | 'acceptable-resolution'
  | 'image-unavailable'
  | 'graphic-unavailable'
  | 'font-unavailable'
  | 'sample-text';

/** `serious` and `warning` count as warnings; a `notice` is information only. */
export type IssueLevel = 'serious' | 'warning' | 'notice';

export interface PrintIssue {
  /** Stable within a report (for React keys and tests). */
  key: string;
  kind: IssueKind;
  level: IssueLevel;
  surfaceId: string | null;
  /** The element to show (null for side- or design-wide notes), and its layer name. */
  elementId: string | null;
  subject: string;
  title: string;
  detail: string;
}

/**
 * Where an element sits (M6), from the four corners of its rotated box:
 * - `inside`: within the safe zone;
 * - `outside-safe`: within the trim, past the safe zone (may be trimmed);
 * - `into-bleed`: past the trim but within the bleed (that part is cut off);
 * - `past-bleed`: partly beyond the bleed edge, outside what is printed at all;
 * - `off-print`: nothing of it is on the print area.
 * With no bleed, the bleed edge is the trim, so anything past the trim is `past-bleed`.
 */
export type ArtworkPlacement = 'inside' | 'outside-safe' | 'into-bleed' | 'past-bleed' | 'off-print';

/**
 * An element's resolution (M6). Only an uploaded raster image has one: its file's pixels over the
 * size it prints at. Text, shapes and library graphics (SVG) are drawn as vectors, sharp at any
 * size. A file this browser doesn't have, or one whose pixel size isn't recorded, has no DPI.
 */
export type ArtworkResolution =
  | { kind: 'raster'; dpi: number; level: ResolutionLevel; sourcePx: { width: number; height: number }; printedMm: { width: number; height: number } }
  | { kind: 'vector' }
  | { kind: 'unavailable' }
  | { kind: 'unknown' };

export type ArtworkType = 'photo' | 'graphic' | 'text' | 'shape';

export interface ArtworkCheck {
  elementId: string;
  name: string;
  type: ArtworkType;
  placement: ArtworkPlacement;
  /** Covers the whole piece (a background running into the bleed): its cut edge is expected. */
  background: boolean;
  resolution: ArtworkResolution;
}

export interface SideCheck {
  surfaceId: string;
  label: string;
  empty: boolean;
  issues: PrintIssue[];
  /** What's fine on this side, in plain words. */
  passed: string[];
  /** Every visible element, top layer first (M6). */
  artwork: ArtworkCheck[];
}

export interface PrintReport {
  /** True when no side has any artwork (or background colour). */
  empty: boolean;
  /** Design-wide issues (the design is empty). */
  issues: PrintIssue[];
  sides: SideCheck[];
  /** `serious` + `warning` issues, all sides. */
  warnings: number;
}

/** Whether an uploaded image or a graphic can be drawn here: settled as shown or missing, or still loading. */
export type ResourceState = 'available' | 'missing' | 'loading';

export interface PrintCheckInputs {
  document: DesignDocument;
  /** Uploaded image files (M12). */
  imageState(assetId: string): ResourceState;
  /** Library graphics (M9): missing when not in the approved library or the file failed. */
  graphicState(graphicId: string): ResourceState;
}

const LEVEL_ORDER: Record<IssueLevel, number> = { serious: 0, warning: 1, notice: 2 };

export function isSideEmpty(surface: SurfaceDesign): boolean {
  return surface.background.color === null && surface.elements.every((e) => e.hidden);
}

export function evaluatePrintChecks({ document, imageState, graphicState }: PrintCheckInputs): PrintReport {
  const sided = document.surfaces.length > 1;
  const empty = document.surfaces.every(isSideEmpty);
  const sides = document.surfaces.map((surface) => checkSide(surface, document, sided && !empty, imageState, graphicState));
  const issues: PrintIssue[] = empty
    ? [
        {
          key: 'design:empty',
          kind: 'empty-design',
          level: 'warning',
          surfaceId: null,
          elementId: null,
          subject: 'Design',
          title: 'Your design is empty',
          detail: 'Add text, shapes, images or a template before printing.',
        },
      ]
    : [];
  const all = [...issues, ...sides.flatMap((s) => s.issues)];
  return { empty, issues, sides, warnings: all.filter((i) => i.level !== 'notice').length };
}

function checkSide(surface: SurfaceDesign, document: DesignDocument, noteIfEmpty: boolean, imageState: PrintCheckInputs['imageState'], graphicState: PrintCheckInputs['graphicState']): SideCheck {
  const visible = surface.elements.filter((e) => !e.hidden);
  const empty = isSideEmpty(surface);
  const side = surface.label.toLowerCase();
  if (empty) {
    const issues: PrintIssue[] = noteIfEmpty
      ? [
          {
            key: `${surface.id}:empty`,
            kind: 'empty-side',
            level: 'notice',
            surfaceId: surface.id,
            elementId: null,
            subject: surface.label,
            title: 'No artwork on this side',
            detail: `The ${side} prints blank.`,
          },
        ]
      : [];
    return { surfaceId: surface.id, label: surface.label, empty, issues, passed: [], artwork: [] };
  }

  const issues: PrintIssue[] = [];
  const add = (element: DesignElement, kind: IssueKind, level: IssueLevel, title: string, detail: string) =>
    issues.push({ key: `${surface.id}:${element.id}:${kind}`, kind, level, surfaceId: surface.id, elementId: element.id, subject: elementDisplayName(element, document), title, detail });
  const safeMm = roundTo(pxToMm(surface.print.safeZonePx, surface.print.dpi), 1);
  const bleedMm = roundTo(pxToMm(surface.print.bleedPx, surface.print.dpi), 1);
  const artwork: ArtworkCheck[] = [];

  // Top layer first, as the layers list shows them.
  for (const element of [...visible].reverse()) {
    const name = `“${elementDisplayName(element, document)}”`;
    const placement = artworkPlacement(element, surface.print);
    const background = (placement === 'into-bleed' || placement === 'past-bleed') && coversPiece(element, surface.print);
    if (background) {
      add(element, 'bleed-background', 'notice', 'Runs into the bleed', `${name} covers the whole piece, so its edge outside the trim is cut off, as expected for a background.`);
    } else if (placement === 'into-bleed') {
      add(
        element,
        'outside-trim',
        'serious',
        'Past the trim edge',
        `Part of ${name} is past the trim edge and will be cut off. That’s expected for a background running into the bleed; keep anything important inside the safe zone.`,
      );
    } else if (placement === 'past-bleed') {
      add(
        element,
        'outside-trim',
        'serious',
        surface.print.bleedPx > 0 ? 'Past the trim edge and the bleed' : 'Past the edge of the print area',
        surface.print.bleedPx > 0
          ? `Part of ${name} goes past the trim edge and beyond the ${bleedMm} mm bleed, outside what is printed. Move it in, and keep anything important inside the safe zone.`
          : `Part of ${name} is past the edge of the print area and won’t print. Move it in, and keep anything important inside the safe zone.`,
      );
    } else if (placement === 'off-print') {
      add(element, 'outside-trim', 'serious', 'Outside the print area', `${name} is entirely outside the print area, so it won’t print. Move it onto the design or delete it.`);
    } else if (placement === 'outside-safe') {
      add(element, 'outside-safe', 'warning', 'Outside the safe zone', `Part of ${name} is outside the safe zone and may be trimmed. Keep it at least ${safeMm} mm from the edge.`);
    }

    const resolution = artworkResolution(element, document, surface.print, imageState, graphicState);
    artwork.push({ elementId: element.id, name: elementDisplayName(element, document), type: artworkType(element), placement, background, resolution });

    if (element.type === 'image' && element.source.kind === 'asset') {
      if (resolution.kind === 'unavailable') {
        add(element, 'image-unavailable', 'warning', 'Image unavailable', `${name} isn’t in this browser, so it can’t be shown or printed. Replace it or delete it.`);
      } else if (resolution.kind === 'raster') {
        const { dpi, level } = resolution;
        if (level === 'low')
          add(
            element,
            'low-resolution',
            'warning',
            `Low resolution image — ${dpi} DPI`,
            `${name} may print soft at this size. Use a higher-resolution image, or make it smaller, for better print quality.`,
          );
        if (level === 'acceptable') add(element, 'acceptable-resolution', 'notice', `Acceptable resolution — ${dpi} DPI`, `${name} prints well at this size; 300 DPI or more is sharpest.`);
      }
    }
    if (element.type === 'image' && element.source.kind === 'graphic' && resolution.kind === 'unavailable') {
      add(element, 'graphic-unavailable', 'warning', 'Graphic unavailable', `${name} can’t be shown, so it won’t print. Replace it or delete it.`);
    }
    if (element.type === 'text' && !fontByFamily(element.fontFamily)) {
      add(element, 'font-unavailable', 'warning', 'Font unavailable', `${name} uses ${element.fontFamily}, which the Studio doesn’t have, so another font is shown. Choose one of the Studio’s fonts.`);
    }
    if (element.type === 'text' && element.placeholder) {
      add(element, 'sample-text', 'notice', 'Sample text', `${name} is the template’s sample text. Replace it with your own, unless it’s what you want printed.`);
    }
  }
  issues.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  const has = (kind: IssueKind) => issues.some((i) => i.kind === kind);
  const images = visible.filter((e) => e.type === 'image');
  const passed: string[] = [];
  if (!has('outside-trim')) passed.push('Nothing is past the trim edge');
  if (!has('outside-trim') && !has('outside-safe') && !has('bleed-background')) passed.push('Everything is inside the safe zone');
  if (artwork.some((a) => a.resolution.kind === 'raster') && !has('low-resolution') && !has('image-unavailable')) passed.push('Images are sharp enough to print (150 DPI or more)');
  if (images.length > 0 && !has('image-unavailable') && !has('graphic-unavailable')) passed.push('All images and graphics are available');
  if (visible.some((e) => e.type === 'text') && !has('font-unavailable')) passed.push('All fonts are available');
  return { surfaceId: surface.id, label: surface.label, empty, issues, passed, artwork };
}

// --------------------------------------------------------------- Artwork (M6)

/** Where an element sits against the safe zone, trim and bleed (see `ArtworkPlacement`). */
export function artworkPlacement(element: DesignElement, print: SurfacePrint): ArtworkPlacement {
  const placement = placementFor(element, print);
  if (placement !== 'outside-trim') return placement;
  const guides = guideGeometry(print);
  const box = boxOf(element);
  if (print.bleedPx > 0 && boxCorners(box).every((c) => shapeContains(guides.bleedShape, guides.bleed, c))) return 'into-bleed';
  const b = boundingRect(box);
  const r = guides.bleed;
  const apart = b.x >= r.x + r.width || b.x + b.width <= r.x || b.y >= r.y + r.height || b.y + b.height <= r.y;
  return apart ? 'off-print' : 'past-bleed';
}

/**
 * A filled rectangle or an image whose box covers the whole trim: a background, cut at the trim on
 * purpose. Text, outlines, lines and shapes that don't fill their box's corners never count.
 */
export function coversPiece(element: DesignElement, print: SurfacePrint): boolean {
  const boxy = element.type === 'image' || (element.type === 'shape' && element.shape === 'rect' && element.fill !== null);
  if (!boxy) return false;
  const box = boxOf(element);
  const corners = [
    { x: 0, y: 0 },
    { x: print.widthPx, y: 0 },
    { x: print.widthPx, y: print.heightPx },
    { x: 0, y: print.heightPx },
  ];
  return corners.every((c) => boxContains(box, c));
}

export function artworkType(element: DesignElement): ArtworkType {
  if (element.type === 'text') return 'text';
  if (element.type === 'shape') return 'shape';
  return element.source.kind === 'asset' ? 'photo' : 'graphic';
}

/** Vector uploads (SVG) have no pixels to count. The Studio doesn't accept them today, but a design may carry one. */
export function isVectorAsset(asset: Pick<DesignAsset, 'mime'>): boolean {
  return asset.mime === 'image/svg+xml';
}

export function artworkResolution(
  element: DesignElement,
  document: DesignDocument,
  print: SurfacePrint,
  imageState: PrintCheckInputs['imageState'],
  graphicState: PrintCheckInputs['graphicState'],
): ArtworkResolution {
  if (element.type !== 'image') return { kind: 'vector' };
  if (element.source.kind === 'graphic') return graphicState(element.source.graphicId) === 'missing' ? { kind: 'unavailable' } : { kind: 'vector' };
  const asset = document.assets[element.source.assetId];
  if (!asset || imageState(element.source.assetId) === 'missing') return { kind: 'unavailable' };
  if (isVectorAsset(asset)) return { kind: 'vector' };
  if (!(asset.naturalWidth > 0) || !(asset.naturalHeight > 0) || !(element.width > 0) || !(element.height > 0)) return { kind: 'unknown' };
  const dpi = effectiveDpi(element, asset, print);
  return {
    kind: 'raster',
    dpi,
    level: resolutionLevel(dpi),
    sourcePx: { width: asset.naturalWidth, height: asset.naturalHeight },
    printedMm: { width: roundTo(pxToMm(element.width, print.dpi), 1), height: roundTo(pxToMm(element.height, print.dpi), 1) },
  };
}
