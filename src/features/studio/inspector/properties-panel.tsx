import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Copy, Eye, EyeOff, Lock, LockOpen, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { Button, Callout, IconButton, IconToggle, NumberField, Slider } from '@/design-system';
import { cn } from '@/lib/cn';
import { PLACEMENT_MESSAGES, placementFor, DUPLICATE_OFFSET_MM } from '../canvas/transform-rules';
import { mmToPx } from '../geometry/units';
import { describeElements, elementDisplayName } from '../naming';
import type { ArrangeAction } from '../commands';
import type { DesignElement, SurfaceDesign } from '../schema/types';
import { selectDocument, useStudio, useStudioActions } from '../store';
import { ElementIcon } from './element-icon';
import { arrangeOptions, elementTypeLabel, opacityFromPercent, opacityPercent } from './inspector-rules';
import { PositionSize } from './position-size';
import { TextContentField } from './text-content-field';
import { TextStyleSection } from './text-style-section';

/** Bigger hit areas on touch screens (44 px). */
const touch = 'pointer-coarse:size-11';

/**
 * Everything about the selected element: name and type, lock / hidden / print warnings, quick
 * actions, text content and style (text), position & size, opacity and layer order. Every change
 * goes through the Studio store (M2 commands, M3 history); locked elements only offer unlock,
 * show/hide and duplicate.
 */
export function PropertiesPanel({ element, surface }: { element: DesignElement; surface: SurfaceDesign }) {
  const document = useStudio(selectDocument);
  const actions = useStudioActions();
  const name = elementDisplayName(element, document);
  const placement = placementFor(element, surface.print);
  const warning = PLACEMENT_MESSAGES[placement];
  return (
    <div className="flex flex-col gap-5" data-testid="selected-properties">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-subtle text-fg-muted">
          <ElementIcon element={element} />
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-body font-semibold text-fg" title={name}>
            {name}
          </p>
          <p className="text-caption text-fg-muted">{elementTypeLabel(element)}</p>
        </div>
      </div>

      <QuickActions element={element} surface={surface} name={describeElements([element], document)} />

      {element.locked && (
        <Callout
          title="This layer is locked"
          actions={
            <Button variant="secondary" size="sm" className="pointer-coarse:h-11" onClick={() => actions.setLocked([element.id], false)}>
              <LockOpen aria-hidden="true" />
              Unlock
            </Button>
          }
        >
          Unlock it to move, resize, reorder or delete it.
        </Callout>
      )}
      {element.hidden && <Callout title="This layer is hidden">It isn’t shown on the canvas or printed. Show it again with the eye button.</Callout>}
      {warning && (
        <Callout tone={placement === 'outside-trim' ? 'danger' : 'warning'} className="p-3">
          {warning}
        </Callout>
      )}

      {element.type === 'text' && (
        <>
          <TextContentField element={element} />
          <TextStyleSection element={element} print={surface.print} />
        </>
      )}
      <PositionSize element={element} print={surface.print} />
      <Appearance element={element} />
      <Arrange element={element} surface={surface} />
    </div>
  );
}

function QuickActions({ element, surface, name }: { element: DesignElement; surface: SurfaceDesign; name: string }) {
  const actions = useStudioActions();
  return (
    <div role="toolbar" aria-label="Layer actions" className="flex items-center gap-1">
      <IconToggle
        label="Hide layer"
        icon={<Eye />}
        pressedIcon={<EyeOff />}
        pressed={element.hidden}
        tooltip={element.hidden ? 'Show layer' : 'Hide layer'}
        onPressedChange={(hidden) => actions.setHidden([element.id], hidden, { keepSelection: true })}
        className={touch}
      />
      <IconToggle
        label="Lock layer"
        icon={<LockOpen />}
        pressedIcon={<Lock />}
        pressed={element.locked}
        tooltip={element.locked ? 'Unlock layer' : 'Lock layer'}
        onPressedChange={(locked) => actions.setLocked([element.id], locked)}
        className={touch}
      />
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <IconButton
        label="Duplicate"
        shortcut="Ctrl D"
        icon={<Copy />}
        size="sm"
        className={touch}
        onClick={() => actions.duplicateElements([element.id], mmToPx(DUPLICATE_OFFSET_MM, surface.print.dpi))}
      />
      <IconButton
        label="Delete"
        shortcut="Delete"
        icon={<Trash2 />}
        size="sm"
        disabled={element.locked}
        className={cn(touch, 'text-danger hover:bg-danger-soft hover:text-danger')}
        onClick={() => actions.removeElements([element.id])}
        aria-description={element.locked ? `${name} is locked` : undefined}
      />
    </div>
  );
}

