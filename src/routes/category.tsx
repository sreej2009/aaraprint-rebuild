import { data, isRouteErrorResponse, Link, type ShouldRevalidateFunctionArgs } from 'react-router';
import { SearchX } from 'lucide-react';
import { Button, EmptyState } from '@/design-system';
import { ListingView } from '@/features/catalogue/listing-view';
import { getCategories, getProductSummaries } from '@/lib/catalogue/catalogue.server';
import { formatINR, pluralize } from '@/lib/format';
import { seo } from '@/lib/seo';
import type { Route } from './+types/category';

const VIEW_ALL = 'view-all';

/** Runs at build time for every pre-rendered category page (and in the dev server). */
export async function loader({ params }: Route.LoaderArgs) {
  const [categories, summaries] = await Promise.all([getCategories(), getProductSummaries()]);
  if (params.categorySlug === VIEW_ALL) {
    return {
      title: 'All products',
      description: `Every product in the catalogue — ${pluralize(summaries.length, 'product')} across ${categories.length} categories, all customisable online.`,
      slug: VIEW_ALL,
      products: summaries,
      groupParam: 'category' as const,
      groupOptions: categories.map((c) => ({ slug: c.slug, name: c.name })),
      fromPriceCents: Math.min(...summaries.map((p) => p.fromPriceCents)),
    };
  }
  const category = categories.find((c) => c.slug === params.categorySlug);
  if (!category) throw data('Category not found', { status: 404 });
  return {
    title: category.name,
    description: category.description,
    slug: category.slug,
    products: summaries.filter((p) => p.categorySlug === category.slug),
    groupParam: 'type' as const,
    groupOptions: category.types.map((t) => ({ slug: t.slug, name: t.name })),
    fromPriceCents: category.fromPriceCents,
  };
}

/** Filters, sorting and pages are applied in the browser; only a new category needs new data. */
export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate;
}

export const meta: Route.MetaFunction = ({ loaderData, location }) => {
  if (!loaderData) return seo({ title: 'Category not found', noindex: true });
  const from = loaderData.fromPriceCents !== null ? ` From ${formatINR(loaderData.fromPriceCents)}.` : '';
  return seo({ title: loaderData.title, description: `${loaderData.description}${from}`, path: location.pathname });
};

export default function CategoryPage({ loaderData }: Route.ComponentProps) {
  return (
    <ListingView
      key={loaderData.slug}
      title={loaderData.title}
      description={loaderData.description}
      breadcrumbs={[{ label: 'Home', href: '/' }, ...(loaderData.slug === VIEW_ALL ? [] : [{ label: 'All products', href: `/categories/${VIEW_ALL}` }]), { label: loaderData.title }]}
      products={loaderData.products}
      groupParam={loaderData.groupParam}
      groupOptions={loaderData.groupOptions}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="container-page grid flex-1 place-items-center py-16">
      <EmptyState
        headingLevel={1}
        icon={SearchX}
        title={notFound ? 'We couldn’t find that category' : 'This page didn’t load'}
        description={notFound ? 'It may have moved. Browse every product instead.' : 'Please try again in a moment.'}
        action={
          <Button asChild>
            <Link to={`/categories/${VIEW_ALL}`}>See all products</Link>
          </Button>
        }
      />
    </div>
  );
}
