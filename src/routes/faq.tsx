import { Link } from 'react-router';
import { Accordion, AccordionItem, Breadcrumbs, Button, PageHeader } from '@/design-system';
import { getFaq } from '@/lib/content/content.server';
import { seo } from '@/lib/seo';
import type { Route } from './+types/faq';

export async function loader() {
  return { faq: await getFaq() };
}

export const meta: Route.MetaFunction = ({ loaderData, location }) => {
  const tags = seo({ title: 'Frequently asked questions', description: 'Answers about designing, ordering, delivery, cancellations and reprints.', path: location.pathname });
  if (loaderData) {
    tags.push({
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: loaderData.faq.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
      },
    });
  }
  return tags;
};

export default function Faq({ loaderData }: Route.ComponentProps) {
  return (
    <div className="container-page flex flex-col gap-8 py-6 md:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'FAQ' }]} />
      <PageHeader eyebrow="Help" title="Frequently asked questions" description="Quick answers about designing, ordering and delivery." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Accordion type="multiple" defaultValue={[loaderData.faq[0]?.question ?? '']} className="max-w-reading border-t border-border">
          {loaderData.faq.map((entry) => (
            <AccordionItem key={entry.question} value={entry.question} title={entry.question} headingLevel={2}>
              <p className="text-body text-fg-muted">{entry.answer}</p>
            </AccordionItem>
          ))}
        </Accordion>
        <aside aria-label="More help" className="flex h-fit flex-col gap-3 rounded-lg bg-surface-subtle p-5">
          <p className="font-display text-h3 font-semibold text-fg">Still need help?</p>
          <p className="text-body-sm text-fg-muted">Our team replies within one business day, Monday to Saturday.</p>
          <Button asChild variant="secondary">
            <Link to="/contact">Contact us</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
