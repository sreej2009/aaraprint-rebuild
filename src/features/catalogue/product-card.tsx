import { Link } from 'react-router';
import { Badge } from '@/design-system';
import type { ProductSummary } from '@/lib/catalogue/types';
import { cn } from '@/lib/cn';
import { formatINR } from '@/lib/format';
import { productHref } from './links';
import { ProductImage } from './product-image';

export interface ProductCardProps {
  product: ProductSummary;
  priority?: boolean;
  className?: string;
}

/** Whole card is one link; badges and price follow the name for a clean reading order. */
export function ProductCard({ product, priority, className }: ProductCardProps) {
  return (
    <article className={cn('group relative flex h-full flex-col', className)}>
      <ProductImage
        image={product.image}
        name={product.name}
        categorySlug={product.categorySlug}
        priority={priority}
        className="aspect-[4/5] rounded-md border border-border transition-shadow duration-150 group-hover:shadow-2"
      />
      <div className="flex flex-1 flex-col gap-1 pt-3">
        <h3 className="font-sans text-body-sm font-semibold text-fg">
          <Link to={productHref(product.slug)} className="after:absolute after:inset-0 after:rounded-md after:content-[''] group-hover:text-accent-strong">
            {product.name}
          </Link>
        </h3>
        <p className="line-clamp-2 text-caption text-fg-muted">{product.shortDescription}</p>
        <p className="mt-auto pt-1 text-body-sm text-fg">
          <span className="text-fg-muted">from </span>
          <span className="font-semibold tabular-nums">{formatINR(product.fromPriceCents)}</span>
        </p>
      </div>
      {(product.isFeatured || product.isNew) && (
        <div className="pointer-events-none absolute top-2.5 left-2.5 flex gap-1.5">
          {product.isFeatured && <Badge tone="neutral" className="bg-surface/95 shadow-1">Bestseller</Badge>}
          {product.isNew && <Badge tone="accent" className="shadow-1">New</Badge>}
        </div>
      )}
    </article>
  );
}
