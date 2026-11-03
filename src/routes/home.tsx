import { ArrowRight, CircleCheck, ImagePlus, Palette, PenTool, Truck, Type, Upload } from 'lucide-react';
import { Link } from 'react-router';
import { CategoryIcon, HeaderSearch } from '@/components/shell';
import { Badge, Button, Card } from '@/design-system';
import { ProductCard } from '@/features/catalogue/product-card';
import { getProductSummaries } from '@/lib/catalogue/catalogue.server';
import { categories, categoryHref } from '@/lib/catalogue/navigation';
import { formatINR, pluralize } from '@/lib/format';
import { seo } from '@/lib/seo';
import type { Route } from './+types/home';

export const meta: Route.MetaFunction = () => seo({ path: '/' });

/** Bestsellers with real product imagery, chosen at build time. */
export async function loader() {
  const summaries = await getProductSummaries();
  const seen = new Set<string>();
  const bestsellers = summaries
    .filter((p) => p.isFeatured && p.image && p.image.kind !== 'stock')
    .filter((p) => (seen.has(p.categorySlug ?? '') ? false : (seen.add(p.categorySlug ?? ''), true)))
    .slice(0, 8);
  return { bestsellers };
}

const totalProducts = categories.reduce((sum, c) => sum + c.productCount, 0);

