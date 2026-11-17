import { CircleCheck, Info, OctagonAlert, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTrigger } from '@/design-system';
import { cn } from '@/lib/cn';
import { CANVAS_REGION_ID } from '../shell/dom-ids';
import type { DesignDocument } from '../schema/types';
import { useStudio, useStudioStoreApi } from '../store';
import { ArtworkList, PrintFacts, ReadinessSummary } from './print-check-parts';
import { usePrintReadiness } from './use-print-status';
import type { IssueLevel, PrintIssue, PrintReport, SideCheck } from './print-checks';
import { ProofSection } from './proof-section';
import { usePrintReport, useSettledPrintReport } from './use-print-report';

/**
 * Print check and proof (Plan M15). The top-bar button shows how many things to check; the dialog
 * lists them per side (advice only — the design is never changed) and makes a proof of the current
 * design, unsaved changes included. Print-ready files are made server-side in Phase 6.
 *
 * Phase 4 M6: the dialog also says whether the design is Ready, has warnings or Needs attention
 * (exactly when Review's "Approve and continue" is blocked: approval/approval.ts), the print facts
 * from the product's print configuration, and each element's placement and resolution. Review has
 * the same checks with the print area drawn (its Print check view).
 */
export function PrintCheckButton({ iconOnly }: { iconOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const report = useSettledPrintReport();
  // An empty design is plain to see (the dialog still says so); the badge counts problems in artwork.
  const count = report.empty ? 0 : report.warnings;
  const Icon = count > 0 ? ShieldAlert : ShieldCheck;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" aria-haspopup="dialog" data-testid="print-check-button" className={cn('relative', iconOnly && 'size-9 px-0')}>
          <Icon aria-hidden="true" className={cn(count > 0 && 'text-warning-strong')} />
          <span className={cn(iconOnly ? 'sr-only' : 'max-[1399px]:sr-only')}>Print check</span>{' '}
          {count > 0 ? (
            <span
              className={cn(
                'grid min-w-5 place-items-center rounded-full bg-warning-soft px-1 text-caption font-semibold text-warning-strong tabular-nums',
                iconOnly && 'absolute -top-1.5 -right-1.5 h-5',
              )}
            >
              {count}
            </span>
          ) : null}{' '}
          <span className="sr-only">{count === 0 ? (report.empty ? 'design is empty' : 'no warnings') : count === 1 ? 'warning' : 'warnings'}</span>
        </Button>
      </DialogTrigger>
      {open && <PrintCheckDialog onClose={() => setOpen(false)} />}
    </Dialog>
  );
}

function PrintCheckDialog({ onClose }: { onClose(): void }) {
  const document = useStudio((s) => s.document);
  const studio = useStudioStoreApi();
  const report = usePrintReport();
  const readiness = usePrintReadiness(report);
  const toCanvas = useRef(false);

  // "Show" closes the dialog and selects the layer on its side, for the customer to fix (or not).
  const show = (issue: PrintIssue) => {
    if (!issue.surfaceId || !issue.elementId) return;
    const { actions } = studio.getState();
    actions.setActiveSurface(issue.surfaceId);
    actions.select([issue.elementId]);
    toCanvas.current = true;
    onClose();
  };

  return (
    <DialogContent
      size="lg"
      title="Print check and proof"
      description="Things that may not print as you expect, and a proof picture of your design. Checks are advice: you can keep editing and saving whatever they say."
      onCloseAutoFocus={(event) => {
        if (!toCanvas.current) return;
        event.preventDefault();
        window.document.getElementById(CANVAS_REGION_ID)?.focus();
      }}
    >
      <div className="flex flex-col gap-6" data-testid="print-check">
        <ReadinessSummary readiness={readiness} testId="print-check-status" />
        <ChecksSection report={report} sided={document.surfaces.length > 1} onShow={show} />
        <DetailsSection document={document} report={report} />
        <ProofSection document={document} report={report} />
      </div>
    </DialogContent>
  );
}

// ------------------------------------------------------------------ Checks

const LEVEL_STYLE: Record<IssueLevel, { icon: typeof TriangleAlert; className: string; label: string }> = {
  serious: { icon: OctagonAlert, className: 'text-danger', label: 'Warning' },
  warning: { icon: TriangleAlert, className: 'text-warning-strong', label: 'Warning' },
  notice: { icon: Info, className: 'text-fg-muted', label: 'Note' },
};

