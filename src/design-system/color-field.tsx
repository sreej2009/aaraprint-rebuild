import { Ban, Check } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { relativeLuminance } from '@/lib/contrast';
import { cn } from '@/lib/cn';
import { normaliseHex } from './color-format';
import { controlClasses } from './input';

export interface ColorChangeInfo {
  /**
   * The colour picker is still open and the value may keep changing (dragging inside it). Editors
   * merge live changes into one undo step and close it on the final (`live: false`) change.
   */
  live: boolean;
}

export interface ColorPreset {
  /** #rrggbb */
  hex: string;
  /** Accessible name, e.g. "Black". */
  label: string;
}

interface BaseProps {
  /** Visible label and accessible name, e.g. "Text colour". */
  label: string;
  disabled?: boolean;
  /** Quick picks under the field. */
  presets?: readonly ColorPreset[];
  className?: string;
}

/** A colour that's always set (text colour). */
interface SolidProps extends BaseProps {
  noneLabel?: undefined;
  /** #rrggbb */
  value: string;
  onChange(value: string, info: ColorChangeInfo): void;
}

/** A colour that can be switched off (shape fill: "No fill"; border: "No border"). */
interface OptionalProps extends BaseProps {
  /** Name of the "none" choice, shown first among the presets. */
  noneLabel: string;
  /** #rrggbb, or null for none. */
  value: string | null;
  onChange(value: string | null, info: ColorChangeInfo): void;
}

export type ColorFieldProps = SolidProps | OptionalProps;

/**
 * A colour as hex: the system colour picker behind a swatch, a hex field (typed values commit on
 * Enter or leaving the field; invalid text is flagged and then restored; Escape restores) and
 * optional presets. With `noneLabel` the colour can also be switched off.
 */
export function ColorField(props: ColorFieldProps) {
  const { label, disabled = false, presets, className, noneLabel } = props;
  const emit = props.onChange as (value: string | null, info: ColorChangeInfo) => void;
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const none = props.value === null;
  const invalid = draft !== null && normaliseHex(draft) === null && !(noneLabel && draft.trim() === '');
  const current = normaliseHex(props.value ?? '') ?? '#000000';
  // The native picker reports every change while open (`input`), then a final `change` when it
  // closes. React's onChange is the `input` event, so `change` is listened to directly.
  const picker = useRef<HTMLInputElement>(null);
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  });
  useEffect(() => {
    const input = picker.current;
    if (!input) return;
    const onFinal = () => {
      const hex = normaliseHex(input.value);
      if (hex) emitRef.current(hex, { live: false });
    };
    input.addEventListener('change', onFinal);
    return () => input.removeEventListener('change', onFinal);
  }, []);

  const commitDraft = () => {
    if (draft === null) return;
    const hex = normaliseHex(draft);
    setDraft(null);
    // Clearing an optional colour switches it off.
    if (!hex && noneLabel && draft.trim() === '' && !none) emit(null, { live: false });
    else if (hex && (none || hex !== current)) emit(hex, { live: false });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Escape' && draft !== null) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    }
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={`${id}-hex`} className="text-caption text-fg-muted">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span
          className={cn('relative size-9 shrink-0 overflow-hidden rounded-sm border border-border-strong pointer-coarse:size-11', disabled && 'opacity-50')}
          style={none ? { backgroundImage: 'linear-gradient(135deg, transparent 46%, var(--color-danger) 46%, var(--color-danger) 54%, transparent 54%)' } : { backgroundColor: current }}
          data-testid="colour-swatch"
        >
          <input
            ref={picker}
            type="color"
            aria-label={`${label}, colour picker`}
            value={current}
            disabled={disabled}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            onChange={(event) => {
              const hex = normaliseHex(event.currentTarget.value);
              if (hex && (none || hex !== current)) emit(hex, { live: true });
            }}
          />
        </span>
        <input
          id={`${id}-hex`}
          aria-label={`${label}, hex code`}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={7}
          disabled={disabled}
          placeholder={noneLabel}
          value={draft ?? (none ? '' : current.toUpperCase())}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commitDraft}
          onKeyDown={onKeyDown}
          className={cn(controlClasses, 'h-9 min-w-0 flex-1 px-2.5 font-mono text-body-sm uppercase tabular-nums placeholder:font-sans placeholder:normal-case pointer-coarse:h-11')}
        />
      </div>
      {invalid && (
        <p id={`${id}-error`} className="text-caption font-medium text-danger">
          Use a hex code such as #1B1F27.
        </p>
      )}
      {((presets && presets.length > 0) || noneLabel) && (
        <ul aria-label={`${label} presets`} className="mt-1 flex flex-wrap gap-1.5">
          {noneLabel && (
            <li>
              <button
                type="button"
                aria-label={noneLabel}
                aria-pressed={none}
                title={noneLabel}
                disabled={disabled}
                onClick={() => !none && emit(null, { live: false })}
                className={cn(
                  'grid size-7 place-items-center rounded-full border border-border-strong bg-surface text-fg-muted transition-shadow disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:size-10',
                  none && 'shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-accent)]',
                )}
              >
                <Ban aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          )}
          {presets?.map((preset) => {
            const selected = !none && preset.hex === current;
            const light = relativeLuminance(preset.hex) > 0.6;
            return (
              <li key={preset.hex}>
                <button
                  type="button"
                  aria-label={preset.label}
                  aria-pressed={selected}
                  title={preset.label}
                  disabled={disabled}
                  onClick={() => emit(preset.hex, { live: false })}
                  className={cn(
                    'grid size-7 place-items-center rounded-full border transition-shadow disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:size-10',
                    light ? 'border-border-strong' : 'border-transparent',
                    selected && 'shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-accent)]',
                  )}
                  style={{ backgroundColor: preset.hex }}
                >
                  {selected && <Check aria-hidden="true" strokeWidth={3} className={cn('size-3.5', light ? 'text-fg' : 'text-white')} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
