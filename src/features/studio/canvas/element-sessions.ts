import type { Point } from '../geometry/boxes';
import { moveBox, resizeBox, rotationFromPointer, type Handle } from '../geometry/transform';
import { describeElements } from '../naming';
import type { DesignElement, ElementPatch } from '../schema/types';
import { selectActiveSurface, type StudioStore } from '../store';
import type { InteractionStore } from './interaction-store';
import { boxOf, keepsRatio, minSizePx, patchForBox } from './transform-rules';
import type { ViewportStore } from './viewport-store';

/**
 * Pointer sessions that move, resize or rotate one element. Each pointer move updates the design
 * through the Studio store (M2 commands), so the canvas, inspector and layer list follow live;
 * all updates of one gesture share a coalesce key and merge into a single undo step, which is
 * sealed when the pointer lifts. Cancelling (Escape, a second finger) restores the start, and a
 * gesture that ends where it began leaves no undo step at all.
 */

export interface SessionContext {
  studio: StudioStore;
  viewport: ViewportStore;
  interaction: InteractionStore;
}

export interface Modifiers {
  shiftKey: boolean;
  altKey: boolean;
}

/** Points are screen px relative to the canvas area. */
export interface ElementSession {
  move(point: Point, modifiers: Modifiers): void;
  end(): void;
  cancel(): void;
}

/** Screen px a press must travel before it counts as a drag (clicks and taps never move things). */
export const DRAG_THRESHOLD = { mouse: 3, touch: 6 } as const;

let gestureCounter = 0;

function toDesign(viewport: ViewportStore, point: Point): Point {
  const { scale, x, y } = viewport.getState().viewport;
  return { x: (point.x - x) / scale, y: (point.y - y) / scale };
}

interface GestureSpec {
  kind: 'move' | 'resize' | 'rotate';
  handle: Handle | null;
  label: string;
  /** Screen px to travel before anything changes. */
  threshold: number;
  patchFor(start: DesignElement, startPoint: Point, point: Point, modifiers: Modifiers): ElementPatch;
}

function startSession(ctx: SessionContext, given: DesignElement, startScreen: Point, spec: GestureSpec): ElementSession {
  const { actions } = ctx.studio.getState();
  // Start from the element as it is now in the design, not as a component last rendered it.
  const element = selectActiveSurface(ctx.studio.getState())?.elements.find((e) => e.id === given.id) ?? given;
  const key = `${spec.kind}:${(gestureCounter += 1)}`;
  const startDesign = toDesign(ctx.viewport, startScreen);
  const label = `${spec.label} ${describeElements([element], ctx.studio.getState().document)}`;
  let active = false;
  let finished = false;

  const apply = (patch: ElementPatch) => actions.updateElement(element.id, patch, { coalesceKey: key, gesture: true, label });

  const finish = () => {
    if (finished) return;
    finished = true;
    if (active) actions.sealHistory();
    if (ctx.interaction.getState().gesture?.cancel === cancel) ctx.interaction.getState().actions.setGesture(null);
  };

  const cancel = () => {
    if (finished) return;
    // Back to the start: merges into the same step, which is then dropped as a no-op.
    if (active) apply(startPatch(element));
    finish();
  };

  return {
    move(point, modifiers) {
      if (finished) return;
      if (!active) {
        if (Math.hypot(point.x - startScreen.x, point.y - startScreen.y) < spec.threshold) return;
        active = true;
        ctx.interaction.getState().actions.setGesture({ kind: spec.kind, elementId: element.id, handle: spec.handle, cancel });
      }
      // The element may have been deleted or locked from elsewhere mid-gesture.
      const current = selectActiveSurface(ctx.studio.getState())?.elements.find((e) => e.id === element.id);
      if (!current || current.locked) {
        finish();
        return;
      }
      apply(spec.patchFor(element, startDesign, toDesign(ctx.viewport, point), modifiers));
    },
    end: finish,
    cancel,
  };
}

/** Drag the element's body. */
export function startMove(ctx: SessionContext, element: DesignElement, start: Point, pointerType: string): ElementSession {
  return startSession(ctx, element, start, {
    kind: 'move',
    handle: null,
    label: 'Move',
    threshold: pointerType === 'mouse' ? DRAG_THRESHOLD.mouse : DRAG_THRESHOLD.touch,
    patchFor(el, from, to) {
      const { x, y } = patchForBox(el, moveBox(boxOf(el), to.x - from.x, to.y - from.y), null);
      return { x, y };
    },
  });
}

/** Drag a resize handle. */
export function startResize(ctx: SessionContext, element: DesignElement, handle: Handle, start: Point, dpi: number): ElementSession {
  return startSession(ctx, element, start, {
    kind: 'resize',
    handle,
    label: 'Resize',
    threshold: 1,
    patchFor(el, from, to, { shiftKey, altKey }) {
      // The handle moves by as much as the pointer, wherever on the handle it was grabbed, so the
      // edge never jumps to the pointer.
      const box = boxOf(el);
      const anchor = handlePoint(box, handle);
      const target = { x: anchor.x + to.x - from.x, y: anchor.y + to.y - from.y };
      const next = resizeBox(box, handle, target, { keepRatio: keepsRatio(el, handle, shiftKey), fromCentre: altKey, minSize: minSizePx(dpi) });
      return patchForBox(el, next, handle);
    },
  });
}

/** Drag the rotation handle. Shift rotates in 15° steps. */
export function startRotate(ctx: SessionContext, element: DesignElement, start: Point): ElementSession {
  return startSession(ctx, element, start, {
    kind: 'rotate',
    handle: null,
    label: 'Rotate',
    threshold: 1,
    patchFor(el, from, to, { shiftKey }) {
      return { rotation: Math.round(rotationFromPointer(boxOf(el), from, to, shiftKey) * 100) / 100 };
    },
  });
}

/** The fields a gesture can change, as they were at the start. */
function startPatch(element: DesignElement): ElementPatch {
  const { x, y, width, height, rotation } = element;
  return (element.type === 'text' ? { x, y, width, height, rotation, fontSize: element.fontSize } : { x, y, width, height, rotation }) as ElementPatch;
}

/** Where a handle sits, in design px (rotation included). */
export function handlePoint(box: ReturnType<typeof boxOf>, handle: Handle): Point {
  const x = handle.includes('w') ? 0 : handle.includes('e') ? 1 : 0.5;
  const y = handle.includes('n') ? 0 : handle.includes('s') ? 1 : 0.5;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const lx = box.x + box.width * x - cx;
  const ly = box.y + box.height * y - cy;
  const a = (box.rotation * Math.PI) / 180;
  return { x: cx + lx * Math.cos(a) - ly * Math.sin(a), y: cy + lx * Math.sin(a) + ly * Math.cos(a) };
}
