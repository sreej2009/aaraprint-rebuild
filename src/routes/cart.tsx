import { CartPage } from '@/features/cart/cart-page';
import { seo } from '@/lib/seo';
import type { Route } from './+types/cart';

/** `/cart` (Phase 4 M5): the approved designs in this browser's cart. Not indexed. */
export const meta: Route.MetaFunction = ({ location }) => seo({ title: 'Your cart', path: location.pathname, noindex: true });

export default function Cart() {
  return <CartPage />;
}
