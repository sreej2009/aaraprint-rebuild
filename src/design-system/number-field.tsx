import { Minus, Plus } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { controlClasses } from './input';
import { formatNumber, parseNumber, roundTo } from './number-format';

export interface NumberCommitInfo {
  /**
   * The value came from a step (arrow key or − / + button). Steps repeat quickly, so editors
   * merge them into one undo step; a typed value is always its own step.
   */
  step: boolean;
}

export interface NumberFieldProps {
  /** Visible label. */
  label: ReactNode;
  /** Accessible name when the visible label is terse ("X" → "X, from the left trim edge"). Must start with the visible label. */
  accessibleLabel?: string;
  value: number;
  /** Shown inside the field, e.g. "mm", "°", "%". */
  unit?: string;
  /** Decimal places shown and committed (default 1). */
  decimals?: number;
  /** Arrow keys and − / + (default 0.1); Shift steps ×10. */
  step?: number;
  min?: number;
  max?: number;
  /** Wrap around instead of clamping (angles: 0–360). */
  wrap?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  /**
   * − / + buttons: `auto` shows them on touch screens only (they are the touch alternative to arrow
   * keys), `always` on every device.
   */
  steppers?: 'auto' | 'always' | 'never';
  hint?: ReactNode;
  className?: string;
  onCommit(value: number, info: NumberCommitInfo): void;
}

/**
 * A number with a unit (Studio inspector: mm, °, %). The text is edited freely and committed on
 * Enter or when focus leaves; Escape restores the current value; invalid text is ignored.
 * ↑ / ↓ step by `step` (Shift ×10), as do the − / + buttons.
 */
export function NumberField({
  label,
  accessibleLabel,
  value,
  unit,
  decimals = 1,
  step = 0.1,
  min,
  max,
  wrap = false,
  readOnly = false,
  disabled = false,
  steppers = 'auto',
  hint,
  className,
  onCommit,
}: NumberFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatNumber(value, decimals);
  const name = accessibleLabel ?? (typeof label === 'string' ? label : undefined);

  const settle = (raw: number) => {
    let next = roundTo(raw, decimals);
    if (wrap && min !== undefined && max !== undefined) {
      const span = max - min;
      next = roundTo(((((next - min) % span) + span) % span) + min, decimals);
    } else {
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
    }
    return next;
  };

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = parseNumber(draft);
    setDraft(null);
    if (parsed === null) return; // not a number: keep the current value
    const next = settle(parsed);
    if (next !== roundTo(value, decimals)) onCommit(next, { step: false });
  };

  const stepBy = (direction: 1 | -1, large: boolean) => {
    if (readOnly || disabled) return;
    const base = draft === null ? value : (parseNumber(draft) ?? value);
    setDraft(null);
    const next = settle(base + direction * step * (large ? 10 : 1));
    if (next !== roundTo(value, decimals)) onCommit(next, { step: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Escape' && draft !== null) {
      // Only swallow Escape when there's something to undo; otherwise it can close a sheet.
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepBy(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey);
    }
  };

  const stepperClass = cn(
    'grid w-9 shrink-0 place-items-center text-fg-muted transition-colors hover:bg-surface-subtle hover:text-fg active:bg-surface-sunken disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
    steppers === 'auto' && 'pointer-fine:hidden',
    steppers === 'never' && 'hidden',
  );
  const atMin = !wrap && min !== undefined && value <= min;
  const atMax = !wrap && max !== undefined && value >= max;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-caption text-fg-muted">
        {label}
      </label>
      <div
        className={cn(
          controlClasses,
          'flex h-9 items-stretch overflow-hidden p-0 focus-within:border-accent pointer-coarse:h-11',
          (readOnly || disabled) && 'border-border bg-surface-subtle text-fg-muted hover:border-border',
          disabled && 'cursor-not-allowed',
        )}
      >
        {!readOnly && (
          <button type="button" tabIndex={-1} aria-label={`Decrease ${name ?? ''}`.trim()} className={cn(stepperClass, 'border-r border-border')} disabled={disabled || atMin} onClick={() => stepBy(-1, false)}>
            <Minus aria-hidden="true" />
          </button>
        )}
        <input
          id={id}
          aria-label={accessibleLabel}
          aria-describedby={hintId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          readOnly={readOnly}
          disabled={disabled}
          value={shown}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commitDraft}
          onKeyDown={onKeyDown}
          className="w-full min-w-0 flex-1 bg-transparent px-2.5 text-body-sm text-inherit tabular-nums outline-none disabled:cursor-not-allowed pointer-coarse:px-2"
        />
        {unit && (
          <span aria-hidden="true" className="pointer-events-none flex items-center pr-2.5 text-caption text-fg-muted pointer-coarse:pr-1.5">
            {unit}
          </span>
        )}
        {!readOnly && (
          <button type="button" tabIndex={-1} aria-label={`Increase ${name ?? ''}`.trim()} className={cn(stepperClass, 'border-l border-border')} disabled={disabled || atMax} onClick={() => stepBy(1, false)}>
            <Plus aria-hidden="true" />
          </button>
        )}
      </div>
      {hint && (
        <p id={hintId} className="text-caption text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
