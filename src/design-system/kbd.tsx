import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Kbd({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'inverse'; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border px-1 font-sans text-caption font-medium',
        tone === 'default' ? 'border-border bg-surface-subtle text-fg-muted' : 'border-white/25 bg-white/10 text-fg-inverse',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
