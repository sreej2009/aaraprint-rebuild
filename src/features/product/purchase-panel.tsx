import { CircleCheck, PenTool, RefreshCcw, ShoppingCart, Truck, Upload, Wallet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useStore } from 'zustand';
import { Badge, Button, Callout, Price } from '@/design-system';
import { business } from '@/config/business';
import { designHref } from '@/features/catalogue/links';
import { EntryDialog } from '@/features/product-options/entry-dialog';
import { ProductOptions } from '@/features/product-options/product-options';
import type { ProductDesignSession } from '@/features/product-options/session';
import { resolvePrice } from '@/features/product-workflow/pricing';
import { needsEntry, nonEntryIssues, type EntryDraft } from '@/features/product-workflow/entry';
import type { Product } from '@/lib/catalogue/types';
import { formatINR } from '@/lib/format';
import { cartService, type AddResult } from '@/features/cart/cart';
import { cartLineFor } from '@/features/cart/line';
import { approvalStatus } from '@/features/studio/approval/approval-status';
import { variantSummary } from '@/features/studio/shell/variant';
import { AttachedDesign } from './attached-design';

export interface PurchasePanelProps {
  product: Product;
  categoryName: string | null;
  /** The product's design session: its configuration is what's shown and priced (Phase 4 M2). */
  session: ProductDesignSession;
}

const PERSISTENCE_NOTE = {
  starting: null,
  device: 'Your choices are saved with your design on this device.',
  memory: 'Your choices last for this visit.',
} as const;

