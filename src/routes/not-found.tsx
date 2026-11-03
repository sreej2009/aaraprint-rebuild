import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { HeaderSearch } from '@/components/shell';
import { Button, EmptyState } from '@/design-system';
import { seo } from '@/lib/seo';
import type { Route } from './+types/not-found';

export const meta: Route.MetaFunction = () => seo({ title: 'Page not found', noindex: true });

export default function NotFound() {
  return (
    <div className="container-page grid flex-1 place-items-center py-16">
      <EmptyState
        headingLevel={1}
        icon={SearchX}
        title="We couldn’t find that page"
        description="The link may be out of date. Search for a product or start again from the home page."
        action={
          <div className="flex w-full max-w-sm flex-col items-center gap-4">
            <HeaderSearch />
            <Button asChild variant="secondary">
              <Link to="/">Go to the home page</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
