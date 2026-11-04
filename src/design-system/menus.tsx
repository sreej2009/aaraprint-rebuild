import { Check } from 'lucide-react';
import { DropdownMenu as DropdownPrimitive, Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const floatingClasses =
  'z-50 rounded-md border border-border bg-surface shadow-2 outline-none ' +
  'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out';

// ---------------------------------------------------------------- Popover

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({ className, align = 'start', sideOffset = 8, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(floatingClasses, 'w-72 p-4 text-body-sm text-fg', className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// ----------------------------------------------------------- Dropdown menu
// For actions (rename, duplicate, delete). Site navigation uses links, not menus.

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({ className, align = 'end', sideOffset = 6, ...props }: ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(floatingClasses, 'min-w-48 p-1', className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  icon,
  shortcut,
  tone = 'default',
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Item> & { icon?: ReactNode; shortcut?: string; tone?: 'default' | 'danger' }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-body-sm outline-none select-none [&_svg]:size-4 [&_svg]:shrink-0',
        tone === 'danger' ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-fg data-[highlighted]:bg-surface-subtle',
        'data-[disabled]:cursor-not-allowed data-[disabled]:text-fg-subtle',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-caption text-fg-muted">{shortcut}</span>}
    </DropdownPrimitive.Item>
  );
}

/** A menu item that toggles a setting, e.g. "Show guides". */
export function DropdownMenuCheckboxItem({
  shortcut,
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownPrimitive.CheckboxItem> & { shortcut?: string }) {
  return (
    <DropdownPrimitive.CheckboxItem
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-body-sm text-fg outline-none select-none data-[highlighted]:bg-surface-subtle',
        className,
      )}
      {...props}
    >
      <span className="grid size-4 place-items-center">
        <DropdownPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-4 text-accent-strong" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-caption text-fg-muted">{shortcut}</span>}
    </DropdownPrimitive.CheckboxItem>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <DropdownPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} />;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownPrimitive.Label>) {
  return <DropdownPrimitive.Label className={cn('px-2.5 py-1.5 text-caption font-semibold text-fg-muted', className)} {...props} />;
}
