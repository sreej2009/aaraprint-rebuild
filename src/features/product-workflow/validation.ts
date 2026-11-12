import type { Product } from '@/lib/catalogue/types';
import { resolveVariant } from '@/lib/pricing';
import { MAX_ORDER_QUANTITY, MIN_ORDER_QUANTITY, type ProductConfiguration } from './configuration';
import { bindCatalogueOptions, type ProductWorkflow } from './registry';

/**
 * Is a product configuration complete enough to design and order (Phase 4 M2)? One set of rules
 * for every screen — the product page now, the entry dialog and Review later — so components only
 * show the issues, never decide them.
 */

export type ConfigurationIssueKind =
  /** A required option has no valid value. */
  | 'required'
  /** Every option is chosen, but the catalogue has no variant for that combination. */
  | 'no-variant'
  /** The quantity is outside what can be ordered. */
  | 'quantity';

export interface ConfigurationIssue {
  kind: ConfigurationIssueKind;
  /** Registry option id (`orientation`, `colour`, `quantity-tier`, `order-quantity`, `variant`…). */
  optionId: string;
  /** The catalogue option group, for catalogue options. */
  groupId?: string;
  /** Short and actionable, shown next to the option. */
  message: string;
}

export function validateConfiguration(product: Pick<Product, 'optionGroups' | 'variants'>, workflow: Pick<ProductWorkflow, 'options'>, configuration: ProductConfiguration): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];

  const orientation = workflow.options.find((o) => o.source === 'entry' && o.role === 'orientation');
  if (orientation?.behaviour.required && configuration.orientation === null) {
    issues.push({ kind: 'required', optionId: orientation.id, message: 'Choose an orientation.' });
  }

  let complete = true;
  for (const { definition, group } of bindCatalogueOptions(workflow, product)) {
    const valueId = configuration.options[group.id];
    if (!definition.behaviour.required) continue;
    if (!valueId || !group.values.some((v) => v.id === valueId)) {
      complete = false;
      issues.push({ kind: 'required', optionId: definition.id, groupId: group.id, message: `Choose the ${group.name.toLowerCase()}.` });
    }
  }
  if (complete && product.optionGroups.length > 0 && !resolveVariant(product, configuration.options)) {
    issues.push({ kind: 'no-variant', optionId: 'variant', message: 'This combination isn’t available. Change one of the options above.' });
  }

  const { quantity } = configuration;
  if (!Number.isInteger(quantity) || quantity < MIN_ORDER_QUANTITY || quantity > MAX_ORDER_QUANTITY) {
    issues.push({ kind: 'quantity', optionId: 'order-quantity', message: `Choose a quantity from ${MIN_ORDER_QUANTITY} to ${MAX_ORDER_QUANTITY}.` });
  }
  return issues;
}

/** Issues for one option (and catalogue group), for showing next to it. */
export function issuesFor(issues: readonly ConfigurationIssue[], optionId: string, groupId?: string): ConfigurationIssue[] {
  return issues.filter((i) => i.optionId === optionId && (groupId === undefined || i.groupId === undefined || i.groupId === groupId));
}
