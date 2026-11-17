import type { ApprovalBlocker } from '../approval/approval';
import { bleedSizeMm, finishedSizeMm } from '../geometry/boxes';
import { pxToMm } from '../geometry/units';
import { formatLength, formatSize } from '../profile/describe';
import type { StudioProfile } from '../profile/types';
import type { SurfacePrint } from '../schema/types';
import type { ArtworkCheck, ArtworkPlacement, PrintReport } from './print-checks';

/**
 * Print check status and print facts (Phase 4 M6), pure.
 *
 * A status sums up the print checks and the M5 approval rules, which stay the only thing that
 * blocks: **Needs attention** exactly when "Approve and continue" is blocked, **Warning** when
 * something is worth checking but may be approved (as the original allowed), and **Ready**
 * otherwise. Nothing here adds a rule of its own.
 */

export type Readiness = 'ready' | 'warning' | 'blocked';
/** A side also can be blank (a back left empty prints blank; that's allowed). */
export type SideReadiness = Readiness | 'blank';

export const READINESS_LABELS: Record<SideReadiness, string> = { ready: 'Ready', warning: 'Warning', blocked: 'Needs attention', blank: 'Blank' };

export interface PrintReadiness {
  overall: Readiness;
  /** One sentence for the overall status. */
  summary: string;
  sides: { surfaceId: string; label: string; status: SideReadiness; warnings: number; detail: string }[];
}

/**
 * `sameDesign`: the product's "Same design on both sides" choice (recorded with the design, M2).
 * The Studio doesn't copy artwork between sides, so a blank side is still said to be blank; with
 * the choice on, it says so too, rather than pretending the back is drawn.
 */
export function printReadiness(report: PrintReport, blockers: readonly ApprovalBlocker[], sameDesign: boolean | null = null): PrintReadiness {
  const overall: Readiness = blockers.length > 0 ? 'blocked' : report.warnings > 0 ? 'warning' : 'ready';
  const n = report.warnings;
  const summary =
    overall === 'blocked'
      ? `Needs attention: ${blockers.length === 1 ? 'one thing has' : `${blockers.length} things have`} to be fixed before you can approve.`
      : overall === 'warning'
        ? `${n} ${n === 1 ? 'thing' : 'things'} worth checking. You can still approve.`
        : 'Ready to print: nothing to fix.';
  const sides = report.sides.map((side) => {
    const warnings = side.issues.filter((i) => i.level !== 'notice').length;
    const missing = side.issues.some((i) => i.kind === 'image-unavailable' || i.kind === 'graphic-unavailable');
    const status: SideReadiness = report.empty ? 'blocked' : missing ? 'blocked' : side.empty ? 'blank' : warnings > 0 ? 'warning' : 'ready';
    const detail =
      status === 'blank'
        ? sameDesign
          ? 'No artwork of its own; “Same design on both sides” is on'
          : 'No artwork; prints blank'
        : report.empty
          ? 'Empty'
          : missing
            ? 'A file is missing'
            : warnings > 0
              ? `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`
              : 'No warnings';
    return { surfaceId: side.surfaceId, label: side.label, status, warnings, detail };
  });
  return { overall, summary, sides };
}

// ------------------------------------------------------------------- Facts

export interface PrintFact {
  term: string;
  value: string;
}

const NBSP = String.fromCharCode(0xa0);
const SHAPES: Record<SurfacePrint['trim']['shape'], string> = { rectangle: 'Rectangle', 'rounded-rectangle': 'Rounded corners', ellipse: 'Round' };

/**
 * What a side prints at, from its print configuration (the document carries it per side, copied
 * from the product's print config). Every value is from the data or a stated conversion
 * (mm = px ÷ DPI × 25.4); nothing is estimated.
 */
