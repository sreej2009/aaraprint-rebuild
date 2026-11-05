import { AlignCenterHorizontal, AlignCenterVertical, Link2, Unlink2 } from 'lucide-react';
import { Button, IconToggle, NumberField, type NumberCommitInfo } from '@/design-system';
import { useInteraction, useInteractionStoreApi } from '../canvas/interaction-store';
import { normaliseAngle } from '../geometry/transform';
import { roundTo } from '../geometry/units';
import { describeElements } from '../naming';
import type { DesignElement, ElementPatch, SurfacePrint } from '../schema/types';
import { selectDocument, useStudio, useStudioActions } from '../store';
import { canLockRatio, centredPatch, defaultRatioLock, heightEditable, isCentred, sizePatch, toMm, toPx } from './inspector-rules';

/**
 * Exact position, size and rotation (Plan §18.6): X and Y from the trim's top-left corner, W and H
 * in mm (one decimal), rotation in degrees, a proportion lock, and centring on the piece.
 * Typing a value and pressing Enter (or leaving the field) is one undo step; ↑/↓ and − / + step
 * by 0.1 mm (Shift: 1 mm) and steps within 600 ms merge into one.
 */
export function PositionSize({ element, print }: { element: DesignElement; print: SurfacePrint }) {
  const actions = useStudioActions();
  const document = useStudio(selectDocument);
  const interaction = useInteractionStoreApi();
  const storedLock = useInteraction((s) => s.ratioLocks[element.id]);
  const ratioLocked = canLockRatio(element) && (storedLock ?? defaultRatioLock(element));
  const disabled = element.locked;
  const name = describeElements([element], document);

  const commit = (verb: string, field: string, patch: ElementPatch, info: NumberCommitInfo) => {
    actions.updateElement(element.id, patch, { label: `${verb} ${name}`, ...(info.step ? { coalesceKey: `field:${field}:${element.id}` } : {}) });
  };

  return (
    <section aria-labelledby="studio-position-heading" className="flex flex-col gap-3">
      <h3 id="studio-position-heading" className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
        Position &amp; size
      </h3>
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <NumberField label="X" accessibleLabel="X, from the left trim edge" unit="mm" value={toMm(element.x, print)} disabled={disabled} onCommit={(v, i) => commit('Move', 'x', { x: toPx(v, print) }, i)} />
        <NumberField label="Y" accessibleLabel="Y, from the top trim edge" unit="mm" value={toMm(element.y, print)} disabled={disabled} onCommit={(v, i) => commit('Move', 'y', { y: toPx(v, print) }, i)} />
        <NumberField
          label="W"
          accessibleLabel="W, width"
          unit="mm"
          min={0.1}
          value={toMm(element.width, print)}
          disabled={disabled}
          onCommit={(v, i) => commit('Resize', 'width', sizePatch(element, 'width', v, ratioLocked, print), i)}
        />
        <NumberField
          label="H"
          accessibleLabel={heightEditable(element) ? 'H, height' : 'H, height (follows the text)'}
          unit="mm"
          min={0.1}
          value={toMm(element.height, print)}
          readOnly={!heightEditable(element)}
          disabled={disabled}
          onCommit={(v, i) => commit('Resize', 'height', sizePatch(element, 'height', v, ratioLocked, print), i)}
        />
      </div>
      {canLockRatio(element) && (
        <div className="-mt-1 flex items-center gap-2">
          <IconToggle
            label="Keep proportions"
            icon={<Unlink2 />}
            pressedIcon={<Link2 />}
            pressed={ratioLocked}
            disabled={disabled}
            onPressedChange={(pressed) => interaction.getState().actions.setRatioLock(element.id, pressed)}
            className="pointer-coarse:size-11"
          />
          <span aria-hidden="true" className="text-caption text-fg-muted">
            {ratioLocked ? 'Proportions locked' : 'Free proportions'}
          </span>
        </div>
      )}
      <NumberField
        label="Rotation"
        unit="°"
        step={1}
        min={0}
        max={360}
        wrap
        value={element.rotation}
        disabled={disabled}
        onCommit={(v, i) => commit('Rotate', 'rotation', { rotation: roundTo(normaliseAngle(v), 2) }, i)}
      />
      <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
        <legend className="mb-1 p-0 text-caption text-fg-muted">Centre on the piece</legend>
        <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="pointer-coarse:h-11"
          aria-label="Centre horizontally"
          disabled={disabled || isCentred(element, print, 'horizontal')}
          onClick={() => actions.updateElement(element.id, centredPatch(element, print, 'horizontal'), { label: `Centre ${name} horizontally` })}
        >
          <AlignCenterHorizontal aria-hidden="true" />
          Horizontally
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="pointer-coarse:h-11"
          aria-label="Centre vertically"
          disabled={disabled || isCentred(element, print, 'vertical')}
          onClick={() => actions.updateElement(element.id, centredPatch(element, print, 'vertical'), { label: `Centre ${name} vertically` })}
        >
          <AlignCenterVertical aria-hidden="true" />
          Vertically
        </Button>
        </div>
      </fieldset>
    </section>
  );
}
