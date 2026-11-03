import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { IconButton, Separator, Sheet, SheetContent, SheetTrigger } from '@/design-system';
import { categories, categoryHref } from '@/lib/catalogue/navigation';
import { formatCount } from '@/lib/format';
import { CategoryIcon } from './category-icon';
import { HeaderSearch } from './header-search';
import { helpLinks } from './links';

/** Phone and tablet navigation: a left sheet with search, categories and help links. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <IconButton label="Open menu" icon={<Menu />} tooltip={false} className="-ml-2 lg:hidden" />
      </SheetTrigger>
      <SheetContent side="left" title="Menu">
        <div className="flex flex-col gap-6 px-5 py-5">
          <HeaderSearch onSubmit={close} />
          <nav aria-label="Shop" className="flex flex-col gap-2">
            <h2 className="text-caption font-semibold tracking-wide text-fg-muted uppercase">Shop</h2>
            <ul className="-mx-2 flex flex-col">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    to={categoryHref(category.slug)}
                    onClick={close}
                    className="flex min-h-12 items-center gap-3 rounded-sm px-2 text-body font-medium text-fg hover:bg-surface-subtle"
                  >
                    <CategoryIcon slug={category.slug} className="size-5 text-fg-muted" />
                    <span className="flex-1">{category.name}</span>
                    <span className="text-caption text-fg-muted tabular-nums">{formatCount(category.productCount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Separator />
          <nav aria-label="Help" className="flex flex-col gap-2">
            <h2 className="text-caption font-semibold tracking-wide text-fg-muted uppercase">Help</h2>
            <ul className="-mx-2 flex flex-col">
              {helpLinks.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} onClick={close} className="flex min-h-11 items-center rounded-sm px-2 text-body text-fg hover:bg-surface-subtle">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/login" onClick={close} className="flex min-h-11 items-center rounded-sm px-2 text-body font-semibold text-accent-strong hover:bg-surface-subtle">
                  Sign in or create an account
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
