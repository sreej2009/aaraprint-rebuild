import { data } from 'react-router';
import { InlineText, ProseBlocks } from '@/components/content/prose';
import { Breadcrumbs } from '@/design-system';
import { CONTENT_PAGES, getContentPage, type ContentSlug } from '@/lib/content/content.server';
import { seo } from '@/lib/seo';
import type { Route } from './+types/content-page';

/** Navigation labels and SEO titles (the imported headings are friendly taglines). */
const LABELS: Record<ContentSlug, { label: string; description: string }> = {
  about: { label: 'About Aaraprint', description: 'Why Aaraprint exists and how we print: live design, careful checks and print partners across India.' },
  shipping: { label: 'Shipping & delivery', description: 'Delivery times, shipping charges and reprints for Aaraprint orders across India.' },
  'refund-policy': { label: 'Returns, reprints & refunds', description: 'When you can cancel, what happens if an order arrives damaged, wrong or late, and how refunds work.' },
  privacy: { label: 'Privacy policy', description: 'What personal data Aaraprint collects, why, who we share it with and your rights under the DPDP Act, 2023.' },
  terms: { label: 'Terms of service', description: 'The terms for browsing, designing and ordering from Aaraprint.' },
};

export async function loader({ request }: Route.LoaderArgs) {
  // Pre-rendering also requests "<path>.data" for client navigation; strip that suffix.
  const slug = new URL(request.url).pathname.replace(/\.data$/, '').replace(/^\/|\/$/g, '') as ContentSlug;
  if (!CONTENT_PAGES.includes(slug)) throw data('Not found', { status: 404 });
  return { page: await getContentPage(slug), ...LABELS[slug] };
}

export const meta: Route.MetaFunction = ({ loaderData, location }) =>
  loaderData ? seo({ title: loaderData.label, description: loaderData.description, path: location.pathname }) : seo({ title: 'Page not found', noindex: true });

export default function ContentPage({ loaderData }: Route.ComponentProps) {
  const { page, label } = loaderData;
  const numbered = page.toc && page.sections.length > 2;
  return (
    <div className="container-page flex flex-col gap-8 py-6 md:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label }]} />
      <header className="flex max-w-reading flex-col gap-3">
        <p className="text-body-sm font-semibold text-accent-strong">{label}</p>
        <h1 className="text-h1 font-bold text-fg">{page.title}</h1>
        {page.intro.map((runs, i) => (
          <p key={i} className="text-lead text-fg-muted">
            <InlineText runs={runs} />
          </p>
        ))}
        {page.updated && (
          <p className="text-body-sm text-fg-muted">
            Last updated <time dateTime={page.updated.iso}>{page.updated.label}</time>
          </p>
        )}
      </header>

      {page.summary && (
        <section aria-labelledby="summary-heading" className="flex flex-col gap-4 rounded-lg bg-surface-subtle p-5 sm:p-6">
          <h2 id="summary-heading" className="text-h3 font-semibold text-fg">
            {page.summary.title}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {page.summary.items.map((item) => (
              <li key={item.title} className="flex flex-col gap-1 rounded-md border border-border bg-surface p-4">
                <p className="text-body-sm font-semibold text-fg">{item.title}</p>
                <p className="text-body-sm text-fg-muted">
                  <InlineText runs={item.text} />
                </p>
              </li>
            ))}
          </ul>
          {page.summary.note && (
            <p className="text-caption text-fg-muted">
              <InlineText runs={page.summary.note} />
            </p>
          )}
        </section>
      )}

      <div className={numbered ? 'grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]' : ''}>
        {numbered && (
          <nav aria-label="On this page" className="lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:self-start">
            <details className="rounded-md border border-border p-4 lg:hidden">
              <summary className="cursor-pointer text-body-sm font-semibold text-fg">On this page</summary>
              <TocList sections={page.sections} />
            </details>
            <div className="hidden lg:block">
              <p className="mb-2 text-caption font-semibold tracking-wide text-fg-muted uppercase">On this page</p>
              <TocList sections={page.sections} />
            </div>
          </nav>
        )}
        <div className="flex max-w-reading flex-col gap-10">
          {page.sections.map((section, i) => (
            <section key={section.id ?? i} id={section.id ?? undefined} aria-labelledby={section.title ? `${section.id}-title` : undefined} className="scroll-mt-28">
              {section.title && (
                <h2 id={`${section.id}-title`} className="mb-4 flex items-baseline gap-3 text-h2 font-bold text-fg">
                  {numbered && <span className="font-sans text-body-sm font-semibold text-fg-muted tabular-nums">{String(i + 1).padStart(2, '0')}</span>}
                  {section.title}
                </h2>
              )}
              <ProseBlocks blocks={section.blocks} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function TocList({ sections }: { sections: Route.ComponentProps['loaderData']['page']['sections'] }) {
  return (
    <ol className="mt-3 flex flex-col gap-1 lg:mt-0">
      {sections
        .filter((s) => s.id && s.title)
        .map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="flex gap-2 rounded-sm py-1.5 text-body-sm text-fg-muted hover:text-fg">
              <span className="text-fg-muted tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              {s.title}
            </a>
          </li>
        ))}
    </ol>
  );
}
