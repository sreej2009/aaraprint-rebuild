import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border font-medium select-none ' +
  'transition-colors duration-150 ease-standard [&_svg]:size-[1.125em] [&_svg]:shrink-0 ' +
  'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-sunken disabled:text-fg-subtle disabled:shadow-none ' +
  'aria-disabled:cursor-not-allowed';

const variants: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-accent text-fg-on-accent shadow-1 hover:bg-accent-hover active:bg-accent-active',
  secondary: 'border-border-strong bg-surface text-fg hover:border-border-hover hover:bg-surface-subtle active:bg-surface-sunken',
  soft: 'border-transparent bg-accent-soft text-accent-strong hover:bg-accent-soft-hover',
  ghost: 'border-transparent bg-transparent text-fg hover:bg-surface-subtle active:bg-surface-sunken disabled:bg-transparent',
  danger: 'border-transparent bg-danger text-white shadow-1 hover:bg-danger-hover',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3 text-body-sm',
  md: 'h-11 gap-2 px-4 text-body-sm',
  lg: 'h-13 gap-2 px-6 text-body',
};

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className);
}
