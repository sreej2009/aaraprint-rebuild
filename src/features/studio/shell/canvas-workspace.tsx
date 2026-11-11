import type Konva from 'konva';
import { lazy, Suspense, useContext, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { CanvasAnnouncer } from '../canvas/canvas-announcer';
import { createElementPointer } from '../canvas/element-pointer';
import { useInteraction, useInteractionStoreApi } from '../canvas/interaction-store';
import { MeasurementLabels } from '../canvas/measurement-labels';
import { SelectionOverlay } from '../canvas/selection-overlay';
import { SelectionToolbar } from '../canvas/selection-toolbar';
import { TextEditHelp, TextEditOverlay } from '../canvas/text-edit-overlay';
import { useEditingText } from '../canvas/text-editing';
import { useCanvasGestures } from '../canvas/use-canvas-gestures';
import { useViewport, useViewportStoreApi } from '../canvas/viewport-context';
import { ZoomAnnouncer, ZoomControl } from '../canvas/zoom-control';
import { finishedSizeMm, printBoxes } from '../geometry/boxes';
import { fitScale, workspacePadding } from '../geometry/fit';
import { formatSize } from '../profile/describe';
import { ProductColourPicker } from '../product-view/colour-picker';
import { COLOUR_UNAVAILABLE, colourUnavailable, photoRect } from '../product-view/product-view';
import { useProductColour, useProductColourOffered, useProductView, useProductViewOffered } from '../product-view/use-product-view';
import { ProductViewToggle } from '../product-view/view-toggle';
import type { SurfaceDesign } from '../schema/types';
import { selectActiveSurface, useStudio, useStudioStoreApi } from '../store';
import { CANVAS_HELP_ID, CANVAS_REGION_ID } from './dom-ids';
import { EmptySideCard } from './empty-side';
import { StudioSessionContext } from './session-context';
import { TextEditSheet } from './text-edit-sheet';
import { StudioUiContext } from './ui-context';
import { useElementSize } from './use-element-size';

// Konva is only downloaded with the canvas; the print-area preview shows while it loads.
const CanvasStage = lazy(() => import('../canvas/canvas-stage'));

export interface CanvasWorkspaceProps {
  /** Floating zoom pill inside the canvas (phones, where the top bar has no zoom control). */
  zoomPill?: boolean;
  onStage?: (stage: Konva.Stage | null) => void;
}

/** Controls floating over the canvas keep their own pointer presses (and focus). */
function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a, input, textarea, [role="toolbar"], [data-no-pan]') !== null;
}

/**
 * The central workspace: the Konva canvas for the active side, fitted to the available space, with
 * wheel / drag / pinch navigation, element selection and transforms (HTML overlay), dimension
 * labels and a footer with size, DPI and guide legend. The region is focusable: arrow keys,
 * Delete and Esc act on the selection while it (or the layers list) has focus.
 */
