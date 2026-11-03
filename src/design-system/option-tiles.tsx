import { Check } from 'lucide-react';
import { formatPriceDelta } from '@/lib/format';
import { ChoiceGroupFrame, ChoiceItem, type ChoiceGroupBaseProps, type ChoiceOption } from './choice-group';

export interface TileOption extends ChoiceOption {
  description?: string;
  /** Image URL (already resolved, e.g. via mediaUrl). */
  imageSrc?: string;
}

export type OptionTilesProps = ChoiceGroupBaseProps<TileOption>;

/** Visual options that need a picture or a short explanation (lid type, paper stock, fold). */
export function OptionTiles(props: OptionTilesProps) {
  return (
    <ChoiceGroupFrame {...props} listClassName="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {props.options.map((option) => {
        const delta = formatPriceDelta(option.priceDeltaCents ?? 0);
        return (
          <ChoiceItem
            key={option.value}
            option={option}
            className="flex h-full flex-col items-stretch gap-2 rounded-md border border-border-strong bg-surface p-2.5 text-left transition-colors duration-150 hover:border-border-hover data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft data-[state=checked]:shadow-[inset_0_0_0_1px_var(--color-accent)] data-[unavailable]:border-dashed data-[unavailable]:bg-surface-subtle"
          >
            <span
              aria-hidden="true"
              className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-accent text-fg-on-accent opacity-0 transition-opacity group-data-[state=checked]:opacity-100"
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            {option.imageSrc && (
              <img
                src={option.imageSrc}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full rounded-sm bg-surface-subtle object-contain mix-blend-multiply group-data-[unavailable]:opacity-50"
              />
            )}
            <span className="flex flex-col gap-0.5 px-0.5">
              <span className="text-body-sm font-semibold text-fg group-data-[unavailable]:text-fg-muted group-data-[unavailable]:line-through">
                {option.label}
              </span>
              {option.description && <span className="text-caption text-fg-muted">{option.description}</span>}
              {(delta || option.unavailableReason) && (
                <span className="text-caption font-medium text-fg-muted tabular-nums">{option.unavailableReason ?? delta}</span>
              )}
            </span>
          </ChoiceItem>
        );
      })}
    </ChoiceGroupFrame>
  );
}
