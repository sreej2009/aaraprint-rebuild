import { designFingerprint } from '../persistence/fingerprint';
import type { DesignApproval } from '../persistence/records';
import type { DesignDocument } from '../schema/types';

/**
 * Whether an approval (Phase 4 M5) still matches the design — small on purpose, so the product
 * page can tell without loading the Studio's checks:
 * - `none`: never approved (or detached);
 * - `approved`: the design is exactly what was approved — it can be added to the cart;
 * - `changed`: it was approved, then changed (artwork or product choices): approve it again.
 */
export type ApprovalStatus = 'none' | 'approved' | 'changed';

export function approvalStatus(approval: DesignApproval | null, document: DesignDocument | null): ApprovalStatus {
  if (!approval || !document) return 'none';
  return designFingerprint(document) === approval.fingerprint ? 'approved' : 'changed';
}
