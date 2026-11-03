import { Search, ShoppingBag, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { BrandLogo, buttonClasses } from '@/design-system';
import { cn } from '@/lib/cn';
import { HeaderSearch } from './header-search';
import { MobileNav } from './mobile-nav';
import { ProductsMenu } from './products-menu';

const actionClasses =
  'inline-flex h-11 items-center gap-2 rounded-full px-3 text-body-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-subtle';

export function SiteHeader() {
  // Cart contents arrive with the cart in Phase 6.
  const cartCount: number = 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-md supports-[backdrop-filter]:bg-surface/85">
      <div className="container-page flex h-(--header-height) items-center gap-2 md:gap-4">
        <MobileNav />
        <Link to="/" className="mr-1 shrink-0 rounded-sm lg:mr-3">
          <BrandLogo title="Aaraprint home" className="h-8 md:h-9" />
        </Link>
        <ProductsMenu />
        <HeaderSearch shortcut className="mx-auto hidden max-w-xl md:block" />
        <div className="ml-auto flex items-center gap-0.5 md:ml-0">
          <Link to="/search" aria-label="Search products" className={cn(buttonClasses({ variant: 'ghost' }), 'size-11 px-0 md:hidden')}>
            <Search aria-hidden="true" className="size-5" />
          </Link>
          <Link to="/login" className={actionClasses}>
            <UserRound aria-hidden="true" className="size-5" />
            <span className="hidden xl:inline">Sign in</span>
            <span className="sr-only xl:hidden">Sign in</span>
          </Link>
          <Link to="/cart" className={`${actionClasses} relative`} aria-label={`Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}>
            <ShoppingBag aria-hidden="true" className="size-5" />
            <span aria-hidden="true" className="hidden xl:inline">
              Cart
            </span>
            {cartCount > 0 && (
              <span aria-hidden="true" className="absolute top-1 right-0.5 grid min-w-4.5 place-items-center rounded-full bg-accent px-1 text-[0.6875rem] leading-[1.125rem] font-semibold text-fg-on-accent">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
