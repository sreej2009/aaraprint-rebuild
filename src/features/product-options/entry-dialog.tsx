import { CircleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Dialog, DialogClose, DialogContent, OptionChips, Price } from '@/design-system';
import { OptionGroupField } from '@/features/product/option-group-field';
import type { Orientation, ProductConfiguration } from '@/features/product-workflow/configuration';
import { applyEntryDraft, draftIssues, entryDraftFrom, entryRequirements, type EntryDraft } from '@/features/product-workflow/entry';
import { resolvePrice } from '@/features/product-workflow/pricing';
import type { ProductWorkflow } from '@/features/product-workflow/registry';
import { issuesFor } from '@/features/product-workflow/validation';
import type { Product } from '@/lib/catalogue/types';

/**
 * The "Design it" entry step (Phase 4 M3): the choices the original asks before the Studio
 * opens — Product Orientation, and the Quantity tier where the product has tiers — driven by the
 * registry (`entryRequirements`). Choices are a local draft: opening, changing and cancelling
 * leave the design untouched; confirming hands the draft to `onConfirm`, which applies it as one
 * product command.
 */

export interface EntryDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  product: Product;
  workflow: ProductWorkflow;
  /** The design's current configuration (the draft starts from its valid choices). */
  configuration: ProductConfiguration;
  confirmLabel: string;
  onConfirm(draft: EntryDraft): void;
  /** Where focus goes when the dialog closes (it is opened by a link, not a dialog trigger). */
  onCloseAutoFocus?: (event: Event) => void;
}

export function EntryDialog({ open, onOpenChange, ...props }: EntryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Remounted on every opening, so each opening starts from the design's current choices. */}
      {open && <EntryDialogBody {...props} />}
    </Dialog>
  );
}

function IssueText({ id, messages }: { id: string; messages: readonly string[] }) {
  if (messages.length === 0) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-caption font-medium text-danger" data-entry-issue>
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{messages.join(' ')}</span>
    </p>
  );
}

function EntryDialogBody({ product, workflow, configuration, confirmLabel, onConfirm, onCloseAutoFocus }: Omit<EntryDialogProps, 'open' | 'onOpenChange'>) {
  const requirements = useMemo(() => entryRequirements(workflow, product), [workflow, product]);
  const [draft, setDraft] = useState<EntryDraft>(() => entryDraftFrom(configuration, requirements));
  const preview = useMemo(() => applyEntryDraft(configuration, draft), [configuration, draft]);
  const issues = useMemo(() => draftIssues(product, workflow, configuration, draft), [product, workflow, configuration, draft]);
  const price = useMemo(() => resolvePrice(product, workflow, preview), [product, workflow, preview]);
  const noVariant = issues.filter((i) => i.kind === 'no-variant').map((i) => i.message);

  return (
    <DialogContent
      title={product.name}
      description="Please select all required options before you design."
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button disabled={issues.length > 0} aria-describedby={issues.length > 0 ? 'entry-blocked' : undefined} onClick={() => onConfirm(draft)} data-entry-confirm>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5" data-entry-dialog={workflow.family.id}>
        {requirements.map((requirement) => {
          if (requirement.kind === 'entry-choice') {
            const { option } = requirement;
            const messages = issuesFor(issues, option.id).map((i) => i.message);
            return (
              <div key={option.id} className="flex flex-col gap-1.5" data-entry-option={option.id}>
                <OptionChips
                  label={`${option.label}${option.behaviour.required ? ' (required)' : ''}`}
                  hint={messages.length ? messages.join(' ') : undefined}
                  required={option.behaviour.required}
                  value={option.role === 'orientation' ? (draft.orientation ?? undefined) : undefined}
                  onValueChange={(value) => {
                    if (option.role === 'orientation') setDraft((d) => ({ ...d, orientation: value as Orientation }));
                  }}
                  options={option.values.map((v) => ({ value: v.id, label: v.label }))}
                />
              </div>
            );
          }
          const { option, group } = requirement;
          const messages = issuesFor(issues, option.id, group.id).map((i) => i.message);
          return (
            <div key={group.id} className="flex flex-col gap-1.5" data-entry-option={option.id}>
              <OptionGroupField product={product} group={group} selection={preview.options} onChange={(groupId, valueId) => setDraft((d) => ({ ...d, options: { ...d.options, [groupId]: valueId } }))} />
              <IssueText id={`entry-${group.id}-issue`} messages={messages} />
            </div>
          );
        })}

        <div aria-live="polite" className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-subtle px-4 py-3" data-entry-price>
          {price.status === 'priced' ? (
            <>
              <span className="text-caption font-medium text-fg-muted">Your price</span>
              <Price amount={price.totalPriceCents} size="md" suffix="incl. printing" />
              <span className="text-caption text-fg-muted">SKU {price.sku}</span>
            </>
          ) : (
            <span className="text-body-sm text-fg">No price yet: this combination isn’t available.</span>
          )}
        </div>
        <IssueText id="entry-variant-issue" messages={noVariant} />
        {issues.length > 0 && (
          <p id="entry-blocked" className="sr-only">
            Can’t start yet. {issues.map((i) => i.message).join(' ')}
          </p>
        )}
      </div>
    </DialogContent>
  );
}
