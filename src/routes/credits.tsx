import { Breadcrumbs, PageHeader } from '@/design-system';
import { getCredits } from '@/lib/content/content.server';
import { seo } from '@/lib/seo';
import type { Route } from './+types/credits';

export async function loader() {
  return { credits: await getCredits() };
}

export const meta: Route.MetaFunction = ({ location }) => seo({ title: 'Photo and model credits', path: location.pathname });

const linkClasses = 'font-medium text-accent-strong underline decoration-accent-strong/30 underline-offset-2 hover:decoration-accent-strong';

export default function Credits({ loaderData }: Route.ComponentProps) {
  return (
    <div className="container-page flex flex-col gap-8 py-6 md:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Credits' }]} />
      <PageHeader title="Photo and model credits" description="Some product photography is used under the Unsplash licence. Thank you to the photographers and 3D artists below." />
      <section aria-labelledby="models-heading" className="flex max-w-reading flex-col gap-2">
        <h2 id="models-heading" className="text-h3 font-semibold text-fg">
          3D models
        </h2>
        <p className="text-body-sm text-fg-muted">
          “POLO SHIRT” by arvintriyoga, licensed{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" className={linkClasses} target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
          .
        </p>
      </section>
      <section aria-labelledby="photos-heading" className="flex flex-col gap-4">
        <h2 id="photos-heading" className="text-h3 font-semibold text-fg">
          Photography ({loaderData.credits.length})
        </h2>
        <ul className="grid gap-x-8 gap-y-3 text-body-sm sm:grid-cols-2 lg:grid-cols-3">
          {loaderData.credits.map((credit) => (
            <li key={`${credit.subject}-${credit.sourceUrl}`} className="flex flex-col border-b border-border pb-3">
              <span className="font-medium text-fg">{credit.subject}</span>
              <span className="text-fg-muted">
                Photo by{' '}
                {credit.authorUrl ? (
                  <a href={credit.authorUrl} className={linkClasses} target="_blank" rel="noreferrer">
                    {credit.author}
                  </a>
                ) : (
                  credit.author
                )}{' '}
                on Unsplash
                {credit.sourceUrl && (
                  <>
                    {' · '}
                    <a href={credit.sourceUrl} className={linkClasses} target="_blank" rel="noreferrer">
                      source<span className="sr-only"> for {credit.subject}</span>
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
