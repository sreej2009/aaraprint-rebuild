import { Check } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import { cn } from '@/lib/cn';
import type { StudioProductColour } from '../profile/types';

/**
 * "Product colour" (Phase 4 M3): round swatches for the product's own colours, shared by the
 * canvas footer and the Preview. A radio group: each swatch is named ("Navy"), the chosen one has
 * a tick as well as a ring (never colour alone), arrow keys move and select, touch targets are
 * 44 px. Only the product photo changes; the design, variant and price don't.
 */
export function ProductColourPicker({ colours, value, onChange, testId }: { colours: readonly StudioProductColour[]; value: string; onChange(id: string): void; testId?: string }) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onChange}
      orientation="horizontal"
      loop
      aria-label="Product colour"
      data-testid={testId}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || !OWN_KEYS.has(event.key)) return;
        // Delete, Backspace and arrows here belong to the swatches, never to the selection behind.
        event.stopPropagation();
        // Arrow keys choose the colour they move to, as radio groups do.
        const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
        if (!delta) return;
        const index = colours.findIndex((c) => c.id === value);
        onChange(colours[(index + delta + colours.length) % colours.length]!.id);
      }}
      className="flex shrink-0 items-center gap-0.5"
    >
      {colours.map((colour) => (
        <RadioGroup.Item
          key={colour.id}
          value={colour.id}
          aria-label={colour.label}
          title={colour.label}
          data-colour={colour.label}
          className="group grid size-9 place-items-center rounded-full outline-offset-1 pointer-coarse:size-11"
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid size-6 place-items-center rounded-full border border-border-strong shadow-1 transition-shadow',
              'group-data-[state=checked]:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-accent)]',
            )}
            style={{ backgroundColor: colour.hex }}
          >
            <Check className={cn('hidden size-3.5 group-data-[state=checked]:block', isLight(colour.hex) ? 'text-fg' : 'text-white')} strokeWidth={3} />
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

const OWN_KEYS = new Set(['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

function isLight(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 150;
}
