import { Search } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Form, useSearchParams } from 'react-router';
import { Kbd } from '@/design-system';
import { cn } from '@/lib/cn';

export interface HeaderSearchProps {
  className?: string;
  /** Focus the field when "/" is pressed outside a text field. */
  shortcut?: boolean;
  /** Called after submitting (e.g. to close the mobile menu). */
  onSubmit?: () => void;
}

/** Product search. Submits to /search?q=… ; autocomplete arrives with the catalogue (Phase 2). */
export function HeaderSearch({ className, shortcut = false, onSubmit }: HeaderSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = `search${useId().replace(/:/g, '')}`;
  const [params] = useSearchParams();

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  return (
    <search className={cn('relative block w-full', className)}>
      <Form method="get" action="/search" onSubmit={onSubmit}>
        <label htmlFor={id} className="sr-only">
          Search products
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-fg-muted" />
        <input
          ref={inputRef}
          id={id}
          type="search"
          name="q"
          defaultValue={params.get('q') ?? ''}
          placeholder="Search visiting cards, mugs, banners…"
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 w-full rounded-full border border-border-strong bg-surface-subtle pr-12 pl-10 text-body text-fg transition-colors duration-150 placeholder:text-fg-muted hover:border-border-hover focus-visible:border-accent focus-visible:bg-surface focus-visible:outline-offset-0 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {shortcut && (
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 lg:block">
            <Kbd>/</Kbd>
          </span>
        )}
      </Form>
    </search>
  );
}
