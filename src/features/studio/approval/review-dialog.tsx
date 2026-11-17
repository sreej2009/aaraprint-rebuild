import { ArrowRight, CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { accountService } from '@/features/account/account';
import { Button, Spinner } from '@/design-system';
import { cn } from '@/lib/cn';
import { formatINR } from '@/lib/format';
import { useSaveController, useSaveState } from '../persistence/persistence-context';
import { usePrintReport } from '../preflight/use-print-report';
import { PreviewDialog } from '../preview/preview-dialog';
import { useStudio } from '../store';
import { useStudioSession } from '../shell/session-context';
import { approvalBlockers, approvalStatus } from './approval';

/**
 * Review your design → Approve and continue (Phase 4 M5), from the Studio's Continue (Next on
 * phones), as the original's Next. The review is the Preview dialog — the same drawing of the same
 * design document in memory (unsaved changes included), on the product where the product can be
 * shown — with this panel: what is ordered, print warnings, what still blocks approval, and the
 * actions. Approving saves the design and keeps the approved content as a version (save
 * controller); the handoff then goes back to the product page, where the design is attached.
 */
export function ReviewButton({ label, iconOnly }: { label: string; iconOnly: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button size="sm" aria-haspopup="dialog" data-testid="review-button">
          <span className={cn(iconOnly && 'sr-only')}>{label}</span>
          <ArrowRight aria-hidden="true" className="max-md:hidden" />
        </Button>
      </DialogPrimitive.Trigger>
      {open && (
        <PreviewDialog
          review={{
            title: 'Review your design',
            closeLabel: 'Close review',
            description: 'Check positioning, spelling and the safe area before continuing.',
            Panel: ReviewPanel,
          }}
        />
      )}
    </DialogPrimitive.Root>
  );
}

function ReviewPanel({ capture }: { capture: () => string | null }) {
  const { product, variant, variantLabel, print, price, workspace } = useStudioSession();
  const document = useStudio((s) => s.document);
  const controller = useSaveController();
  const approval = useSaveState((s) => s.approval);
  const report = usePrintReport();
  const workflow = workspace?.workflow ?? null;
  const blockers = useMemo(() => approvalBlockers({ product, workflow, document, report }), [product, workflow, document, report]);
  const warnings = report.sides.flatMap((side) => side.issues.filter((i) => i.level !== 'notice' && i.kind !== 'image-unavailable' && i.kind !== 'graphic-unavailable').map((i) => ({ ...i, side: side.label })));
  const status = approvalStatus(approval, document);
  const [step, setStep] = useState<'review' | 'approving' | 'handoff'>('review');
  const [problem, setProblem] = useState<string | null>(null);

  const approve = async () => {
    if (blockers.length > 0 || !controller) return;
    setProblem(null);
    setStep('approving');
    const result = await controller.approve({ thumbnail: capture() });
    if (result.ok) setStep('handoff');
    else {
      setProblem(result.message);
      setStep('review');
    }
  };

  const priced = price?.status === 'priced' ? price : null;
  const sided = document.surfaces.length > 1;
  const counts = document.surfaces.map((s) => {
    const n = s.elements.filter((e) => !e.hidden).length;
    return `${s.label}: ${n === 0 && s.background.color === null ? 'empty' : `${n} ${n === 1 ? 'item' : 'items'}`}`;
  });

  return (
    <aside
      aria-label="Review"
      data-testid="review-panel"
      data-approval={status}
      className="flex max-h-[42dvh] shrink-0 flex-col border-t border-border bg-surface lg:max-h-none lg:w-96 lg:border-t-0 lg:border-l"
    >
      {step === 'handoff' ? (
        <Handoff />
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <section aria-labelledby="review-order-heading" className="flex flex-col gap-2">
              <h2 id="review-order-heading" className="text-body font-semibold text-fg">
                {product.name}
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm" data-testid="review-summary">
                {variantLabel && <Row term="Options" value={variantLabel} />}
                <Row term="Quantity" value={String(document.product.configuration.quantity)} />
                {priced && <Row term="Unit price" value={formatINR(priced.unitPriceCents)} />}
                {priced && <Row term="Total" value={formatINR(priced.totalPriceCents)} strong />}
                <Row term="Print size" value={print.finishedSize} />
                <Row term={sided ? 'Sides' : 'Design'} value={counts.join(' · ')} />
              </dl>
              {(priced?.sku ?? variant?.sku) && <p className="text-caption break-all text-fg-muted">SKU {priced?.sku ?? variant?.sku}</p>}
            </section>

            {status !== 'none' && (
              <p className={cn('flex items-start gap-2 text-body-sm', status === 'approved' ? 'text-success' : 'text-fg')} data-testid="review-approval-status">
                {status === 'approved' ? <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
                {status === 'approved' ? 'You approved this design. It is ready to add to your cart.' : 'You changed this design after approving it. Approve it again to order these changes.'}
              </p>
            )}

            {warnings.length > 0 && (
              <section aria-labelledby="review-warnings-heading" className="flex flex-col gap-1.5" data-testid="review-warnings">
                <h3 id="review-warnings-heading" className="text-body-sm font-semibold text-fg">
                  Worth checking
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {warnings.map((w) => (
                    <li key={w.key} className="flex items-start gap-2 text-body-sm text-fg">
                      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span>
                        {sided && <span className="font-medium">{w.side}: </span>}
                        {w.title}. <span className="text-fg-muted">{w.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {blockers.length > 0 && (
              <ul id="review-blockers" className="flex flex-col gap-1.5" data-testid="review-blockers">
                {blockers.map((b) => (
                  <li key={b.kind} className="flex items-start gap-2 text-body-sm font-medium text-danger">
                    <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>{b.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {problem && (
              <p role="alert" className="text-body-sm font-medium text-danger" data-testid="review-problem">
                {problem}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row-reverse lg:flex-col">
            <Button
              onClick={() => void approve()}
              disabled={blockers.length > 0 || step === 'approving' || !controller}
              aria-describedby={blockers.length > 0 ? 'review-blockers' : undefined}
              data-testid="approve-button"
              className="sm:flex-1 lg:flex-none"
            >
              {step === 'approving' ? <Spinner size="sm" /> : <CircleCheck aria-hidden="true" />}
              {step === 'approving' ? 'Approving…' : 'Approve and continue'}
            </Button>
            <DialogPrimitive.Close asChild>
              <Button variant="secondary" className="sm:flex-1 lg:flex-none">
                Back to design
              </Button>
            </DialogPrimitive.Close>
          </div>
        </>
      )}
    </aside>
  );
}

function Row({ term, value, strong }: { term: string; value: string; strong?: boolean }) {
  return (
    <div className="contents">
      <dt className="text-fg-muted">{term}</dt>
      <dd className={cn('text-right text-fg tabular-nums', strong ? 'font-semibold' : 'font-medium')}>{value}</dd>
    </div>
  );
}

/**
 * After approving: on to the product page, where the design is attached. The original asked a
 * guest to sign in first; this build has no accounts (account boundary), so it says so and the
 * design — already saved in this browser — continues as a guest's. Nothing is sent anywhere.
 */
function Handoff() {
  const { product } = useStudioSession();
  const designId = useStudio((s) => s.document.id);
  const variantId = useStudio((s) => s.document.product.variantId);
  const controller = useSaveController();
  const navigate = useNavigate();
  const account = accountService().session();
  const [leaving, setLeaving] = useState(false);
  const params = new URLSearchParams({ designId, ...(variantId ? { variantId } : {}) });
  const attachedHref = `/products/${product.slug}?${params}`;

  const continueToProduct = async () => {
    setLeaving(true);
    await controller?.flush();
    void navigate(attachedHref);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="review-handoff">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <h2 className="flex items-center gap-2 text-body font-semibold text-fg" tabIndex={-1} ref={(node) => node?.focus()}>
          <CircleCheck aria-hidden="true" className="size-5 text-success" /> Design approved
        </h2>
        <p className="text-body-sm text-fg">Your design is saved in this browser. Next, it’s attached to {product.name} so you can add it to your cart.</p>
        {account.kind === 'unavailable' && (
          <p className="text-body-sm text-fg-muted" data-testid="handoff-account-note">
            {account.reason} Until then, designs stay in this browser.
          </p>
        )}
        {account.kind === 'signed-in' && <p className="text-body-sm text-fg-muted">Signed in as {account.displayName}.</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row-reverse lg:flex-col">
        <Button onClick={() => void continueToProduct()} disabled={leaving} data-testid="handoff-continue" className="sm:flex-1 lg:flex-none">
          {leaving ? <Spinner size="sm" /> : null}
          {account.kind === 'signed-in' ? 'Continue to product' : 'Continue as guest'}
        </Button>
        {account.kind === 'guest' && (
          <Button asChild variant="secondary" className="sm:flex-1 lg:flex-none">
            <a href={account.signInHref(attachedHref)}>Sign in</a>
          </Button>
        )}
        <DialogPrimitive.Close asChild>
          <Button variant="secondary" className="sm:flex-1 lg:flex-none">
            Back to design
          </Button>
        </DialogPrimitive.Close>
      </div>
    </div>
  );
}
