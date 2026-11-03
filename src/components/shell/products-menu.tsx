import { ArrowRight, ChevronDown } from 'lucide-react';
import { NavigationMenu, Tabs } from 'radix-ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { catalogueApi } from '@/lib/api/catalogue';
import { categories, categoryHref } from '@/lib/catalogue/navigation';
import type { NavGroup } from '@/lib/catalogue/types';
import { cn } from '@/lib/cn';
import { formatINR, pluralize } from '@/lib/format';
import { CategoryIcon } from './category-icon';

const totalProducts = categories.reduce((sum, c) => sum + c.productCount, 0);

const navLinkClasses =
  'inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-body-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-subtle data-[state=open]:bg-surface-subtle';

/** Curated product groups per category, fetched once when the menu first opens. */
let navGroupsRequest: Promise<Map<string, NavGroup[]>> | null = null;
function loadNavGroups() {
  navGroupsRequest ??= catalogueApi
    .listCategories()
    .then((list) => new Map(list.map((c) => [c.slug, c.navGroups])))
    .catch(() => {
      navGroupsRequest = null;
      return new Map<string, NavGroup[]>();
    });
  return navGroupsRequest;
}

/**
 * Desktop mega-menu. Categories are a vertical tab list (arrow keys or hover switch them);
 * each panel shows the category's product types and its curated product groups.
 */
export function ProductsMenu() {
  const [active, setActive] = useState(categories[0]?.slug ?? '');
  const [navGroups, setNavGroups] = useState<Map<string, NavGroup[]> | null>(null);

  return (
    <NavigationMenu.Root
      aria-label="Main"
      className="hidden lg:block"
      onValueChange={(value) => {
        if (value && !navGroups) loadNavGroups().then(setNavGroups, () => {});
      }}
    >
      <NavigationMenu.List className="flex items-center gap-1">
        <NavigationMenu.Item value="products">
          <NavigationMenu.Trigger className={`group ${navLinkClasses}`} onPointerEnter={() => loadNavGroups().then(setNavGroups, () => {})}>
            Products
            <ChevronDown aria-hidden="true" className="size-4 text-fg-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="data-[motion^=from-]:animate-fade-in data-[motion^=to-]:animate-fade-out">
            <Tabs.Root value={active} onValueChange={setActive} orientation="vertical" className="container-page grid grid-cols-[17rem_1fr] gap-8 py-6">
              <Tabs.List aria-label="Categories" className="flex flex-col gap-0.5 border-r border-border pr-4">
                {categories.map((category) => (
                  <Tabs.Trigger
                    key={category.slug}
                    value={category.slug}
                    onPointerEnter={() => setActive(category.slug)}
                    className="flex items-center gap-3 rounded-md px-2.5 py-2 text-left text-body-sm font-medium text-fg transition-colors data-[state=active]:bg-accent-soft data-[state=active]:text-accent-strong hover:bg-surface-subtle"
                  >
                    <CategoryIcon slug={category.slug} className="size-4.5 shrink-0" />
                    <span className="truncate">{category.name}</span>
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              {categories.map((category) => {
                const groups = navGroups?.get(category.slug) ?? [];
                return (
                  <Tabs.Content key={category.slug} value={category.slug} className="flex min-w-0 flex-col gap-6 outline-none">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <p className="font-display text-h3 font-semibold text-fg">{category.name}</p>
                      <NavigationMenu.Link asChild>
                        <Link to={categoryHref(category.slug)} className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-accent-strong hover:underline">
                          View all {pluralize(category.productCount, 'product')}
                          {category.fromPriceCents !== null && <span className="font-normal text-fg-muted">· from {formatINR(category.fromPriceCents)}</span>}
                          <ArrowRight aria-hidden="true" className="size-4" />
                        </Link>
                      </NavigationMenu.Link>
                    </div>
                    {category.types.length > 1 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-caption font-semibold tracking-wide text-fg-muted uppercase">Shop by type</p>
                        <ul className="flex flex-wrap gap-2">
                          {category.types.map((type) => (
                            <li key={type.slug}>
                              <NavigationMenu.Link asChild>
                                <Link
                                  to={`${categoryHref(category.slug)}?type=${type.slug}`}
                                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-strong px-3.5 text-body-sm text-fg hover:border-accent hover:text-accent-strong"
                                >
                                  {type.name} <span className="text-caption text-fg-muted tabular-nums">{type.productCount}</span>
                                </Link>
                              </NavigationMenu.Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className={cn('grid grid-cols-3 gap-6', !navGroups && 'animate-pulse')}>
                      {groups.slice(0, 3).map((group) => (
                        <div key={group.id} className="flex flex-col gap-2">
                          <p className="text-caption font-semibold tracking-wide text-fg-muted uppercase">{group.name}</p>
                          <ul className="flex flex-col gap-1.5">
                            {group.items.slice(0, 6).map((item) => (
                              <li key={item.href}>
                                <NavigationMenu.Link asChild>
                                  <Link to={item.href} className="inline-flex items-center gap-1.5 text-body-sm text-fg hover:text-accent-strong hover:underline">
                                    {item.name}
                                    {item.isNew && <span className="rounded-full bg-accent-soft px-1.5 text-[0.6875rem] font-semibold text-accent-strong">New</span>}
                                  </Link>
                                </NavigationMenu.Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </Tabs.Content>
                );
              })}
            </Tabs.Root>
            <div className="border-t border-border">
              <div className="container-page flex items-center justify-between gap-4 py-3">
                <NavigationMenu.Link asChild>
                  <Link to="/categories/view-all" className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-accent-strong hover:underline">
                    Browse all {totalProducts} products <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </NavigationMenu.Link>
                <NavigationMenu.Link asChild>
                  <Link to="/contact" className="text-body-sm text-fg-muted hover:text-fg hover:underline">
                    Ordering 500+ units? Get volume pricing
                  </Link>
                </NavigationMenu.Link>
              </div>
            </div>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        <NavigationMenu.Item>
          <NavigationMenu.Link asChild>
            <Link to="/categories/view-all" className={navLinkClasses}>
              All products
            </Link>
          </NavigationMenu.Link>
        </NavigationMenu.Item>
        <NavigationMenu.Item>
          <NavigationMenu.Link asChild>
            <Link to="/contact" className={navLinkClasses}>
              Bulk orders
            </Link>
          </NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      {/* Full-width panel anchored to the sticky <header> (nearest positioned ancestor). */}
      <div className="absolute inset-x-0 top-full">
        <NavigationMenu.Viewport className="h-(--radix-navigation-menu-viewport-height) w-full overflow-hidden border-b border-border bg-surface shadow-2 transition-[height] duration-200 ease-standard data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      </div>
    </NavigationMenu.Root>
  );
}
