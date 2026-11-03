import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';
import { useFieldControl } from './field-control';
import { controlClasses } from './input';

export interface SelectOption {
  value: string;
  label: string;
  /** Secondary text inside the list, e.g. a price difference. */
  detail?: string;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  /** Accessible name when the select is not inside a <Field>. */
  'aria-label'?: string;
  className?: string;
}

/** Styled listbox for short option lists (sort order, sizes). Use NativeSelect inside long forms. */
export function Select({ options, placeholder = 'Select…', className, value, defaultValue, onValueChange, name, ...props }: SelectProps) {
  const control = useFieldControl(props);
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      name={name}
      disabled={control.disabled}
      required={control.required}
    >
      <SelectPrimitive.Trigger
        id={control.id}
        aria-label={control['aria-label']}
        aria-describedby={control['aria-describedby']}
        aria-invalid={control['aria-invalid']}
        className={cn(
          controlClasses,
          'inline-flex h-11 items-center justify-between gap-2 pr-3 pl-3 text-left data-[placeholder]:text-fg-muted',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden="true" className="size-4 text-fg-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-border bg-surface shadow-2',
            'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  'relative flex min-h-10 cursor-pointer items-center gap-3 rounded-sm py-2 pr-3 pl-9 text-body-sm text-fg outline-none select-none',
                  'data-[highlighted]:bg-surface-subtle data-[disabled]:cursor-not-allowed data-[disabled]:text-fg-subtle',
                )}
              >
                <SelectPrimitive.ItemIndicator className="absolute left-3 inline-flex">
                  <Check aria-hidden="true" className="size-4 text-accent-strong" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                {option.detail && <span className="ml-auto text-caption text-fg-muted tabular-nums">{option.detail}</span>}
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
