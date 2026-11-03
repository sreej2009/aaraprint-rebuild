/* oxlint-disable jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events --
   ARIA 1.2 combobox pattern: the listbox options are driven from the input via aria-activedescendant. */
import { Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Form, useNavigate, useSearchParams } from 'react-router';
import { Kbd } from '@/design-system';
import { suggest, type SearchIndex } from '@/features/catalogue/search';
import { loadSearchIndex } from '@/features/catalogue/search-index';
import { categoryHref } from '@/lib/catalogue/navigation';
import { cn } from '@/lib/cn';
import { formatINR } from '@/lib/format';

export interface HeaderSearchProps {
  className?: string;
  /** Focus the field when "/" is pressed outside a text field. */
  shortcut?: boolean;
  /** Called after submitting or choosing a suggestion (e.g. to close the mobile menu). */
  onSubmit?: () => void;
}

interface Option {
  id: string;
  href: string;
  label: string;
  detail: string;
  kind: 'category' | 'product' | 'all';
}

/**
 * Product search with suggestions (ARIA combobox). The search index loads the first time
 * the field is focused; submitting goes to /search?q=….
 */
export function HeaderSearch({ className, shortcut = false, onSubmit }: HeaderSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = `search${useId().replace(/:/g, '')}`;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [index, setIndex] = useState<SearchIndex | null>(null);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  const ensureIndex = () => {
    if (!index) loadSearchIndex().then((r) => setIndex(r.index), () => {});
  };

  const options = useMemo<Option[]>(() => {
    const q = value.trim();
    if (!index || q.length < 2) return [];
    const s = suggest(index, q);
    const list: Option[] = [
      ...s.categories.map((c) => ({ id: `c-${c.slug}`, href: categoryHref(c.slug), label: c.name, detail: 'Category', kind: 'category' as const })),
      ...s.products.map((p) => ({ id: `p-${p.slug}`, href: `/products/${p.slug}`, label: p.name, detail: `from ${formatINR(p.fromPriceCents)}`, kind: 'product' as const })),
    ];
    if (s.total > 0) list.push({ id: 'all', href: `/search?q=${encodeURIComponent(q)}`, label: `See all ${s.total} results for “${q}”`, detail: '', kind: 'all' });
    return list;
  }, [index, value]);

  const expanded = open && options.length > 0;
  const go = (href: string) => {
    setOpen(false);
    setActive(-1);
    onSubmit?.();
    navigate(href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = options.length;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count) {
      event.preventDefault();
      setOpen(true);
      // -1 means "focus stays on the typed text"
      if (event.key === 'ArrowDown') setActive((a) => (a >= count - 1 ? -1 : a + 1));
      else setActive((a) => (a <= -1 ? count - 1 : a - 1));
    } else if (event.key === 'Enter' && expanded && active >= 0) {
      event.preventDefault();
      go(options[active]!.href);
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  const optionId = (option: Option) => `${id}-${option.id}`;

  return (
    <search className={cn('relative block w-full', className)}>
      <Form
        method="get"
        action="/search"
        onSubmit={(event) => {
          if (!value.trim()) {
            event.preventDefault();
            return;
          }
          setOpen(false);
          onSubmit?.();
        }}
      >
        <label htmlFor={id} className="sr-only">
          Search products
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-fg-muted" />
        <input
          ref={inputRef}
          id={id}
          type="search"
          name="q"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? optionId(options[active]!) : undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
            ensureIndex();
          }}
          onFocus={() => {
            ensureIndex();
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Search visiting cards, mugs, banners…"
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 w-full rounded-full border border-border-strong bg-surface-subtle pr-12 pl-10 text-body text-fg transition-colors duration-150 placeholder:text-fg-muted hover:border-border-hover focus-visible:border-accent focus-visible:bg-surface focus-visible:outline-offset-0 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {shortcut && !value && (
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 lg:block">
            <Kbd>/</Kbd>
          </span>
        )}
      </Form>
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-50 mt-2 max-h-[min(28rem,70vh)] overflow-y-auto rounded-md border border-border bg-surface p-1.5 shadow-2"
      >
        {options.map((option, i) => (
          <li
            key={option.id}
            id={optionId(option)}
            role="option"
            aria-selected={i === active}
            // Keep focus in the input so the list stays open while clicking.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => go(option.href)}
            className={cn(
              'flex cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-body-sm',
              i === active ? 'bg-accent-soft text-fg' : 'text-fg hover:bg-surface-subtle',
              option.kind === 'all' && 'mt-1 border-t border-border font-semibold text-accent-strong',
            )}
          >
            <span className={cn('min-w-0 truncate', option.kind === 'category' && 'font-semibold')}>{option.label}</span>
            {option.detail && <span className="shrink-0 text-caption text-fg-muted tabular-nums">{option.detail}</span>}
          </li>
        ))}
      </ul>
    </search>
  );
}
