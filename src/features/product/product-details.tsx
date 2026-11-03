import { Link } from 'react-router';
import { Accordion, AccordionItem, TextLink } from '@/design-system';
import { business } from '@/config/business';
import type { Product } from '@/lib/catalogue/types';
import { formatINR } from '@/lib/format';
import { printSpecs } from './selection';

/** Overview, print specifications and delivery information. */
export function ProductDetails({ product }: { product: Pick<Product, 'description' | 'print'> }) {
  const specs = product.print ? printSpecs(product.print) : null;
  return (
    <Accordion type="multiple" defaultValue={['overview', 'specs']} className="border-t border-border">
      <AccordionItem value="overview" title="About this product" headingLevel={2}>
        <p className="max-w-reading text-body text-fg">{product.description}</p>
      </AccordionItem>
      {specs && (
        <AccordionItem value="specs" title="Print specifications" headingLevel={2}>
          <dl className="grid max-w-reading gap-x-6 gap-y-3 sm:grid-cols-[10rem_1fr]">
            {specs.customer.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-body-sm font-semibold text-fg">{row.label}</dt>
                <dd className="text-body-sm text-fg-muted">{row.value}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-5 max-w-reading rounded-md bg-surface-subtle p-4">
            <summary className="cursor-pointer text-body-sm font-semibold text-fg">For designers: canvas in pixels</summary>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-body-sm sm:grid-cols-4">
              {specs.designer.map((row) => (
                <div key={row.label}>
                  <dt className="text-caption text-fg-muted">{row.label}</dt>
                  <dd className="font-mono text-fg">{row.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        </AccordionItem>
      )}
      <AccordionItem value="delivery" title="Delivery & returns" headingLevel={2}>
        <ul className="flex max-w-reading list-disc flex-col gap-2 pl-5 text-body text-fg">
          <li>
            Goes to print within 24–48 hours and is delivered {business.deliveryBusinessDays.min}–{business.deliveryBusinessDays.max} business days after printing.
          </li>
          <li>
            Free shipping on orders of {formatINR(business.freeShippingThresholdCents)} or more; a flat {formatINR(business.flatShippingCents)} below that.
          </li>
          <li>
            If it arrives damaged, wrong or late, tell us within {business.reprintWindowDays} days and we’ll reprint it free or refund you.
          </li>
          <li>Made to order, so we can’t accept change-of-mind returns on items printed correctly.</li>
        </ul>
        <p className="mt-3 text-body-sm text-fg-muted">
          Details: <TextLink to="/shipping">Shipping & delivery</TextLink> · <TextLink to="/refund-policy">Returns, reprints & refunds</TextLink> ·{' '}
          <Link to="/contact" className="font-medium text-accent-strong underline underline-offset-2">
            Bulk orders
          </Link>
        </p>
      </AccordionItem>
    </Accordion>
  );
}
