import { X } from 'lucide-react';
import { AlertDialog as AlertDialogPrimitive, Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-[35rem]', lg: 'sm:max-w-3xl' } as const;

/** Overlay that centres on larger screens and docks to the bottom on phones (blueprint §13.4). */
const overlayClasses =
  'fixed inset-0 z-50 grid items-end overflow-y-auto bg-scrim sm:place-items-center sm:p-6 ' +
  'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out';

const panelClasses =
  'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg bg-surface shadow-3 outline-none ' +
  'data-[state=open]:animate-sheet-in-bottom data-[state=closed]:animate-sheet-out-bottom ' +
  'sm:max-h-[min(88dvh,52rem)] sm:rounded-lg sm:data-[state=open]:animate-dialog-in sm:data-[state=closed]:animate-dialog-out';

export interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons pinned to the bottom of the dialog. */
  footer?: ReactNode;
  size?: keyof typeof widths;
  className?: string;
  /** Where focus goes when the dialog closes; call `preventDefault()` to place it yourself. */
  onCloseAutoFocus?: (event: Event) => void;
  children?: ReactNode;
}

export function DialogContent({ title, description, footer, size = 'md', className, onCloseAutoFocus, children }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses}>
        <DialogPrimitive.Content
          data-modal-dialog=""
          className={cn(panelClasses, widths[size], className)}
          onCloseAutoFocus={onCloseAutoFocus}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex items-start gap-4 px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DialogPrimitive.Title className="font-display text-h3 font-semibold text-fg">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-body-sm text-fg-muted">{description}</DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close" icon={<X />} size="sm" tooltip={false} className="-mt-1 -mr-2" />
            </DialogPrimitive.Close>
          </div>
          {children && <div className="flex-1 overflow-y-auto px-5 pb-5 text-body text-fg sm:px-6">{children}</div>}
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  );
}

export interface ConfirmDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the dialog, when uncontrolled. */
  trigger?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
}

/** Confirmation before destructive or irreversible actions (blueprint §11.12). Focus starts on Cancel. */
export function ConfirmDialog({ open, onOpenChange, trigger, title, description, confirmLabel, cancelLabel = 'Cancel', tone = 'default', onConfirm }: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger>}
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={overlayClasses}>
          <AlertDialogPrimitive.Content data-modal-dialog="" className={cn(panelClasses, widths.sm)}>
            <div className="flex flex-col gap-2 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
              <AlertDialogPrimitive.Title className="font-display text-h3 font-semibold text-fg">{title}</AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="text-body-sm text-fg-muted">{description}</AlertDialogPrimitive.Description>
            </div>
            <div className="flex flex-col-reverse gap-2 px-5 pb-5 sm:flex-row sm:justify-end sm:px-6 sm:pb-6">
              <AlertDialogPrimitive.Cancel asChild>
                <Button variant="secondary">{cancelLabel}</Button>
              </AlertDialogPrimitive.Cancel>
              <AlertDialogPrimitive.Action asChild>
                <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
                  {confirmLabel}
                </Button>
              </AlertDialogPrimitive.Action>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Overlay>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
