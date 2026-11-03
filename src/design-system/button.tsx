import { Slot } from 'radix-ui';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-classes';
import { Spinner } from './spinner';
import { Tooltip } from './tooltip';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner, keeps the button's width and blocks clicks. */
  loading?: boolean;
  /** Render the single child (e.g. a router <Link>) with button styling. */
  asChild?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  asChild = false,
  className,
  children,
  type,
  onClick,
  ...props
}: ButtonProps) {
  const classes = buttonClasses({ variant, size, fullWidth, className });
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={cn(classes, loading && 'relative')}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      {loading ? (
        <>
          {/* Kept in the accessibility tree (opacity, not visibility) so the name stays readable. */}
          <span className="inline-flex items-center gap-[inherit] opacity-0">{children}</span>
          <span className="absolute inset-0 grid place-items-center">
            <Spinner size="sm" />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

const iconSizes: Record<ButtonSize, string> = { sm: 'size-9 px-0', md: 'size-11 px-0', lg: 'size-13 px-0' };

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'asChild' | 'fullWidth'> {
  /** Accessible name, also shown as the tooltip. */
  label: string;
  icon: ReactNode;
  /** Show the label in a tooltip on hover/focus (default true). */
  tooltip?: boolean;
  /** Keyboard shortcut shown in the tooltip, e.g. "Ctrl Z". */
  shortcut?: string;
}

export function IconButton({ label, icon, tooltip = true, shortcut, variant = 'ghost', size = 'md', className, ...props }: IconButtonProps) {
  const button = (
    <Button variant={variant} size={size} aria-label={label} className={cn(iconSizes[size], className)} {...props}>
      {icon}
    </Button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} shortcut={shortcut}>
      {button}
    </Tooltip>
  );
}
