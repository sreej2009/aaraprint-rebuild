import { ImageOff, PenTool, ShoppingBag, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Breadcrumbs, Button, Callout, EmptyState, PageHeader, Spinner } from '@/design-system';
import { useHydrated } from '@/lib/use-hydrated';
import { formatINR } from '@/lib/format';
import { cartService, useCartLines, type CartLine } from './cart';
import { useApprovedThumbnail } from './line';

/**
 * Your cart (Phase 4 M5): the approved designs added from product pages, from this browser's cart.
 * Each line shows the approved design (its thumbnail and name), what is ordered with it and its
 * price, and can be edited (back to the Studio) or removed. Checkout is Phase 6: this page says so
 * and points to the contact page instead of pretending to take an order.
 */
export function CartPage() {
  const hydrated = useHydrated();
  const lines = useCartLines();
  const subtotal = lines.reduce((sum, l) => sum + l.totalPriceCents, 0);

  return (
    <div className="container-page flex flex-col gap-8 py-8 md:py-12">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Your cart' }]} />
      <PageHeader title="Your cart" />
      {!hydrated ? (
        <p className="flex items-center gap-2 text-body-sm text-fg-muted">
          <Spinner size="sm" /> Loading your cart…
        </p>
      ) : lines.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Browse our catalog and start designing — everything you add will show up here."
          action={
            <Button asChild>
              <Link to="/categories/view-all">Browse products</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <ul aria-label="Items in your cart" className="flex flex-col gap-4" data-testid="cart-lines">
            {lines.map((line) => (
              <CartLineItem key={line.lineId} line={line} />
            ))}
          </ul>
          <section aria-labelledby="cart-summary-heading" className="flex flex-col gap-4 rounded-lg border border-border bg-surface-subtle p-5">
            <h2 id="cart-summary-heading" className="text-h4 font-semibold text-fg">
              Summary
            </h2>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-body-sm">
              <dt className="text-fg-muted">
                {lines.length} {lines.length === 1 ? 'item' : 'items'}
              </dt>
              <dd className="text-right font-semibold text-fg tabular-nums" data-testid="cart-subtotal">
                {formatINR(subtotal)}
              </dd>
            </dl>
            <p className="text-caption text-fg-muted">Shipping and GST are shown at checkout.</p>
            <Callout tone="info" className="py-3">
              Online checkout is being rebuilt.{' '}
              <Link to="/contact" className="font-semibold underline underline-offset-2">
                Contact us
              </Link>{' '}
              to place this order.
            </Callout>
          </section>
        </div>
      )}
    </div>
  );
}

function CartLineItem({ line }: { line: CartLine }) {
  const thumbnail = useApprovedThumbnail(line.design.versionId);
  const approved = new Date(line.design.approvedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <li className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row" data-testid="cart-line" data-sku={line.sku} data-design-id={line.design.designId} data-version-id={line.design.versionId}>
      <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-sunken">
        {thumbnail ? <img src={thumbnail} alt={`Approved design, ${line.design.name}`} className="size-full object-contain" /> : <ImageOff aria-hidden="true" className="size-6 text-fg-subtle" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-body font-semibold text-fg">
            <Link to={`/products/${line.productSlug}?designId=${encodeURIComponent(line.design.designId)}`} className="hover:underline">
              {line.productName}
            </Link>
          </h2>
          <Badge tone="success">Design ready</Badge>
        </div>
        <p className="truncate text-body-sm text-fg" title={line.design.name}>
          {line.design.name} · approved {approved}
        </p>
        {line.optionsLabel && <p className="text-body-sm text-fg-muted">{line.optionsLabel}</p>}
        <p className="text-caption break-all text-fg-muted">SKU {line.sku}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link to={`/products/${line.productSlug}/design?design=${encodeURIComponent(line.design.designId)}`}>
              <PenTool aria-hidden="true" /> Edit design
            </Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => cartService().remove(line.lineId)} aria-label={`Remove ${line.productName} from your cart`}>
            <Trash2 aria-hidden="true" /> Remove
          </Button>
        </div>
      </div>
      <dl className="grid shrink-0 grid-cols-[auto_auto] content-start gap-x-4 gap-y-1 text-body-sm sm:text-right">
        <dt className="text-fg-muted">Quantity</dt>
        <dd className="font-medium text-fg tabular-nums">{line.quantity}</dd>
        <dt className="text-fg-muted">Price</dt>
        <dd className="font-semibold text-fg tabular-nums">{formatINR(line.totalPriceCents)}</dd>
      </dl>
    </li>
  );
}
