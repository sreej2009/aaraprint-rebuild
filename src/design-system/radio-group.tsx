import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  label: ReactNode;
  hideLabel?: boolean;
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  /** `cards` gives each option a bordered, full-width target (payment or delivery choices). */
  variant?: 'list' | 'cards';
  className?: string;
}

export function RadioGroup({ label, hideLabel, options, variant = 'list', className, ...props }: RadioGroupProps) {
  const id = `radio${useId().replace(/:/g, '')}`;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span id={`${id}-label`} className={cn('text-body-sm font-medium text-fg', hideLabel && 'sr-only')}>
        {label}
      </span>
      <RadioGroupPrimitive.Root aria-labelledby={`${id}-label`} className={cn('flex flex-col', variant === 'cards' ? 'gap-2' : 'gap-3')} {...props}>
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={cn(
                'flex cursor-pointer items-start gap-3',
                variant === 'cards' &&
                  'rounded-md border border-border-strong p-4 transition-colors duration-150 hover:border-border-hover has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent-soft',
                option.disabled && 'cursor-not-allowed',
              )}
            >
              <RadioGroupPrimitive.Item
                id={optionId}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-border-strong bg-surface transition-colors duration-150',
                  'hover:border-border-hover data-[state=checked]:border-accent disabled:border-border disabled:bg-surface-subtle',
                )}
              >
                <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-accent" />
              </RadioGroupPrimitive.Item>
              <span className="flex flex-col gap-0.5">
                <span className={cn('text-body-sm font-medium', option.disabled ? 'text-fg-subtle' : 'text-fg')}>{option.label}</span>
                {option.description && <span className="text-caption text-fg-muted">{option.description}</span>}
              </span>
            </label>
          );
        })}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
