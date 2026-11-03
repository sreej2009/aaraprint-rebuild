import { useId, useState, type FormEvent } from 'react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { Button, Checkbox, Input } from '@/design-system';
import { setParam, toggleParam, type ListingQuery, type ListingResult } from './listing';

export interface FilterPanelProps {
  query: ListingQuery;
  result: ListingResult;
  params: URLSearchParams;
  onChange: (next: URLSearchParams) => void;
}

function Section({ value, title, children }: { value: string; title: string; children: React.ReactNode }) {
  return (
    <AccordionPrimitive.Item value={value} className="border-b border-border py-1">
      <AccordionPrimitive.Header asChild>
        <h3 className="font-sans">
          <AccordionPrimitive.Trigger className="group flex min-h-11 w-full items-center justify-between text-left text-body-sm font-semibold text-fg">
            {title}
            <ChevronDown aria-hidden="true" className="size-4 text-fg-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </AccordionPrimitive.Trigger>
        </h3>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="flex flex-col gap-3 pt-1 pb-4">{children}</div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}

/** Filters generated from the products' own option data (blueprint §6). Changes apply immediately. */
export function FilterPanel({ query, result, params, onChange }: FilterPanelProps) {
  const sections = ['show', 'price', ...result.optionFacets.map((f) => f.key)];
  return (
    <AccordionPrimitive.Root type="multiple" defaultValue={sections} className="flex flex-col">
      <Section value="show" title="Show">
        <Checkbox
          label="Bestsellers"
          checked={query.show.includes('bestsellers')}
          onCheckedChange={() => onChange(toggleParam(params, 'show', 'bestsellers'))}
        />
        <Checkbox label="New arrivals" checked={query.show.includes('new')} onCheckedChange={() => onChange(toggleParam(params, 'show', 'new'))} />
      </Section>
      <Section value="price" title="Starting price">
        <PriceFilter key={`${query.minRupees}-${query.maxRupees}`} query={query} result={result} params={params} onChange={onChange} />
      </Section>
      {result.optionFacets.map((facet) => (
        <Section key={facet.key} value={facet.key} title={facet.name}>
          {facet.values.map((value) => (
            <Checkbox
              key={value.value}
              label={
                <span className="flex items-baseline gap-1.5">
                  {value.label}
                  <span className="text-caption font-normal text-fg-muted tabular-nums">{value.count}</span>
                </span>
              }
              checked={query.options[facet.key]?.includes(value.value) ?? false}
              onCheckedChange={() => onChange(toggleParam(params, facet.key, value.value))}
            />
          ))}
        </Section>
      ))}
    </AccordionPrimitive.Root>
  );
}

function PriceFilter({ query, result, params, onChange }: FilterPanelProps) {
  const [min, setMin] = useState(query.minRupees?.toString() ?? '');
  const [max, setMax] = useState(query.maxRupees?.toString() ?? '');
  const id = `price${useId().replace(/:/g, '')}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onChange(setParam(setParam(params, 'min', min.trim() || null), 'max', max.trim() || null));
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Starting price">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-min`} className="text-caption text-fg-muted">
            Min (₹)
          </label>
          <Input id={`${id}-min`} inputMode="numeric" pattern="[0-9]*" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} placeholder={String(result.priceBounds?.minRupees ?? 0)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-max`} className="text-caption text-fg-muted">
            Max (₹)
          </label>
          <Input id={`${id}-max`} inputMode="numeric" pattern="[0-9]*" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} placeholder={String(result.priceBounds?.maxRupees ?? '')} />
        </div>
      </div>
      <Button type="submit" variant="secondary" size="sm">
        Apply price
      </Button>
    </form>
  );
}
