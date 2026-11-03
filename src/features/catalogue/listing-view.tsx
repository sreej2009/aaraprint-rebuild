import { PackageSearch, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Breadcrumbs, Button, EmptyState, NativeSelect, Sheet, SheetContent, SheetTrigger, type Crumb } from '@/design-system';
import type { ProductSummary } from '@/lib/catalogue/types';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/lib/use-hydrated';
import { formatINR, pluralize } from '@/lib/format';
import { FilterPanel } from './filter-panel';
import { applyListing, clearFilters, PAGE_SIZE, parseListingQuery, setParam, SORT_OPTIONS, toggleParam, type GroupOption } from './listing';
import { Pagination } from './pagination';
import { ProductCard } from './product-card';

export interface ListingViewProps {
  title: string;
  description?: ReactNode;
  breadcrumbs: Crumb[];
  products: ProductSummary[];
  /** "type" on category pages, "category" on all-products and search pages. */
  groupParam: 'type' | 'category';
  groupOptions: GroupOption[];
  /** Shown above the results, e.g. the search field. */
  headerSlot?: ReactNode;
  /** Shown instead of the grid when there is nothing to list yet (e.g. empty search). */
  idleSlot?: ReactNode;
  /** Products arrive ranked (search): keep that order for "Recommended". */
  ranked?: boolean;
}

