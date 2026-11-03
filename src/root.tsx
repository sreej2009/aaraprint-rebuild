import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import manropeLatinUrl from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url';
import { House, RefreshCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { BrandLogo, Button, EmptyState, Spinner, Toaster, TooltipProvider } from '@/design-system';
import { seo } from '@/lib/seo';
import type { Route } from './+types/root';
import '@/styles/app.css';

export const links: Route.LinksFunction = () => [
  { rel: 'preload', href: interLatinUrl, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
  { rel: 'preload', href: manropeLatinUrl, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
  { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
  { rel: 'icon', href: '/icon.png', type: 'image/png' },
  { rel: 'apple-touch-icon', href: '/apple-icon.png' },
];

export const meta: Route.MetaFunction = () => seo();

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-dvh flex-col">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  );
}

/** Rendered into the SPA fallback HTML and shown until the app hydrates (non-prerendered pages). */
export function HydrateFallback() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="h-8 border-b border-border bg-surface-subtle" />
      <div className="border-b border-border">
        <div className="container-page flex h-(--header-height) items-center">
          <BrandLogo className="h-8 md:h-9" />
        </div>
      </div>
      <div className="container-page grid flex-1 place-items-center py-24">
        <Spinner size="lg" label="Loading page" className="text-accent" />
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (import.meta.env.DEV && !notFound) console.error(error);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="border-b border-border">
        <div className="container-page flex h-(--header-height) items-center">
          <Link to="/" className="rounded-sm">
            <BrandLogo title="Aaraprint home" className="h-8 md:h-9" />
          </Link>
        </div>
      </div>
      <main id="main-content" className="container-page grid flex-1 place-items-center py-16">
        <EmptyState
          headingLevel={1}
          icon={notFound ? House : RefreshCcw}
          title={notFound ? 'We couldn’t find that page' : 'Something went wrong'}
          description={
            notFound
              ? 'The link may be out of date. Head back to the home page to find what you need.'
              : 'Please try again. If it keeps happening, contact us and we’ll sort it out.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {!notFound && (
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Try again
                </Button>
              )}
              <Button asChild>
                <Link to="/">Go to the home page</Link>
              </Button>
            </div>
          }
        />
      </main>
    </div>
  );
}
