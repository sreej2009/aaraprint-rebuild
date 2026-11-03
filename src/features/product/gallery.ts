import type { Product, ProductImage as ProductImageData } from '@/lib/catalogue/types';

/** Product photos first, then the Studio mockups (front / back), without duplicates. */
/** Polos share one Studio mockup in the original site (`/products/polo/*`). */
const POLO_MOCKUPS = { front: 'products/polo/front.png', back: 'products/polo/back.png' };

export function galleryImages(product: Pick<Product, 'name' | 'images' | 'print' | 'categorySlug'>): ProductImageData[] {
  const images: ProductImageData[] = [...product.images];
  const add = (src: string | null | undefined, side: string) => {
    if (src && !images.some((i) => i.src === src)) images.push({ kind: 'mockup', src, alt: `${product.name} — ${side}` });
  };
  const polo = product.categorySlug === 'custom-polo-t-shirts';
  add(product.print?.mockups.front ?? (polo ? POLO_MOCKUPS.front : null), 'front');
  add(product.print?.mockups.back ?? (polo ? POLO_MOCKUPS.back : null), 'back');
  return images;
}
