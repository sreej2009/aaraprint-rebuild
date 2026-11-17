import type { ProductWorkflow } from '@/features/product-workflow/registry';
import { resolvePrice } from '@/features/product-workflow/pricing';
import { nonEntryIssues } from '@/features/product-workflow/entry';
import type { Product } from '@/lib/catalogue/types';
import type { PrintIssue, PrintReport } from '../preflight/print-checks';
import { validateDesign } from '../schema/validate';
import type { DesignDocument } from '../schema/types';

export { approvalStatus, type ApprovalStatus } from './approval-status';

/**
 * Approving a design (Phase 4 M5): "Approve and continue" in Review. What can stop it, and whether
 * an approval still matches the design. The approval itself is kept by the save controller (an
 * `approved` version plus the approval on the design record); nothing here stores anything.
 */

export interface ApprovalBlocker {
  kind: 'empty' | 'missing-file' | 'configuration' | 'no-variant' | 'invalid';
  message: string;
}

/**
 * Why this design can't be approved yet, in customer words; empty when it can. Print warnings
 * (low resolution, near the edge) don't block: the original showed them in Review and let the
 * customer approve. An empty design, a missing image or graphic, unfinished product choices or a
 * combination we can't make do block.
 */
export function approvalBlockers({ product, workflow, document, report }: { product: Product; workflow: ProductWorkflow | null; document: DesignDocument; report: PrintReport }): ApprovalBlocker[] {
  const blockers: ApprovalBlocker[] = [];
  if (validateDesign(document).length > 0) blockers.push({ kind: 'invalid', message: 'This design couldn’t be checked. Undo your last change or start a new design.' });
  if (report.empty) blockers.push({ kind: 'empty', message: 'Your design is empty. Add your text, images or a background before approving it.' });
  const missing = report.sides.flatMap((s) => s.issues).filter((i: PrintIssue) => i.kind === 'image-unavailable' || i.kind === 'graphic-unavailable');
  if (missing.length > 0) blockers.push({ kind: 'missing-file', message: `${missing.length === 1 ? 'An image or graphic in your design is' : `${missing.length} images or graphics in your design are`} missing. Replace or remove ${missing.length === 1 ? 'it' : 'them'} first (Print check shows where).` });
  if (workflow) {
    // Entry choices (orientation) are the product page's "Design it" step; the artwork already fixes
    // them, and the original didn't carry them past Approve. A missing quantity tier has no variant.
    const issues = nonEntryIssues(product, workflow, document.product.configuration);
    if (issues.length > 0) blockers.push({ kind: 'configuration', message: `Finish your product choices: ${issues.map((i) => i.message).join(' ')}` });
  }
  const price = resolvePrice(product, workflow, document.product.configuration);
  if (price.status !== 'priced') blockers.push({ kind: 'no-variant', message: 'These product choices don’t match a product we make. Change them in Product options.' });
  return blockers;
}
