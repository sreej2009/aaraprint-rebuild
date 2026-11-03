import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CheckboxProps {
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  className?: string;
}

export function Checkbox({ label, description, className, ...props }: CheckboxProps) {
  const id = `checkbox${useId().replace(/:/g, '')}`;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <CheckboxPrimitive.Root
        id={id}
        aria-describedby={descriptionId}
        className={cn(
          'peer mt-0.5 grid size-5 shrink-0 place-items-center rounded-[5px] border border-border-strong bg-surface transition-colors duration-150',
          'hover:border-border-hover data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
          'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-subtle',
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="text-fg-on-accent">
          {props.checked === 'indeterminate' ? <Minus className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-body-sm font-medium text-fg peer-disabled:cursor-not-allowed peer-disabled:text-fg-subtle">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-caption text-fg-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