export function PurchasePanel({ product, categoryName, session }: PurchasePanelProps) {
  const { store, workflow } = session;
  const configuration = useStore(store, (s) => s.document.product.configuration);
  // Price and validity come from the product-workflow domain only (M1 resolver, M2 validation).
  const price = useMemo(() => resolvePrice(product, workflow, configuration), [product, workflow, configuration]);
  // Entry choices (orientation, quantity tier) are asked by the "Design it" step (M3); anything
  // else that is missing or unavailable is fixed here on the page first.
  const issues = useMemo(() => (workflow ? nonEntryIssues(product, workflow, configuration) : []), [product, workflow, configuration]);
  const variantId = price.status === 'priced' ? price.variantId : undefined;
  const ready = issues.length === 0;

  // The design attached to this product (Phase 4 M5): this browser's saved design and its approval
  // (the save controller's), current only while the design is exactly what was approved.
  const document = useStore(store, (s) => s.document);
  const approval = useSyncExternalStore(
    (listener) => session.controller?.state.subscribe(listener) ?? (() => {}),
    () => session.controller?.state.getState().approval ?? null,
    () => null,
  );
  const status = useMemo(() => (product.isCustomizable ? approvalStatus(approval, document) : 'none'), [product.isCustomizable, approval, document]);
  const optionsLabel = useMemo(() => variantSummary(product, price.status === 'priced' ? price.variant : undefined), [product, price]);
  const editHref = `/products/${product.slug}/design?design=${encodeURIComponent(document.id)}`;
  const [added, setAdded] = useState<{ result: AddResult; lineId: string } | { result: 'failed'; reason: string } | null>(null);
  const addToCart = () => {
    if (!approval || status !== 'approved') return;
    const built = cartLineFor({ product, document, approval, price, optionsLabel, now: Date.now() });
    setAdded(built.ok ? { result: cartService().add(built.line), lineId: built.line.lineId } : { result: 'failed', reason: built.reason });
  };
  const navigate = useNavigate();
  const [entry, setEntry] = useState<'design' | 'upload' | null>(null);
  // The link that opened the entry step gets focus back when it closes.
  const opener = useRef<HTMLElement | null>(null);

  // "Design it": save what's pending (so the Studio restores exactly this design), then open it.
  const enterStudio = async (mode: 'design' | 'upload') => {
    await session.flush();
    const resolved = store.getState().document.product.variantId ?? undefined;
    void navigate(designHref(product.slug, resolved, mode === 'upload' ? 'upload' : undefined));
  };
  const startDesigning = (mode: 'design' | 'upload') => (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    opener.current = event.currentTarget;
    if (workflow && needsEntry(product, workflow, store.getState().document.product.configuration)) setEntry(mode);
    else void enterStudio(mode);
  };
  const confirmEntry = (draft: EntryDraft) => {
    const mode = entry ?? 'design';
    // One product command (one undo step) for the whole confirmation.
    store.getState().actions.applyEntryOptions(draft);
    setEntry(null);
    void enterStudio(mode);
  };
  const units = price.status === 'priced' && price.piecesPerUnit ? price.piecesPerUnit * price.quantity : null;
  const persistenceNote = product.isCustomizable ? PERSISTENCE_NOTE[session.persistence] : null;
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaVisible, setCtaVisible] = useState(true);

  // Show the sticky buy bar on small screens only while the main buttons are off-screen.
  useEffect(() => {
    const node = ctaRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setCtaVisible(Boolean(entry?.isIntersecting)), { rootMargin: '0px 0px -40px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {categoryName && <span className="text-body-sm font-semibold text-accent-strong">{categoryName}</span>}
          {product.isFeatured && <Badge>Bestseller</Badge>}
          {product.isNew && <Badge tone="accent">New</Badge>}
        </div>
        <h1 className="text-h1 font-bold text-fg">{product.name}</h1>
        <p className="text-body text-fg-muted">{product.shortDescription}</p>
      </div>

      {workflow ? (
        <ProductOptions product={product} workflow={workflow} store={store} issues={issues} />
      ) : (
        <Callout tone="warning">This product’s options can’t be shown right now. Please contact us to order it.</Callout>
      )}

      {approval && status !== 'none' && (
        <AttachedDesign
          status={status}
          approval={approval}
          designName={document.name}
          optionsLabel={optionsLabel}
          quantity={document.product.configuration.quantity}
          totalCents={price.status === 'priced' ? price.totalPriceCents : null}
          editHref={editHref}
          onRemove={async () => {
            setAdded(null);
            await session.controller?.clearApproval();
          }}
        />
      )}

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-subtle p-5">
        <div aria-live="polite" className="flex flex-col gap-1" data-price-summary>
          <span className="text-caption font-medium text-fg-muted">Your price</span>
          {price.status === 'priced' ? (
            <>
              <Price amount={price.totalPriceCents} size="lg" suffix="incl. printing" />
              {units !== null && (
                <span className="text-body-sm text-fg-muted tabular-nums">
                  {units.toLocaleString('en-IN')} units · {formatINR(Math.round(price.totalPriceCents / units))} each
                </span>
              )}
              {price.quantity > 1 && (
                <span className="text-body-sm text-fg-muted tabular-nums">
                  {formatINR(price.unitPriceCents)} × {price.quantity} {product.quantityStepper === 'sets' ? 'sets' : 'items'}
                </span>
              )}
              {price.adjustments.map((a) => (
                <span key={a.optionId} className="text-body-sm text-fg-muted tabular-nums" data-price-adjustment>
                  Includes {a.label} ({a.cents > 0 ? '+' : '−'}
                  {formatINR(Math.abs(a.cents))})
                </span>
              ))}
              <span className="text-caption text-fg-muted">SKU {price.sku}</span>
            </>
          ) : (
            <p className="text-body-sm font-medium text-fg">Choose your options to see the price.</p>
          )}
        </div>
        <div ref={ctaRef} className="flex flex-col gap-2">
          {product.isCustomizable && status === 'approved' ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button size="lg" className="flex-1" onClick={addToCart} data-testid="add-to-cart">
                  <ShoppingCart aria-hidden="true" /> Add to cart
                </Button>
                <Button asChild size="lg" variant="secondary" className="flex-1">
                  <Link to={editHref}>
                    <PenTool aria-hidden="true" /> Edit design
                  </Link>
                </Button>
              </div>
              <div aria-live="polite" data-testid="cart-confirmation">
                {added && added.result !== 'failed' && (
                  <Callout tone="success" className="py-3">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {added.result === 'added' ? 'Added to cart.' : 'This approved design is already in your cart.'}
                      <Link to="/cart" className="font-semibold underline underline-offset-2">
                        View cart
                      </Link>
                    </span>
                  </Callout>
                )}
                {added?.result === 'failed' && (
                  <Callout tone="warning" className="py-3">
                    {added.reason}
                  </Callout>
                )}
              </div>
            </>
          ) : product.isCustomizable ? (
            ready ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild size="lg" className="flex-1">
                  <Link to={designHref(product.slug, variantId)} onClick={startDesigning('design')}>
                    <PenTool aria-hidden="true" /> Start designing
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary" className="flex-1">
                  <Link to={designHref(product.slug, variantId, 'upload')} onClick={startDesigning('upload')}>
                    <Upload aria-hidden="true" /> Upload your file
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <Button size="lg" disabled aria-describedby="choices-needed">
                  <PenTool aria-hidden="true" /> Start designing
                </Button>
                <p id="choices-needed" className="text-body-sm text-danger" data-choices-needed>
                  Finish your choices above to start designing. {issues.map((i) => i.message).join(' ')}
                </p>
              </>
            )
          ) : null}
          {persistenceNote && <p className="text-caption text-fg-muted">{persistenceNote}</p>}
        </div>
        <Callout tone="info" className="py-3">
          {product.isCustomizable
            ? 'Design it, review and approve it, then add it to your cart. Online checkout is being rebuilt — contact us to place your order meanwhile.'
            : 'This product is ordered without a design. Online cart and checkout are being rebuilt — contact us to order now.'}
        </Callout>
      </div>

      <ul className="grid gap-3 text-body-sm text-fg sm:grid-cols-2">
        <li className="flex items-start gap-2.5">
          <Truck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-accent-strong" />
          <span>
            Dispatched in {product.dispatchDays ? `${product.dispatchDays.min}–${product.dispatchDays.max}` : `${business.dispatchDays.min}–${business.dispatchDays.max}`} days
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <Wallet aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-accent-strong" />
          <span>Pay on delivery</span>
        </li>
        <li className="flex items-start gap-2.5">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-accent-strong" />
          <span>Free shipping over {formatINR(business.freeShippingThresholdCents)}</span>
        </li>
        <li className="flex items-start gap-2.5">
          <RefreshCcw aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-accent-strong" />
          <span>Free reprint if it arrives wrong</span>
        </li>
      </ul>

      {/* Sticky buy bar for phones and tablets */}
      <div
        aria-hidden={ctaVisible}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-3 backdrop-blur transition-transform duration-200 lg:hidden ${
          ctaVisible ? 'translate-y-full' : 'translate-y-0'
        }`}
      >
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          {price.status === 'priced' ? <Price amount={price.totalPriceCents} size="md" /> : <span className="text-body-sm text-fg-muted">Choose your options</span>}
          {product.isCustomizable && status === 'approved' ? (
            <Button tabIndex={ctaVisible ? -1 : undefined} onClick={addToCart}>
              <ShoppingCart aria-hidden="true" /> Add to cart
            </Button>
          ) : product.isCustomizable && ready && (
            <Button asChild tabIndex={ctaVisible ? -1 : undefined}>
              <Link to={designHref(product.slug, variantId)} tabIndex={ctaVisible ? -1 : undefined} onClick={startDesigning('design')}>
                Start designing
              </Link>
            </Button>
          )}
        </div>
      </div>
      {workflow && product.isCustomizable && (
        <EntryDialog
          open={entry !== null}
          onOpenChange={(open) => {
            if (!open) setEntry(null); // Cancel, Escape or the close button: nothing changes.
          }}
          product={product}
          workflow={workflow}
          configuration={configuration}
          confirmLabel={entry === 'upload' ? 'Continue to upload' : 'Start designing'}
          onConfirm={confirmEntry}
          onCloseAutoFocus={(event) => {
            if (!opener.current?.isConnected) return;
            event.preventDefault();
            opener.current.focus();
          }}
        />
      )}
    </div>
  );
}
