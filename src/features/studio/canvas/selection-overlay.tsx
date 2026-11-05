import { Lock, RotateCw } from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Placement } from '../geometry/bounds';
import type { Point } from '../geometry/boxes';
import { handleDirection, type Handle } from '../geometry/transform';
import { pxToMm } from '../geometry/units';
import type { Viewport } from '../geometry/viewport';
import { formatLength, formatSize } from '../profile/describe';
import type { DesignElement } from '../schema/types';
import { selectActiveSurface, useStudio, useStudioStoreApi } from '../store';
import { startResize, startRotate, type ElementSession, type SessionContext } from './element-sessions';
import { useInteraction, useInteractionStoreApi, type Gesture } from './interaction-store';
import { cursorFor, elementBounds, handlesFor, isLineLike, placementFor, ratioLocked } from './transform-rules';
import { useViewport, useViewportStoreApi } from './viewport-context';

/**
 * Selection outline, resize handles and rotation handle, drawn in HTML over the canvas. They're
 * not part of the Konva stage, so they can never end up in the printable artwork or an export.
 * The outline turns amber when part of the element leaves the safe area and red past the trim.
 * Pointer-only affordances: keyboard and screen-reader users have the inspector and shortcuts.
 */
export function SelectionOverlay() {
  const viewport = useViewport((s) => s.viewport);
  const selectedId = useStudio((s) => (s.editor.selectedIds.length === 1 ? s.editor.selectedIds[0]! : null));
  const hoveredId = useStudio((s) => s.editor.hoveredId);
  const surface = useStudio(selectActiveSurface);
  const gesture = useInteraction((s) => s.gesture);
  const editing = useStudio((s) => s.editor.editingTextId !== null && s.editor.editingTextId === selectedId);
  const selected = selectedId ? (surface?.elements.find((e) => e.id === selectedId) ?? null) : null;
  const hovered = hoveredId && hoveredId !== selectedId && !gesture ? (surface?.elements.find((e) => e.id === hoveredId && !e.hidden) ?? null) : null;
  if (!surface) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="selection-overlay">
      {hovered && <Frame element={hovered} viewport={viewport} className="border border-accent/70" testId="hover-outline" />}
      {/* While text is edited only its outline shows: the editor has the box. */}
      {selected && editing && <Frame element={selected} viewport={viewport} className="border border-accent/50" testId="editing-frame" />}
      {selected && !editing && <Selection element={selected} viewport={viewport} dpi={surface.print.dpi} placement={placementFor(selected, surface.print)} gesture={gesture} />}
    </div>
  );
}

const PLACEMENT_STYLES: Record<Placement, { frame: string; handle: string; chip: string; label: string | null }> = {
  inside: { frame: 'border-accent', handle: 'border-accent', chip: '', label: null },
  'outside-safe': { frame: 'border-warning', handle: 'border-warning', chip: 'bg-warning-soft text-warning-strong', label: 'Outside the safe area' },
  'outside-trim': { frame: 'border-danger', handle: 'border-danger', chip: 'bg-danger-soft text-danger', label: 'Past the trim edge' },
};

interface ScreenFrame {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
}

function screenFrame(element: DesignElement, { scale, x, y }: Viewport): ScreenFrame {
  return {
    cx: (element.x + element.width / 2) * scale + x,
    cy: (element.y + element.height / 2) * scale + y,
    // Never thinner than a hairline, so tiny elements still show where they are.
    width: Math.max(element.width * scale, 2),
    height: Math.max(element.height * scale, 2),
    rotation: element.rotation,
  };
}

function Frame({ element, viewport, className, testId, children }: { element: DesignElement; viewport: Viewport; className: string; testId: string; children?: ReactNode }) {
  const f = screenFrame(element, viewport);
  return (
    <div
      className={cn('absolute', className)}
      style={{ left: f.cx, top: f.cy, width: f.width, height: f.height, transform: `translate(-50%, -50%) rotate(${f.rotation}deg)` }}
      data-testid={testId}
      data-element-id={element.id}
    >
      {children}
    </div>
  );
}

