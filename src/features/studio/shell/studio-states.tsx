import { ArrowLeft, PackageCheck, RefreshCcw, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BrandLogo, Button, EmptyState, Skeleton, Spinner } from '@/design-system';

/** Minimal full-screen frame for Studio states that have no editor: logo and a way back. */
function StudioFrame({ backHref, children }: { backHref: string | null; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-subtle">
      <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4">
        {backHref && (
          <Button asChild variant="ghost" size="sm">
            <Link to={backHref}>
              <ArrowLeft aria-hidden="true" /> Back to product
            </Link>
          </Button>
        )}
        <Link to="/" className="ml-auto rounded-sm">
          <BrandLogo title="Aaraprint home" className="h-7" />
        </Link>
      </header>
      <main id="main-content" className="grid flex-1 place-items-center px-4 py-12">
        <div className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-1">{children}</div>
      </main>
    </div>
  );
}

/** Shown while the product and its print profile load. Same outline as the editor, so nothing jumps. */
export function StudioLoading() {
  return (
    <div className="flex h-dvh flex-col bg-surface-subtle">
      <div className="flex h-13 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 md:h-14">
        <Skeleton className="size-9 rounded-md" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-9 w-28 rounded-md" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-18 border-r border-border bg-surface md:block" />
        <main id="main-content" className="grid flex-1 place-items-center bg-surface-sunken">
          <h1 className="sr-only">Opening the Design Studio</h1>
          <Spinner size="lg" label="Opening the Design Studio" className="text-accent" />
        </main>
      </div>
    </div>
  );
}

/** The one product printed as shown (no artwork), or any product without a Studio profile. */
export function StudioUnsupported({ productName, productHref }: { productName: string; productHref: string }) {
  return (
    <StudioFrame backHref={productHref}>
      <EmptyState
        headingLevel={1}
        icon={PackageCheck}
        title="This product doesn’t need a design"
        description={`${productName} is printed or made as shown, so there’s nothing to design. You can choose options and order it from the product page.`}
        action={
          <Button asChild>
            <Link to={productHref}>Go to the product</Link>
          </Button>
        }
      />
    </StudioFrame>
  );
}

export function StudioNotFound() {
  return (
    <StudioFrame backHref={null}>
      <EmptyState
        headingLevel={1}
        icon={SearchX}
        title="We couldn’t find that product"
        description="It may have been renamed or retired. Browse the catalogue to pick something to design."
        action={
          <Button asChild>
            <Link to="/categories/view-all">Browse all products</Link>
          </Button>
        }
      />
    </StudioFrame>
  );
}

export function StudioLoadError({ productHref }: { productHref: string | null }) {
  return (
    <StudioFrame backHref={productHref}>
      <EmptyState
        headingLevel={1}
        icon={RefreshCcw}
        title="The Design Studio didn’t load"
        description="Check your connection and try again."
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    </StudioFrame>
  );
}
