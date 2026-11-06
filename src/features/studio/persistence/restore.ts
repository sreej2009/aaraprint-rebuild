import type { DesignDocument } from '../schema/types';
import { parseDesign } from '../schema/validate';
import type { DesignRecord } from './records';
import type { DesignRepository } from './repository';

/**
 * Opening the Studio (Plan M11): find the design to continue, never trusting stored JSON.
 *   IndexedDB → parse → migrate → validate → (product check) → hydrate the store
 * A record that fails any step is reported — and left untouched in storage, so nothing is lost —
 * and the customer can start a new design.
 */
export type OpenResult =
  /** Nothing saved for this product (or storage unavailable): a new blank design. */
  | { kind: 'new'; storageError?: string }
  | { kind: 'restored'; document: DesignDocument; record: DesignRecord }
  /** The stored data can't be read, migrated or validated. */
  | { kind: 'corrupt'; designId: string; reason: string }
  /** Saved for another product: never opened here. */
  | { kind: 'mismatch'; designId: string; productSlug: string; name: string }
  /** `?design=` names a design this browser doesn't have. */
  | { kind: 'missing'; designId: string };

export interface OpenRequest {
  productSlug: string;
  /** From `?design=`: open exactly this design. */
  designId: string | null;
}

/** Check a stored record and turn it into a design for this product (or say why not). */
export function readRecord(record: DesignRecord, productSlug: string): OpenResult {
  let parsed: ReturnType<typeof parseDesign>;
  try {
    parsed = parseDesign(record.document);
  } catch {
    return { kind: 'corrupt', designId: record.designId, reason: 'The saved data can’t be read.' };
  }
  if (!parsed.ok) {
    const first = parsed.errors[0];
    const unsupported = first?.code === 'unsupported-version';
    return { kind: 'corrupt', designId: record.designId, reason: unsupported ? first.message : 'The saved data is damaged or incomplete.' };
  }
  if (record.productSlug !== productSlug || parsed.document.product.slug !== productSlug) {
    return { kind: 'mismatch', designId: record.designId, productSlug: record.productSlug, name: parsed.document.name };
  }
  return { kind: 'restored', document: parsed.document, record };
}

export async function openSavedDesign(repository: DesignRepository, { productSlug, designId }: OpenRequest): Promise<OpenResult> {
  let record: DesignRecord | null;
  try {
    record = designId ? await repository.getDesign(designId) : await repository.latestForProduct(productSlug);
  } catch (error) {
    // Storage isn't available: carry on with a new design in memory, and say so.
    return { kind: 'new', storageError: error instanceof Error ? error.message : 'Saving isn’t available in this browser.' };
  }
  if (!record) return designId ? { kind: 'missing', designId } : { kind: 'new' };
  if (typeof record !== 'object' || typeof record.designId !== 'string') return { kind: 'corrupt', designId: designId ?? 'unknown', reason: 'The saved data can’t be read.' };
  return readRecord(record, productSlug);
}
