import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { finishedSizeMm, printBoxes } from '../geometry/boxes';
import { fitScale, workspacePadding } from '../geometry/fit';
import { formatSize } from '../profile/describe';
import type { SurfaceDesign } from '../schema/types';
import { selectActiveSurface, useStudio } from '../store';
import { CANVAS_REGION_ID } from './dom-ids';
import { useElementSize } from './use-element-size';

/**
 * The central workspace. M5 mounts the Konva CanvasStage here (same region, same fit maths);
 * until then it draws the print area — trim, safe zone and bleed — at the right proportions,
 * so customers and reviewers see the real size and shape of what they're designing.
 */
export function CanvasWorkspace() {
  const surface = useStudio(selectActiveSurface);
  const areaRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(areaRef);
  if (!surface) return null;
  const finished = finishedSizeMm(surface.print);
  const sizeText = formatSize(finished.width, finished.height);
  return (
    <section
      id={CANVAS_REGION_ID}
      aria-label={`Design canvas: ${surface.label}, ${sizeText}`}
      aria-roledescription="design canvas"
      className="relative flex h-full min-h-0 flex-col bg-surface-sunken"
    >
      <div ref={areaRef} className="relative min-h-0 flex-1 overflow-hidden">
        <PrintAreaPreview surface={surface} available={size} />
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-surface px-3 py-2 text-caption text-fg-muted md:px-4">
        <p>
          <span className="font-semibold text-fg">{surface.label}</span> · {sizeText} · {surface.print.dpi} DPI
        </p>
        <GuideLegend hasBleed={surface.print.bleedPx > 0} />
      </footer>
    </section>
  );
}

function GuideLegend({ hasBleed }: { hasBleed: boolean }) {
  const items = [
    { label: 'Trim', className: 'border-guide-trim' },
    { label: 'Safe area', className: 'border-guide-safe border-dashed' },
    ...(hasBleed ? [{ label: 'Bleed', className: 'border-guide-bleed' }] : []),
  ];
  return (
    <ul aria-label="Guides" className="flex items-center gap-3">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('inline-block size-3 rounded-[2px] border-2', item.className)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function PrintAreaPreview({ surface, available }: { surface: SurfaceDesign; available: { width: number; height: number } }) {
  const boxes = printBoxes(surface.print);
  const scale = fitScale(available, boxes.bleed, workspacePadding(available.width));
  if (scale <= 0) return null;
  const { bleedPx, safeZonePx, trim } = surface.print;
  const px = (value: number) => value * scale;
  const radius = (inset: number): string => {
    if (trim.shape === 'ellipse') return '50%';
    if (trim.shape === 'rounded-rectangle') return `${Math.max(0, px(trim.cornerRadiusPx - inset))}px`;
    return '0px';
  };
  return (
    <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
      {/* Bleed area: tinted, outside the trim. */}
      <div
        className={cn('relative', bleedPx > 0 && 'border border-guide-bleed/70 bg-guide-bleed/8')}
        style={{ width: px(boxes.bleed.width), height: px(boxes.bleed.height), borderRadius: radius(-bleedPx) }}
        data-testid="print-area-preview"
      >
        {/* Trim: the finished piece. */}
        <div
          className="absolute bg-surface shadow-2 outline outline-1 outline-guide-trim/80"
          style={{
            left: px(bleedPx),
            top: px(bleedPx),
            width: px(boxes.trim.width),
            height: px(boxes.trim.height),
            borderRadius: radius(0),
            backgroundColor: surface.background.color ?? undefined,
          }}
        >
          {safeZonePx > 0 && (
            <div
              className="absolute border border-dashed border-guide-safe"
              style={{ left: px(safeZonePx), top: px(safeZonePx), right: px(safeZonePx), bottom: px(safeZonePx), borderRadius: radius(safeZonePx) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
