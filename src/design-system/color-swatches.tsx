import { Check } from 'lucide-react';
import { relativeLuminance } from '@/lib/contrast';
import { formatPriceDelta } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ChoiceGroupFrame, ChoiceItem, type ChoiceGroupBaseProps, type ChoiceOption } from './choice-group';

export interface ColorOption extends ChoiceOption {
  /** #rrggbb */
  hex: string;
  /** Optional second colour for two-tone products, shown as a diagonal split. */
  secondHex?: string;
}

export type ColorSwatchesProps = ChoiceGroupBaseProps<ColorOption>;

/** Colour options. The selected colour's name is shown next to the group label. */
export function ColorSwatches(props: ColorSwatchesProps) {
  const selected = props.options.find((o) => o.value === props.value);
  return (
    <ChoiceGroupFrame {...props} labelDetail={props.labelDetail ?? selected?.label} listClassName="flex flex-wrap gap-1.5">
      {props.options.map((option) => {
        const delta = formatPriceDelta(option.priceDeltaCents ?? 0);
        const light = relativeLuminance(option.hex) > 0.6;
        const name = [option.label, delta, option.unavailableReason].filter(Boolean).join(', ');
        return (
          <ChoiceItem
              key={option.value}
              option={option}
              aria-label={name}
              title={name}
              className="grid size-11 place-items-center rounded-full outline-offset-0 data-[state=checked]:shadow-[inset_0_0_0_2px_var(--color-accent)]"
            >
              <span
                className={cn(
                  'relative grid size-8 place-items-center overflow-hidden rounded-full border',
                  light ? 'border-border-strong' : 'border-transparent',
                )}
                style={{
                  background: option.secondHex ? `linear-gradient(135deg, ${option.hex} 50%, ${option.secondHex} 50%)` : option.hex,
                }}
              >
                <Check
                  aria-hidden="true"
                  strokeWidth={3}
                  className={cn('size-4 opacity-0 group-data-[state=checked]:opacity-100', light ? 'text-fg' : 'text-white')}
                />
                {option.unavailableReason && (
                  <span aria-hidden="true" className="absolute h-0.5 w-11 rotate-45 bg-fg/70" />
                )}
              </span>
            </ChoiceItem>
        );
      })}
    </ChoiceGroupFrame>
  );
}
