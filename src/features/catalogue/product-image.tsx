import { CategoryIcon } from '@/components/shell/category-icon';
import type { ProductImage as ProductImageData } from '@/lib/catalogue/types';
import { cn } from '@/lib/cn';
import { hasMedia, mediaUrl } from '@/lib/media';

export interface ProductImageProps {
  image: ProductImageData | null;
  /** Used for the alt text and the placeholder. */
  name: string;
  categorySlug: string | null;
  /** Load immediately (above the fold) instead of lazily. */
  priority?: boolean;
  className?: string;
}

/**
 * Product picture on a soft background. Mockups and photos sit on a light background,
 * so they are contained and multiplied into the surface; stock photos fill the frame.
 * Products without a picture get a calm placeholder instead of an empty box.
 */
export function ProductImage({ image, name, categorySlug, priority = false, className }: ProductImageProps) {
  if (!image || !hasMedia(image.src)) {
    return (
      <div className={cn('grid place-items-center bg-surface-subtle text-fg-subtle', className)} aria-hidden="true">
        <CategoryIcon slug={categorySlug ?? ''} className="size-10" />
        <span className="sr-only">Photo coming soon</span>
      </div>
    );
  }
  const stock = image.kind === 'stock';
  return (
    <div className={cn('overflow-hidden bg-surface-subtle', className)}>
      <img
        src={mediaUrl(image.src)}
        alt={image.alt || name}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={cn('size-full', stock ? 'object-cover' : 'object-contain mix-blend-multiply')}
      />
    </div>
  );
}