/** Side handles hide when the side is too short to grab them apart from the corners. */
const MIN_SIDE_FOR_HANDLE = 40;
/**
 * Handles sit on a frame at least this big (screen px), so on small elements they stand clear
 * of the element instead of covering it — a finger on a small element then moves it rather than
 * grabbing a handle. Bigger for touch, where handle hit areas are bigger.
 */
const MIN_HANDLE_FRAME = { fine: 24, coarse: 56 } as const;

function useCoarsePointer(): boolean {
  const [coarse] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
  return coarse;
}

function Selection({ element, viewport, dpi, placement, gesture }: { element: DesignElement; viewport: Viewport; dpi: number; placement: Placement; gesture: Gesture | null }) {
  const style = PLACEMENT_STYLES[placement];
  const f = screenFrame(element, viewport);
  const editable = !element.locked && !element.hidden;
  const storedLock = useInteraction((s) => s.ratioLocks[element.id]);
  const handles = editable
    ? handlesFor(element, ratioLocked(element, storedLock)).filter((h) => {
        if (gesture?.handle === h) return true; // never pull a handle out from under the pointer
        if (isLineLike(element) && (h === 'e' || h === 'w')) return true; // a line's ends are its only handles
        const dir = handleDirection(h);
        if (dir.x !== 0 && dir.y !== 0) return true;
        return (dir.x === 0 ? f.width : f.height) >= MIN_SIDE_FOR_HANDLE;
      })
    : [];
  const showRotate = editable && (!gesture || gesture.kind === 'rotate');
  const min = useCoarsePointer() ? MIN_HANDLE_FRAME.coarse : MIN_HANDLE_FRAME.fine;
  return (
    <>
      <Frame
        element={element}
        viewport={viewport}
        className={cn('shadow-[0_0_0_1px_rgb(255_255_255/0.75)]', editable ? cn('border-[1.5px]', style.frame) : 'border-[1.5px] border-dashed border-fg-muted')}
        testId="selection-frame"
      >
        {!editable && (
          <span className="absolute -top-3 -left-3 grid size-6 place-items-center rounded-full border border-border bg-surface text-fg-muted shadow-1" data-testid="locked-badge">
            <Lock className="size-3.5" />
          </span>
        )}
      </Frame>
      {editable && (
        <div
          className="absolute"
          style={{ left: f.cx, top: f.cy, width: Math.max(f.width, min), height: Math.max(f.height, min), transform: `translate(-50%, -50%) rotate(${f.rotation}deg)` }}
          data-testid="selection-handles"
        >
          {(!gesture || gesture.kind === 'resize') && handles.map((h) => <ResizeHandle key={h} element={element} handle={h} rotation={f.rotation} dpi={dpi} className={style.handle} />)}
          {showRotate && <RotateHandle element={element} className={style.handle} />}
        </div>
      )}
      <SelectionBadge element={element} viewport={viewport} dpi={dpi} gesture={gesture} placement={placement} />
    </>
  );
}

// ------------------------------------------------------------------ Handles