export function CanvasWorkspace({ zoomPill = false, onStage }: CanvasWorkspaceProps) {
  const surface = useStudio(selectActiveSurface);
  const regionRef = useRef<HTMLElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(areaRef);
  const studioStore = useStudioStoreApi();
  const viewportStore = useViewportStoreApi();
  const interactionStore = useInteractionStoreApi();
  const viewport = useViewport((s) => s.viewport);
  const showGuides = useViewport((s) => s.showGuides);
  const ready = useViewport((s) => s.content !== null && s.area.width > 0 && s.area.height > 0);
  const delegate = useMemo(
    () => createElementPointer({ studio: studioStore, viewport: viewportStore, interaction: interactionStore }),
    [studioStore, viewportStore, interactionStore],
  );
  const panCursor = useCanvasGestures(areaRef, viewportStore, delegate);
  const hovering = useStudio((s) => s.editor.hoveredId !== null);
  const moving = useInteraction((s) => s.gesture?.kind === 'move');
  const cursor = moving || (hovering && panCursor === null) ? 'move' : panCursor;
  const print = surface?.print;

  /*
   * On the product (Phase 4 M2): the product photo behind the artwork, for products and sides whose
   * photo may be shown (rights cleared, original placement, media published — the M1 gate). The
   * design stays in print px: the photo is placed around the print area in design space, and Fit
   * shows the whole photo. Every editing tool works as on the flat sheet. The choice is view state
   * (viewport store): never saved, never undone. Unsupported products stay exactly as before.
   */
  const profile = useContext(StudioSessionContext)?.profile ?? null;
  const surfaces = useStudio((s) => s.document.surfaces);
  const wantProduct = useViewport((s) => s.productView);
  const offered = useProductViewOffered(profile, surfaces);
  // The product colour (M3): the photo's fabric recoloured with its mask; the design never changes.
  const { colours, colour, choose } = useProductColour(profile);
  const colourOffered = useProductColourOffered(profile, surfaces);
  const product = useProductView(profile, surface, offered && wantProduct, colourOffered ? colour : null);
  const onProduct = product.status === 'loading' || product.status === 'ready';
  // Where the photo (or, for mugs, the side's half of it) is drawn, in design px (M4).
  const drawn = useMemo(() => (product.view && product.placed ? { rect: photoRect(product.view, product.placed), crop: product.view.draw.crop } : null), [product.view, product.placed]);
  const notes = [product.status === 'unavailable' ? CANVAS_PRODUCT_UNAVAILABLE : null, onProduct && colourOffered && colourUnavailable(product.view, colour, product.tint) ? COLOUR_UNAVAILABLE : null].filter(
    (note): note is string => note !== null,
  );
  const content = useMemo(() => (print ? (onProduct && product.bounds ? product.bounds : printBoxes(print).bleed) : null), [print, onProduct, product.bounds]);
  // Phones edit text in a bottom sheet (room for the keyboard); larger screens edit in place.
  const sheetEditing = useContext(StudioUiContext)?.layout === 'phone';
  const editing = useEditingText();

  // Clicking the canvas gives it keyboard focus (pointer presses don't move focus by themselves
  // here), so the arrow keys move the selection instead of whatever control had focus before.
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const onBlur = () => delete region.dataset.pointerFocus;
    region.addEventListener('blur', onBlur);
    return () => region.removeEventListener('blur', onBlur);
  }, []);

  // The focus ring is for keyboard users: a click marks the focus as pointer focus, which hides it.
  const focusCanvas = (event: ReactPointerEvent) => {
    const region = regionRef.current;
    if (!region || isControl(event.target) || document.activeElement === region) return;
    region.dataset.pointerFocus = '';
    region.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  };

  useEffect(() => {
    viewportStore.getState().actions.setArea(size);
  }, [viewportStore, size]);

  const surfaceId = surface?.id;
  useEffect(() => {
    // Each side keeps its own zoom and pan; a side seen for the first time (or resized) fits. On the
    // product, Fit shows the whole photo; switching between flat and product fits again.
    if (print && surfaceId && content) viewportStore.getState().actions.showSurface(surfaceId, content, print.dpi);
  }, [viewportStore, print, surfaceId, content]);

  if (!surface) return null;
  const finished = finishedSizeMm(surface.print);
  const sizeText = formatSize(finished.width, finished.height);
  return (
    <section
      ref={regionRef}
      id={CANVAS_REGION_ID}
      aria-label={`Design canvas: ${surface.label}, ${sizeText}${onProduct ? ', on the product' : ''}`}
      aria-roledescription="design canvas"
      aria-describedby={CANVAS_HELP_ID}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the canvas is a focusable region (Plan §18.7): arrow keys and Delete act on the selection
      tabIndex={0}
      data-studio-keys=""
      data-studio-canvas=""
      data-view={onProduct ? 'product' : 'flat'}
      data-tint={onProduct ? product.tint : undefined}
      className="relative flex h-full min-h-0 flex-col bg-surface-sunken focus-visible:-outline-offset-2 data-pointer-focus:outline-none"
    >
      <p id={CANVAS_HELP_ID} className="sr-only">
        Select an item by clicking it or from the layers list. Arrow keys move it, Shift with an arrow moves it further, Delete removes it and Escape deselects. Enter or a double-click edits text.
      </p>
      <TextEditHelp />
      <div
        ref={areaRef}
        data-testid="canvas-area"
        onPointerDownCapture={focusCanvas}
        className={cn(
          'relative min-h-0 flex-1 touch-none overflow-hidden select-none',
          cursor === 'grab' && 'cursor-grab',
          cursor === 'grabbing' && 'cursor-grabbing',
          cursor === 'move' && 'cursor-move',
        )}
      >
        {ready && (
          <Suspense fallback={<PrintAreaPreview surface={surface} available={size} />}>
            <div aria-hidden="true" className="absolute inset-0">
              <CanvasStage
                surface={surface}
                width={size.width}
                height={size.height}
                viewport={viewport}
                showGuides={showGuides}
                editingId={editing && !sheetEditing ? editing.id : null}
                onStage={onStage}
                product={onProduct && product.bounds && drawn ? { photo: product.photo, bounds: product.bounds, ...drawn } : null}
              />
            </div>
          </Suspense>
        )}
        {ready && showGuides && <MeasurementLabels print={surface.print} viewport={viewport} />}
        {ready && <SelectionOverlay />}
        {ready && !sheetEditing && <TextEditOverlay />}
        <SelectionToolbar />
        <EmptySideCard />
        {notes.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2 px-4">
            {notes.map((note) => (
              <p
                key={note}
                className="w-fit max-w-full rounded-full bg-surface/95 px-3 py-1 text-center text-body-sm text-fg-muted shadow-1"
                data-testid={note === CANVAS_PRODUCT_UNAVAILABLE ? 'canvas-product-unavailable' : 'canvas-colour-unavailable'}
              >
                {note}
              </p>
            ))}
          </div>
        )}
        {zoomPill && (
          <div className="absolute right-3 bottom-3 rounded-full border border-border bg-surface/95 px-1 shadow-2 backdrop-blur">
            <ZoomControl />
          </div>
        )}
        <ZoomAnnouncer />
        <CanvasAnnouncer />
      </div>
      {sheetEditing && <TextEditSheet />}
      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-surface px-3 py-2 text-caption text-fg-muted md:px-4">
        <p>
          <span className="font-semibold text-fg">{surface.label}</span> · {sizeText} · {surface.print.dpi} DPI{onProduct && (import.meta.env.DEV && profile?.devFixtures ? ' · on a stand-in photo (development only)' : ' · on a product photo')}
        </p>
        {offered && (
          <ProductViewToggle
            label="Canvas view"
            testId="canvas-view-toggle"
            value={wantProduct ? 'product' : 'flat'}
            onChange={(next) => viewportStore.getState().actions.setProductView(next === 'product')}
          />
        )}
        {onProduct && colourOffered && colours && colour && <ProductColourPicker colours={colours.options} value={colour.id} onChange={choose} testId="canvas-colours" />}
        <GuideLegend hasBleed={surface.print.bleedPx > 0} dimmed={!showGuides} />
      </footer>
    </section>
  );
}

/** Shown when "On the product" is chosen but this side's photo can't be shown: the flat sheet stays. */
export const CANVAS_PRODUCT_UNAVAILABLE = 'On-product view unavailable for this product.';

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
