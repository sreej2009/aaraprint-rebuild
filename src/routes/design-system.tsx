import { ButtonsDemo, FeedbackDemo, FormsDemo, NavigationDemo, OptionsDemo, OverlaysDemo } from '@/components/docs/component-demos';
import { ColorFoundations, LayoutFoundations, TypeFoundations } from '@/components/docs/foundations';
import { StudioCanvasSection } from '@/components/docs/studio-canvas-section';
import { PageHeader } from '@/design-system';
import { catalogueApi } from '@/lib/api/catalogue';
import { seo } from '@/lib/seo';
import type { Route } from './+types/design-system';

export const meta: Route.MetaFunction = () =>
  seo({ title: 'Design system', description: 'Aaraprint design tokens and components.', noindex: true });

/** Runs in the browser; demonstrates the catalogue API feeding real product data into components. */
export async function clientLoader() {
  const product = await catalogueApi.getProduct('business-card-classic').catch(() => null);
  return { product };
}

const sections = [
  { id: 'colour', label: 'Colour' },
  { id: 'typography', label: 'Typography' },
  { id: 'layout', label: 'Spacing & shape' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'forms', label: 'Form controls' },
  { id: 'options', label: 'Product options' },
  { id: 'feedback', label: 'Status & feedback' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'canvas-demo', label: 'Studio canvas' },
];

export default function DesignSystem({ loaderData }: Route.ComponentProps) {
  return (
    <div className="container-page py-8 md:py-12">
      <PageHeader
        eyebrow="Internal reference"
        title="Aaraprint design system"
        description="Tokens and components for the new storefront and Design Studio. Everything here is built from the tokens in src/styles/theme.css."
      />
      <div className="mt-10 grid gap-10 lg:grid-cols-[12rem_1fr]">
        <nav aria-label="Design system sections" className="hidden lg:block">
          <ul className="sticky top-[calc(var(--header-height)+1.5rem)] flex flex-col gap-1 border-l border-border">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-body-sm text-fg-muted transition-colors hover:border-border-hover hover:text-fg"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-14">
          <ColorFoundations />
          <TypeFoundations />
          <LayoutFoundations />
          <ButtonsDemo />
          <FormsDemo />
          <OptionsDemo product={loaderData.product} />
          <FeedbackDemo />
          <OverlaysDemo />
          <NavigationDemo />
          <StudioCanvasSection />
        </div>
      </div>
    </div>
  );
}