/** Area-relative point for a pointer event on any element inside the canvas area. */
function useHandleSession() {
  const studio = useStudioStoreApi();
  const viewport = useViewportStoreApi();
  const interaction = useInteractionStoreApi();
  const active = useRef<{ id: number; session: ElementSession } | null>(null);
  const ctx: SessionContext = { studio, viewport, interaction };

  const local = (event: ReactPointerEvent): Point => {
    const area = (event.currentTarget as HTMLElement).closest('[data-testid="canvas-area"]') ?? (event.currentTarget as HTMLElement).offsetParent;
    const box = area?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  return {
    begin(event: ReactPointerEvent, start: (ctx: SessionContext, point: Point) => ElementSession) {
      if (event.button !== 0 || active.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      active.current = { id: event.pointerId, session: start(ctx, local(event)) };
    },
    handlers: {
      onPointerMove(event: ReactPointerEvent) {
        if (active.current?.id === event.pointerId) active.current.session.move(local(event), event);
      },
      onPointerUp(event: ReactPointerEvent) {
        if (active.current?.id !== event.pointerId) return;
        active.current.session.end();
        active.current = null;
      },
      onPointerCancel(event: ReactPointerEvent) {
        if (active.current?.id !== event.pointerId) return;
        active.current.session.cancel();
        active.current = null;
      },
    },
  };
}

const HANDLE_LABELS: Record<Handle, string> = { nw: 'top-left', n: 'top', ne: 'top-right', e: 'right', se: 'bottom-right', s: 'bottom', sw: 'bottom-left', w: 'left' };

function ResizeHandle({ element, handle, rotation, dpi, className }: { element: DesignElement; handle: Handle; rotation: number; dpi: number; className: string }) {
  const { begin, handlers } = useHandleSession();
  const dir = handleDirection(handle);
  const corner = dir.x !== 0 && dir.y !== 0;
  return (
    <div
      data-no-pan=""
      data-handle={handle}
      title={`Resize from the ${HANDLE_LABELS[handle]}`}
      className={cn(
        'pointer-events-auto absolute -translate-1/2 touch-none',
        // A generous invisible hit area around a small visible handle; bigger for fingers.
        'before:absolute before:-inset-2 before:content-[""] pointer-coarse:before:-inset-3.5',
        corner ? 'size-2.5 rounded-[2px] pointer-coarse:size-3.5' : dir.x === 0 ? 'h-1.5 w-4 rounded-full pointer-coarse:h-2 pointer-coarse:w-6' : 'h-4 w-1.5 rounded-full pointer-coarse:h-6 pointer-coarse:w-2',
        'border-[1.5px] bg-surface shadow-1',
        className,
      )}
      style={{ left: `${((dir.x + 1) / 2) * 100}%`, top: `${((dir.y + 1) / 2) * 100}%`, cursor: cursorFor(handle, rotation) }}
      onPointerDown={(event) => begin(event, (ctx, point) => startResize(ctx, element, handle, point, dpi))}
      {...handlers}
    />
  );
}

function RotateHandle({ element, className }: { element: DesignElement; className: string }) {
  const { begin, handlers } = useHandleSession();
  return (
    <>
      <span className="absolute bottom-full left-1/2 h-5 w-px -translate-x-1/2 bg-accent/60 pointer-coarse:h-7" />
      <div
        data-no-pan=""
        data-handle="rotate"
        title="Rotate (Shift: 15° steps)"
        className={cn(
          'pointer-events-auto absolute bottom-full left-1/2 mb-5 grid size-6 -translate-x-1/2 cursor-grab touch-none place-items-center rounded-full border-[1.5px] bg-surface text-fg shadow-1 active:cursor-grabbing',
          'before:absolute before:-inset-2 before:content-[""] pointer-coarse:mb-7 pointer-coarse:size-8',
          className,
        )}
        onPointerDown={(event) => begin(event, (ctx, point) => startRotate(ctx, element, point))}
        {...handlers}
      >
        <RotateCw className="size-3.5 pointer-coarse:size-4.5" />
      </div>
    </>
  );
}

// -------------------------------------------------------------------- Badge

/** Live values while moving, resizing or rotating; otherwise any print warning. */
function SelectionBadge({ element, viewport, dpi, gesture, placement }: { element: DesignElement; viewport: Viewport; dpi: number; gesture: Gesture | null; placement: Placement }) {
  const style = PLACEMENT_STYLES[placement];
  const mm = (px: number) => pxToMm(px, dpi);
  let text: string | null = null;
  if (gesture?.elementId === element.id) {
    if (gesture.kind === 'move') text = `X ${formatLength(mm(element.x))} · Y ${formatLength(mm(element.y))}`;
    else if (gesture.kind === 'resize') text = formatSize(mm(element.width), mm(element.height));
    else text = `${Math.round(element.rotation * 10) / 10}°`;
  }
  const label = text ?? style.label;
  if (!label) return null;
  const bounds = elementBounds(element);
  const left = (bounds.x + bounds.width / 2) * viewport.scale + viewport.x;
  const top = (bounds.y + bounds.height) * viewport.scale + viewport.y + 10;
  return (
    <span
      className={cn(
        'absolute -translate-x-1/2 rounded-full px-2 py-0.5 text-caption font-medium whitespace-nowrap tabular-nums shadow-1',
        text ? 'bg-surface-inverse text-fg-on-accent' : style.chip,
      )}
      style={{ left, top }}
      data-testid={text ? 'gesture-badge' : 'placement-badge'}
      data-placement={placement}
    >
      {label}
    </span>
  );
}
