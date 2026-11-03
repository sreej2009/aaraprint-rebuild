import { RefreshCcw, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { BrandLogo } from '@/design-system';
import { categories, categoryHref } from '@/lib/catalogue/navigation';
import { companyLinks, helpLinks, legalLinks, type SiteLink } from './links';

/** Evaluated once when the module loads (at build time for pre-rendered pages). */
const YEAR = new Date().getFullYear();

const promises = [
  { Icon: Wallet, title: 'Pay on delivery', text: 'No online payment needed' },
  { Icon: Truck, title: 'Free shipping over ₹1,999', text: 'Flat ₹99 below that' },
  { Icon: RefreshCcw, title: 'Free reprint if it’s wrong', text: 'Tell us within 7 days' },
  { Icon: ShieldCheck, title: 'Print-checked files', text: 'We review every design' },
];

function LinkColumn({ title, links }: { title: string; links: SiteLink[] }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-3">
      <h2 className="font-sans text-body-sm font-semibold text-fg">{title}</h2>
      <ul className="flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={`${link.href}-${link.label}`}>
            <Link to={link.href} className="text-body-sm text-fg-muted transition-colors hover:text-fg hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  const shopLinks = categories.map((c) => ({ label: c.name, href: categoryHref(c.slug) }));

  return (
    <footer className="mt-auto border-t border-border bg-surface-subtle">
      <div className="container-page">
        <ul className="grid grid-cols-1 gap-4 border-b border-border py-8 sm:grid-cols-2 lg:grid-cols-4">
          {promises.map(({ Icon, title, text }) => (
            <li key={title} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-accent-strong shadow-1">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-body-sm font-semibold text-fg">{title}</span>
                <span className="text-caption text-fg-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div className="flex max-w-xs flex-col gap-4">
            <BrandLogo className="h-10 w-fit" />
            <p className="text-body-sm text-fg-muted">
              Custom print and merchandise for businesses and celebrations — designed online, printed carefully and delivered across India.
            </p>
          </div>
          <LinkColumn title="Shop" links={shopLinks.slice(0, 6)} />
          <LinkColumn title="Help" links={helpLinks} />
          <LinkColumn title="Company" links={companyLinks} />
        </div>

        <div className="flex flex-col gap-3 border-t border-border py-6 text-caption text-fg-muted md:flex-row md:items-center md:justify-between">
          <p>© {YEAR} Aaraprint. All prices in Indian rupees.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link to={link.href} className="hover:text-fg hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
