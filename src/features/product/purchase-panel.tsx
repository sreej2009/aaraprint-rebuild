import { CircleCheck, PenTool, RefreshCcw, Truck, Upload, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Callout, Price, QuantityStepper } from '@/design-system';
import { business } from '@/config/business';
import { designHref } from '@/features/catalogue/links';
import type { Product } from '@/lib/catalogue/types';
import { formatINR } from '@/lib/format';
import type { Selection } from '@/lib/pricing';
import { OptionGroupField } from './option-group-field';
import { priceSummary } from './selection';

export interface PurchasePanelProps {
  product: Product;
  categoryName: string | null;
  selection: Selection;
  onSelectionChange: (groupId: string, valueId: string) => void;
  sets: number;
  onSetsChange: (sets: number) => void;
}

export function PurchasePanel({ product, categoryName, selection, onSelectionChange, sets, onSetsChange }: PurchasePanelProps) {
  const summary = priceSummary(product, selection, sets);
  const variantId = summary.variant?.id;
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

      {product.optionGroups.map((group) => (
        <OptionGroupField key={group.id} product={product} group={group} selection={selection} onChange={onSelectionChange} />
      ))}

      <QuantityStepper
        label={product.quantityStepper === 'sets' ? 'Number of sets' : 'Quantity'}
        value={sets}
        onValueChange={onSetsChange}
        min={1}
        max={product.quantityStepper === 'sets' ? 50 : 500}
      />

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-subtle p-5">
        <div aria-live="polite" className="flex flex-col gap-1">
          <span className="text-caption font-medium text-fg-muted">Your price</span>
          <Price amount={summary.totalCents} size="lg" suffix="incl. printing" />
          {summary.units && summary.unitCents !== null && (
            <span className="text-body-sm text-fg-muted tabular-nums">
              {summary.units.toLocaleString('en-IN')} units · {formatINR(Math.round(summary.unitCents))} each
            </span>
          )}
          {summary.variant && <span className="text-caption text-fg-muted">SKU {summary.variant.sku}</span>}
        </div>
        <div ref={ctaRef} className="flex flex-col gap-2 sm:flex-row">
          {product.isCustomizable ? (
            <>
              <Button asChild size="lg" className="flex-1">
                <Link to={designHref(product.slug, variantId)}>
                  <PenTool aria-hidden="true" /> Start designing
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="flex-1">
                <Link to={designHref(product.slug, variantId, 'upload')}>
                  <Upload aria-hidden="true" /> Upload your file
                </Link>
              </Button>
            </>
          ) : null}
        </div>
        <Callout tone="info" className="py-3">
          {product.isCustomizable
            ? 'Online cart and checkout are being rebuilt. Your design will be ready to order as soon as they launch.'
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
          <Price amount={summary.totalCents} size="md" />
          {product.isCustomizable && (
            <Button asChild tabIndex={ctaVisible ? -1 : undefined}>
              <Link to={designHref(product.slug, variantId)} tabIndex={ctaVisible ? -1 : undefined}>
                Start designing
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
