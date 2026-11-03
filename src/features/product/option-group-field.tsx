import { ColorSwatches, Field, OptionChips, QuantityTiers, Select } from '@/design-system';
import { swatchFor } from '@/lib/catalogue/colours';
import type { OptionGroup, Product } from '@/lib/catalogue/types';
import { formatPriceDelta } from '@/lib/format';
import { quantityTiers, type Selection } from '@/lib/pricing';
import { displayFor, unavailableReason, unitLabel } from './selection';

export interface OptionGroupFieldProps {
  product: Pick<Product, 'optionGroups' | 'variants'>;
  group: OptionGroup;
  selection: Selection;
  onChange: (groupId: string, valueId: string) => void;
}

/** One option group, rendered as tiers, swatches, chips or a dropdown depending on its values. */
export function OptionGroupField({ product, group, selection, onChange }: OptionGroupFieldProps) {
  const display = displayFor(product, group);
  const value = selection[group.id];
  const change = (valueId: string) => onChange(group.id, valueId);
  const reason = (valueId: string) => unavailableReason(product, selection, group.id, valueId);

  if (display === 'tiers') {
    const tiers = quantityTiers(product, selection);
    return (
      <QuantityTiers
        label={group.name}
        unitLabel={unitLabel(product)}
        value={value}
        onValueChange={change}
        options={tiers.map((tier) => ({
          value: tier.valueId,
          label: tier.label,
          quantity: tier.quantity,
          totalCents: tier.totalCents,
          unitCents: tier.unitCents,
          savingsPercent: tier.savingsPercent,
          unavailableReason: tier.available ? undefined : reason(tier.valueId) ?? 'Unavailable',
        }))}
      />
    );
  }

  if (display === 'swatches') {
    return (
      <ColorSwatches
        label={group.name}
        value={value}
        onValueChange={change}
        options={group.values.map((v) => {
          const swatch = swatchFor(v.label)!;
          return { value: v.id, label: v.label, hex: swatch.hex, secondHex: swatch.secondHex, priceDeltaCents: v.priceDeltaCents, unavailableReason: reason(v.id) };
        })}
      />
    );
  }

  if (display === 'select') {
    return (
      <Field label={group.name}>
        <Select
          value={value}
          onValueChange={change}
          options={group.values.map((v) => ({ value: v.id, label: v.label, detail: formatPriceDelta(v.priceDeltaCents) || undefined, disabled: Boolean(reason(v.id)) }))}
        />
      </Field>
    );
  }

  return (
    <OptionChips
      label={group.name}
      value={value}
      onValueChange={change}
      options={group.values.map((v) => ({ value: v.id, label: v.label, priceDeltaCents: v.priceDeltaCents, unavailableReason: reason(v.id) }))}
    />
  );
}
