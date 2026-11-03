import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';

export interface Crumb {
  label: string;
  /** Omit for the current page (always the last crumb). */
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-body-sm', className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-fg-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !last ? (
                <Link to={item.href} className="rounded-sm transition-colors hover:text-fg hover:underline hover:underline-offset-2">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn(last && 'font-medium text-fg')}>
                  {item.label}
                </span>
              )}
              {!last && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
