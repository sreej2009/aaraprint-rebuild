import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const paddings = { none: '', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' } as const;

export interface CardProps extends ComponentProps<'div'> {
  padding?: keyof typeof paddings;
  /** Hover elevation for cards that are entirely clickable. */
  interactive?: boolean;
}

/** Flat bordered surface. Elevation only appears on interaction (blueprint §2.3). */
export function Card({ padding = 'md', interactive = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-surface',
        paddings[padding],
        interactive && 'transition-[box-shadow,border-color] duration-150 hover:border-border-hover hover:shadow-2 has-[a:focus-visible]:shadow-2',
        className,
      )}
      {...props}
    />
  );
}
