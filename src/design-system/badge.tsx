import { CircleCheck, CircleX, Clock, PackageCheck, Printer, Truck, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-fg',
  accent: 'bg-accent-soft text-accent-strong',
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap [&_svg]:size-3.5',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export type OrderStatus = 'awaiting_payment' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

const statuses: Record<OrderStatus, { label: string; tone: BadgeTone; Icon: LucideIcon }> = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'warning', Icon: Clock },
  confirmed: { label: 'Confirmed', tone: 'accent', Icon: CircleCheck },
  processing: { label: 'Printing', tone: 'accent', Icon: Printer },
  shipped: { label: 'Shipped', tone: 'accent', Icon: Truck },
  delivered: { label: 'Delivered', tone: 'success', Icon: PackageCheck },
  cancelled: { label: 'Cancelled', tone: 'neutral', Icon: CircleX },
};

/** Order status with icon + text, never colour alone (blueprint §3). */
export function StatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  const { label, tone, Icon } = statuses[status];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden="true" />} className={className}>
      {label}
    </Badge>
  );
}
