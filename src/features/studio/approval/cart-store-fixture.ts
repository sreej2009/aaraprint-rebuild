import { createLocalCart, type CartService } from '@/features/cart/cart';

/** A cart over an in-memory storage, for tests. */
export function createCartStore(): CartService & { storage: Map<string, string> } {
  const storage = new Map<string, string>();
  const cart = createLocalCart({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) });
  return Object.assign(cart, { storage });
}
