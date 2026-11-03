import { Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Kbd } from './kbd';

/** Mount once near the root. 400 ms delay per the blueprint (§11.11). */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  content: ReactNode;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** A single focusable element. */
  children: ReactElement;
}

export function Tooltip({ content, shortcut, side = 'top', children }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-50 flex max-w-xs items-center gap-2 rounded-sm bg-surface-inverse px-2.5 py-1.5 text-caption font-medium text-fg-inverse shadow-2',
            'data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-pop-in data-[state=closed]:animate-pop-out',
          )}
        >
          {content}
          {shortcut && <Kbd tone="inverse">{shortcut}</Kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
