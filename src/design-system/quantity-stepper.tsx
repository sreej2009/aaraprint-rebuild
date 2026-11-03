import { Minus, Plus } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export interface QuantityStepperProps {
  label: string;
  hideLabel?: boolean;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Number stepper following the ARIA spinbutton pattern (arrows, Page Up/Down, Home/End). */
export function QuantityStepper({ label, hideLabel, value, onValueChange, min = 1, max = 999, step = 1, disabled, className }: QuantityStepperProps) {
  const id = `stepper${useId().replace(/:/g, '')}`;
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (next: number) => {
    const clean = clamp(Math.round(next / step) * step, min, max);
    setDraft(null);
    if (clean !== value) onValueChange(clean);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const moves: Record<string, number> = {
      ArrowUp: value + step,
      ArrowDown: value - step,
      PageUp: value + step * 10,
      PageDown: value - step * 10,
      Home: min,
      End: max,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      commit(next);
    } else if (event.key === 'Enter' && draft !== null) {
      commit(Number(draft) || min);
    }
  };

  const buttonClasses =
    'grid size-11 shrink-0 place-items-center text-fg transition-colors duration-150 hover:bg-surface-subtle disabled:cursor-not-allowed disabled:text-fg-subtle disabled:hover:bg-transparent';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-body-sm font-semibold text-fg', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="inline-flex w-fit items-center overflow-hidden rounded-sm border border-border-strong bg-surface has-[input:focus-visible]:border-accent">
        <button
          type="button"
          className={buttonClasses}
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={disabled || value <= min}
          onClick={() => commit(value - step)}
        >
          <Minus aria-hidden="true" className="size-4" />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          autoComplete="off"
          disabled={disabled}
          value={draft ?? String(value)}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => draft !== null && commit(Number(draft) || min)}
          onKeyDown={onKeyDown}
          className="h-11 w-14 border-x border-border bg-transparent text-center text-body font-semibold text-fg tabular-nums focus-visible:outline-none disabled:text-fg-subtle"
        />
        <button
          type="button"
          className={buttonClasses}
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={disabled || value >= max}
          onClick={() => commit(value + step)}
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
