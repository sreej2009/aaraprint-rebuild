import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';
import { useToastStore, type ToastTone } from './toast-store';

const icons: Record<ToastTone, { Icon: LucideIcon; className: string }> = {
  info: { Icon: Info, className: 'text-accent' },
  success: { Icon: CircleCheck, className: 'text-success' },
  warning: { Icon: TriangleAlert, className: 'text-warning' },
  danger: { Icon: CircleAlert, className: 'text-danger' },
};

/** Mount once near the root. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const close = useToastStore((state) => state.close);
  const remove = useToastStore((state) => state.remove);

  return (
    <ToastPrimitive.Provider swipeDirection="right" label="Notification">
      {toasts.map(({ id, open, title, description, tone = 'info', action, duration }) => {
        const { Icon, className } = icons[tone];
        return (
          <ToastPrimitive.Root
            key={id}
            open={open}
            onOpenChange={(next) => {
              if (!next) {
                close(id);
                window.setTimeout(() => remove(id), 200);
              }
            }}
            duration={duration ?? (action ? 8000 : 5000)}
            type={tone === 'danger' || tone === 'warning' ? 'foreground' : 'background'}
            className={cn(
              'pointer-events-auto flex w-full items-start gap-3 rounded-md border border-border bg-surface p-4 shadow-3',
              'data-[state=open]:animate-toast-in data-[state=closed]:animate-toast-out',
              'data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:animate-toast-out',
            )}
          >
            <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', className)} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <ToastPrimitive.Title className="text-body-sm font-semibold text-fg">{title}</ToastPrimitive.Title>
              {description && <ToastPrimitive.Description className="text-body-sm text-fg-muted">{description}</ToastPrimitive.Description>}
            </div>
            {action && (
              <ToastPrimitive.Action
                altText={action.label}
                onClick={action.onClick}
                className="-my-1 h-9 shrink-0 rounded-sm px-3 text-body-sm font-semibold text-accent-strong hover:bg-accent-soft"
              >
                {action.label}
              </ToastPrimitive.Action>
            )}
            <ToastPrimitive.Close aria-label="Dismiss notification" className="-my-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-sm text-fg-muted hover:bg-surface-subtle hover:text-fg">
              <X aria-hidden="true" className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="pointer-events-none fixed right-0 bottom-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none sm:p-6" />
    </ToastPrimitive.Provider>
  );
}
