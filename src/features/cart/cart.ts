import { useSyncExternalStore } from 'react';
import type { ProductConfiguration } from '@/features/product-workflow/configuration';

/**
 * The cart (Phase 4 M5): what the customer has chosen to order. The original kept its cart lines
 * in localStorage (`nexuz-cart-cache`) and added them through a server action that couldn't be
 * observed; this rebuild has no order backend yet (checkout is Phase 6). So the cart sits behind
 * `CartService`, and the only adapter is this browser's localStorage. A server-backed adapter can
 * replace it later without changing the product page or the cart page.
 *
 * A line never copies a design. It refers to the approved version of a design saved in this
 * browser (`design.designId` + `design.versionId`, the `approved` version the Studio keeps and
 * never prunes) and records what is ordered with it, exactly as approved. Its id is that pair, so
 * the same approval can't be added twice and no random id is invented.
 */

export interface CartDesignRef {
  designId: string;
  /** The `approved` version: exactly the artwork and choices that were approved. */
  versionId: string;
  name: string;
  /** ms since the epoch. */
  approvedAt: number;
  fingerprint: string;
}

export interface CartLine {
  /** `${designId}:${versionId}`. */
  lineId: string;
  productSlug: string;
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
  /** The chosen options in words ("100 cards · Classic Black"). */
  optionsLabel: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  /** The product configuration as approved: everything needed to reproduce the order. */
  configuration: ProductConfiguration;
  design: CartDesignRef;
  /** ms since the epoch. */
  addedAt: number;
}

export type AddResult = 'added' | 'already-in-cart';

export interface CartService {
  lines(): readonly CartLine[];
  add(line: CartLine): AddResult;
  remove(lineId: string): void;
  subscribe(listener: () => void): () => void;
}

export const CART_STORAGE_KEY = 'aaraprint-cart';
const CART_FORMAT = 1;

export function cartLineId(designId: string, versionId: string): string {
  return `${designId}:${versionId}`;
}

const text = (v: unknown, max = 400): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** A stored line checked field by field (localStorage is untrusted); null when damaged. */
export function readCartLine(value: unknown): CartLine | null {
  if (!value || typeof value !== 'object') return null;
  const l = value as Record<string, unknown>;
  const d = l.design as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object' || !text(d.designId) || !text(d.versionId) || !text(d.name, 200) || !text(d.fingerprint) || !count(d.approvedAt)) return null;
  if (l.lineId !== cartLineId(d.designId as string, d.versionId as string)) return null;
  if (!text(l.productSlug) || !text(l.productId) || !text(l.productName) || !text(l.variantId) || !text(l.sku) || typeof l.optionsLabel !== 'string') return null;
  if (!count(l.quantity) || (l.quantity as number) < 1 || !count(l.unitPriceCents) || !count(l.totalPriceCents) || !count(l.addedAt)) return null;
  const c = l.configuration as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object' || typeof c.options !== 'object' || c.options === null || typeof c.studio !== 'object' || c.studio === null) return null;
  return value as CartLine;
}

/** The cart in this browser's localStorage, shared by every tab. */
export function createLocalCart(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): CartService {
  const listeners = new Set<() => void>();
  let cache: readonly CartLine[] | null = null;
  const read = (): readonly CartLine[] => {
    if (cache) return cache;
    let lines: CartLine[] = [];
    try {
      const raw = storage?.getItem(CART_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as { format?: unknown; lines?: unknown }) : null;
      if (parsed?.format === CART_FORMAT && Array.isArray(parsed.lines)) lines = parsed.lines.map(readCartLine).filter((l): l is CartLine => l !== null);
    } catch {
      lines = [];
    }
    cache = lines;
    return lines;
  };
  const write = (lines: readonly CartLine[]) => {
    cache = lines;
    try {
      storage?.setItem(CART_STORAGE_KEY, JSON.stringify({ format: CART_FORMAT, lines }));
    } catch {
      /* storage full or blocked: the cart lasts for this visit */
    }
    for (const listener of listeners) listener();
  };
  if (typeof window !== 'undefined') {
    // Another tab changed the cart.
    window.addEventListener('storage', (event) => {
      if (event.key !== CART_STORAGE_KEY) return;
      cache = null;
      for (const listener of listeners) listener();
    });
  }
  return {
    lines: read,
    add(line) {
      const lines = read();
      if (lines.some((l) => l.lineId === line.lineId)) return 'already-in-cart';
      write([...lines, line]);
      return 'added';
    },
    remove(lineId) {
      write(read().filter((l) => l.lineId !== lineId));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let service: CartService | null = null;

export function cartService(): CartService {
  service ??= createLocalCart();
  return service;
}

export function setCartServiceForTests(next: CartService | null): void {
  service = next;
}

const NO_LINES: readonly CartLine[] = [];

/** The cart's lines, live (empty while pre-rendering). */
export function useCartLines(): readonly CartLine[] {
  return useSyncExternalStore(
    (listener) => cartService().subscribe(listener),
    () => cartService().lines(),
    () => NO_LINES,
  );
}
