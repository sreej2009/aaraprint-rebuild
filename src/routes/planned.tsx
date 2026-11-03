import { ArrowLeft, Construction, SearchX } from 'lucide-react';
import { Link, useMatches, useParams } from 'react-router';
import { Breadcrumbs, Button, Callout, EmptyState, PageHeader } from '@/design-system';
import { categories } from '@/lib/catalogue/navigation';
import { formatINR, pluralize } from '@/lib/format';
import { seo } from '@/lib/seo';
import type { Route } from './+types/planned';

/**
 * Placeholder for routes whose pages are built in later phases. Keeping the original URL
 * structure live now means links, bookmarks and the route map stay stable while we build.
 */
const PHASES: Record<number, string> = {
  2: 'Catalogue, product pages and content',
  6: 'Cart, checkout and accounts',
};

interface PlannedPage {
  title: string;
  description: string;
  phase: number;
}

const PAGES: Record<string, PlannedPage> = {
  product: { title: 'Product details', description: 'Options, live pricing, quantity tiers and the start of the design flow.', phase: 2 },
  search: { title: 'Search', description: 'Search with suggestions across the full catalogue, with filters and sorting.', phase: 2 },
  cart: { title: 'Your cart', description: 'Items with design previews, free-shipping progress and an order summary.', phase: 6 },
  checkout: { title: 'Checkout', description: 'Contact, delivery address with PIN-code lookup, pay on delivery and review.', phase: 6 },
  'track-order': { title: 'Track your order', description: 'Order status timeline, courier and tracking details.', phase: 6 },
  account: { title: 'Your account', description: 'Orders, saved designs, addresses and settings in one place.', phase: 6 },
  'account-orders': { title: 'Orders', description: 'Order history with status, invoices, cancellation and reorder.', phase: 6 },
  'account-designs': { title: 'Saved designs', description: 'Every design you have saved, ready to edit, duplicate or order.', phase: 6 },
  'account-addresses': { title: 'Addresses', description: 'Saved delivery addresses with a default.', phase: 6 },
  'account-settings': { title: 'Account settings', description: 'Name, contact details, password and account deletion.', phase: 6 },
  login: { title: 'Sign in', description: 'Email and password or Google sign-in, returning you to where you were.', phase: 6 },
  signup: { title: 'Create an account', description: 'Save designs, track orders and reorder faster.', phase: 6 },
  'forgot-password': { title: 'Reset your password', description: 'We’ll email you a link to choose a new password.', phase: 6 },
  about: { title: 'About Aaraprint', description: 'Who we are and how we print.', phase: 2 },
  contact: { title: 'Contact us', description: 'Support hours, bulk enquiries and grievance redressal.', phase: 2 },
  faq: { title: 'Frequently asked questions', description: 'Designing, ordering, delivery, cancellations and reprints.', phase: 2 },
  shipping: { title: 'Shipping & delivery', description: 'Delivery times, shipping charges and coverage across India.', phase: 2 },
  'refund-policy': { title: 'Returns, reprints & refunds', description: 'Cancellations, reprints for damaged or wrong items, and refunds.', phase: 2 },
  privacy: { title: 'Privacy policy', description: 'What we collect, why, and your rights under the DPDP Act, 2023.', phase: 2 },
  terms: { title: 'Terms of service', description: 'The terms for designing in the studio and ordering from us.', phase: 2 },
  credits: { title: 'Photo credits', description: 'Attribution for photography and 3D models used on the site.', phase: 2 },
};

function usePlannedPage() {
  const routeId = useMatches().at(-1)?.id ?? '';
  const { categorySlug } = useParams();
  if (routeId === 'category') {
    const category = categories.find((c) => c.slug === categorySlug);
    if (!category) return null;
    return {
      title: category.name,
      eyebrow:
        `${pluralize(category.productCount, 'product')}` + (category.fromPriceCents !== null ? ` · from ${formatINR(category.fromPriceCents)}` : ''),
      description: 'Product grid with filters generated from product options, sorting and quick view.',
      phase: 2,
    };
  }
  const page = PAGES[routeId];
  return page ? { ...page, eyebrow: undefined } : null;
}

export const meta: Route.MetaFunction = ({ matches, params, location }) => {
  const routeId = matches.at(-1)?.id ?? '';
  const category = routeId === 'category' ? categories.find((c) => c.slug === params.categorySlug) : undefined;
  const title = category?.name ?? PAGES[routeId]?.title ?? 'Page not found';
  return seo({ title, path: location.pathname, noindex: true });
};

export default function Planned() {
  const page = usePlannedPage();

  if (!page) {
    return (
      <div className="container-page grid flex-1 place-items-center py-16">
        <EmptyState
          headingLevel={1}
          icon={SearchX}
          title="We couldn’t find that category"
          description="It may have moved. Browse all categories from the home page."
          action={
            <Button asChild>
              <Link to="/#categories">See all categories</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page flex flex-col gap-8 py-8 md:py-12">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: page.title }]} />
      <PageHeader eyebrow={page.eyebrow} title={page.title} description={page.description} />
      <Callout tone="info" title={`Arriving in Phase ${page.phase}: ${PHASES[page.phase] ?? 'later phase'}`} className="max-w-reading">
        This address already works so links and bookmarks stay valid. The page itself is built in a later phase of the Aaraprint rebuild.
      </Callout>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="secondary">
          <Link to="/">
            <ArrowLeft aria-hidden="true" /> Back to home
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/design-system">
            <Construction aria-hidden="true" /> See the design system
          </Link>
        </Button>
      </div>
    </div>
  );
}
