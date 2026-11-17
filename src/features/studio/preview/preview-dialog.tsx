import type Konva from 'konva';
import { ChevronDown, Eye, Maximize, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog as DialogPrimitive, RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { Component, Suspense, type ComponentType, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton, SegmentedControl, Spinner } from '@/design-system';
import { cn } from '@/lib/cn';
import { finishedSizeMm } from '../geometry/boxes';
import { formatZoom, wheelZoomFactor } from '../geometry/viewport';
import { formatSize } from '../profile/describe';
import type { StudioProfile } from '../profile/types';
import { productSpace } from '../product-view/product-view';
import { COLOUR_UNAVAILABLE, colourUnavailable } from '../product-view/product-view';
import { useProductColour, useProductColourOffered, useProductView, useProductViewOffered } from '../product-view/use-product-view';
import { ProductViewToggle, type ProductViewMode } from '../product-view/view-toggle';
import type { DesignDocument, SurfaceDesign } from '../schema/types';
import { useStudio, useStudioStoreApi } from '../store';
import { useStudioSession } from '../shell/session-context';
import { useStudioUi } from '../shell/ui-context';
import { useElementSize } from '../shell/use-element-size';
import { PrintLegend } from '../preflight/print-check-parts';
import { usePrintStatus, type PrintCheckState } from '../preflight/use-print-status';
import { READINESS_LABELS } from '../preflight/print-status';
import { usePrintReportFor } from '../preflight/use-print-report';
import { canPan, panBy, percentOf, PREVIEW_PRESETS, previewFit, previewLimits, printSpace, stepPreviewPercent, viewportFor, zoomToPercent, type PreviewZoom } from './preview-view';
import { usePreviewReady } from './readiness';
import { previewRenderer } from './renderer';

/**
 * Preview (Plan M14): the current design as the finished piece, full screen, without the editor.
 * It reads the design document in memory (unsaved changes included) and never changes it: no
 * undo steps, no autosave, and the editor's side, selection and zoom are as they were on close.
 * Focus moves into the preview on open and back to the Preview button on close.
 */
export function PreviewButton({ iconOnly }: { iconOnly: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="secondary" size="sm" aria-haspopup="dialog" className={cn(iconOnly && 'size-9 px-0')} data-testid="preview-button">
          <Eye aria-hidden="true" />
          <span className={cn(iconOnly ? 'sr-only' : 'max-[1399px]:sr-only')}>Preview</span>
        </Button>
      </DialogPrimitive.Trigger>
      {open && <PreviewDialog />}
    </DialogPrimitive.Root>
  );
}

/**
 * Review your design (Phase 4 M5) is this same dialog — the same drawing, sides, zoom and product
 * view — with a review panel beside the preview (below it on phones). `Panel` gets `capture`,
 * a small PNG of the preview (null when it can't be drawn), for the approval.
 *
 * Phase 4 M6: Review also has a **Print check** view — the side's whole print area with trim,
 * bleed, safe zone and the elements worth checking outlined — and the panel gets the checks, the
 * status and what blocks approval, worked out once here. `capture` always pictures the preview:
 * from the print check view it switches back first.
 */
export interface ReviewPanelProps {
  capture: () => Promise<string | null>;
  checks: PrintCheckState;
  printView: boolean;
  onPrintView(on: boolean): void;
  /** The side shown. */
  surface: SurfaceDesign;
}

export interface ReviewSlot {
  title: string;
  closeLabel: string;
  description: string;
  Panel: ComponentType<ReviewPanelProps>;
}

export function PreviewDialog({ review }: { review?: ReviewSlot } = {}) {
  const document = useStudio((s) => s.document);
  const { profile, workspace } = useStudioSession();
  const studio = useStudioStoreApi();
  // Flat (the finished piece, as in Phase 3) or on the product photo (Phase 4 M1); kept on retry.
  // Photo-frame families have only the product (M4-C).
  const productOnly = workspace?.productOnly ?? false;
  const [view, setView] = useState<PreviewMode>(productOnly ? 'product' : 'flat');
  // Starts on the side being edited; switching here never changes the editor's side.
  const [sideId, setSideId] = useState(() => studio.getState().editor.activeSurfaceId);
  const surface = document.surfaces.find((s) => s.id === sideId) ?? document.surfaces[0]!;
  const contentRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  // Review's view: the preview or the print check (M6). Kept on retry.
  const [printView, setPrintView] = useState(false);
  const body = { document, surface, profile, view: productOnly ? 'product' : view, productOnly, onView: setView, onSide: setSideId, onRetry: () => setAttempt((n) => n + 1) } as const;

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content
        ref={contentRef}
        aria-describedby="studio-preview-description"
        data-testid={review ? 'studio-review' : 'studio-preview'}
        data-modal-dialog=""
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        className="fixed inset-0 z-50 flex flex-col bg-surface-sunken outline-none data-[state=open]:animate-fade-in"
      >
        {review ? <ReviewBody key={attempt} {...body} review={review} printView={printView} onPrintView={setPrintView} /> : <PreviewBody key={attempt} {...body} />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Editor shortcut keys (with Ctrl/⌘) whose browser default must not run either (bookmark, save page…). */
const EDITOR_KEYS = new Set(['z', 'y', 'd', 's', '[', ']', '{', '}', ';']);

type PreviewMode = ProductViewMode;

/** Shown when "On the product" is chosen but this side's photo can't be shown. */
export const PRODUCT_VIEW_UNAVAILABLE = 'On-product preview unavailable for this product.';

/** Review: the print checks of the design shown, worked out once for the drawing and the panel. */
function ReviewBody(props: BodyProps & { review: ReviewSlot }) {
  const checks = usePrintStatus(usePrintReportFor(props.document));
  return <PreviewBody {...props} checks={checks} />;
}

type ReviewView = 'preview' | 'print';

const FIT: PreviewZoom = { mode: 'fit' };

interface BodyProps {
  document: DesignDocument;
  surface: SurfaceDesign;
  profile: StudioProfile;
  view: PreviewMode;
  /** The product is the only view (photo-frame families): no Flat switch. */
  productOnly?: boolean;
  /** Review your design (Phase 4 M5): the review panel and its texts. */
  review?: ReviewSlot | undefined;
  /** Review (M6): the print checks, and whether the print check view is shown. */
  checks?: PrintCheckState;
  printView?: boolean;
  onPrintView?(on: boolean): void;
  onView(view: PreviewMode): void;
  onSide(id: string): void;
  onRetry(): void;
}

function PreviewBody({ document, surface, profile, view, productOnly = false, review, checks, printView = false, onPrintView, onView, onSide, onRetry }: BodyProps) {
  const ready = usePreviewReady(document.surfaces);
  // Phones keep the header short: sides and zoom move to the bottom bar (and the view toggle on tablets too).
  const layout = useStudioUi().layout;
  const phone = layout === 'phone';
  const roomy = layout === 'laptop' || layout === 'desktop';
  const areaRef = useRef<HTMLElement>(null);
  const { Canvas, ProductCanvas, PrintCanvas, size: fixedSize } = previewRenderer();
  const measured = useElementSize(areaRef);
  const available = fixedSize ?? measured;
  // Review's print check view (M6): the whole print area, with its guides.
  const printing = Boolean(review && checks && printView);
  const reviewView: ReviewView = printing ? 'print' : 'preview';
  // Each view starts fitted: the zoom belongs to the view it was set in.
  const [zoomState, setZoomState] = useState<{ view: ReviewView; zoom: PreviewZoom }>({ view: 'preview', zoom: { mode: 'fit' } });
  const zoom: PreviewZoom = zoomState.view === reviewView ? zoomState.zoom : FIT;
  const setZoom = useCallback(
    (next: PreviewZoom | ((current: PreviewZoom) => PreviewZoom)) =>
      setZoomState((state) => {
        const current = state.view === reviewView ? state.zoom : FIT;
        return { view: reviewView, zoom: typeof next === 'function' ? next(current) : next };
      }),
    [reviewView],
  );
  const [failed, setFailed] = useState(false);
  // The drawn stage (flat or on the product), for the approval's thumbnail.
  const stageRef = useRef<Konva.Stage | null>(null);
  const [stageVersion, setStageVersion] = useState(0);
  const onStage = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage;
    if (stage) setStageVersion((v) => v + 1);
  }, []);
  const snap = useCallback((): string | null => {
    const stage = stageRef.current;
    if (!stage || stage.width() === 0 || stage.height() === 0) return null;
    try {
      return stage.toDataURL({ mimeType: 'image/png', pixelRatio: Math.min(1, 360 / Math.max(stage.width(), stage.height())) });
    } catch {
      return null; // a photo that can't be read back: approve without a thumbnail
    }
  }, []);

  /*
   * On the product (Phase 4 M1): offered only when a side has a photo whose rights are cleared, with
   * the original's placement, and the media library is published. The photo is a backdrop: the
   * design isn't changed, saved or exported with it. Only the photo for the side shown is loaded.
   */
  const offered = useProductViewOffered(profile, document.surfaces);
  const wanted = offered && view === 'product' && !printing;
  // The product colour is the design's (Product options, M4): the same tinted photo as the canvas.
  const { colour } = useProductColour(profile);
  const colourOffered = useProductColourOffered(profile, document.surfaces);
  const product = useProductView(profile, surface, wanted, colourOffered ? colour : null);
  const { view: productView, placed, photo } = product;
  const onProduct = product.status === 'loading' || product.status === 'ready';
  const print = surface.print;
  // Zoom and pan work the same on the product: over the whole photo, 100 % = the artwork's real size.
  const space = useMemo(() => (printing ? printSpace(print) : onProduct && productView && placed ? productSpace(productView, placed, print) : print), [printing, onProduct, productView, placed, print]);
  const shown = ready && (printing || product.status !== 'loading');

  // The approval's thumbnail is always the preview (flat or on the product), never the print check
  // view: from there, Review switches back and pictures the preview once it is drawn.
  const printingNow = useRef(printing);
  const waiting = useRef<((url: string | null) => void)[]>([]);
  useEffect(() => {
    printingNow.current = printing;
  }, [printing]);
  useEffect(() => {
    if (printing || !shown || waiting.current.length === 0) return;
    const frame = requestAnimationFrame(() => {
      const url = snap();
      for (const resolve of waiting.current.splice(0)) resolve(url);
    });
    return () => cancelAnimationFrame(frame);
  }, [printing, shown, stageVersion, snap]);
  const capture = useCallback((): Promise<string | null> => {
    if (!printingNow.current) return Promise.resolve(snap());
    return new Promise((resolve) => {
      const done = (url: string | null) => {
        clearTimeout(timer);
        resolve(url);
      };
      // Never hold the approval up: without a picture in 5 s, approve without a thumbnail.
      const timer = setTimeout(() => {
        waiting.current = waiting.current.filter((w) => w !== done);
        resolve(null);
      }, 5000);
      waiting.current.push(done);
      onPrintView?.(false);
    });
  }, [snap, onPrintView]);
  const sized = available.width > 0 && available.height > 0;
  const viewport = useMemo(() => (sized ? viewportFor(zoom, available, space) : { scale: 0, x: 0, y: 0 }), [sized, zoom, available, space]);
  const fitPercent = sized ? percentOf(previewFit(available, space), space) : 100;
  const percent = sized ? percentOf(viewport, space) : 100;
  const limits = previewLimits(fitPercent);
  const pannable = sized && canPan(viewport, available, space);
  const sided = document.surfaces.length > 1;
  const empty = document.surfaces.every(isBlank);
  const size = finishedSizeMm(print);

  const zoomTo = useCallback(
    (next: number | 'fit', anchor?: { x: number; y: number }) => {
      if (next === 'fit') setZoom({ mode: 'fit' });
      else setZoom((z) => ({ mode: 'manual', viewport: zoomToPercent(viewportFor(z, available, space), next, available, space, anchor) }));
    },
    [available, space, setZoom],
  );
  const step = useCallback((direction: 1 | -1) => zoomTo(stepPreviewPercent(percent, direction, fitPercent)), [zoomTo, percent, fitPercent]);

  // Switching sides keeps a chosen zoom level (the sides share a size); Fit stays Fit. On the
  // product each side has its own photo, so it starts fitted.
  const switchSide = (id: string) => {
    onSide(id);
    if (wanted) setZoom({ mode: 'fit' });
    else if (zoom.mode === 'manual') setZoom({ mode: 'manual', viewport: zoomToPercent({ scale: 0, x: 0, y: 0 }, percent, available, space) });
  };
  // Flat and on the product show different things, so each starts fitted.
  const switchView = (next: PreviewMode) => {
    onView(next);
    setZoom({ mode: 'fit' });
  };

  // Ctrl/⌘ + wheel or a trackpad pinch zooms around the pointer; a plain wheel moves a zoomed piece.
  useEffect(() => {
    const area = areaRef.current;
    if (!area || !sized) return;
    const onWheel = (event: WheelEvent) => {
      const rect = area.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomTo(percent * wheelZoomFactor(event.deltaY, event.deltaMode), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      } else if (pannable) {
        event.preventDefault();
        setZoom({ mode: 'manual', viewport: panBy(viewport, -event.deltaX, -event.deltaY, available, space) });
      }
    };
    area.addEventListener('wheel', onWheel, { passive: false });
    return () => area.removeEventListener('wheel', onWheel);
  }, [sized, pannable, percent, viewport, available, space, zoomTo, setZoom]);

  // Dragging (mouse, pen or one finger) moves the piece once it's bigger than the screen.
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!pannable || event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    drag.current = { id: start.id, x: event.clientX, y: event.clientY };
    setZoom({ mode: 'manual', viewport: panBy(viewport, event.clientX - start.x, event.clientY - start.y, available, space) });
  };
  const endDrag = () => {
    drag.current = null;
  };

  /*
   * The editor's shortcuts listen on the window (Ctrl/⌘ Z, Y, D, S, [ ], + − 0, Shift 1). While the
   * preview is open none of them may reach the design or the editor's view, wherever focus is —
   * so the preview takes these keys first (window, capture phase). Ctrl/⌘ + − 0 and Shift 1 zoom
   * the preview instead. Plain keys pass: the editor only uses them in its own regions, and the
   * preview needs its arrow keys and Escape.
   */
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const fitKey = !mod && event.shiftKey && event.code === 'Digit1';
      if (!mod && !event.altKey && !fitKey) return;
      event.stopPropagation();
      const key = event.key.toLowerCase();
      if (mod && (key === '=' || key === '+')) step(1);
      else if (mod && (key === '-' || key === '_')) step(-1);
      else if (mod && key === '0') zoomTo(100);
      else if (fitKey) zoomTo('fit');
      else if (!mod || !EDITOR_KEYS.has(key)) return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, zoomTo]);

  // Arrow keys move a zoomed piece while the artwork has focus.
  const onArtworkKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!pannable) return;
    const distance = event.shiftKey ? 160 : 40;
    const moves: Record<string, [number, number]> = { ArrowLeft: [distance, 0], ArrowRight: [-distance, 0], ArrowUp: [0, distance], ArrowDown: [0, -distance] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setZoom({ mode: 'manual', viewport: panBy(viewport, move[0], move[1], available, space) });
  };

  const sideName = sided ? `${surface.label} side` : 'Design';
  const status = empty ? 'Your design is empty' : isBlank(surface) ? 'No artwork on this side' : null;
  const notes = [
    status,
    wanted && !onProduct ? PRODUCT_VIEW_UNAVAILABLE : null,
    onProduct && colourUnavailable(product.view, colour, product.tint) ? COLOUR_UNAVAILABLE : null,
  ].filter((n): n is string => n !== null);
  const toggle = offered && !productOnly && !printing && (
    <>
      <ProductViewToggle label="Preview view" testId="preview-view-toggle" value={view} onChange={switchView} />
    </>
  );
  // Review (M6): Preview or Print check.
  const reviewToggle = review && checks && onPrintView && (
    <div data-testid="review-view-toggle" className="shrink-0">
      <SegmentedControl
        label="Review view"
        size="sm"
        options={[
          { value: 'preview', label: 'Preview' },
          { value: 'print', label: 'Print check' },
        ]}
        value={reviewView}
        onValueChange={(next) => onPrintView(next === 'print')}
        className="pointer-coarse:*:h-11"
      />
    </div>
  );
  const sideStatus = checks?.readiness.sides.find((s) => s.surfaceId === surface.id);
  const flagged = useMemo(
    () =>
      (checks?.report.sides.find((s) => s.surfaceId === surface.id)?.issues ?? [])
        .filter((i): i is typeof i & { elementId: string; level: 'serious' | 'warning' } => i.elementId !== null && i.level !== 'notice')
        .map((i) => ({ elementId: i.elementId, level: i.level })),
    [checks, surface.id],
  );
  // Side tabs say each side's print check status in the print check view.
  const sideNote = printing && checks ? (s: SurfaceDesign) => {
    const found = checks.readiness.sides.find((r) => r.surfaceId === s.id);
    return found ? READINESS_LABELS[found.status] : '';
  } : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2 md:gap-4 md:px-4">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <DialogPrimitive.Title className="text-body font-semibold text-fg">{review ? review.title : 'Preview'}</DialogPrimitive.Title>
          <p className="truncate text-caption text-fg-muted" title={document.name}>
            {document.name}
          </p>
        </div>
        {!phone && sided && <SidePicker document={document} active={surface.id} onSelect={switchSide} note={sideNote} />}
        {roomy && reviewToggle}
        {roomy && toggle}
        {!phone && <ZoomControls percent={percent} limits={limits} fit={zoom.mode === 'fit'} onStep={step} onZoom={zoomTo} />}
        <DialogPrimitive.Close asChild>
          <IconButton label={review ? review.closeLabel : 'Close preview'} icon={<X />} size="sm" tooltip={false} className="pointer-coarse:size-11" />
        </DialogPrimitive.Close>
      </header>
      <DialogPrimitive.Description id="studio-preview-description" className="sr-only">
        {review ? `${review.description} ` : ''}
        {printing
          ? `Print check of ${sided ? `the ${surface.label.toLowerCase()} of ` : ''}“${document.name}”: the whole print area (${formatSize(size.width, size.height)} trim${print.bleedPx > 0 ? ' plus bleed' : ''}) with the trim, bleed and safe zone drawn, and anything worth checking outlined. Escape closes the review.`
          : onProduct
          ? `How ${sided ? `the ${surface.label.toLowerCase()} of ` : ''}“${document.name}” will look on the product (${formatSize(size.width, size.height)} print), shown on a product photo; colours and fit are approximate. Guides, bleed and editing controls are hidden. Escape closes the preview.`
          : `How ${sided ? `the ${surface.label.toLowerCase()} of ` : ''}“${document.name}” will look once printed and trimmed (${formatSize(size.width, size.height)}). Guides, bleed and editing controls are hidden. Escape closes the preview.`}
      </DialogPrimitive.Description>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the artwork region: focusable only while zoomed in, so arrow keys (and drags) move around; every action also has a button */}
      <section
        ref={areaRef}
        aria-roledescription="preview"
        aria-label={`${sideName}${printing ? ' print check' : onProduct ? ' on the product' : ''}: ${status ?? `${visibleCount(surface)} ${visibleCount(surface) === 1 ? 'item' : 'items'}`}${printing && sideStatus ? `, ${READINESS_LABELS[sideStatus.status]} (${sideStatus.detail.toLowerCase()})` : ''}, ${formatSize(size.width, size.height)}.${pannable ? ' Arrow keys move around.' : ''}`}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable only while zoomed in, so arrow keys can move around
        tabIndex={pannable ? 0 : -1}
        data-testid="preview-area"
        data-zoom={zoom.mode}
        data-view={printing ? 'print' : onProduct ? 'product' : 'flat'}
        data-tint={onProduct ? product.tint : undefined}
        onKeyDown={onArtworkKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn('relative min-h-0 flex-1 overflow-hidden select-none focus-visible:-outline-offset-4', pannable ? 'cursor-grab touch-none active:cursor-grabbing' : 'touch-pan-y')}
      >
        {failed ? (
          <PreviewError onRetry={onRetry} />
        ) : (
          <>
            {sized && (
              <PreviewBoundary onError={() => setFailed(true)}>
                <Suspense fallback={null}>
                  <div aria-hidden="true" className={cn('absolute inset-0 transition-opacity', shown ? 'opacity-100' : 'opacity-0')}>
                    {printing ? (
                      <PrintCanvas surface={surface} width={available.width} height={available.height} viewport={viewport} flagged={flagged} onStage={onStage} />
                    ) : !onProduct ? (
                      <Canvas surface={surface} width={available.width} height={available.height} viewport={viewport} onStage={onStage} />
                    ) : (
                      photo &&
                      productView &&
                      placed && (
                        <ProductCanvas
                          surface={surface}
                          photo={photo}
                          photoSize={productView.photo}
                          draw={productView.draw}
                          placed={placed}
                          width={available.width}
                          height={available.height}
                          viewport={viewport}
                          onStage={onStage}
                        />
                      )
                    )}
                  </div>
                </Suspense>
              </PreviewBoundary>
            )}
            {!shown && (
              <output className="absolute inset-0 flex items-center justify-center gap-3 text-body-sm text-fg-muted" data-testid="preview-loading">
                <Spinner size="sm" /> Preparing preview…
              </output>
            )}
            {shown && notes.length > 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-4 flex flex-col items-center gap-2 px-3">
                {notes.map((note) => (
                  <p
                    key={note}
                    className="w-fit rounded-full bg-surface/90 px-3 py-1 text-center text-body-sm text-fg-muted shadow-1"
                    data-testid={note === PRODUCT_VIEW_UNAVAILABLE ? 'preview-product-unavailable' : note === COLOUR_UNAVAILABLE ? 'preview-colour-unavailable' : 'preview-empty'}
                  >
                    {note}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-surface px-3 py-2 md:px-4">
        {phone && sided && <SidePicker document={document} active={surface.id} onSelect={switchSide} note={sideNote} />}
        {phone && <ZoomControls percent={percent} limits={limits} fit={zoom.mode === 'fit'} onStep={step} onZoom={zoomTo} />}
        {!roomy && reviewToggle}
        {!roomy && toggle}
        {printing ? (
          <div className={cn('flex min-w-0 flex-col gap-1', phone && 'w-full')}>
            {/* Phones keep the drawing as tall as they can: the size is in the panel and the area's name. */}
            {!phone && (
              <p className="text-caption text-fg-muted">
                <span className="font-semibold text-fg">{sided ? surface.label : 'Design'}</span> · print area {formatSize(size.width, size.height)}
                {print.bleedPx > 0 ? ' plus bleed' : ''}
              </p>
            )}
            <PrintLegend print={print} compact={phone} />
          </div>
        ) : (
          <p className={cn('text-caption text-fg-muted', phone && 'w-full')}>
            <span className="font-semibold text-fg">{sided ? surface.label : 'Design'}</span> ·{' '}
            {onProduct
              ? `on the product · ${formatSize(size.width, size.height)} print on a ${import.meta.env.DEV && profile.devFixtures ? 'stand-in photo (development only)' : 'product photo, colours approximate'}`
              : `${formatSize(size.width, size.height)}, trimmed · guides and bleed hidden`}
          </p>
        )}
      </footer>
      </div>
      {review && checks && onPrintView && <review.Panel capture={capture} checks={checks} printView={printing} onPrintView={onPrintView} surface={surface} />}
      </div>
      <ZoomAnnouncer percent={percent} fit={zoom.mode === 'fit'} />
    </div>
  );
}

function isBlank(surface: SurfaceDesign): boolean {
  return surface.background.color === null && surface.elements.every((e) => e.hidden);
}

// ------------------------------------------------------------------ Sides

/**
 * Front and back as thumbnails: a radio group (arrow keys move between sides), each named by its
 * side and marked when empty. Only the sides the product really has are shown.
 */
function SidePicker({ document, active, onSelect, note, className }: { document: DesignDocument; active: string; onSelect(id: string): void; note?: ((surface: SurfaceDesign) => string) | undefined; className?: string }) {
  const { Thumbnail } = previewRenderer();
  return (
    <RadioGroupPrimitive.Root
      value={active}
      onValueChange={onSelect}
      orientation="horizontal"
      loop
      aria-label="Side to preview"
      // Arrow keys select the side they move to, as radio groups do.
      onKeyDown={(event) => {
        const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
        if (!delta) return;
        const index = document.surfaces.findIndex((s) => s.id === active);
        onSelect(document.surfaces[(index + delta + document.surfaces.length) % document.surfaces.length]!.id);
      }}
      className={cn('flex items-center gap-2', className)}
    >
      {document.surfaces.map((surface) => {
        const checked = surface.id === active;
        const count = visibleCount(surface);
        return (
          <RadioGroupPrimitive.Item
            key={surface.id}
            value={surface.id}
            data-side={surface.id}
            className={cn(
              'flex items-center gap-2 rounded-md border p-1 pr-3 text-left transition-colors',
              checked ? 'border-accent bg-accent-soft text-accent-strong shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'border-border bg-surface text-fg hover:border-border-hover',
            )}
          >
            <span aria-hidden="true" className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-sm bg-surface-sunken" data-testid="preview-thumbnail">
              <ThumbnailBoundary>
                <Suspense fallback={null}>
                  <Thumbnail surface={surface} width={56} height={40} />
                </Suspense>
              </ThumbnailBoundary>
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-body-sm font-semibold">{surface.label}</span>{' '}
              <span className={cn('text-caption', checked ? 'text-accent-strong' : 'text-fg-muted')}>{note ? note(surface) : isBlank(surface) ? 'Empty' : `${count} ${count === 1 ? 'item' : 'items'}`}</span>
            </span>
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}

function visibleCount(surface: SurfaceDesign): number {
  return surface.elements.filter((e) => !e.hidden).length;
}

// ------------------------------------------------------------------- View

// ------------------------------------------------------------------- Zoom

function ZoomControls({
  percent,
  limits,
  fit,
  onStep,
  onZoom,
  className,
}: {
  percent: number;
  limits: { minPercent: number; maxPercent: number };
  fit: boolean;
  onStep(direction: 1 | -1): void;
  onZoom(next: number | 'fit'): void;
  className?: string;
}) {
  const label = formatZoom(percent);
  return (
    <fieldset className={cn('m-0 flex min-w-0 items-center border-0 p-0', className)}>
      <legend className="sr-only">Preview zoom</legend>
      <IconButton label="Zoom out" shortcut="Ctrl −" icon={<ZoomOut />} size="sm" className="pointer-coarse:size-11" {...limit(percent <= limits.minPercent + 0.05, () => onStep(-1))} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Zoom ${label}, zoom options`} className="min-w-18 gap-0.5 px-2 tabular-nums pointer-coarse:h-11">
            {label}
            <ChevronDown aria-hidden="true" className="text-fg-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="z-[60] min-w-48">
          <DropdownMenuItem shortcut="Shift 1" disabled={fit} onSelect={() => onZoom('fit')}>
            Fit to screen
          </DropdownMenuItem>
          {PREVIEW_PRESETS.map((p) => (
            <DropdownMenuItem key={p} shortcut={p === 100 ? 'Ctrl 0' : undefined} disabled={p < limits.minPercent || p > limits.maxPercent} onSelect={() => onZoom(p)}>
              {p === 100 ? 'Actual size (100%)' : `${p}%`}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton label="Zoom in" shortcut="Ctrl +" icon={<ZoomIn />} size="sm" className="pointer-coarse:size-11" {...limit(percent >= limits.maxPercent - 0.05, () => onStep(1))} />
      <Button variant="ghost" size="sm" {...limit(fit, () => onZoom('fit'))} className="gap-1 px-2 aria-disabled:text-fg-subtle aria-disabled:hover:bg-transparent pointer-coarse:h-11">
        <Maximize aria-hidden="true" />
        Fit
      </Button>
    </fieldset>
  );
}

/**
 * A zoom button at its limit stays focusable (aria-disabled) and does nothing, so focus never drops
 * out of the preview to the page — where the editor's shortcuts would see the next key.
 */
function limit(atLimit: boolean, onClick: () => void) {
  return atLimit ? { 'aria-disabled': true as const, onClick: () => {} } : { onClick };
}

function ZoomAnnouncer({ percent, fit }: { percent: number; fit: boolean }) {
  const [announced, setAnnounced] = useState('');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => setAnnounced(fit ? `Fitted to screen, ${formatZoom(percent)}` : `Zoom ${formatZoom(percent)}`), 400);
    return () => clearTimeout(timer);
  }, [percent, fit]);
  return (
    <p className="sr-only" aria-live="polite" data-testid="preview-zoom-announcer">
      {announced}
    </p>
  );
}

// ------------------------------------------------------------------ Errors

function PreviewError({ onRetry }: { onRetry(): void }) {
  return (
    <div role="alert" className="absolute inset-0 m-auto flex h-fit max-w-sm flex-col items-center gap-3 rounded-lg bg-surface p-6 text-center shadow-2" data-testid="preview-error">
      <p className="text-body font-semibold text-fg">Preview couldn’t be generated.</p>
      <p className="text-body-sm text-fg-muted">Your design is safe and unchanged.</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
        <DialogPrimitive.Close asChild>
          <Button size="sm" variant="secondary">
            Close preview
          </Button>
        </DialogPrimitive.Close>
      </div>
    </div>
  );
}

/** Rendering problems in the preview stay in the preview; the Studio and the design are untouched. */
class PreviewBoundary extends Component<{ children: ReactNode; onError(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A thumbnail that can't be drawn leaves a neutral tile; the side stays selectable. */
class ThumbnailBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
