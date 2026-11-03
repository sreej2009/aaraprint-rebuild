import { useEffect, useState } from 'react';
import { data, isRouteErrorResponse, Link, useSearchParams, type ShouldRevalidateFunctionArgs } from 'react-router';
import { SearchX } from 'lucide-react';
import { Breadcrumbs, Button, EmptyState } from '@/design-system';
import { ProductCard } from '@/features/catalogue/product-card';
import { ProductDetails } from '@/features/product/product-details';
import { ProductGallery } from '@/features/product/product-gallery';
import { PurchasePanel } from '@/features/product/purchase-panel';
import { selectionForVariant } from '@/features/product/selection';
import { getCategories, getProduct, getProductSummaries } from '@/lib/catalogue/catalogue.server';
import { defaultSelection, type Selection } from '@/lib/pricing';
import { seo } from '@/lib/seo';
import type { Route } from './+types/product';

const RELATED_COUNT = 4;

export async function loader({ params }: Route.LoaderArgs) {
  const product = await getProduct(params.productSlug);
  if (!product) throw data('Product not found', { status: 404 });
  const [categories, summaries] = await Promise.all([getCategories(), getProductSummaries()]);
  const category = categories.find((c) => c.slug === product.categorySlug) ?? null;
  // Same type first, then the rest of the category; bestsellers before others.
  const related = summaries
    .filter((p) => p.categorySlug === product.categorySlug && p.slug !== product.slug)
    .sort((a, b) => Number(b.typeSlug === product.typeSlug) - Number(a.typeSlug === product.typeSlug) || Number(b.isFeatured) - Number(a.isFeatured))
    .slice(0, RELATED_COUNT);
  return { product, category: category ? { slug: category.slug, name: category.name } : null, related };
}

/** Option changes only update `?variantId=` — no need to reload the product. */
export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate;
}

export const meta: Route.MetaFunction = ({ loaderData, location }) => {
  if (!loaderData) return seo({ title: 'Product not found', noindex: true });
  const { product, category } = loaderData;
  const tags = seo({ title: product.name, description: `${product.shortDescription} From ₹${Math.round(product.fromPriceCents / 100)}.`, path: location.pathname });
  tags.push({
    'script:ld+json': {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description,
      category: category?.name,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'INR',
        lowPrice: (product.fromPriceCents / 100).toFixed(2),
        highPrice: (product.toPriceCents / 100).toFixed(2),
        offerCount: product.variants.length,
        availability: 'https://schema.org/InStock',
      },
    },
  });
  if (category) {
    tags.push({
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
          { '@type': 'ListItem', position: 2, name: category.name, item: `/categories/${category.slug}` },
          { '@type': 'ListItem', position: 3, name: product.name },
        ],
      },
    });
  }
  return tags;
};

export default function ProductPage({ loaderData }: Route.ComponentProps) {
  const { product, category, related } = loaderData;
  // Remount per product so selection state never leaks between products.
  return <ProductView key={product.slug} product={product} category={category} related={related} />;
}

function ProductView({ product, category, related }: Route.ComponentProps['loaderData']) {
  const [params, setParams] = useSearchParams();
  // Start from the default (matches the pre-rendered HTML), then apply a ?variantId= deep link.
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(product));
  const [sets, setSets] = useState(1);
  const linkedVariant = params.get('variantId');
  useEffect(() => {
    const linked = selectionForVariant(product, linkedVariant);
    if (linked) setSelection(linked);
    // Only on first load: later changes to ?variantId= come from this page itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeOption = (groupId: string, valueId: string) => {
    const next = { ...selection, [groupId]: valueId };
    setSelection(next);
    const variant = product.variants.find((v) => product.optionGroups.every((g) => v.optionValueIds.includes(next[g.id] ?? '')));
    const nextParams = new URLSearchParams(params);
    if (variant) nextParams.set('variantId', variant.id);
    setParams(nextParams, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="container-page flex flex-col gap-8 py-6 pb-28 md:py-10 lg:pb-10">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          ...(category ? [{ label: category.name, href: `/categories/${category.slug}` }] : []),
          { label: product.name },
        ]}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
        <div className="lg:sticky lg:top-[calc(var(--header-height)+1.5rem)]">
          <ProductGallery product={product} />
        </div>
        <PurchasePanel
          product={product}
          categoryName={category?.name ?? null}
          selection={selection}
          onSelectionChange={changeOption}
          sets={sets}
          onSetsChange={setSets}
        />
      </div>
      <ProductDetails product={product} />
      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="flex flex-col gap-5 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="related-heading" className="text-h2 font-bold text-fg">
              You may also like
            </h2>
            {category && (
              <Link to={`/categories/${category.slug}`} className="text-body-sm font-semibold text-accent-strong hover:underline">
                More in {category.name}
              </Link>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {related.map((item) => (
              <li key={item.slug}>
                <ProductCard product={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="container-page grid flex-1 place-items-center py-16">
      <EmptyState
        headingLevel={1}
        icon={SearchX}
        title={notFound ? 'We couldn’t find that product' : 'This product didn’t load'}
        description={notFound ? 'It may have been renamed or retired. Search the catalogue instead.' : 'Please try again in a moment.'}
        action={
          <Button asChild>
            <Link to="/categories/view-all">Browse all products</Link>
          </Button>
        }
      />
    </div>
  );
}
