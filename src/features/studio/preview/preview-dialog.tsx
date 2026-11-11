import { ChevronDown, Eye, Maximize, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog as DialogPrimitive, RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton, Spinner } from '@/design-system';
import { cn } from '@/lib/cn';
import { finishedSizeMm } from '../geometry/boxes';
import { formatZoom, wheelZoomFactor } from '../geometry/viewport';
import { formatSize } from '../profile/describe';
import type { StudioProfile } from '../profile/types';
import { productSpace } from '../product-view/product-view';
import { ProductColourPicker } from '../product-view/colour-picker';
import { COLOUR_UNAVAILABLE, colourUnavailable } from '../product-view/product-view';
import { useProductColour, useProductColourOffered, useProductView, useProductViewOffered } from '../product-view/use-product-view';
import { ProductViewToggle, type ProductViewMode } from '../product-view/view-toggle';
import type { DesignDocument, SurfaceDesign } from '../schema/types';
import { useStudio, useStudioStoreApi } from '../store';
import { useStudioSession } from '../shell/session-context';
import { useStudioUi } from '../shell/ui-context';
import { useElementSize } from '../shell/use-element-size';
import { canPan, panBy, percentOf, PREVIEW_PRESETS, previewFit, previewLimits, stepPreviewPercent, viewportFor, zoomToPercent, type PreviewZoom } from './preview-view';
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