let opacityGesture = 0;

/** Opacity: a slider for feel and a field for exact values, both in whole percent. */
function Appearance({ element }: { element: DesignElement }) {
  const actions = useStudioActions();
  const document = useStudio(selectDocument);
  // A pointer drag on the slider is one undo step however slow; key presses merge within 600 ms.
  const dragKey = useRef<string | null>(null);
  const label = `Change opacity ${describeElements([element], document)}`;
  const set = (percent: number, merge: { coalesceKey?: string; gesture?: boolean } = {}) =>
    actions.updateElement(element.id, { opacity: opacityFromPercent(percent) }, { label, ...merge });
  const percent = opacityPercent(element);
  return (
    <section aria-labelledby="studio-appearance-heading" className="flex flex-col gap-3">
      <h3 id="studio-appearance-heading" className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
        Appearance
      </h3>
      {/* Side by side with a mouse; stacked on touch screens, where the field has − / + buttons. */}
      <div className="grid grid-cols-[1fr_6.5rem] items-end gap-3 pointer-coarse:grid-cols-1">
        <div
          onPointerDownCapture={() => {
            opacityGesture += 1;
            dragKey.current = `opacity-drag:${opacityGesture}`;
          }}
        >
          <Slider
            label="Opacity"
            hideLabel
            value={percent}
            disabled={element.locked}
            valueText={(v) => `${v} percent`}
            onValueChange={(v) => set(v, dragKey.current ? { coalesceKey: dragKey.current, gesture: true } : { coalesceKey: `opacity:${element.id}` })}
            onValueCommit={(_, { pointer }) => {
              if (!pointer) return;
              dragKey.current = null;
              actions.sealHistory();
            }}
          />
        </div>
        <NumberField
          label="Opacity"
          unit="%"
          decimals={0}
          step={1}
          min={0}
          max={100}
          value={percent}
          disabled={element.locked}
          className="pointer-coarse:w-1/2"
          onCommit={(v, info) => set(v, info.step ? { coalesceKey: `opacity:${element.id}` } : {})}
        />
      </div>
    </section>
  );
}

const ARRANGE: { action: ArrangeAction; label: string; short: string; icon: typeof ArrowUp }[] = [
  { action: 'forward', label: 'Bring forward', short: 'Forward', icon: ArrowUp },
  { action: 'backward', label: 'Send backward', short: 'Backward', icon: ArrowDown },
  { action: 'front', label: 'Bring to front', short: 'To front', icon: ArrowUpToLine },
  { action: 'back', label: 'Send to back', short: 'To back', icon: ArrowDownToLine },
];

function Arrange({ element, surface }: { element: DesignElement; surface: SurfaceDesign }) {
  const actions = useStudioActions();
  const options = arrangeOptions(surface, element.id);
  return (
    <section aria-labelledby="studio-arrange-heading" className="flex flex-col gap-3">
      <h3 id="studio-arrange-heading" className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
        Layer order
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {ARRANGE.map(({ action, label, short, icon: Icon }) => {
          const up = action === 'forward' || action === 'front';
          return (
            <Button
              key={action}
              variant="secondary"
              size="sm"
              aria-label={label}
              className="justify-start pointer-coarse:h-11"
              disabled={!(up ? options.forward : options.backward)}
              onClick={() => actions.arrangeElement(element.id, action)}
            >
              <Icon aria-hidden="true" />
              {short}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
