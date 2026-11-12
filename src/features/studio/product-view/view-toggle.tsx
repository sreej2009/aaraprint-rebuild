import { SegmentedControl } from '@/design-system';

export type ProductViewMode = 'flat' | 'product';

const OWN_KEYS = new Set(['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

const options = (flatLabel = 'Flat') => [
  { value: 'flat', label: flatLabel },
  { value: 'product', label: 'On the product' },
];

/**
 * "Flat / On the product" (Phase 4): the Preview's view and the editing workspace's view. Shown only
 * when a side can be shown on the product. A radio group: the selected option is announced, arrow
 * keys move between the two, and touch screens get 44 px targets.
 */
export function ProductViewToggle({ label, value, onChange, testId, flatLabel }: { label: string; value: ProductViewMode; onChange(view: ProductViewMode): void; testId?: string; flatLabel?: string | undefined }) {
  return (
    // Delete, Backspace, arrows, Home and End pressed here belong to the choice: they never reach
    // the editor's selection behind it. Escape and Ctrl/⌘ shortcuts pass as usual.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only keeps a few plain keys inside the radio group
    <div
      data-testid={testId}
      className="shrink-0"
      onKeyDown={(event) => {
        if (!event.ctrlKey && !event.metaKey && !event.altKey && OWN_KEYS.has(event.key)) event.stopPropagation();
      }}
    >
      <SegmentedControl label={label} size="sm" options={options(flatLabel)} value={value} onValueChange={(next) => onChange(next === 'product' ? 'product' : 'flat')} className="pointer-coarse:*:h-11" />
    </div>
  );
}
