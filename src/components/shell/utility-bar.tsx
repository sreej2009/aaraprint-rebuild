import { Truck, Wallet } from 'lucide-react';
import { Link } from 'react-router';

/** Thin strip above the header with the two promises customers ask about most. */
export function UtilityBar() {
  return (
    <aside aria-label="Delivery and payment" className="border-b border-border bg-surface-subtle text-caption text-fg-muted">
      <div className="container-page flex h-8 items-center justify-center gap-5 md:justify-between">
        <p className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Truck aria-hidden="true" className="size-3.5" />
            Free shipping over ₹1,999
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Wallet aria-hidden="true" className="size-3.5" />
            Pay on delivery
          </span>
        </p>
        <nav aria-label="Support" className="hidden items-center gap-4 md:flex">
          <Link to="/track-order" className="hover:text-fg hover:underline">
            Track an order
          </Link>
          <Link to="/faq" className="hover:text-fg hover:underline">
            Help
          </Link>
        </nav>
      </div>
    </aside>
  );
}
