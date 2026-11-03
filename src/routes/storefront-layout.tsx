import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { SiteFooter, SiteHeader, SkipLink, UtilityBar } from '@/components/shell';

/** Header, footer and main landmark shared by every storefront page. */
export default function StorefrontLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname, hash } = useLocation();
  const firstRender = useRef(true);

  // After client-side navigation, move focus to the new page so screen readers announce it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!hash) mainRef.current?.focus({ preventScroll: true });
  }, [pathname, hash]);

  return (
    <>
      <SkipLink />
      <UtilityBar />
      <SiteHeader />
      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
