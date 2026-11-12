import type { OptionGroup, Product } from '@/lib/catalogue/types';
import { quantityGroup } from '@/lib/pricing';
import type { Orientation, ProductConfiguration } from './configuration';
import type { ProductWorkflow } from './registry';
import type { CatalogueOptionDefinition, EntryOptionDefinition } from './types';
import { validateConfiguration, type ConfigurationIssue } from './validation';

/**
 * The "Design it" entry step (Phase 4 M3): the choices asked before the Studio opens.
 *
 * Audit §3.2 (live, 532/532 products): the original asks "Product Orientation*" for every
 * customisable product, plus a Quantity select when the catalogue has a "Quantity" group with two
 * or more tiers (532/532 agree). Nothing else is asked at entry. We ask only when one of these
 * choices is missing or invalid (the original asked every time and reset to Horizontal).
 */

export type EntryRequirement =
  | { kind: 'entry-choice'; option: EntryOptionDefinition }
  | { kind: 'catalogue'; option: CatalogueOptionDefinition; group: OptionGroup };

/** What the entry step asks for this product (empty for products ordered without a design). */
export function entryRequirements(workflow: Pick<ProductWorkflow, 'options' | 'customizable'>, product: Pick<Product, 'optionGroups'>): EntryRequirement[] {
  if (!workflow.customizable) return [];
  const requirements: EntryRequirement[] = [];
  for (const option of workflow.options) {
    if (option.source === 'entry') requirements.push({ kind: 'entry-choice', option });
  }
  const tiers = entryQuantityGroup(product);
  const tierOption = workflow.options.find((o): o is CatalogueOptionDefinition => o.source === 'catalogue' && o.role === 'quantity-tier');
  if (tiers && tierOption) requirements.push({ kind: 'catalogue', option: tierOption, group: tiers });
  return requirements;
}

/**
 * The original's rule (audit §4, 532/532): a "Quantity" group with two or more numeric values.
 * All its values are offered — some tiers ("Single Piece") have no unit count in the catalogue,
 * so this is looser than `quantityGroup`, which needs every tier counted.
 */
function entryQuantityGroup(product: Pick<Product, 'optionGroups'>): OptionGroup | undefined {
  const group = quantityGroup(product) ?? product.optionGroups.find((g) => g.name === 'Quantity');
  if (!group) return undefined;
  const numeric = group.values.filter((v) => (v.quantity ?? 0) > 0 || /\d/.test(v.label)).length;
  return numeric >= 2 ? group : undefined;
}

/** Pending entry choices, kept apart from the design until confirmed. */
export interface EntryDraft {
  orientation: Orientation | null;
  /** Catalogue entry choices: option-group id → value id. */
  options: Record<string, string>;
}

/** The draft the entry step starts from: the design's current, still-valid choices. */
export function entryDraftFrom(configuration: ProductConfiguration, requirements: readonly EntryRequirement[]): EntryDraft {
  const options: Record<string, string> = {};
  for (const requirement of requirements) {
    if (requirement.kind !== 'catalogue') continue;
    const valueId = configuration.options[requirement.group.id];
    if (valueId && requirement.group.values.some((v) => v.id === valueId)) options[requirement.group.id] = valueId;
  }
  return { orientation: configuration.orientation, options };
}

/** The configuration as it would be with the draft applied (for previews and validation). */
export function applyEntryDraft(configuration: ProductConfiguration, draft: EntryDraft): ProductConfiguration {
  return { ...configuration, orientation: draft.orientation, options: { ...configuration.options, ...draft.options } };
}

const isEntryIssue = (issue: ConfigurationIssue, requirements: readonly EntryRequirement[]) =>
  requirements.some((r) => r.option.id === issue.optionId && (r.kind === 'entry-choice' || issue.groupId === undefined || issue.groupId === r.group.id));

/** Problems the entry step can fix: a missing or invalid entry choice. */
export function entryIssues(product: Pick<Product, 'optionGroups' | 'variants'>, workflow: Pick<ProductWorkflow, 'options' | 'customizable'>, configuration: ProductConfiguration): ConfigurationIssue[] {
  const requirements = entryRequirements(workflow, product);
  return validateConfiguration(product, workflow, configuration).filter((issue) => isEntryIssue(issue, requirements));
}

/** Problems the entry step can't fix (other options, no variant, quantity): fixed on the product page. */
export function nonEntryIssues(product: Pick<Product, 'optionGroups' | 'variants'>, workflow: Pick<ProductWorkflow, 'options' | 'customizable'>, configuration: ProductConfiguration): ConfigurationIssue[] {
  const requirements = entryRequirements(workflow, product);
  return validateConfiguration(product, workflow, configuration).filter((issue) => !isEntryIssue(issue, requirements));
}

/** Must the entry step be shown before the Studio opens? */
export function needsEntry(product: Pick<Product, 'optionGroups' | 'variants'>, workflow: Pick<ProductWorkflow, 'options' | 'customizable'>, configuration: ProductConfiguration): boolean {
  return entryIssues(product, workflow, configuration).length > 0;
}

/** Everything that stops the draft being confirmed (its own issues, and a missing variant). */
export function draftIssues(product: Pick<Product, 'optionGroups' | 'variants'>, workflow: Pick<ProductWorkflow, 'options' | 'customizable'>, configuration: ProductConfiguration, draft: EntryDraft): ConfigurationIssue[] {
  const requirements = entryRequirements(workflow, product);
  return validateConfiguration(product, workflow, applyEntryDraft(configuration, draft)).filter((issue) => isEntryIssue(issue, requirements) || issue.kind === 'no-variant');
}
