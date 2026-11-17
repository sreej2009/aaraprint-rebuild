import { useMemo } from 'react';
import { approvalBlockers, type ApprovalBlocker } from '../approval/approval';
import { useStudioSession } from '../shell/session-context';
import { useStudio } from '../store';
import type { PrintReport } from './print-checks';
import { printReadiness, type PrintReadiness } from './print-status';

/** The print check status of the current design: the print checks plus the M5 approval rules. */
export function usePrintReadiness(report: PrintReport): PrintReadiness {
  return usePrintStatus(report).readiness;
}

export interface PrintCheckState {
  report: PrintReport;
  /** What blocks "Approve and continue" (M5 rules, unchanged). */
  blockers: ApprovalBlocker[];
  readiness: PrintReadiness;
}

/** The checks, what blocks approval and the status, worked out once for Review (M6). */
export function usePrintStatus(report: PrintReport): PrintCheckState {
  const { product, workspace } = useStudioSession();
  const document = useStudio((s) => s.document);
  const workflow = workspace?.workflow ?? null;
  return useMemo(() => {
    const blockers = approvalBlockers({ product, workflow, document, report });
    return { report, blockers, readiness: printReadiness(report, blockers, document.product.configuration.sameDesignBothSides) };
  }, [product, workflow, document, report]);
}
