import { Download } from 'lucide-react';
import { Component, Suspense, useMemo, useState, type ReactNode } from 'react';
import { Button, RadioGroup, Spinner } from '@/design-system';
import { cn } from '@/lib/cn';
import { finishedSizeMm } from '../geometry/boxes';
import { pxToMm, roundTo } from '../geometry/units';
import { usePreviewReady } from '../preview/readiness';
import { formatSize } from '../profile/describe';
import type { DesignDocument, SurfaceDesign } from '../schema/types';
import { useStudioSession } from '../shell/session-context';
import type { PrintReport } from './print-checks';
import { proofPipeline, type ProofDelivery, type ProofTexts } from './proof-export';
import { proofFileName, proofLayout, type ProofFormat, type ProofLayout } from './proof-layout';
import { proofTexts } from './proof-texts';

/**
 * Download proof (Plan M15; Phase 4 M6 adds the PDF, product details and Review). A picture of the
 * design document in memory — unsaved changes included, never a saved or approved copy — with its
 * trim, bleed and safe zone, made in the browser. Used by the Print check dialog and by Review.
 * Making a proof never edits the design, its history or the editor's side.
 */

type ProofState = { status: 'idle' } | { status: 'making'; format: ProofFormat } | { status: 'done'; fileName: string } | { status: 'error' };

const FORMATS: { value: ProofFormat; label: string }[] = [
  { value: 'png', label: 'PNG image' },
  { value: 'pdf', label: 'PDF, at real size' },
];

export function ProofSection({ document, report, compact = false }: { document: DesignDocument; report: PrintReport; compact?: boolean }) {
  const { product, variant, variantLabel, price } = useStudioSession();
  const withArt = document.surfaces.filter((s) => !report.sides.find((c) => c.surfaceId === s.id)?.empty);
  const choices = withArt.length > 1 ? ['all', ...withArt.map((s) => s.id)] : withArt.map((s) => s.id);
  const [choice, setChoice] = useState(() => choices[0] ?? '');
  const [format, setFormat] = useState<ProofFormat>('png');
  const selected = choices.includes(choice) ? choice : (choices[0] ?? '');
  const surfaces = useMemo(() => (selected === 'all' ? withArt : withArt.filter((s) => s.id === selected)), [selected, withArt]);
  const [state, setState] = useState<ProofState>({ status: 'idle' });
  const layout = useMemo(() => (surfaces.length ? proofLayout(surfaces.map((s) => s.print)) : null), [surfaces]);
  const print = (surfaces[0] ?? document.surfaces[0]!).print;
  const size = finishedSizeMm(print);
  const mm = (px: number) => `${roundTo(pxToMm(px, print.dpi), 1)} mm`;
  const making = state.status === 'making';
  const fileName = proofFileName(product.slug, selected === 'all' ? 'all' : surfaces.map((s) => s.label), format);
  const priced = price?.status === 'priced' ? price : null;
  const identity = { options: variantLabel || null, sku: priced?.sku ?? variant?.sku ?? null, quantity: document.product.configuration.quantity };
  const headingId = compact ? 'review-proof-heading' : 'proof-heading';

  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-3', !compact && 'border-t border-border pt-5')} data-testid="proof-section">
      <h3 id={headingId} className={cn('font-semibold text-fg', compact ? 'text-body-sm' : 'text-body')}>
        {compact ? 'Download proof' : 'Proof'}
      </h3>
      <p className="text-body-sm text-fg-muted">
        {compact
          ? 'A picture of this design with its trim, bleed and safe zone, to check or share. It isn’t a print-ready file.'
          : 'A picture of your design to check, with the trim line, the bleed (the tinted edge that is cut off) and the safe zone (dashed). It isn’t a print-ready file: those are made separately when your design is printed, and colours on screen can differ from print.'}
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
          <RadioGroup label="Proof file" value={format} onValueChange={(v) => setFormat(v === 'pdf' ? 'pdf' : 'png')} options={FORMATS} />
          {!compact && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body-sm" data-testid="proof-facts">
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
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={compact ? 'secondary' : 'primary'}
              onClick={() => !making && setState({ status: 'making', format })}
              aria-disabled={making || undefined}
              data-testid="download-proof"
              data-format={format}
              className="pointer-coarse:h-11 max-sm:w-full"
            >
              {making ? <Spinner size="sm" /> : <Download aria-hidden="true" />}
              Download proof ({format.toUpperCase()})
            </Button>
            <output className="min-w-0 text-body-sm [overflow-wrap:anywhere] text-fg-muted" data-testid="proof-status">
              {state.status === 'making' ? 'Making your proof…' : state.status === 'done' ? `Proof downloaded: ${state.fileName}` : ''}
            </output>
          </div>
          {state.status === 'error' && (
            <p role="alert" className="text-body-sm font-medium text-danger" data-testid="proof-error">
              The proof couldn’t be made. Your design is unchanged — try again.
            </p>
          )}
          {state.status === 'making' && (
            <ProofBoundary onError={() => setState({ status: 'error' })}>
              <ProofJob
                surfaces={surfaces}
                layout={layout}
                texts={proofTexts(document, product.name, surfaces, layout, report.warnings, identity)}
                fileName={fileName}
                delivery={{ format: state.format, dpi: print.dpi }}
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
      <dd className="text-right text-fg tabular-nums [overflow-wrap:anywhere]">{value}</dd>
    </>
  );
}

/** Waits for fonts and images (as the preview does), draws the sides, then hands over the file. */
function ProofJob({
  surfaces,
  layout,
  texts,
  fileName,
  delivery,
  onDone,
  onError,
}: {
  surfaces: SurfaceDesign[];
  layout: ProofLayout;
  texts: ProofTexts;
  fileName: string;
  delivery: ProofDelivery;
  onDone(): void;
  onError(): void;
}) {
  const ready = usePreviewReady(surfaces);
  const { Render, deliver } = proofPipeline();
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <Render
        surfaces={surfaces}
        layout={layout}
        onDone={(canvases) => {
          deliver(layout, canvases, texts, fileName, delivery).then(onDone, onError);
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
