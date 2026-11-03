import { formatPriceDelta } from '@/lib/format';
import { ChoiceGroupFrame, ChoiceItem, type ChoiceGroupBaseProps, type ChoiceOption } from './choice-group';

export type OptionChipsProps = ChoiceGroupBaseProps<ChoiceOption>;

/** Text options such as finish, ink style or size, with their price difference. */
export function OptionChips(props: OptionChipsProps) {
  return (
    <ChoiceGroupFrame {...props} listClassName="flex flex-wrap gap-2">
      {props.options.map((option) => {
        const delta = formatPriceDelta(option.priceDeltaCents ?? 0);
        return (
          <ChoiceItem
            key={option.value}
            option={option}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-4 py-2 text-left text-body-sm text-fg transition-colors duration-150 hover:border-border-hover data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft data-[state=checked]:shadow-[inset_0_0_0_1px_var(--color-accent)] data-[unavailable]:border-dashed data-[unavailable]:bg-surface-subtle data-[unavailable]:text-fg-muted data-[unavailable]:hover:border-border-strong"
          >
            <span className="font-medium group-data-[unavailable]:line-through">{option.label}</span>{' '}
            {delta && <span className="text-fg-muted tabular-nums group-data-[state=checked]:text-accent-strong">{delta}</span>}
            {option.unavailableReason && <span className="text-caption">{' '}· {option.unavailableReason}</span>}
          </ChoiceItem>
        );
      })}
    </ChoiceGroupFrame>
  );
}
