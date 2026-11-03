import { useState } from 'react';
import { ProductImage } from '@/features/catalogue/product-image';
import type { Product } from '@/lib/catalogue/types';
import { galleryImages } from './gallery';
import { cn } from '@/lib/cn';
import { mediaUrl } from '@/lib/media';

export function ProductGallery({ product }: { product: Pick<Product, 'name' | 'images' | 'print' | 'categorySlug'> }) {
  const images = galleryImages(product);
  const [active, setActive] = useState(0);
  const current = images[active] ?? null;

  return (
    <div className="flex flex-col gap-3">
      <ProductImage
        image={current}
        name={product.name}
        categorySlug={product.categorySlug}
        priority
        className="aspect-square w-full rounded-lg border border-border"
      />
      {images.length > 1 && (
        <ul aria-label="Product images" className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <li key={image.src} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={index === active}
                aria-label={`Show image ${index + 1} of ${images.length}${image.alt ? `: ${image.alt}` : ''}`}
                className={cn(
                  'block size-18 overflow-hidden rounded-md border-2 bg-surface-subtle transition-colors',
                  index === active ? 'border-accent' : 'border-transparent hover:border-border-hover',
                )}
              >
                <img
                  src={mediaUrl(image.src)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={cn('size-full', image.kind === 'stock' ? 'object-cover' : 'object-contain mix-blend-multiply')}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