export function printFacts(print: SurfacePrint): PrintFact[] {
  const finished = finishedSizeMm(print);
  const withBleed = bleedSizeMm(print);
  const mm = (px: number) => formatLength(pxToMm(px, print.dpi));
  const px = (w: number, h: number) => `${w}${NBSP}×${NBSP}${h}${NBSP}px`;
  return [
    { term: 'Print size (trim)', value: formatSize(finished.width, finished.height) },
    { term: 'With bleed', value: print.bleedPx > 0 ? formatSize(withBleed.width, withBleed.height) : 'No bleed' },
    { term: 'Bleed', value: print.bleedPx > 0 ? `${mm(print.bleedPx)} each side` : 'None' },
    { term: 'Safe zone', value: print.safeZonePx > 0 ? `${mm(print.safeZonePx)} inside the trim` : 'None' },
    { term: 'Print resolution', value: `${print.dpi}${NBSP}DPI` },
    { term: 'Print area', value: print.bleedPx > 0 ? `${px(print.widthPx, print.heightPx)} (${px(print.widthPx + 2 * print.bleedPx, print.heightPx + 2 * print.bleedPx)} with bleed)` : px(print.widthPx, print.heightPx) },
    { term: 'Shape', value: SHAPES[print.trim.shape] },
  ];
}

/**
 * What the print facts can't say, from the product's profile: products whose real print size
 * follows a choice (Size, Height…) keep one design area in the Studio, and the size printed for
 * the choice isn't in the data. Said plainly rather than guessed.
 */
export function printFactNotes(profile: Pick<StudioProfile, 'geometryOptions'>): string[] {
  const options = profile.geometryOptions ?? [];
  if (options.length === 0) return [];
  const names = options.map((o) => o.toLowerCase());
  return [`The printed size for your ${names.join(' and ')} choice isn’t available here: these figures are this product’s design area.`];
}

// ----------------------------------------------------------------- Artwork

export const PLACEMENT_LABELS: Record<ArtworkPlacement, string> = {
  inside: 'Inside the safe zone',
  'outside-safe': 'Outside the safe zone',
  'into-bleed': 'Past the trim, in the bleed',
  'past-bleed': 'Past the bleed edge',
  'off-print': 'Outside the print area',
};

const TYPE_LABELS: Record<ArtworkCheck['type'], string> = { photo: 'Image', graphic: 'Graphic', text: 'Text', shape: 'Shape' };

/** "Image · 312 DPI (Good)", "Text · vector", "Image · resolution not available". */
export function describeArtwork(item: ArtworkCheck, bleed: boolean): { type: string; resolution: string; placement: string; tone: 'ok' | 'notice' | 'warning' } {
  const r = item.resolution;
  const resolution =
    r.kind === 'raster'
      ? `${r.dpi}${NBSP}DPI ${r.level === 'good' ? '(good)' : r.level === 'acceptable' ? '(acceptable)' : '(low)'} · ${r.sourcePx.width}${NBSP}×${NBSP}${r.sourcePx.height}${NBSP}px file printed at ${formatSize(r.printedMm.width, r.printedMm.height)}`
      : r.kind === 'vector'
        ? item.type === 'text'
          ? 'Vector text: sharp at any size'
          : 'Vector: sharp at any size'
        : r.kind === 'unavailable'
          ? 'Not available: the file is missing'
          : 'Resolution can’t be determined: the file’s pixel size isn’t known';
  const placement = item.background ? 'Background into the bleed' : item.placement === 'past-bleed' && !bleed ? 'Past the edge of the print area' : PLACEMENT_LABELS[item.placement];
  const placementWarns = !item.background && item.placement !== 'inside';
  const resolutionWarns = r.kind === 'unavailable' || (r.kind === 'raster' && r.level === 'low');
  const tone = placementWarns || resolutionWarns ? 'warning' : item.background || (r.kind === 'raster' && r.level === 'acceptable') || r.kind === 'unknown' ? 'notice' : 'ok';
  return { type: TYPE_LABELS[item.type], resolution, placement, tone };
}
