import { useEffect, useState } from 'react';
import type { ResolvedPrice } from '@/features/product-workflow/pricing';
import type { DesignApproval } from '@/features/studio/persistence/records';
import type { DesignDocument } from '@/features/studio/schema/types';
import type { Product } from '@/lib/catalogue/types';
import { cartLineId, type CartLine } from './cart';

/**
 * The cart line for an approved design (Phase 4 M5), or why there can't be one. Everything comes
 * from the design as approved — the approval's version, variant, SKU and quantity, and the design's
 * configuration, which equals the approved one (the caller only offers Add to cart while the
 * approval is current). Nothing is copied or invented: no design, no id, no price.
 */
export function cartLineFor({
  product,
  document,
  approval,
  price,
  optionsLabel,
  now,
}: {
  product: Pick<Product, 'slug' | 'id' | 'name'>;
  document: DesignDocument;
  approval: DesignApproval;
  price: ResolvedPrice;
  optionsLabel: string;
  now: number;
}): { ok: true; line: CartLine } | { ok: false; reason: string } {
  if (price.status !== 'priced') return { ok: false, reason: 'These choices don’t match a product we make.' };
  if (!approval.sku || !approval.variantId || approval.sku !== price.sku || approval.variantId !== price.variantId || approval.quantity !== price.quantity) {
    return { ok: false, reason: 'Your choices changed since you approved the design. Review and approve it again.' };
  }
  return {
    ok: true,
    line: {
      lineId: cartLineId(document.id, approval.versionId),
      productSlug: product.slug,
      productId: product.id,
      productName: product.name,
      variantId: price.variantId,
      sku: price.sku,
      optionsLabel,
      quantity: price.quantity,
      unitPriceCents: price.unitPriceCents,
      totalPriceCents: price.totalPriceCents,
      configuration: structuredClone(document.product.configuration),
      design: { designId: document.id, versionId: approval.versionId, name: document.name, approvedAt: approval.approvedAt, fingerprint: approval.fingerprint },
      addedAt: now,
    },
  };
}

/**
 * The thumbnail kept with an approved version (made when it was approved), read from this
 * browser's designs. The saving code loads only when a thumbnail is needed; null until then, or
 * when there is none (no picture could be made, or storage isn't available).
 */
export function useApprovedThumbnail(versionId: string | null): string | null {
  const [thumbnail, setThumbnail] = useState<{ versionId: string; src: string | null } | null>(null);
  useEffect(() => {
    if (!versionId || typeof indexedDB === 'undefined') return;
    let live = true;
    void import('@/features/studio/persistence/repository')
      .then(({ browserRepository }) => browserRepository().getVersion(versionId))
      .then((version) => {
        if (live) setThumbnail({ versionId, src: typeof version?.thumbnail === 'string' && version.thumbnail.startsWith('data:image/png;base64,') ? version.thumbnail : null });
      })
      .catch(() => {
        if (live) setThumbnail({ versionId, src: null });
      });
    return () => {
      live = false;
    };
  }, [versionId]);
  return thumbnail?.versionId === versionId ? thumbnail.src : null;
}
