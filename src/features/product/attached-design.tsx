import { CircleAlert, CircleCheck, ImageOff, PenTool, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/design-system';
import { useApprovedThumbnail } from '@/features/cart/line';
import type { ApprovalStatus } from '@/features/studio/approval/approval-status';
import type { DesignApproval } from '@/features/studio/persistence/records';
import { formatINR } from '@/lib/format';

/**
 * The design attached to this product (Phase 4 M5): the customer's approved design, from this
 * browser's saved design — never from the URL alone. Approved and unchanged, it is ready to add to
 * the cart ("Your design is attached and ready to order.", as on the original). Changed since it
 * was approved (here or in the Studio), it must be approved again before it can be ordered.
 */
export function AttachedDesign({
  status,
  approval,
  designName,
  optionsLabel,
  quantity,
  totalCents,
  editHref,
  onRemove,
}: {
  status: Exclude<ApprovalStatus, 'none'>;
  approval: DesignApproval;
  designName: string;
  optionsLabel: string;
  quantity: number;
  totalCents: number | null;
  editHref: string;
  onRemove(): Promise<void>;
}) {
  const thumbnail = useApprovedThumbnail(approval.versionId);
  const [removing, setRemoving] = useState(false);
  const approved = status === 'approved';
  return (
    <section aria-labelledby="attached-design-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-testid="attached-design" data-status={status}>
      <div className="flex items-start gap-3">
        <span className="grid size-18 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-sunken" data-testid="attached-thumbnail">
          {thumbnail ? <img src={thumbnail} alt={`Your approved design, ${designName}`} className="size-full object-contain" /> : <ImageOff aria-hidden="true" className="size-6 text-fg-subtle" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="attached-design-heading" className="flex items-center gap-1.5 text-body font-semibold text-fg">
            {approved ? <CircleCheck aria-hidden="true" className="size-4.5 shrink-0 text-success" /> : <CircleAlert aria-hidden="true" className="size-4.5 shrink-0 text-warning" />}
            {approved ? 'Design attached' : 'Design changed since you approved it'}
          </h2>
          <p className="truncate text-body-sm font-medium text-fg" title={designName}>
            {designName}
          </p>
          <p className="text-body-sm text-fg-muted">
            {approved ? 'Your design is attached and ready to order.' : 'Review it in the Design Studio and approve it again to order these changes.'}
          </p>
        </div>
      </div>
      {approved && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm" data-testid="attached-summary">
          {optionsLabel && (
            <>
              <dt className="text-fg-muted">Options</dt>
              <dd className="text-right font-medium text-fg">{optionsLabel}</dd>
            </>
          )}
          <dt className="text-fg-muted">Quantity</dt>
          <dd className="text-right font-medium text-fg tabular-nums">{quantity}</dd>
          {totalCents !== null && (
            <>
              <dt className="text-fg-muted">Price</dt>
              <dd className="text-right font-semibold text-fg tabular-nums">{formatINR(totalCents)}</dd>
            </>
          )}
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link to={editHref} data-testid="attached-edit">
            <PenTool aria-hidden="true" /> {approved ? 'Edit design' : 'Review and approve'}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={removing}
          data-testid="attached-remove"
          onClick={() => {
            setRemoving(true);
            void onRemove().finally(() => setRemoving(false));
          }}
        >
          <X aria-hidden="true" /> Remove design
        </Button>
      </div>
    </section>
  );
}
