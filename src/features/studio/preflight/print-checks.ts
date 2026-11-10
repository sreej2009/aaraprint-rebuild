import { fontByFamily } from '../assets/fonts';
import { effectiveDpi, resolutionLevel } from '../assets/image-placement';
import { placementFor } from '../canvas/transform-rules';
import { pxToMm, roundTo } from '../geometry/units';
import { elementDisplayName } from '../naming';
import type { DesignDocument, DesignElement, SurfaceDesign } from '../schema/types';

/**
 * Print checks (Plan M15): advice computed from the design document and the product's print
 * geometry, never stored in the design and never blocking anything (blocking preflight is Phase 4).
 * Reuses the editor's own rules: the safe-zone and trim test the canvas already shows
 * (canvas/transform-rules.ts `placementFor`, rotated corners against the trim shape) and the M12
 * resolution bands (≥ 300 DPI good, 150–299 acceptable, below 150 low).
 */

export type IssueKind = 'empty-design' | 'empty-side' | 'outside-trim' | 'outside-safe' | 'low-resolution' | 'acceptable-resolution' | 'image-unavailable' | 'graphic-unavailable' | 'font-unavailable';

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

export interface SideCheck {
  surfaceId: string;
  label: string;
  empty: boolean;
  issues: PrintIssue[];
  /** What's fine on this side, in plain words. */
  passed: string[];
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
    return { surfaceId: surface.id, label: surface.label, empty, issues, passed: [] };
  }

  const issues: PrintIssue[] = [];
  const add = (element: DesignElement, kind: IssueKind, level: IssueLevel, title: string, detail: string) =>
    issues.push({ key: `${surface.id}:${element.id}:${kind}`, kind, level, surfaceId: surface.id, elementId: element.id, subject: elementDisplayName(element, document), title, detail });
  const safeMm = roundTo(pxToMm(surface.print.safeZonePx, surface.print.dpi), 1);

  // Top layer first, as the layers list shows them.
  for (const element of [...visible].reverse()) {
    const name = `“${elementDisplayName(element, document)}”`;
    const placement = placementFor(element, surface.print);
    if (placement === 'outside-trim') {
      add(
        element,
        'outside-trim',
        'serious',
        'Past the trim edge',
        `Part of ${name} is past the trim edge and will be cut off. That’s expected for a background running into the bleed; keep anything important inside the safe zone.`,
      );
    } else if (placement === 'outside-safe') {
      add(element, 'outside-safe', 'warning', 'Outside the safe zone', `Part of ${name} is outside the safe zone and may be trimmed. Keep it at least ${safeMm} mm from the edge.`);
    }

    if (element.type === 'image' && element.source.kind === 'asset') {
      const asset = document.assets[element.source.assetId];
      if (!asset || imageState(element.source.assetId) === 'missing') {
        add(element, 'image-unavailable', 'warning', 'Image unavailable', `${name} isn’t in this browser, so it can’t be shown or printed. Replace it or delete it.`);
      } else {
        const dpi = effectiveDpi(element, asset, surface.print);
        const level = resolutionLevel(dpi);
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
    if (element.type === 'image' && element.source.kind === 'graphic' && graphicState(element.source.graphicId) === 'missing') {
      add(element, 'graphic-unavailable', 'warning', 'Graphic unavailable', `${name} can’t be shown, so it won’t print. Replace it or delete it.`);
    }
    if (element.type === 'text' && !fontByFamily(element.fontFamily)) {
      add(element, 'font-unavailable', 'warning', 'Font unavailable', `${name} uses ${element.fontFamily}, which the Studio doesn’t have, so another font is shown. Choose one of the Studio’s fonts.`);
    }
  }
  issues.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  const has = (kind: IssueKind) => issues.some((i) => i.kind === kind);
  const images = visible.filter((e) => e.type === 'image');
  const passed: string[] = [];
  if (!has('outside-trim')) passed.push('Nothing is past the trim edge');
  if (!has('outside-trim') && !has('outside-safe')) passed.push('Everything is inside the safe zone');
  if (visible.some((e) => e.type === 'image' && e.source.kind === 'asset') && !has('low-resolution') && !has('image-unavailable')) passed.push('Images are sharp enough to print (150 DPI or more)');
  if (images.length > 0 && !has('image-unavailable') && !has('graphic-unavailable')) passed.push('All images and graphics are available');
  if (visible.some((e) => e.type === 'text') && !has('font-unavailable')) passed.push('All fonts are available');
  return { surfaceId: surface.id, label: surface.label, empty, issues, passed };
}
