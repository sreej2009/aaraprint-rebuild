import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { FieldContext } from './field-control';

export interface FieldProps {
  label: ReactNode;
  /** Helper text shown under the label and announced with the control. */
  hint?: ReactNode;
  /** Validation message. Marks the control invalid and is announced with it. */
  error?: ReactNode;
  required?: boolean;
  /** Adds "(optional)" to the label. Prefer marking optional fields over required ones. */
  optional?: boolean;
  disabled?: boolean;
  /** Visually hide the label (it stays available to assistive technology). */
  hideLabel?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Labels a single form control and connects hint/error text to it. */
export function Field({ label, hint, error, required, optional, disabled, hideLabel, id: idProp, className, children }: FieldProps) {
  const autoId = useId();
  const id = idProp ?? `field${autoId.replace(/:/g, '')}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext value={{ id, describedBy, invalid: Boolean(error), required: Boolean(required), disabled: Boolean(disabled) }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className={cn('text-body-sm font-medium text-fg', hideLabel && 'sr-only')}>
          {label}
          {optional && <span className="font-normal text-fg-muted"> (optional)</span>}
        </label>
        {hint && (
          <p id={hintId} className="-mt-0.5 text-caption text-fg-muted">
            {hint}
          </p>
        )}
        {children}
        {error && (
          <p id={errorId} className="flex items-start gap-1.5 text-caption font-medium text-danger">
            <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </FieldContext>
  );
}