function PreviewDialog() {
  const document = useStudio((s) => s.document);
  const { profile } = useStudioSession();
  const studio = useStudioStoreApi();
  // Flat (the finished piece, as in Phase 3) or on the product photo (Phase 4 M1); kept on retry.
  const [view, setView] = useState<PreviewMode>('flat');
  // Starts on the side being edited; switching here never changes the editor's side.
  const [sideId, setSideId] = useState(() => studio.getState().editor.activeSurfaceId);
  const surface = document.surfaces.find((s) => s.id === sideId) ?? document.surfaces[0]!;
  const contentRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content
        ref={contentRef}
        aria-describedby="studio-preview-description"
        data-testid="studio-preview"
        data-modal-dialog=""
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        className="fixed inset-0 z-50 flex flex-col bg-surface-sunken outline-none data-[state=open]:animate-fade-in"
      >
        <PreviewBody key={attempt} document={document} surface={surface} profile={profile} view={view} onView={setView} onSide={setSideId} onRetry={() => setAttempt((n) => n + 1)} />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Editor shortcut keys (with Ctrl/⌘) whose browser default must not run either (bookmark, save page…). */
const EDITOR_KEYS = new Set(['z', 'y', 'd', 's', '[', ']', '{', '}', ';']);

type PreviewMode = ProductViewMode;

/** Shown when "On the product" is chosen but this side's photo can't be shown. */
export const PRODUCT_VIEW_UNAVAILABLE = 'On-product preview unavailable for this product.';

interface BodyProps {
  document: DesignDocument;
  surface: SurfaceDesign;
  profile: StudioProfile;
  view: PreviewMode;
  onView(view: PreviewMode): void;
  onSide(id: string): void;
  onRetry(): void;
}

function PreviewBody({ document, surface, profile, view, onView, onSide, onRetry }: BodyProps) {
  const ready = usePreviewReady(document.surfaces);
  // Phones keep the header short: sides and zoom move to the bottom bar (and the view toggle on tablets too).
  const layout = useStudioUi().layout;
  const phone = layout === 'phone';
  const roomy = layout === 'laptop' || layout === 'desktop';
  const areaRef = useRef<HTMLElement>(null);
  const { Canvas, ProductCanvas, size: fixedSize } = previewRenderer();
  const measured = useElementSize(areaRef);
  const available = fixedSize ?? measured;
  const [zoom, setZoom] = useState<PreviewZoom>({ mode: 'fit' });
  const [failed, setFailed] = useState(false);

  /*
   * On the product (Phase 4 M1): offered only when a side has a photo whose rights are cleared, with
   * the original's placement, and the media library is published. The photo is a backdrop: the
   * design isn't changed, saved or exported with it. Only the photo for the side shown is loaded.
   */
  const offered = useProductViewOffered(profile, document.surfaces);
  const wanted = offered && view === 'product';
  // The product colour (M3) is shared with the canvas: the same choice, the same tinted photo.
  const { colours, colour, choose } = useProductColour(profile);
  const colourOffered = useProductColourOffered(profile, document.surfaces);
  const product = useProductView(profile, surface, wanted, colourOffered ? colour : null);
  const { view: productView, placed, photo } = product;
  const onProduct = product.status === 'loading' || product.status === 'ready';
  const print = surface.print;
  // Zoom and pan work the same on the product: over the whole photo, 100 % = the artwork's real size.
  const space = useMemo(() => (onProduct && productView && placed ? productSpace(productView, placed, print) : print), [onProduct, productView, placed, print]);
  const shown = ready && product.status !== 'loading';
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
    [available, space],
  );
  const step = useCallback((direction: 1 | -1) => zoomTo(stepPreviewPercent(percent, direction, fitPercent)), [zoomTo, percent, fitPercent]);

  // Switching sides keeps a chosen zoom level (the sides share a size); Fit stays Fit. On the
  // product each side has its own photo, so it starts fitted.
  const switchSide = (id: string) => {
    onSide(id);
    if (wanted) setZoom({ mode: 'fit' });
    else if (zoom.mode === 'manual') setZoom({ mode: 'manual', viewport: zoomToPercent({ scale: 0, x: 0, y: 0 }, percent, available, print) });
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
  }, [sized, pannable, percent, viewport, available, space, zoomTo]);

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
    onProduct && colourOffered && colourUnavailable(product.view, colour, product.tint) ? COLOUR_UNAVAILABLE : null,
  ].filter((n): n is string => n !== null);
  const toggle = offered && (
    <>
      <ProductViewToggle label="Preview view" testId="preview-view-toggle" value={view} onChange={switchView} />
      {onProduct && colourOffered && colours && colour && <ProductColourPicker colours={colours.options} value={colour.id} onChange={choose} testId="preview-colours" />}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2 md:gap-4 md:px-4">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <DialogPrimitive.Title className="text-body font-semibold text-fg">Preview</DialogPrimitive.Title>
          <p className="truncate text-caption text-fg-muted" title={document.name}>
            {document.name}
          </p>
        </div>
        {!phone && sided && <SidePicker document={document} active={surface.id} onSelect={switchSide} />}
        {roomy && toggle}
        {!phone && <ZoomControls percent={percent} limits={limits} fit={zoom.mode === 'fit'} onStep={step} onZoom={zoomTo} />}
        <DialogPrimitive.Close asChild>
          <IconButton label="Close preview" icon={<X />} size="sm" tooltip={false} className="pointer-coarse:size-11" />
        </DialogPrimitive.Close>
      </header>
      <DialogPrimitive.Description id="studio-preview-description" className="sr-only">
        {onProduct
          ? `How ${sided ? `the ${surface.label.toLowerCase()} of ` : ''}“${document.name}” will look on the product (${formatSize(size.width, size.height)} print), shown on a product photo; colours and fit are approximate. Guides, bleed and editing controls are hidden. Escape closes the preview.`
          : `How ${sided ? `the ${surface.label.toLowerCase()} of ` : ''}“${document.name}” will look once printed and trimmed (${formatSize(size.width, size.height)}). Guides, bleed and editing controls are hidden. Escape closes the preview.`}
      </DialogPrimitive.Description>

      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the artwork region: focusable only while zoomed in, so arrow keys (and drags) move around; every action also has a button */}
      <section
        ref={areaRef}
        aria-roledescription="preview"
        aria-label={`${sideName}${onProduct ? ' on the product' : ''}: ${status ?? `${visibleCount(surface)} ${visibleCount(surface) === 1 ? 'item' : 'items'}`}, ${formatSize(size.width, size.height)}.${pannable ? ' Arrow keys move around.' : ''}`}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable only while zoomed in, so arrow keys can move around
        tabIndex={pannable ? 0 : -1}
        data-testid="preview-area"
        data-zoom={zoom.mode}
        data-view={onProduct ? 'product' : 'flat'}
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
                    {!onProduct ? (
                      <Canvas surface={surface} width={available.width} height={available.height} viewport={viewport} />
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
        {phone && sided && <SidePicker document={document} active={surface.id} onSelect={switchSide} />}
        {phone && <ZoomControls percent={percent} limits={limits} fit={zoom.mode === 'fit'} onStep={step} onZoom={zoomTo} />}
        {!roomy && toggle}
        <p className={cn('text-caption text-fg-muted', phone && 'w-full')}>
          <span className="font-semibold text-fg">{sided ? surface.label : 'Design'}</span> ·{' '}
          {onProduct
            ? `on the product · ${formatSize(size.width, size.height)} print on a product photo, colours approximate`
            : `${formatSize(size.width, size.height)}, trimmed · guides and bleed hidden`}
        </p>
      </footer>
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
function SidePicker({ document, active, onSelect, className }: { document: DesignDocument; active: string; onSelect(id: string): void; className?: string }) {
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
              <span className={cn('text-caption', checked ? 'text-accent-strong' : 'text-fg-muted')}>{isBlank(surface) ? 'Empty' : `${count} ${count === 1 ? 'item' : 'items'}`}</span>
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