function ChecksSection({ report, sided, onShow }: { report: PrintReport; sided: boolean; onShow(issue: PrintIssue): void }) {
  const n = report.warnings;
  const summary = report.empty ? 'Your design is empty.' : n === 0 ? 'No problems found.' : `${n} ${n === 1 ? 'thing' : 'things'} to check before you print.`;
  return (
    <section aria-labelledby="print-check-heading" className="flex flex-col gap-3">
      <h3 id="print-check-heading" className="text-body font-semibold text-fg">
        Print check
      </h3>
      <output
        data-testid="print-check-summary"
        data-warnings={n}
        className={cn('flex items-center gap-2 rounded-md p-3 text-body-sm font-medium', n === 0 ? 'bg-success-soft text-success-strong' : 'bg-warning-soft text-warning-strong')}
      >
        {n === 0 ? <CircleCheck aria-hidden="true" className="size-4 shrink-0" /> : <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />}
        {summary}
      </output>
      {report.empty ? (
        <p className="text-body-sm text-fg-muted">Add text, shapes, images or a template, then check again.</p>
      ) : (
        report.sides.map((side) => <SideChecks key={side.surfaceId} side={side} sided={sided} onShow={onShow} />)
      )}
    </section>
  );
}

function SideChecks({ side, sided, onShow }: { side: SideCheck; sided: boolean; onShow(issue: PrintIssue): void }) {
  const warnings = side.issues.filter((i) => i.level !== 'notice').length;
  const headingId = `print-check-${side.surfaceId}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2" data-testid={`print-check-side-${side.surfaceId}`}>
      {sided && (
        <h4 id={headingId} className="text-body-sm font-semibold text-fg">
          {side.label} <span className="font-normal text-fg-muted">· {side.empty ? 'no artwork' : warnings === 0 ? 'no warnings' : `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`}</span>
        </h4>
      )}
      {side.issues.length > 0 && (
        <ul aria-labelledby={sided ? headingId : 'print-check-heading'} className="flex flex-col gap-2">
          {side.issues.map((issue) => {
            const style = LEVEL_STYLE[issue.level];
            const Icon = style.icon;
            return (
              <li key={issue.key} data-kind={issue.kind} data-level={issue.level} className="flex items-start gap-3 rounded-md border border-border bg-surface p-3">
                <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', style.className)} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-body-sm font-semibold text-fg">
                    <span className="sr-only">{style.label}: </span>
                    {issue.title}
                  </p>
                  <p className="text-body-sm text-fg-muted">{issue.detail}</p>
                </div>
                {issue.elementId && (
                  <Button variant="secondary" size="sm" className="shrink-0 pointer-coarse:h-11" aria-label={`Show ${issue.subject}`} onClick={() => onShow(issue)}>
                    Show
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {side.passed.length > 0 && (
        <ul aria-label={`${sided ? side.label : 'Design'}: fine`} className="flex flex-col gap-1">
          {side.passed.map((text) => (
            <li key={text} className="flex items-center gap-2 text-body-sm text-fg">
              <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success-strong" />
              {text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ----------------------------------------------------------------- Details

/**
 * The print facts (once when the sides share them, which they do on every product today) and each
 * side's artwork with placement and resolution (M6).
 */
function DetailsSection({ document, report }: { document: DesignDocument; report: PrintReport }) {
  const sided = document.surfaces.length > 1;
  const same = document.surfaces.every((s) => JSON.stringify(s.print) === JSON.stringify(document.surfaces[0]!.print));
  const prints = same ? [document.surfaces[0]!] : document.surfaces;
  return (
    <section aria-labelledby="print-details-heading" className="flex flex-col gap-3 border-t border-border pt-5" data-testid="print-details">
      <h3 id="print-details-heading" className="text-body font-semibold text-fg">
        Print details
      </h3>
      {prints.map((surface) => (
        <div key={surface.id} className="flex flex-col gap-2">
          {!same && <h4 className="text-body-sm font-semibold text-fg">{surface.label}</h4>}
          <PrintFacts print={surface.print} testId={`print-facts-${surface.id}`} />
        </div>
      ))}
      {!report.empty &&
        report.sides.map((side) => {
          const surface = document.surfaces.find((s) => s.id === side.surfaceId)!;
          if (sided && side.empty) return null;
          return (
            <div key={side.surfaceId} className="flex flex-col gap-2">
              <h4 className="text-body-sm font-semibold text-fg">{sided ? `${side.label}: artwork and resolution` : 'Artwork and resolution'}</h4>
              <ArtworkList side={side} print={surface.print} label={sided ? `${side.label} artwork` : 'Artwork'} />
            </div>
          );
        })}
    </section>
  );
}
