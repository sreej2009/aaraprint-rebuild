import { Separator as SeparatorPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';

export function Separator({
  orientation = 'horizontal',
  decorative = true,
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
  className?: string;
}) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      decorative={decorative}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    />
  );
}
