import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Point } from '../geometry/boxes';
import { pinchViewport, scaleForPercent, wheelZoomFactor, type Viewport } from '../geometry/viewport';
import { limitsOf, type ViewportStore } from './viewport-store';

export type PanCursor = 'grab' | 'grabbing' | null;

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
 * `canPan(event)` lets later milestones keep left-drag for moving selected elements (M6); while
 * every drag pans (M5), the idle cursor is a hand. Returns the cursor to show.
 */
export function useCanvasGestures(ref: RefObject<HTMLElement | null>, store: ViewportStore, canPan: (event: PointerEvent) => boolean = alwaysPan): PanCursor {
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

    const twoPointers = (): [Point, Point] | null => {
      const [a, b] = [...pointers.values()];
      return a && b ? [a, b] : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      const middle = event.button === 1;
      const primary = event.button === 0;
      if ((!middle && !primary) || isControl(event.target)) return;
      if (event.pointerType === 'mouse' && primary && !spaceHeldRef.current && !canPan(event)) return;
      if (event.pointerType !== 'mouse' && !canPan(event) && pointers.size === 0) return;
      event.preventDefault();
      element.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, local(event));
      const pair = twoPointers();
      if (pair) {
        pinch = { start: store.getState().viewport, from: pair };
        last = null;
      } else {
        last = local(event);
      }
      setDragging(true);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      const point = local(event);
      pointers.set(event.pointerId, point);
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
      if (!pointers.delete(event.pointerId)) return;
      element.releasePointerCapture?.(event.pointerId);
      // Lifting one finger of a pinch continues as a one-finger pan from where it is.
      pinch = null;
      const remaining = [...pointers.values()][0];
      last = remaining ?? null;
      if (pointers.size === 0) setDragging(false);
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerEnd);
    element.addEventListener('pointercancel', onPointerEnd);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [ref, store, canPan]);

  if (dragging) return 'grabbing';
  return spaceHeld || canPan === alwaysPan ? 'grab' : null;
}

function alwaysPan(): boolean {
  return true;
}
