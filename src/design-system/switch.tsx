import { Switch as SwitchPrimitive } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps {
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** On/off setting that applies immediately (e.g. "Show print guides"). Use Checkbox inside forms. */
export function Switch({ label, description, className, ...props }: SwitchProps) {
  const id = `switch${useId().replace(/:/g, '')}`;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-body-sm font-medium text-fg">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-caption text-fg-muted">
            {description}
          </p>
        )}
      </div>
      <SwitchPrimitive.Root
        id={id}
        aria-describedby={descriptionId}
        className={cn(
          'relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-border-strong bg-surface-sunken transition-colors duration-150',
          'data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb className="block size-4.5 translate-x-0.5 rounded-full bg-white shadow-1 transition-transform duration-150 ease-standard data-[state=checked]:translate-x-[1.125rem]" />
      </SwitchPrimitive.Root>
    </div>
  );
}
