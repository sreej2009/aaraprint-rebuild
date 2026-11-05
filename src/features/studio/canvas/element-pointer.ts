import type { Point } from '../geometry/boxes';
import { boxContains } from '../geometry/transform';
import { selectActiveSurface, selectSelectedElements } from '../store';
import { startMove, type SessionContext } from './element-sessions';
import { boxOf, elementAt } from './transform-rules';
import type { CanvasPointerDelegate } from './use-canvas-gestures';

/** Screen px added around hairline elements (lines, thin text) so they're easy to hit. */
const HIT_SLOP = { mouse: 4, touch: 10 } as const;

/**
 * Canvas pointer rules for elements (Plan §18.6, §18.9):
 * - mouse: pressing a visible, unlocked element selects it and drags it; clicking empty canvas
 *   deselects; dragging empty canvas pans;
 * - touch: tapping an element selects it, tapping empty canvas deselects; one finger on the
 *   *selected* element drags it, anywhere else it pans (so scrolling around a full-bleed design
 *   never moves things by accident); two fingers always pinch and pan.
 * Locked and hidden elements are never picked on the canvas (Layers selects them).
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

  return {
    press(event, point) {
      const { actions } = ctx.studio.getState();
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
        const element = pick(point, event.pointerType);
        if (!element) return null;
        if (ctx.studio.getState().editor.selectedIds[0] !== element.id || ctx.studio.getState().editor.selectedIds.length !== 1) actions.select([element.id]);
        return asPointerSession(startMove(ctx, element, point, event.pointerType));
      }
      // Touch: only the selected element can be dragged.
      const [selected] = selectSelectedElements(ctx.studio.getState());
      if (!selected || selected.locked || selected.hidden) return null;
      if (!boxContains(boxOf(selected), toDesign(point), slopFor(event.pointerType))) return null;
      return asPointerSession(startMove(ctx, selected, point, event.pointerType));
    },

    tap(event, point) {
      const { actions } = ctx.studio.getState();
      const element = pick(point, event.pointerType);
      if (element) actions.select([element.id]);
      else actions.clearSelection();
    },

    hover(point) {
      const element = point ? pick(point, 'mouse') : null;
      ctx.studio.getState().actions.setHovered(element?.id ?? null);
    },
  };
}

function asPointerSession(session: ReturnType<typeof startMove>) {
  return {
    move: (point: Point, event: PointerEvent) => session.move(point, event),
    end: () => session.end(),
    cancel: () => session.cancel(),
  };
}
