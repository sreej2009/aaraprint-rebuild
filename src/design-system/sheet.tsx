import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './button';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const sides = {
  right:
    'inset-y-0 right-0 h-dvh w-full max-w-[26rem] border-l data-[state=open]:animate-sheet-in-right data-[state=closed]:animate-sheet-out-right',
  left: 'inset-y-0 left-0 h-dvh w-[min(100vw-3rem,22rem)] border-r data-[state=open]:animate-sheet-in-left data-[state=closed]:animate-sheet-out-left',
  bottom:
    'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-lg border-t data-[state=open]:animate-sheet-in-bottom data-[state=closed]:animate-sheet-out-bottom',
} as const;

export interface SheetContentProps {
  side?: keyof typeof sides;
  title: ReactNode;
  /** Visually hide the title (it stays the dialog's accessible name). */
  hideTitle?: boolean;
  description?: ReactNode;
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Where focus goes when the sheet opens; call `preventDefault()` to place it yourself. */
  onOpenAutoFocus?: (event: Event) => void;
  /** Where focus goes when the sheet has closed; call `preventDefault()` to leave it where it is. */
  onCloseAutoFocus?: (event: Event) => void;
  /** Escape; call `preventDefault()` to keep the sheet open (or close it your own way). */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  children?: ReactNode;
}

/** Drawer for the cart, mobile navigation, filters and Studio tool panels on phones. */
export function SheetContent({ side = 'right', title, hideTitle, description, footer, className, style, onOpenAutoFocus, onCloseAutoFocus, onEscapeKeyDown, children }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
      <DialogPrimitive.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn('fixed z-50 flex flex-col border-border bg-surface shadow-3 outline-none', sides[side], className)}
        style={style}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
      >
        {side === 'bottom' && <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border-strong/50" />}
        <div className={cn('flex items-center gap-3 px-5 py-3', !hideTitle && 'border-b border-border')}>
          <div className={cn('flex min-w-0 flex-1 flex-col', hideTitle && 'sr-only')}>
            <DialogPrimitive.Title className="font-display text-h3 font-semibold text-fg">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="text-body-sm text-fg-muted">{description}</DialogPrimitive.Description> : null}
          </div>
          <DialogPrimitive.Close asChild>
            <IconButton label="Close" icon={<X />} size="sm" tooltip={false} className={cn(hideTitle ? 'ml-auto' : '-mr-2')} />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