/** Category, all-products and search results: chips, filters, sort, grid and pagination. */
export function ListingView({ title, description, breadcrumbs, products, groupParam, groupOptions, headerSlot, idleSlot, ranked = false }: ListingViewProps) {
  const [urlParams, setParams] = useSearchParams();
  // Pre-rendered HTML is the unfiltered page; apply the URL's filters right after hydration.
  const hydrated = useHydrated();
  const params = useMemo(() => (hydrated ? urlParams : new URLSearchParams()), [hydrated, urlParams]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useMemo(() => parseListingQuery(params, groupParam), [params, groupParam]);
  const result = useMemo(
    () => applyListing(products, query, { groupField: groupParam === 'type' ? 'typeSlug' : 'categorySlug', groupOptions, preserveOrder: ranked }),
    [products, query, groupParam, groupOptions, ranked],
  );
  const update = (next: URLSearchParams) => setParams(next, { preventScrollReset: true });
  const first = (result.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(result.page * PAGE_SIZE, result.total);

  const filterPanel = <FilterPanel query={query} result={result} params={params} onChange={update} />;
  const optionLabel = (key: string, value: string) =>
    result.optionFacets.find((f) => f.key === key)?.values.find((v) => v.value === value)?.label ?? value;
  const activeChips: { label: string; next: URLSearchParams }[] = [
    ...query.show.map((s) => ({ label: s === 'new' ? 'New arrivals' : 'Bestsellers', next: toggleParam(params, 'show', s) })),
    ...(query.minRupees !== null ? [{ label: `From ${formatINR(query.minRupees * 100)}`, next: setParam(params, 'min', null) }] : []),
    ...(query.maxRupees !== null ? [{ label: `Up to ${formatINR(query.maxRupees * 100)}`, next: setParam(params, 'max', null) }] : []),
    ...Object.entries(query.options).flatMap(([key, values]) =>
      result.optionFacets.some((f) => f.key === key) ? values.map((value) => ({ label: optionLabel(key, value), next: toggleParam(params, key, value) })) : [],
    ),
  ];

  const groupHref = (value: string | null) => {
    const next = setParam(params, groupParam, value);
    const qs = next.toString();
    return qs ? `?${qs}` : '?';
  };

  return (
    <div className="container-page flex flex-col gap-6 py-6 md:py-10">
      <Breadcrumbs items={breadcrumbs} />
      <header className="flex flex-col gap-2">
        <h1 className="text-h1 font-bold text-fg">{title}</h1>
        {description && <p className="max-w-reading text-body text-fg-muted">{description}</p>}
      </header>
      {headerSlot}

      {idleSlot ?? (
        <>
          {result.groupFacet.length > 1 && (
            <nav aria-label={groupParam === 'type' ? 'Product types' : 'Categories'} className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)]">
              <ul className="flex w-max gap-2 pb-1">
                <li>
                  <GroupChip href={groupHref(null)} active={query.groups.length === 0}>
                    All
                  </GroupChip>
                </li>
                {result.groupFacet.map((group) => (
                  <li key={group.value}>
                    <GroupChip href={groupHref(query.groups.includes(group.value) ? null : group.value)} active={query.groups.includes(group.value)}>
                      {group.label} <span className="tabular-nums opacity-70">{group.count}</span>
                    </GroupChip>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
            <aside aria-label="Filters" className="hidden lg:block">
              <h2 className="sr-only">Filters</h2>
              {filterPanel}
            </aside>

            <section aria-labelledby="results-heading" className="flex min-w-0 flex-col gap-5">
              <h2 id="results-heading" className="sr-only">
                Products
              </h2>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-body-sm text-fg-muted" aria-live="polite">
                  {result.total === 0 ? 'No products' : `Showing ${first}–${last} of ${pluralize(result.total, 'product')}`}
                </p>
                <div className="flex items-center gap-2">
                  <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <SheetTrigger asChild>
                      <Button variant="secondary" size="sm" className="lg:hidden">
                        <SlidersHorizontal aria-hidden="true" /> Filters
                        {result.activeFilterCount > 0 && (
                          <span className="grid min-w-5 place-items-center rounded-full bg-accent px-1 text-caption text-fg-on-accent">{result.activeFilterCount}</span>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="bottom"
                      title="Filters"
                      footer={
                        <Button fullWidth onClick={() => setFiltersOpen(false)}>
                          Show {pluralize(result.total, 'product')}
                        </Button>
                      }
                    >
                      <div className="px-5">{filterPanel}</div>
                    </SheetContent>
                  </Sheet>
                  <label className="flex items-center gap-2 text-body-sm text-fg-muted">
                    <span className="hidden sm:inline">Sort by</span>
                    <NativeSelect
                      aria-label="Sort products"
                      value={query.sort}
                      onChange={(e) => update(setParam(params, 'sort', e.target.value === 'recommended' ? null : e.target.value))}
                      className="w-48 [&_select]:h-9 [&_select]:text-body-sm"
                    >
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                </div>
              </div>

              {activeChips.length > 0 && (
                <ul aria-label="Active filters" className="flex flex-wrap gap-2">
                  {activeChips.map((chip) => (
                    <li key={chip.label}>
                      <button
                        type="button"
                        onClick={() => update(chip.next)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-caption font-medium text-fg hover:bg-surface-subtle"
                        aria-label={`Remove filter: ${chip.label}`}
                      >
                        {chip.label}
                        <X aria-hidden="true" className="size-3.5" />
                      </button>
                    </li>
                  ))}
                  <li>
                    <button type="button" onClick={() => update(clearFilters(params))} className="h-8 px-2 text-caption font-semibold text-accent-strong hover:underline">
                      Clear all
                    </button>
                  </li>
                </ul>
              )}

              {result.total === 0 ? (
                <EmptyState
                  icon={PackageSearch}
                  title="No products match these filters"
                  description="Try removing a filter or widening the price range."
                  action={
                    <Button variant="secondary" onClick={() => update(clearFilters(params))}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-4">
                  {result.items.map((product, index) => (
                    <li key={product.slug}>
                      <ProductCard product={product} priority={index < 4} />
                    </li>
                  ))}
                </ul>
              )}
              <Pagination page={result.page} pageCount={result.pageCount} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function GroupChip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={href}
      preventScrollReset
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-body-sm font-medium whitespace-nowrap transition-colors duration-150',
        active ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border-strong bg-surface text-fg hover:bg-surface-subtle',
      )}
    >
      {children}
    </Link>
  );
}
