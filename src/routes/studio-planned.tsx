import { ArrowLeft, Layers, MousePointerClick, ScanEye, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { BrandLogo, Button, Callout } from '@/design-system';
import { seo } from '@/lib/seo';
import type { Route } from './+types/studio-planned';

export const meta: Route.MetaFunction = () => seo({ title: 'Design Studio', noindex: true });

const highlights = [
  { Icon: Sparkles, text: 'Templates, text, uploads, graphics, shapes and QR codes' },
  { Icon: MousePointerClick, text: 'Smart guides, snapping, multi-select and keyboard shortcuts' },
  { Icon: ScanEye, text: 'Print checks for safe zone, bleed and image resolution' },
  { Icon: Layers, text: 'Autosave, version history and 2D / 3D review before ordering' },
];

/** Full-screen route (no storefront chrome), matching the future Studio layout. */
export default function StudioPlanned() {
  const { productSlug } = useParams();
  return (
    <div className="flex min-h-dvh flex-col bg-surface-subtle">
      <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/products/${productSlug}`}>
            <ArrowLeft aria-hidden="true" /> Back to product
          </Link>
        </Button>
        <Link to="/" className="ml-auto rounded-sm">
          <BrandLogo title="Aaraprint home" className="h-7" />
        </Link>
      </header>
      <main id="main-content" className="grid flex-1 place-items-center px-4 py-12">
        <div className="flex w-full max-w-xl flex-col gap-6 rounded-lg border border-border bg-surface p-6 shadow-2 sm:p-8">
          <div className="flex flex-col gap-2">
            <p className="text-body-sm font-semibold text-accent-strong">Design Studio</p>
            <h1 className="text-h1 font-bold text-fg">A new studio is on its way</h1>
            <p className="text-body text-fg-muted">The editor is rebuilt across Phases 3 to 5. When it lands, you’ll design right here:</p>
          </div>
          <ul className="flex flex-col gap-3">
            {highlights.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-body-sm text-fg">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>
          <Callout tone="info">
            Product: <span className="font-semibold">{productSlug}</span>
          </Callout>
        </div>
      </main>
    </div>
  );
}
