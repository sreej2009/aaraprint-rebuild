import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/cn';
import { pageWindow, setParam } from './listing';

const itemClasses =
  'inline-flex h-11 min-w-11 items-center justify-center whitespace-nowrap rounded-md px-3 text-body-sm font-medium transition-colors duration-150';

export function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  const { pathname, search } = useLocation();
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const params = setParam(new URLSearchParams(search), 'page', p === 1 ? null : String(p));
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ''}`;
  };
  return (
    <nav aria-label="Pages" className="flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link to={href(page - 1)} className={cn(itemClasses, 'gap-1 text-fg hover:bg-surface-subtle')} aria-label="Previous page">
          <ChevronLeft aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Previous</span>
        </Link>
      ) : null}
      <ul className="flex items-center gap-1">
        {pageWindow(page, pageCount).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-fg-muted">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                to={href(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={cn(itemClasses, p === page ? 'bg-accent text-fg-on-accent' : 'text-fg hover:bg-surface-subtle')}
              >
                {p}
              </Link>
            </li>
          ),
        )}
      </ul>
      {page < pageCount ? (
        <Link to={href(page + 1)} className={cn(itemClasses, 'gap-1 text-fg hover:bg-surface-subtle')} aria-label="Next page">
          <span className="hidden sm:inline">Next</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </nav>
  );
}
