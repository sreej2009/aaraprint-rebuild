import { ArrowRight, ChevronDown } from 'lucide-react';
import { NavigationMenu } from 'radix-ui';
import { Link } from 'react-router';
import { categories, categoryHref } from '@/lib/catalogue/navigation';
import { formatINR, pluralize } from '@/lib/format';
import { CategoryIcon } from './category-icon';

const totalProducts = categories.reduce((sum, c) => sum + c.productCount, 0);

const navLinkClasses =
  'inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-body-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-subtle data-[state=open]:bg-surface-subtle';

/**
 * Desktop primary navigation. "Products" opens a full-width panel of categories.
 * Phase 2 extends it with sub-types, popular products and occasion collections.
 */
export function ProductsMenu() {
  return (
    <NavigationMenu.Root aria-label="Main" className="hidden lg:block">
      <NavigationMenu.List className="flex items-center gap-1">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className={`group ${navLinkClasses}`}>
            Products
            <ChevronDown aria-hidden="true" className="size-4 text-fg-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="data-[motion^=from-]:animate-fade-in data-[motion^=to-]:animate-fade-out">
            <div className="container-page grid gap-8 py-6 xl:grid-cols-[1fr_17rem]">
              <ul className="grid grid-cols-2 gap-1 xl:grid-cols-3">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <NavigationMenu.Link asChild>
                      <Link
                        to={categoryHref(category.slug)}
                        className="group/item flex items-center gap-3 rounded-md p-2.5 transition-colors duration-150 hover:bg-surface-subtle"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent-strong">
                          <CategoryIcon slug={category.slug} className="size-5" />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-body-sm font-semibold text-fg group-hover/item:text-accent-strong">{category.name}</span>
                          <span className="text-caption text-fg-muted">
                            {pluralize(category.productCount, 'product')}
                            {category.fromPriceCents !== null && ` · from ${formatINR(category.fromPriceCents)}`}
                          </span>
                        </span>
                      </Link>
                    </NavigationMenu.Link>
                  </li>
                ))}
              </ul>
              <div className="hidden flex-col justify-between gap-4 rounded-md bg-surface-subtle p-5 xl:flex">
                <div className="flex flex-col gap-1.5">
                  <p className="font-display text-h3 font-semibold text-fg">Ordering in bulk?</p>
                  <p className="text-body-sm text-fg-muted">Get volume pricing for 500+ units — uniforms, welcome kits, event merchandise.</p>
                </div>
                <NavigationMenu.Link asChild>
                  <Link to="/contact" className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-accent-strong hover:underline">
                    Talk to our team <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </NavigationMenu.Link>
              </div>
            </div>
            <div className="border-t border-border">
              <div className="container-page py-3">
                <NavigationMenu.Link asChild>
                  <Link to="/search" className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-accent-strong hover:underline">
                    Browse all {totalProducts} products <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </NavigationMenu.Link>
              </div>
            </div>
          </NavigationMenu.Content>
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
