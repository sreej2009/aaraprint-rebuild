import { cn } from '@/lib/cn';
import { formatINR, savingsPercent } from '@/lib/format';
import { Badge } from './badge';

const sizes = { sm: 'text-body-sm', md: 'text-body', lg: 'text-h2' } as const;

export interface PriceProps {
  /** Amount in paise. */
  amount: number;
  /** Previous price in paise; shown struck through with the saving. */
  compareAt?: number | null;
  /** Text after the price, e.g. "incl. print" or "/ card". */
  suffix?: string;
  /** Prefix such as "from". */
  prefix?: string;
  size?: keyof typeof sizes;
  className?: string;
}

export function Price({ amount, compareAt, suffix, prefix, size = 'md', className }: PriceProps) {
  const saving = compareAt ? savingsPercent(compareAt, amount) : 0;
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2 gap-y-1', className)}>
      {prefix && <span className="text-body-sm text-fg-muted">{prefix}</span>}
      <span className={cn('font-semibold text-fg tabular-nums', sizes[size])}>{formatINR(amount)}</span>
      {saving > 0 && compareAt && (
        <>
          <s className="text-body-sm text-fg-muted tabular-nums">
            <span className="sr-only">Was </span>
            {formatINR(compareAt)}
          </s>
          <Badge tone="success">Save {saving}%</Badge>
        </>
      )}
      {suffix && <span className="text-body-sm text-fg-muted">{suffix}</span>}
    </span>
  );
}
