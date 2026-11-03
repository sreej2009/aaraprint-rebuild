import { formatINR } from '@/lib/format';
import { ChoiceGroupFrame, ChoiceItem, type ChoiceGroupBaseProps, type ChoiceOption } from './choice-group';

export interface QuantityTierOption extends ChoiceOption {
  quantity: number;
  /** Price for the whole tier, in paise. */
  totalCents: number;
  /** Price per unit, in paise (may be fractional, e.g. 152 = ₹1.52). */
  unitCents: number;
  /** Saving per unit compared with the smallest tier. */
  savingsPercent?: number;
  /** Short highlight such as "Most popular". */
  badge?: string;
}

export interface QuantityTiersProps extends ChoiceGroupBaseProps<QuantityTierOption> {
  /** Singular unit for the per-unit price, e.g. "card". */
  unitLabel: string;
}

/**
 * Quantity choices with total, per-unit price and saving on each tier.
 * Replaces the original's separate "quantity price breaks" table (blueprint §7).
 */
export function QuantityTiers({ unitLabel, ...props }: QuantityTiersProps) {
  return (
    <ChoiceGroupFrame {...props} listClassName="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {props.options.map((option) => (
        <ChoiceItem
          key={option.value}
          option={option}
          className="flex h-full flex-col items-start gap-1 rounded-md border border-border-strong bg-surface px-3 pt-3 pb-2.5 text-left transition-colors duration-150 hover:border-border-hover data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft data-[state=checked]:shadow-[inset_0_0_0_1px_var(--color-accent)] data-[unavailable]:border-dashed data-[unavailable]:bg-surface-subtle"
        >
          {option.badge && (
            <span className="absolute -top-2.5 left-3 rounded-full bg-accent px-2 py-px text-caption font-semibold text-fg-on-accent">
              {option.badge}
            </span>
          )}
          <span className="text-body-sm font-semibold text-fg group-data-[unavailable]:text-fg-muted">{option.label}</span>
          <span className="text-body font-semibold text-fg tabular-nums">{formatINR(option.totalCents)}</span>
          <span className="text-caption text-fg-muted tabular-nums">
            {formatINR(Math.round(option.unitCents))} / {unitLabel}
          </span>
          <span className="mt-1 min-h-5 text-caption font-semibold text-success-strong">
            {option.unavailableReason ?? (option.savingsPercent ? `Save ${option.savingsPercent}%` : '')}
          </span>
        </ChoiceItem>
      ))}
    </ChoiceGroupFrame>
  );
}
