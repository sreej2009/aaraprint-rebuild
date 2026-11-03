import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { useFieldControl } from './field-control';

/** Shared look for text-like controls. 16px text avoids iOS zoom on focus. */
export const controlClasses =
  'w-full rounded-sm border border-border-strong bg-surface text-body text-fg transition-colors duration-150 ' +
  'placeholder:text-fg-muted hover:border-border-hover focus-visible:border-accent focus-visible:outline-offset-0 ' +
  'aria-invalid:border-danger aria-invalid:hover:border-danger ' +
  'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-subtle disabled:text-fg-subtle';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  const control = useFieldControl(props);
  return <input className={cn(controlClasses, 'h-11 px-3', className)} {...control} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  const control = useFieldControl(props);
  return <textarea rows={rows} className={cn(controlClasses, 'min-h-24 resize-y px-3 py-2.5', className)} {...control} />;
}

/** Native <select>: best on phones (system picker) and in long forms such as addresses. */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  const control = useFieldControl(props);
  return (
    <div className={cn('relative', className)}>
      <select className={cn(controlClasses, 'h-11 cursor-pointer appearance-none pr-10 pl-3')} {...control}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-muted" />
    </div>
  );
}
