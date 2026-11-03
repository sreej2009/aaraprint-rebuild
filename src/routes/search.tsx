import { ArrowRight, SearchX } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CategoryIcon, HeaderSearch } from '@/components/shell';
import { Button, EmptyState, Skeleton } from '@/design-system';
import { ListingView } from '@/features/catalogue/listing-view';
import { ProductCard } from '@/features/catalogue/product-card';
import { searchProducts } from '@/features/catalogue/search';
import { loadSearchIndex } from '@/features/catalogue/search-index';
import { categories, categoryHref } from '@/lib/catalogue/navigation';
import { seo } from '@/lib/seo';
import type { Route } from './+types/search';

/** Search runs in the browser over the catalogue summaries (not pre-rendered). */
export async function clientLoader() {
  return loadSearchIndex();
}

export function HydrateFallback() {
  return (
    <div className="container-page flex flex-col gap-6 py-10" aria-busy="true">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-11 w-full max-w-xl rounded-full" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-md" />
        ))}
      </div>
    </div>
  );
}

export const meta: Route.MetaFunction = ({ location }) => {
  const q = new URLSearchParams(location.search).get('q')?.trim();
  return seo({ title: q ? `Search results for “${q}”` : 'Search products', noindex: true });
};

export default function SearchPage({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const results = useMemo(() => (q ? searchProducts(loaderData.index, q) : []), [loaderData.index, q]);
  const bestsellers = useMemo(() => loaderData.products.filter((p) => p.isFeatured).slice(0, 8), [loaderData.products]);
  const searchField = <HeaderSearch key={q} className="max-w-xl" />;

  let idle: React.ReactNode = undefined;
  if (!q) {
    idle = <SearchIdle bestsellers={bestsellers} />;
  } else if (results.length === 0) {
    idle = (
      <EmptyState
        icon={SearchX}
        title={`No products match “${q}”`}
        description="Check the spelling, try a more general word such as “cards” or “bottle”, or browse a category."
        action={
          <Button asChild variant="secondary">
            <Link to="/categories/view-all">Browse all products</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ListingView
      title={q ? `Results for “${q}”` : 'Search products'}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Search' }]}
      products={results}
      groupParam="category"
      groupOptions={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      headerSlot={searchField}
      idleSlot={idle}
      ranked
    />
  );
}

function SearchIdle({ bestsellers }: { bestsellers: Route.ComponentProps['loaderData']['products'] }) {
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="browse-heading" className="flex flex-col gap-4">
        <h2 id="browse-heading" className="text-h3 font-semibold text-fg">
          Browse by category
        </h2>
        <ul className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                to={categoryHref(c.slug)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-body-sm font-medium text-fg hover:bg-surface-subtle"
              >
                <CategoryIcon slug={c.slug} className="size-4 text-accent-strong" />
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="popular-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="popular-heading" className="text-h3 font-semibold text-fg">
            Popular right now
          </h2>
          <Link to="/categories/view-all" className="inline-flex items-center gap-1 text-body-sm font-semibold text-accent-strong hover:underline">
            All products <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {bestsellers.map((p) => (
            <li key={p.slug}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
