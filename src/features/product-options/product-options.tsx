import { CircleAlert, Redo2, Undo2 } from 'lucide-react';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { Button, OptionChips, QuantityStepper, Switch } from '@/design-system';
import { OptionGroupField } from '@/features/product/option-group-field';
import type { Orientation } from '@/features/product-workflow/configuration';
import { applicableOptions, bindCatalogueOptions, type ProductWorkflow } from '@/features/product-workflow/registry';
import type { EntryOptionDefinition, OrderOptionDefinition, StudioOptionDefinition } from '@/features/product-workflow/types';
import { issuesFor, type ConfigurationIssue } from '@/features/product-workflow/validation';
import type { StudioStore } from '@/features/studio/store';
import type { Product } from '@/lib/catalogue/types';
import { StudioOptionField } from './studio-option-field';

/**
 * Product options from the product-family registry (Phase 4 M2), rendered for one product and
 * bound to its design's product configuration in the Studio store. Nothing here decides business
 * rules: options and values come from the registry and catalogue, validation from
 * `validateConfiguration`, and every change is one M1 product command (one undo step).
 */

export interface ProductOptionsProps {
  product: Product;
  workflow: ProductWorkflow;
  store: StudioStore;
  issues: readonly ConfigurationIssue[];
}

function IssueText({ issues }: { issues: readonly ConfigurationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <p className="flex items-start gap-1.5 text-caption font-medium text-danger" data-option-issue>
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{issues.map((i) => i.message).join(' ')}</span>
    </p>
  );
}

export function ProductOptions({ product, workflow, store, issues }: ProductOptionsProps) {
  const configuration = useStore(store, (s) => s.document.product.configuration);
  const actions = useStore(store, (s) => s.actions);
  const undoLabel = useStore(store, (s) => s.history.past.at(-1)?.label ?? null);
  const redoLabel = useStore(store, (s) => s.history.future.at(-1)?.label ?? null);

  const designable = product.isCustomizable;
  const bound = useMemo(() => bindCatalogueOptions(workflow, product), [workflow, product]);
  const orientation = designable ? workflow.options.find((o): o is EntryOptionDefinition => o.source === 'entry' && o.role === 'orientation') : undefined;
  const orderQuantity = workflow.options.find((o): o is OrderOptionDefinition => o.source === 'order');
  const studioOptions = useMemo(() => (designable ? applicableOptions(workflow, product).filter((o): o is StudioOptionDefinition => o.source === 'studio') : []), [designable, workflow, product]);
  const sameDesign = designable && workflow.sameDesignBothSides.available ? workflow.sameDesignBothSides : null;
  const orientationIssues = orientation ? issuesFor(issues, orientation.id) : [];

  return (
    <section aria-labelledby="product-options-heading" className="flex flex-col gap-6" data-product-options={workflow.family.id}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="product-options-heading" className="text-h4 font-semibold text-fg">
          Your choices
        </h2>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={!undoLabel} onClick={() => actions.undo()} aria-label={undoLabel ? `Undo: ${undoLabel}` : 'Undo'}>
            <Undo2 aria-hidden="true" /> Undo
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={!redoLabel} onClick={() => actions.redo()} aria-label={redoLabel ? `Redo: ${redoLabel}` : 'Redo'}>
            <Redo2 aria-hidden="true" /> Redo
          </Button>
        </div>
      </div>

      {orientation && (
        <div className="flex flex-col gap-1.5" data-option={orientation.id} data-option-source="entry">
          <OptionChips
            label={orientation.label}
            hint={orientation.behaviour.required ? 'Required before you design' : undefined}
            required={orientation.behaviour.required}
            value={configuration.orientation ?? undefined}
            onValueChange={(value) => actions.setOrientation(value as Orientation)}
            options={orientation.values.map((v) => ({ value: v.id, label: v.label }))}
          />
          <IssueText issues={orientationIssues} />
        </div>
      )}

      {bound.map(({ definition, group }) => (
        <div key={group.id} className="flex flex-col gap-1.5" data-option={definition.id} data-option-source="catalogue">
          <OptionGroupField product={product} group={group} selection={configuration.options} onChange={(groupId, valueId) => actions.setProductOption(groupId, valueId)} />
          <IssueText issues={issuesFor(issues, definition.id, group.id)} />
        </div>
      ))}

      {orderQuantity && (
        <div className="flex flex-col gap-1.5" data-option={orderQuantity.id} data-option-source="order">
          <QuantityStepper
            label={product.quantityStepper === 'sets' ? 'Number of sets' : 'Quantity'}
            value={configuration.quantity}
            onValueChange={(quantity) => actions.setOrderQuantity(quantity)}
            min={orderQuantity.min}
            max={orderQuantity.max}
          />
          <IssueText issues={issuesFor(issues, orderQuantity.id)} />
        </div>
      )}

      {(studioOptions.length > 0 || sameDesign) && (
        <div className="flex flex-col gap-5 border-t border-border pt-5" data-studio-options>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-body font-semibold text-fg">Product details</h3>
            <p className="text-caption text-fg-muted">Saved with your design. You can change these again in the Design Studio.</p>
          </div>
          {studioOptions.map((option) => (
            <div key={option.id} data-option={option.id} data-option-source="studio">
              <StudioOptionField option={option} choices={configuration.studio} onChoose={(key, choice) => actions.setStudioChoice(key, choice)} />
            </div>
          ))}
          {sameDesign && (
            <Switch
              label="Same design on both sides"
              description="The back repeats the front. Turn off to design each side separately."
              checked={configuration.sameDesignBothSides ?? sameDesign.defaultOn}
              onCheckedChange={(on) => actions.setSameDesignBothSides(on)}
            />
          )}
        </div>
      )}
    </section>
  );
}
