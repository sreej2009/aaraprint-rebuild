import { CircleCheck, Download, Info, OctagonAlert, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Component, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, DialogContent, DialogTrigger, RadioGroup, Spinner } from '@/design-system';
import { cn } from '@/lib/cn';
import { CANVAS_REGION_ID } from '../shell/dom-ids';
import { useStudioSession } from '../shell/session-context';
import { finishedSizeMm } from '../geometry/boxes';
import { pxToMm, roundTo } from '../geometry/units';
import { usePreviewReady } from '../preview/readiness';
import { formatSize } from '../profile/describe';
import type { DesignDocument, SurfaceDesign } from '../schema/types';
import { useStudio, useStudioStoreApi } from '../store';
import type { IssueLevel, PrintIssue, PrintReport, SideCheck } from './print-checks';
import { proofPipeline, type ProofTexts } from './proof-export';
import { proofTexts } from './proof-texts';
import { proofFileName, proofLayout, type ProofLayout } from './proof-layout';
import { usePrintReport, useSettledPrintReport } from './use-print-report';

/**
 * Print check and proof (Plan M15). The top-bar button shows how many things to check; the dialog
 * lists them per side (advice only — nothing is blocked, the design is never changed) and makes a
 * PNG proof of the current design, unsaved changes included. Full preflight with blocking is
 * Phase 4; print-ready files are made server-side in Phase 6.
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
          <span className={cn(iconOnly ? 'sr-only' : 'max-xl:sr-only')}>Print check</span>{' '}
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
        <ChecksSection report={report} sided={document.surfaces.length > 1} onShow={show} />
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

// ------------------------------------------------------------------- Proof

type ProofState = { status: 'idle' } | { status: 'making' } | { status: 'done'; fileName: string } | { status: 'error' };

function ProofSection({ document, report }: { document: DesignDocument; report: PrintReport }) {
  const { product } = useStudioSession();
  const withArt = document.surfaces.filter((s) => !report.sides.find((c) => c.surfaceId === s.id)?.empty);
  const choices = withArt.length > 1 ? ['all', ...withArt.map((s) => s.id)] : withArt.map((s) => s.id);
  const [choice, setChoice] = useState(() => choices[0] ?? '');
  const selected = choices.includes(choice) ? choice : (choices[0] ?? '');
  const surfaces = selected === 'all' ? withArt : withArt.filter((s) => s.id === selected);
  const [state, setState] = useState<ProofState>({ status: 'idle' });
  const layout = useMemo(() => (surfaces.length ? proofLayout(surfaces.map((s) => s.print)) : null), [surfaces]);
  const print = (surfaces[0] ?? document.surfaces[0]!).print;
  const size = finishedSizeMm(print);
  const mm = (px: number) => `${roundTo(pxToMm(px, print.dpi), 1)} mm`;
  const making = state.status === 'making';
  const fileName = proofFileName(document.name, selected === 'all' ? 'all' : surfaces.map((s) => s.label));

  return (
    <section aria-labelledby="proof-heading" className="flex flex-col gap-3 border-t border-border pt-5">
      <h3 id="proof-heading" className="text-body font-semibold text-fg">
        Proof
      </h3>
      <p className="text-body-sm text-fg-muted">
        A picture of your design to check, with the trim line and the bleed (the tinted edge that is cut off). It isn’t a print-ready file: those are made separately when your design is printed, and
        colours on screen can differ from print.
      </p>
      {!layout ? (
        <p className="text-body-sm font-medium text-fg" data-testid="proof-empty">
          Your design is empty. Add something to it to make a proof.
        </p>
      ) : (
        <>
          {choices.length > 1 && (
            <RadioGroup
              label="Sides in the proof"
              value={selected}
              onValueChange={setChoice}
              options={choices.map((value) => ({ value, label: value === 'all' ? 'Front and back' : `${document.surfaces.find((s) => s.id === value)!.label} only` }))}
            />
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm" data-testid="proof-facts">
            <Fact term="Product" value={product.name} />
            <Fact term="Sides" value={surfaces.map((s) => s.label).join(' and ')} />
            <Fact term="Finished size" value={formatSize(size.width, size.height)} />
            <Fact term="Resolution" value={`${print.dpi} DPI`} />
            <Fact term="Bleed" value={print.bleedPx > 0 ? `${mm(print.bleedPx)} each side` : 'None'} />
            <Fact term="Safe zone" value={`${mm(print.safeZonePx)} from the edge`} />
            <Fact
              term="Proof image"
              value={`${layout.width} × ${layout.height} px${layout.scaled ? `, scaled to ${Math.round(layout.scale * 100)}% to stay within browser limits` : ', full resolution'}`}
            />
            <Fact term="Print check" value={report.warnings === 0 ? 'No warnings' : `${report.warnings} ${report.warnings === 1 ? 'warning' : 'warnings'}`} />
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => !making && setState({ status: 'making' })} aria-disabled={making || undefined} data-testid="download-proof" className="pointer-coarse:h-11">
              {making ? <Spinner size="sm" /> : <Download aria-hidden="true" />}
              Download proof (PNG)
            </Button>
            <output className="text-body-sm text-fg-muted" data-testid="proof-status">
              {state.status === 'making' ? 'Making your proof…' : state.status === 'done' ? `Proof downloaded: ${state.fileName}` : ''}
            </output>
          </div>
          {state.status === 'error' && (
            <p role="alert" className="text-body-sm font-medium text-danger" data-testid="proof-error">
              The proof couldn’t be made. Your design is unchanged — try again.
            </p>
          )}
          {making && (
            <ProofBoundary onError={() => setState({ status: 'error' })}>
              <ProofJob
                surfaces={surfaces}
                layout={layout}
                texts={proofTexts(document, product.name, surfaces, layout, report.warnings)}
                fileName={fileName}
                onDone={() => setState({ status: 'done', fileName })}
                onError={() => setState({ status: 'error' })}
              />
            </ProofBoundary>
          )}
        </>
      )}
    </section>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt className="text-fg-muted">{term}</dt>
      <dd className="text-right text-fg tabular-nums">{value}</dd>
    </>
  );
}

/** Waits for fonts and images (as the preview does), draws the sides, then hands over the file. */
function ProofJob({ surfaces, layout, texts, fileName, onDone, onError }: { surfaces: SurfaceDesign[]; layout: ProofLayout; texts: ProofTexts; fileName: string; onDone(): void; onError(): void }) {
  const ready = usePreviewReady(surfaces);
  const { Render, deliver } = proofPipeline();
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <Render
        surfaces={surfaces}
        layout={layout}
        onDone={(canvases) => {
          deliver(layout, canvases, texts, fileName).then(onDone, onError);
        }}
        onError={onError}
      />
    </Suspense>
  );
}

class ProofBoundary extends Component<{ children: ReactNode; onError(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
