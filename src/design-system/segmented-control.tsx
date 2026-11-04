import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/cn';

export interface SegmentedOption {
  value: string;
  label: string;
  /** Small number after the label, e.g. elements on a Studio side. Read out as "Front, 3 items". */
  count?: number;
}

export interface SegmentedControlProps {
  /** Accessible name for the group, e.g. "Preview mode". */
  label: string;
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Compact single choice that switches a view (2D / 3D, Front / Back).
 * Use Tabs instead when each option reveals its own panel of content.
 */
export function SegmentedControl({ label, options, value, onValueChange, size = 'md', className }: SegmentedControlProps) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      // Radix emits "" when the active item is pressed again; keep one option selected.
      onValueChange={(next) => next && onValueChange(next)}
      className={cn('inline-flex w-fit gap-1 rounded-md border border-border bg-surface-subtle p-1', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          {...(option.count === undefined ? {} : { 'aria-label': `${option.label}, ${option.count} ${option.count === 1 ? 'item' : 'items'}` })}
          className={cn(
            'inline-flex items-center justify-center rounded-sm px-3 font-medium whitespace-nowrap text-fg-muted transition-colors duration-150 hover:text-fg',
            'data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-1',
            size === 'sm' ? 'h-8 min-w-12 text-caption' : 'h-9 min-w-16 text-body-sm',
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span aria-hidden="true" className="ml-1.5 min-w-5 rounded-full bg-surface-sunken px-1.5 text-center text-caption leading-5 tabular-nums text-fg-muted">
              {option.count}
            </span>
          )}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
