import type { Point } from '../geometry/boxes';
import { boxContains } from '../geometry/transform';
import { selectActiveSurface, selectSelectedElements } from '../store';
import type { DesignElement } from '../schema/types';
import { DRAG_THRESHOLD, startMove, type ElementSession, type SessionContext } from './element-sessions';
import { boxOf, elementAt } from './transform-rules';
import type { CanvasPointerDelegate, PointerSession } from './use-canvas-gestures';

/** Screen px added around hairline elements (lines, thin text) so they're easy to hit. */
const HIT_SLOP = { mouse: 4, touch: 10 } as const;
/** Two clicks or taps this close in time (ms) and space (screen px) are a double-click / double-tap. */
export const DOUBLE_CLICK_MS = 500;
const DOUBLE_CLICK_SLOP = { mouse: 6, touch: 24 } as const;

/**
 * Canvas pointer rules for elements (Plan §18.6, §18.9):
 * - mouse: pressing a visible, unlocked element selects it and drags it; clicking empty canvas
 *   deselects; dragging empty canvas pans;
 * - touch: tapping an element selects it, tapping empty canvas deselects; one finger on the
 *   *selected* element drags it, anywhere else it pans (so scrolling around a full-bleed design
 *   never moves things by accident); two fingers always pinch and pan.
 * Locked and hidden elements are never picked on the canvas (Layers selects them).
 * Double-clicking (or double-tapping) text edits it. Like the browser's own dblclick, it takes two
 * complete clicks, so pressing again to drag right after selecting still drags.
 */
export function createElementPointer(ctx: SessionContext): CanvasPointerDelegate {
  const toDesign = (point: Point): Point => {
    const { scale, x, y } = ctx.viewport.getState().viewport;
    return { x: (point.x - x) / scale, y: (point.y - y) / scale };
  };
  const slopFor = (pointerType: string) => (pointerType === 'mouse' ? HIT_SLOP.mouse : HIT_SLOP.touch) / ctx.viewport.getState().viewport.scale;
  const pick = (point: Point, pointerType: string) => {
    const surface = selectActiveSurface(ctx.studio.getState());
    return surface ? elementAt(surface, toDesign(point), slopFor(pointerType)) : null;
  };

  let lastClick: { id: string; time: number; point: Point } | null = null;
  /** Records a click on `element`; a second one in quick succession on the same text edits it. */
  const clicked = (element: DesignElement, point: Point, event: PointerEvent) => {
    const previous = lastClick;
    const time = event.timeStamp;
    const slop = event.pointerType === 'mouse' ? DOUBLE_CLICK_SLOP.mouse : DOUBLE_CLICK_SLOP.touch;
    if (previous && previous.id === element.id && time - previous.time <= DOUBLE_CLICK_MS && Math.hypot(point.x - previous.point.x, point.y - previous.point.y) <= slop) {
      lastClick = null;
      if (element.type === 'text') ctx.studio.getState().actions.setEditingText(element.id);
      return;
    }
    lastClick = { id: element.id, time, point };
  };
  /** A move session that counts as a click when the pointer lifts without dragging. */
  const withClick = (session: ElementSession, element: DesignElement, start: Point, event: PointerEvent): PointerSession => {
    const threshold = event.pointerType === 'mouse' ? DRAG_THRESHOLD.mouse : DRAG_THRESHOLD.touch;
    let dragged = false;
    return {
      move(point, moveEvent) {
        if (Math.hypot(point.x - start.x, point.y - start.y) >= threshold) dragged = true;
        session.move(point, moveEvent);
      },
      end(point, endEvent) {
        session.end();
        if (dragged) lastClick = null;
        else clicked(element, point, endEvent);
      },
      cancel() {
        lastClick = null;
        session.cancel();
      },
    };
  };

  return {
    press(event, point) {
      const { actions } = ctx.studio.getState();
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
        const element = pick(point, event.pointerType);
        if (!element) return null;
        if (ctx.studio.getState().editor.selectedIds[0] !== element.id || ctx.studio.getState().editor.selectedIds.length !== 1) actions.select([element.id]);
        return withClick(startMove(ctx, element, point, event.pointerType), element, point, event);
      }
      // Touch: only the selected element can be dragged.
      const [selected] = selectSelectedElements(ctx.studio.getState());
      if (!selected || selected.locked || selected.hidden) return null;
      if (!boxContains(boxOf(selected), toDesign(point), slopFor(event.pointerType))) return null;
      return withClick(startMove(ctx, selected, point, event.pointerType), selected, point, event);
    },

    tap(event, point) {
      const { actions } = ctx.studio.getState();
      const element = pick(point, event.pointerType);
      if (element) {
        actions.select([element.id]);
        clicked(element, point, event);
      } else {
        lastClick = null;
        actions.clearSelection();
      }
    },

    hover(point) {
      const element = point ? pick(point, 'mouse') : null;
      ctx.studio.getState().actions.setHovered(element?.id ?? null);
    },
  };
}

