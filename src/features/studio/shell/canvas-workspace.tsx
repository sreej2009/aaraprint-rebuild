import type Konva from 'konva';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { MeasurementLabels } from '../canvas/measurement-labels';
import { useCanvasGestures } from '../canvas/use-canvas-gestures';
import { useViewport, useViewportStoreApi } from '../canvas/viewport-context';
import { ZoomAnnouncer, ZoomControl } from '../canvas/zoom-control';
import { finishedSizeMm, printBoxes } from '../geometry/boxes';
import { fitScale, workspacePadding } from '../geometry/fit';
import { formatSize } from '../profile/describe';
import type { SurfaceDesign } from '../schema/types';
import { selectActiveSurface, useStudio } from '../store';
import { CANVAS_REGION_ID } from './dom-ids';
import { useElementSize } from './use-element-size';

// Konva is only downloaded with the canvas; the print-area preview shows while it loads.
const CanvasStage = lazy(() => import('../canvas/canvas-stage'));

export interface CanvasWorkspaceProps {
  /** Floating zoom pill inside the canvas (phones, where the top bar has no zoom control). */
  zoomPill?: boolean;
  onStage?: (stage: Konva.Stage | null) => void;
}

/**
 * The central workspace: the Konva canvas for the active side, fitted to the available space, with
 * wheel / drag / pinch navigation, dimension labels and a footer with size, DPI and guide legend.
 */
export function CanvasWorkspace({ zoomPill = false, onStage }: CanvasWorkspaceProps) {
  const surface = useStudio(selectActiveSurface);
  const areaRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(areaRef);
  const viewportStore = useViewportStoreApi();
  const viewport = useViewport((s) => s.viewport);
  const showGuides = useViewport((s) => s.showGuides);
  const ready = useViewport((s) => s.content !== null && s.area.width > 0 && s.area.height > 0);
  const cursor = useCanvasGestures(areaRef, viewportStore);
  const print = surface?.print;

  useEffect(() => {
    viewportStore.getState().actions.setArea(size);
  }, [viewportStore, size]);

  useEffect(() => {
    // Front and back share a size, so switching sides keeps the view; a different size re-fits.
    if (print) viewportStore.getState().actions.setContent(printBoxes(print).bleed, print.dpi);
  }, [viewportStore, print]);

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
      <div
        ref={areaRef}
        data-testid="canvas-area"
        className={cn('relative min-h-0 flex-1 touch-none overflow-hidden select-none', cursor === 'grab' && 'cursor-grab', cursor === 'grabbing' && 'cursor-grabbing')}
      >
        {ready && (
          <Suspense fallback={<PrintAreaPreview surface={surface} available={size} />}>
            <div aria-hidden="true" className="absolute inset-0">
              <CanvasStage surface={surface} width={size.width} height={size.height} viewport={viewport} showGuides={showGuides} onStage={onStage} />
            </div>
          </Suspense>
        )}
        {ready && showGuides && <MeasurementLabels print={surface.print} viewport={viewport} />}
        {zoomPill && (
          <div className="absolute right-3 bottom-3 rounded-full border border-border bg-surface/95 px-1 shadow-2 backdrop-blur">
            <ZoomControl />
          </div>
        )}
        <ZoomAnnouncer />
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-surface px-3 py-2 text-caption text-fg-muted md:px-4">
        <p>
          <span className="font-semibold text-fg">{surface.label}</span> · {sizeText} · {surface.print.dpi} DPI
        </p>
        <GuideLegend hasBleed={surface.print.bleedPx > 0} dimmed={!showGuides} />
      </footer>
    </section>
  );
}

function GuideLegend({ hasBleed, dimmed }: { hasBleed: boolean; dimmed: boolean }) {
  const items = [
    { label: 'Trim', className: 'border-guide-trim' },
    { label: 'Safe area', className: 'border-guide-safe border-dashed' },
    ...(hasBleed ? [{ label: 'Bleed', className: 'border-guide-bleed bg-guide-bleed/10' }] : []),
  ];
  return (
    <ul aria-label={dimmed ? 'Guides (hidden)' : 'Guides'} className={cn('flex items-center gap-3', dimmed && 'opacity-60')}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('inline-block size-3 rounded-[2px] border-2', item.className)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Lightweight HTML drawing of the print area, shown while the canvas code loads. */
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
      <div
        className={cn('relative', bleedPx > 0 && 'border border-guide-bleed/70 bg-guide-bleed/8')}
        style={{ width: px(boxes.bleed.width), height: px(boxes.bleed.height), borderRadius: radius(-bleedPx) }}
        data-testid="print-area-preview"
      >
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
