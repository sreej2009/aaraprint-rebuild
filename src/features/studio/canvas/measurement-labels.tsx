import { printBoxes } from '../geometry/boxes';
import { pxToMm } from '../geometry/units';
import { toScreenRect, type Viewport } from '../geometry/viewport';
import { formatLength } from '../profile/describe';
import type { SurfacePrint } from '../schema/types';

/** Space between the bleed edge and the dimension line, in screen px. */
const GAP = 14;
/** Hide labels when the sheet is too small on screen for them to be readable. */
const MIN_SIZE = 72;

/**
 * Dimension lines for the finished (trim) size: width above the sheet, height to its left.
 * Screen-only decoration (aria-hidden; the canvas label and footer carry the same facts) drawn
 * in HTML over the canvas, so it's never part of the artwork.
 */
export function MeasurementLabels({ print, viewport }: { print: SurfacePrint; viewport: Viewport }) {
  const boxes = printBoxes(print);
  const trim = toScreenRect(viewport, boxes.trim);
  const bleed = toScreenRect(viewport, boxes.bleed);
  const width = formatLength(pxToMm(print.widthPx, print.dpi));
  const height = formatLength(pxToMm(print.heightPx, print.dpi));
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden text-caption text-fg-muted" data-testid="measurements">
      {trim.width >= MIN_SIZE && (
        <div className="absolute flex items-center" style={{ left: trim.x, top: bleed.y - GAP, width: trim.width, transform: 'translateY(-50%)' }} data-testid="measure-width">
          <DimensionLine />
          <span className="shrink-0 rounded-sm bg-surface-sunken px-1.5 whitespace-nowrap tabular-nums">{width}</span>
          <DimensionLine />
        </div>
      )}
      {trim.height >= MIN_SIZE && (
        <div
          className="absolute flex items-center"
          style={{ left: bleed.x - GAP, top: trim.y + trim.height / 2, width: trim.height, transform: 'translate(-50%, -50%) rotate(-90deg)' }}
          data-testid="measure-height"
        >
          <DimensionLine />
          <span className="shrink-0 rounded-sm bg-surface-sunken px-1.5 whitespace-nowrap tabular-nums">{height}</span>
          <DimensionLine />
        </div>
      )}
    </div>
  );
}

function DimensionLine() {
  return <span className="h-2 flex-1 border-x border-fg-subtle bg-[linear-gradient(var(--color-fg-subtle),var(--color-fg-subtle))] bg-[length:100%_1px] bg-center bg-no-repeat" />;
}
