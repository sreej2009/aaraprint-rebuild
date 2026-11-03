import { cn } from '@/lib/cn';

const sizes = { sm: 'size-4', md: 'size-5', lg: 'size-8' } as const;

export interface SpinnerProps {
  size?: keyof typeof sizes;
  /** When set, the spinner is announced as a status with this text. Otherwise it is decorative. */
  label?: string;
  className?: string;
}

export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  const svg = (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn('animate-spin', sizes[size], className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  if (!label) return svg;
  return (
    <output className="inline-flex items-center">
      {svg}
      <span className="sr-only">{label}</span>
    </output>
  );
}
