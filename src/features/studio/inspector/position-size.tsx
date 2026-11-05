import { useId, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { controlClasses } from '@/design-system';
import { MIN_SIZE_MM } from '../canvas/transform-rules';
import { normaliseAngle } from '../geometry/transform';
import { mmToPx, pxToMm, roundTo } from '../geometry/units';
import { formatNumber, parseNumber } from './numbers';
import type { DesignElement, ElementPatch, SurfacePrint } from '../schema/types';
import { describeElements } from '../naming';
import { selectDocument, useStudio, useStudioActions } from '../store';

/**
 * Exact position, size and rotation of the selected element (Plan §18.6): X and Y from the trim's
 * top-left corner, W and H in mm (one decimal), rotation in degrees. Enter or leaving a field
 * commits one undo step; ↑/↓ step by 0.1 (Shift: 1) and repeated steps within 600 ms merge.
 * M7 adds the proportion lock, centre/fit actions and opacity.
 */
export function PositionSize({ element, print }: { element: DesignElement; print: SurfacePrint }) {
  const actions = useStudioActions();
  const document = useStudio(selectDocument);
  const mm = (px: number) => pxToMm(px, print.dpi);
  const px = (value: number) => Math.round(mmToPx(value, print.dpi) * 100) / 100;
  const disabled = element.locked;
  const ratio = element.width / element.height;

  const VERBS: Record<string, string> = { X: 'Move', Y: 'Move', Width: 'Resize', Height: 'Resize', Rotation: 'Rotate' };
  const commit = (field: string, patch: ElementPatch, repeat: boolean) => {
    const label = `${VERBS[field] ?? 'Edit'} ${describeElements([element], document)}`;
    actions.updateElement(element.id, patch, { label, ...(repeat ? { coalesceKey: `field:${field}:${element.id}` } : {}) });
  };

  const setWidth = (value: number, repeat: boolean) => {
    const width = px(Math.max(value, minFor(mm(element.width))));
    // Images keep their proportions, as on the canvas.
    commit('Width', element.type === 'image' ? { width, height: Math.round((width / ratio) * 100) / 100 } : { width }, repeat);
  };
  const setHeight = (value: number, repeat: boolean) => {
    const height = px(Math.max(value, minFor(mm(element.height))));
    commit('Height', element.type === 'image' ? { height, width: Math.round(height * ratio * 100) / 100 } : { height }, repeat);
  };

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" disabled={disabled}>
      <legend className="mb-2 text-caption font-semibold tracking-wide text-fg-muted uppercase">Position &amp; size</legend>
      <div className="grid grid-cols-2 gap-2">
        <MeasureField label="X" description="From the left trim edge" unit="mm" value={mm(element.x)} onCommit={(v, r) => commit('X', { x: px(v) }, r)} />
        <MeasureField label="Y" description="From the top trim edge" unit="mm" value={mm(element.y)} onCommit={(v, r) => commit('Y', { y: px(v) }, r)} />
        <MeasureField label="W" description="Width" unit="mm" value={mm(element.width)} min={0.1} onCommit={setWidth} />
        <MeasureField
          label="H"
          description={element.type === 'text' ? 'Height (follows the text)' : 'Height'}
          unit="mm"
          value={mm(element.height)}
          min={0.1}
          readOnly={element.type === 'text'}
          onCommit={setHeight}
        />
        <MeasureField label="Rotation" unit="°" value={element.rotation} onCommit={(v, r) => commit('Rotation', { rotation: roundTo(normaliseAngle(v), 2) }, r)} wide />
      </div>
      {element.type === 'image' && <p className="text-caption text-fg-muted">Images keep their proportions.</p>}
    </fieldset>
  );
}

/** Never grow a small element up to the minimum just by typing near its size. */
function minFor(currentMm: number): number {
  return Math.min(MIN_SIZE_MM, currentMm);
}

interface MeasureFieldProps {
  label: string;
  description?: string;
  unit: string;
  value: number;
  min?: number;
  readOnly?: boolean;
  wide?: boolean;
  /** `repeat`: an arrow-key step, merged with the previous one within 600 ms. */
  onCommit(value: number, repeat: boolean): void;
}

export function MeasureField({ label, description, unit, value, min, readOnly, wide, onCommit }: MeasureFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatNumber(value);

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = parseNumber(draft);
    setDraft(null);
    if (parsed === null) return; // not a number: keep the old value
    const next = min === undefined ? parsed : Math.max(min, parsed);
    if (roundTo(next, 1) !== roundTo(value, 1)) onCommit(next, false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !readOnly) {
      event.preventDefault();
      const step = (event.shiftKey ? 1 : 0.1) * (event.key === 'ArrowUp' ? 1 : -1);
      const base = draft === null ? value : (parseNumber(draft) ?? value);
      const next = roundTo(min === undefined ? base + step : Math.max(min, base + step), 1);
      setDraft(null);
      onCommit(next, true);
    }
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', wide && 'col-span-2')}>
      <label htmlFor={id} className="text-caption text-fg-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-label={description ? `${label}, ${description}` : undefined}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          readOnly={readOnly}
          value={shown}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commitDraft}
          onKeyDown={onKeyDown}
          className={cn(controlClasses, 'h-9 pr-9 pl-2.5 text-body-sm tabular-nums read-only:bg-surface-subtle read-only:text-fg-muted')}
        />
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-caption text-fg-muted">
          {unit}
        </span>
      </div>
    </div>
  );
}
