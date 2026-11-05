import { Toggle as TogglePrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { buttonClasses, type ButtonSize } from './button-classes';
import { Tooltip } from './tooltip';

const iconSizes: Record<ButtonSize, string> = { sm: 'size-9 px-0', md: 'size-11 px-0', lg: 'size-13 px-0' };

export interface IconToggleProps {
  /** Accessible name; stays the same whether pressed or not ("Keep proportions"). */
  label: string;
  icon: ReactNode;
  /** Icon while pressed, when it should change (lock ↔ unlock). */
  pressedIcon?: ReactNode;
  pressed: boolean;
  onPressedChange(pressed: boolean): void;
  size?: ButtonSize;
  disabled?: boolean;
  /** Tooltip text; defaults to the label. False hides the tooltip. */
  tooltip?: string | false;
  shortcut?: string;
  className?: string;
}

/**
 * An icon button that stays pressed (aria-pressed): proportion lock, show/hide, lock/unlock.
 * Pressed shows the accent tint, so the state never relies on the icon alone.
 */
export function IconToggle({ label, icon, pressedIcon, pressed, onPressedChange, size = 'sm', disabled, tooltip, shortcut, className }: IconToggleProps) {
  const toggle = (
    <TogglePrimitive.Root
      aria-label={label}
      pressed={pressed}
      onPressedChange={onPressedChange}
      disabled={disabled}
      className={cn(
        buttonClasses({ variant: 'ghost', size }),
        iconSizes[size],
        'data-[state=on]:bg-accent-soft data-[state=on]:text-accent-strong data-[state=on]:hover:bg-accent-soft-hover',
        className,
      )}
    >
      {pressed && pressedIcon ? pressedIcon : icon}
    </TogglePrimitive.Root>
  );
  if (tooltip === false) return toggle;
  return (
    <Tooltip content={tooltip ?? label} shortcut={shortcut}>
      {toggle}
    </Tooltip>
  );
}
