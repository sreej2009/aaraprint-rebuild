import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------- Callout

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

const calloutTones: Record<CalloutTone, { Icon: LucideIcon; box: string; icon: string }> = {
  info: { Icon: Info, box: 'border-accent/25 bg-accent-soft', icon: 'text-accent-strong' },
  success: { Icon: CircleCheck, box: 'border-success/30 bg-success-soft', icon: 'text-success-strong' },
  warning: { Icon: TriangleAlert, box: 'border-warning/35 bg-warning-soft', icon: 'text-warning-strong' },
  danger: { Icon: CircleAlert, box: 'border-danger/25 bg-danger-soft', icon: 'text-danger' },
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Optional actions shown under the message. */
  actions?: ReactNode;
  /** Pass "alert" or "status" when the callout appears in response to something the user did. */
  role?: 'alert' | 'status';
  className?: string;
}

/** Inline message that stays on the page (print checks, form summaries, notices). */
export function Callout({ tone = 'info', title, children, actions, role, className }: CalloutProps) {
  const { Icon, box, icon } = calloutTones[tone];
  return (
    <div role={role} className={cn('flex gap-3 rounded-md border p-4', box, className)}>
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', icon)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-body-sm text-fg">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg [&_a]:font-medium [&_a]:underline">{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- Empty state

export interface EmptyStateProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  className?: string;
}

/** One icon, one sentence, one action (blueprint §3). */
export function EmptyState({ icon: Icon, title, description, action, headingLevel = 2, className }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-strong">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <Heading className="text-h3 font-semibold text-fg">{title}</Heading>
      {description && <p className="max-w-sm text-body-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Skeleton

/** Placeholder block matching the final layout while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-sm bg-surface-sunken', className)} />;
}

// ---------------------------------------------------------------- Progress

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Accessible name. Visible text describing progress should sit next to the bar. */
  label: string;
  tone?: 'accent' | 'success';
  className?: string;
}

export function ProgressBar({ value, max = 100, label, tone = 'accent', className }: ProgressBarProps) {
  const clamped = Math.min(max, Math.max(0, value));
  return (
    <ProgressPrimitive.Root value={clamped} max={max} aria-label={label} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-surface-sunken', className)}>
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-full transition-[width] duration-300 ease-standard', tone === 'success' ? 'bg-success' : 'bg-accent')}
        style={{ width: `${(clamped / max) * 100}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
