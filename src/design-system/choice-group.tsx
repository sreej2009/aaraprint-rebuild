import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ChoiceOption {
  value: string;
  label: string;
  priceDeltaCents?: number;
  /**
   * When set, the option can't be chosen (e.g. "Out of stock"). It stays focusable and
   * announces the reason instead of disappearing (blueprint §3 "Option selector").
   */
  unavailableReason?: string;
}

export interface ChoiceGroupBaseProps<T extends ChoiceOption> {
  label: string;
  /** Shown after the label, e.g. the selected colour name. */
  labelDetail?: ReactNode;
  hint?: ReactNode;
  hideLabel?: boolean;
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: readonly T[];
  /** Submits the value with an enclosing <form>. */
  name?: string;
  required?: boolean;
  className?: string;
}

interface ChoiceGroupFrameProps<T extends ChoiceOption> extends ChoiceGroupBaseProps<T> {
  listClassName: string;
  children: ReactNode;
}

/** Single-select group with radio semantics (arrow keys move between options). */
export function ChoiceGroupFrame<T extends ChoiceOption>({
  label,
  labelDetail,
  hint,
  hideLabel,
  value,
  onValueChange,
  options,
  name,
  required,
  className,
  listClassName,
  children,
}: ChoiceGroupFrameProps<T>) {
  const id = `choice${useId().replace(/:/g, '')}`;
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className={cn('flex flex-col gap-0.5', hideLabel && 'sr-only')}>
        <span id={`${id}-label`} className="text-body-sm font-semibold text-fg">
          {label}
          {labelDetail && <span className="font-normal text-fg-muted">: {labelDetail}</span>}
        </span>
        {hint && (
          <span id={`${id}-hint`} className="text-caption text-fg-muted">
            {hint}
          </span>
        )}
      </div>
      <RadioGroupPrimitive.Root
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value ?? ''}
        name={name}
        required={required}
        onValueChange={(next) => {
          const option = options.find((o) => o.value === next);
          if (option && !option.unavailableReason) onValueChange(next);
        }}
        className={listClassName}
      >
        {children}
      </RadioGroupPrimitive.Root>
    </div>
  );
}

export interface ChoiceItemProps {
  option: ChoiceOption;
  className?: string;
  /** Overrides the accessible name (needed when the visible content isn't text, e.g. swatches). */
  'aria-label'?: string;
  title?: string;
  children: ReactNode;
}

export function ChoiceItem({ option, className, children, ...props }: ChoiceItemProps) {
  const unavailable = Boolean(option.unavailableReason);
  return (
    <RadioGroupPrimitive.Item
      value={option.value}
      aria-disabled={unavailable || undefined}
      data-unavailable={unavailable || undefined}
      className={cn('group relative outline-offset-2', unavailable && 'cursor-not-allowed', className)}
      {...props}
    >
      {children}
    </RadioGroupPrimitive.Item>
  );
}