const steps = [
  { Icon: PenTool, title: 'Choose a product', text: 'Pick from visiting cards, stationery, signage, apparel, drinkware and gifts.' },
  { Icon: Upload, title: 'Design or upload', text: 'Start from a template, design in the browser, or upload a print-ready file.' },
  { Icon: Truck, title: 'We print and deliver', text: 'Every file is checked before printing. Pay on delivery anywhere in India.' },
];

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <section className="border-b border-border bg-linear-to-b from-surface to-surface-subtle">
        <div className="container-page grid items-center gap-12 py-12 md:py-16 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div className="flex flex-col gap-6">
            <Badge tone="accent" className="w-fit">
              {pluralize(totalProducts, 'product')} · designed online
            </Badge>
            <h1 className="text-display font-bold text-fg">Custom printing for your brand and big days</h1>
            <p className="max-w-xl text-lead text-fg-muted">
              Design visiting cards, apparel, mugs and signage in your browser, see exactly what will print, and pay when it arrives.
            </p>
            <HeaderSearch className="max-w-xl [&_input]:h-13 [&_input]:bg-surface [&_input]:shadow-1" />
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href="#categories">
                  Browse products <ArrowRight aria-hidden="true" />
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/contact">Bulk & business orders</Link>
              </Button>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm text-fg-muted">
              {['Pay on delivery', 'Free shipping over ₹1,999', 'Free reprint if it’s wrong'].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <CircleCheck aria-hidden="true" className="size-4 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <StudioPreview />
        </div>
      </section>

      <section id="categories" aria-labelledby="categories-heading" className="container-page scroll-mt-28 py-14 md:py-20">
        <div className="mb-8 flex flex-col gap-2">
          <h2 id="categories-heading" className="text-h2 font-bold text-fg">
            Shop by category
          </h2>
          <p className="text-body text-fg-muted">Eleven ranges, every product customisable in the Design Studio.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map((category) => (
            <li key={category.slug}>
              <Card interactive padding="none" className="h-full">
                <Link to={categoryHref(category.slug)} className="group flex h-full items-center gap-4 rounded-md p-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-strong transition-colors group-hover:bg-accent group-hover:text-fg-on-accent">
                    <CategoryIcon slug={category.slug} className="size-6" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-body-sm font-semibold text-fg">{category.name}</span>
                    <span className="text-caption text-fg-muted">
                      {pluralize(category.productCount, 'product')}
                      {category.fromPriceCents !== null && ` · from ${formatINR(category.fromPriceCents)}`}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent-strong" />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {loaderData.bestsellers.length > 0 && (
        <section aria-labelledby="bestsellers-heading" className="border-t border-border">
          <div className="container-page py-14 md:py-20">
            <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex flex-col gap-2">
                <h2 id="bestsellers-heading" className="text-h2 font-bold text-fg">
                  Bestsellers
                </h2>
                <p className="text-body text-fg-muted">Popular picks from across the catalogue.</p>
              </div>
              <Link to="/categories/view-all?show=bestsellers" className="inline-flex items-center gap-1 text-body-sm font-semibold text-accent-strong hover:underline">
                All bestsellers <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
              {loaderData.bestsellers.map((product) => (
                <li key={product.slug}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="how-heading" className="border-t border-border bg-surface-subtle">
        <div className="container-page py-14 md:py-20">
          <h2 id="how-heading" className="mb-8 text-h2 font-bold text-fg">
            How it works
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map(({ Icon, title, text }, index) => (
              <li key={title} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-6">
                <span className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-accent text-fg-on-accent">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="text-caption font-semibold text-fg-muted">Step {index + 1}</span>
                </span>
                <h3 className="text-h3 font-semibold text-fg">{title}</h3>
                <p className="text-body-sm text-fg-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

/** Decorative illustration of the Design Studio editing a visiting card (pure CSS, no imagery). */
function StudioPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-xl select-none">
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface p-4 shadow-3 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-border-strong/40" />
            <span className="size-2.5 rounded-full bg-border-strong/40" />
            <span className="size-2.5 rounded-full bg-border-strong/40" />
          </div>
          <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-caption font-semibold text-success-strong">● Saved</span>
        </div>
        <div className="grid place-items-center rounded-md bg-surface-subtle bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-[length:16px_16px] px-4 py-10 sm:py-14">
          <div className="relative aspect-[1.75] w-full max-w-sm rounded-[6px] bg-surface p-[7%] shadow-2">
            <div className="pointer-events-none absolute inset-[5%] rounded-[3px] border border-dashed border-guide-safe/60" />
            <div className="flex h-full flex-col justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-[5px] bg-accent font-display text-[0.7rem] font-bold text-fg-on-accent">RS</span>
                <span className="font-display text-[0.7rem] font-bold tracking-wide text-fg">ROOTS STUDIO</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="relative w-fit font-display text-body font-bold text-fg">
                  Riya Sharma
                  <span className="absolute -inset-x-1.5 -inset-y-1 rounded-[3px] border-[1.5px] border-accent" />
                  <span className="absolute -top-1.5 -left-2.5 size-2 rounded-[2px] border-[1.5px] border-accent bg-surface" />
                  <span className="absolute -right-2.5 -bottom-1.5 size-2 rounded-[2px] border-[1.5px] border-accent bg-surface" />
                  {/* Contextual toolbar floating above the selected text */}
                  <span className="absolute bottom-full left-0 mb-3 flex items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-2">
                    {[Type, Palette, ImagePlus].map((Icon, i) => (
                      <span key={i} className="grid size-7 place-items-center rounded-full text-fg first:bg-accent-soft first:text-accent-strong">
                        <Icon className="size-3.5" />
                      </span>
                    ))}
                  </span>
                </span>
                <span className="text-[0.65rem] text-fg-muted">Brand designer · +91 98450 12345</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -left-2 hidden rounded-md border border-border bg-surface px-4 py-3 shadow-2 sm:block">
        <p className="text-caption text-fg-muted">Classic visiting cards</p>
        <p className="text-body-sm font-semibold text-fg tabular-nums">
          250 cards · {formatINR(37900)} <span className="font-normal text-fg-muted">({formatINR(152)} each)</span>
        </p>
      </div>
      <div className="absolute -top-4 -right-2 hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-caption font-semibold text-success-strong shadow-2 sm:flex">
        <CircleCheck className="size-4" /> Text inside safe zone
      </div>
    </div>
  );
}
