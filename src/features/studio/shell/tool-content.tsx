import { Link } from 'react-router';
import { Button } from '@/design-system';
import { formatINR } from '@/lib/format';
import { BackgroundTool } from '../tools/background-tool';
import { GraphicsTool } from '../tools/graphics-tool';
import { ShapesTool } from '../tools/shapes-tool';
import { TemplatesTool } from '../tools/templates-tool';
import { TextTool } from '../tools/text-tool';
import { UploadsTool } from '../tools/uploads-tool';
import { useStudioSession } from './session-context';
import type { ToolDefinition } from './tools';

/** The body of a tool panel, shared by the docked panel, the tablet overlay and phone sheets. */
export function ToolContent({ tool }: { tool: ToolDefinition }) {
  if (tool.id === 'product') return <ProductDetails />;
  if (tool.id === 'help') return <PrintTips />;
  if (tool.id === 'text') return <TextTool />;
  if (tool.id === 'shapes') return <ShapesTool />;
  if (tool.id === 'graphics') return <GraphicsTool />;
  if (tool.id === 'background') return <BackgroundTool />;
  if (tool.id === 'uploads') return <UploadsTool />;
  if (tool.id === 'templates') return <TemplatesTool />;
  return <ComingSoonTool tool={tool} />;
}

function ComingSoonTool({ tool }: { tool: ToolDefinition }) {
  const Icon = tool.icon;
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border-strong/60 bg-surface-subtle px-5 py-8 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent-strong">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="text-body-sm font-semibold text-fg">Coming soon</p>
      <p className="text-caption text-fg-muted">We’re building this part of the Studio now.</p>
    </div>
  );
}

function Facts({ rows }: { rows: [string, string | null][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
      {rows
        .filter((row): row is [string, string] => row[1] !== null)
        .map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-fg-muted">{term}</dt>
            <dd className="text-right font-medium text-fg tabular-nums">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function ProductDetails() {
  const { product, variant, variantLabel, print, productHref } = useStudioSession();
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="studio-product-heading" className="flex flex-col gap-3">
        <h3 id="studio-product-heading" className="text-body-sm font-semibold text-fg">
          {product.name}
        </h3>
        <Facts
          rows={[
            ['Options', variantLabel || null],
            ['Price', variant ? formatINR(variant.priceCents) : null],
          ]}
        />
        {variant && <p className="text-caption break-all text-fg-muted">SKU {variant.sku}</p>}
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link to={productHref}>Change options</Link>
        </Button>
      </section>
      <section aria-labelledby="studio-print-heading" className="flex flex-col gap-3">
        <h3 id="studio-print-heading" className="text-body-sm font-semibold text-fg">
          Print size
        </h3>
        <Facts
          rows={[
            ['Finished size', print.finishedSize],
            ['Artwork with bleed', print.withBleed],
            ['Bleed', print.bleed && `${print.bleed} each side`],
            ['Safe area', print.safeZone && `${print.safeZone} from the edge`],
            ['Resolution', print.dpi],
            ['Shape', print.shape],
            ['Sides', print.sides],
          ]}
        />
      </section>
    </div>
  );
}

function PrintTips() {
  const { print } = useStudioSession();
  const tips = [
    print.safeZone && { title: 'Keep it inside the safe area', body: `Put text and logos at least ${print.safeZone} from the edge. Cutting can drift slightly.`, swatch: 'border-guide-safe border-dashed' },
    print.bleed && { title: 'Run backgrounds into the bleed', body: `Colours and photos should go ${print.bleed} past the edge, so no white line shows after trimming.`, swatch: 'border-guide-bleed' },
    { title: 'Use sharp images', body: `Images look best at ${print.dpi} at their printed size. The Studio will warn you about blurry ones.`, swatch: 'border-guide-trim' },
  ].filter((tip): tip is { title: string; body: string; swatch: string } => Boolean(tip));
  return (
    <ul className="flex flex-col gap-4">
      {tips.map((tip) => (
        <li key={tip.title} className="flex gap-3">
          <span aria-hidden="true" className={`mt-1 size-4 shrink-0 rounded-sm border-2 ${tip.swatch}`} />
          <div className="flex flex-col gap-0.5">
            <p className="text-body-sm font-semibold text-fg">{tip.title}</p>
            <p className="text-body-sm text-fg-muted">{tip.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
