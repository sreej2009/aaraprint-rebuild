import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Point } from '../geometry/boxes';
import { pinchViewport, scaleForPercent, wheelZoomFactor, type Viewport } from '../geometry/viewport';
import { limitsOf, type ViewportStore } from './viewport-store';

export type PanCursor = 'grab' | 'grabbing' | null;

/** A pointer the element layer has taken over (moving an element). Points are area px. */
export interface PointerSession {
  move(point: Point, event: PointerEvent): void;
  end(point: Point, event: PointerEvent): void;
  /** Undo what the session did: a second finger landed (pinch) or the pointer was cancelled. */
  cancel(): void;
}

/**
 * How the element layer (M6) joins in. Without a delegate every drag pans, as in M5.
 * - `press`: a primary-button press or first touch that isn't on a control and isn't a Space /
 *   middle-button pan. Return a session to own the pointer (dragging an element); null pans.
 * - `tap`: a press that ended without travelling (click / tap) and that no session took.
 * - `hover`: the mouse moving with no button pressed (null when it leaves the canvas).
 */
export interface CanvasPointerDelegate {
  press(event: PointerEvent, point: Point): PointerSession | null;
  tap(event: PointerEvent, point: Point): void;
  hover?(point: Point | null): void;
}

/** Screen px a pan press may wander and still count as a click or tap. */
const TAP_SLOP = { mouse: 3, touch: 8 } as const;

/** Typing in a field must never pan or zoom the canvas. */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** Controls floating over the canvas (zoom pill, labels) keep their own clicks. */
function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a, input, select, textarea, [role="menu"], [role="dialog"], [data-no-pan]') !== null;
}

/**
 * Pointer and wheel navigation for the canvas area:
 * - Ctrl/⌘ + wheel or trackpad pinch → zoom around the pointer;
 * - wheel / two-finger trackpad scroll → pan (Shift + wheel pans sideways);
 * - drag with the left button (on empty canvas), middle button or Space held → pan;
 * - touch: one finger pans, two fingers pinch-zoom and pan.
 * A `delegate` takes presses on elements (moving them), clicks and taps (selecting) and hover.
 * A pan only starts once the pointer travels a few px, so clicks never nudge the view. A second
 * finger landing while an element is being dragged cancels that drag and pinches instead.
 * Returns the cursor to show: a hand while every drag pans (no delegate) or Space is held.
 */
export function useCanvasGestures(ref: RefObject<HTMLElement | null>, store: ViewportStore, delegate: CanvasPointerDelegate | null = null): PanCursor {
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Read by the pointer handlers, so they don't re-subscribe on every key press.
  const spaceHeldRef = useRef(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTyping(event.target)) return;
      spaceHeldRef.current = event.type === 'keydown';
      setSpaceHeld(spaceHeldRef.current);
    };
    const reset = () => {
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', reset);
    };
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { actions } = store.getState();
    const local = (event: { clientX: number; clientY: number }): Point => {
      const box = element.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault(); // never scroll or zoom the page itself
      if (event.ctrlKey || event.metaKey) {
        actions.zoomBy(wheelZoomFactor(event.deltaY, event.deltaMode), local(event));
        return;
      }
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const dx = (event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * unit;
      const dy = (event.shiftKey && !event.deltaX ? 0 : event.deltaY) * unit;
      actions.panBy(-dx, -dy);
    };

    const pointers = new Map<number, Point>();
    let last: Point | null = null;
    let pinch: { start: Viewport; from: [Point, Point] } | null = null;
    // The pointer an element session owns (it's also in `pointers`, for pinches).
    let owned: { id: number; session: PointerSession } | null = null;
    // A pan press that hasn't travelled yet: it's a click or tap until it does.
    let pending: { id: number; start: Point; slop: number } | null = null;

    const twoPointers = (): [Point, Point] | null => {
      const [a, b] = [...pointers.values()];
      return a && b ? [a, b] : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      const middle = event.button === 1;
      const primary = event.button === 0;
      if ((!middle && !primary) || isControl(event.target)) return;
      const touch = event.pointerType !== 'mouse';
      // Only touch can add a pointer mid-drag: the second finger turns the drag into a pinch.
      if (owned && !touch) return;
      event.preventDefault();
      element.setPointerCapture?.(event.pointerId);
      const point = local(event);

      if (owned) {
        owned.session.cancel();
        owned = null;
      } else if (pointers.size === 0 && primary && !spaceHeldRef.current && delegate) {
        const session = delegate.press(event, point);
        if (session) {
          owned = { id: event.pointerId, session };
          pointers.set(event.pointerId, point);
          return;
        }
      }

      pointers.set(event.pointerId, point);
      const pair = twoPointers();
      if (pair) {
        pinch = { start: store.getState().viewport, from: pair };
        last = null;
        pending = null;
      } else {
        last = point;
        pending = primary && !spaceHeldRef.current ? { id: event.pointerId, start: point, slop: touch ? TAP_SLOP.touch : TAP_SLOP.mouse } : null;
      }
      setDragging(true);
    };

    const onPointerMove = (event: PointerEvent) => {
      const point = local(event);
      if (owned?.id === event.pointerId) {
        pointers.set(event.pointerId, point);
        owned.session.move(point, event);
        return;
      }
      if (!pointers.has(event.pointerId)) {
        if (event.pointerType === 'mouse' && event.buttons === 0 && pointers.size === 0) delegate?.hover?.(point);
        return;
      }
      pointers.set(event.pointerId, point);
      if (pending?.id === event.pointerId) {
        if (Math.hypot(point.x - pending.start.x, point.y - pending.start.y) < pending.slop) return;
        pending = null; // it's a pan: catch up from where the press began
      }
      const pair = twoPointers();
      if (pinch && pair) {
        const state = store.getState();
        const limits = limitsOf(state);
        const clampScale = (scale: number) =>
          Math.min(scaleForPercent(limits.maxPercent, state.dpi), Math.max(scaleForPercent(limits.minPercent, state.dpi), scale));
        actions.setViewport(pinchViewport(pinch.start, pinch.from, pair, clampScale));
        return;
      }
      if (last) {
        actions.panBy(point.x - last.x, point.y - last.y);
        last = point;
      }
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (owned?.id === event.pointerId) {
        const { session } = owned;
        owned = null;
        pointers.delete(event.pointerId);
        element.releasePointerCapture?.(event.pointerId);
        if (event.type === 'pointercancel') session.cancel();
        else session.end(local(event), event);
        if (pointers.size === 0) setDragging(false);
        return;
      }
      if (!pointers.delete(event.pointerId)) return;
      element.releasePointerCapture?.(event.pointerId);
      if (pending?.id === event.pointerId) {
        pending = null;
        if (event.type === 'pointerup') delegate?.tap(event, local(event));
      }
      // Lifting one finger of a pinch continues as a one-finger pan from where it is.
      pinch = null;
      const remaining = [...pointers.values()][0];
      last = remaining ?? null;
      if (pointers.size === 0) setDragging(false);
    };

    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') delegate?.hover?.(null);
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerEnd);
    element.addEventListener('pointercancel', onPointerEnd);
    return () => {
      owned?.session.cancel();
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [ref, store, delegate]);

  if (dragging) return 'grabbing';
  return spaceHeld || !delegate ? 'grab' : null;
}
