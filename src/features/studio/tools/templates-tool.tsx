import { Ban, ChevronDown, ChevronLeft, CircleCheck, LayoutTemplate, Scaling, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, Dialog, DialogClose, DialogContent, Spinner } from '@/design-system';
import { cn } from '@/lib/cn';
import { graphicById, useGraphicsLibrary } from '../assets/graphics';
import { finishedSizeMm } from '../geometry/boxes';
import { roundTo } from '../geometry/units';
import { selectActiveSurface, useStudio, useStudioStoreApi } from '../store';
import { describeContents, isSurfaceEmpty } from '../shell/side-rules';
import { useStudioSession } from '../shell/session-context';
import { useStudioUi } from '../shell/ui-context';
import { templateTargets } from '../templates/apply';
import { templateFit, type FitLevel, type TemplateFit } from '../templates/compat';
import { filterTemplates, loadTemplates, useTemplateRegistry } from '../templates/registry';
import { TemplatePreview } from '../templates/template-preview';
import { isTwoSided, templateGraphicIds, TEMPLATE_CATEGORIES, type StudioTemplate, type TemplateCategory } from '../templates/types';
import type { SurfaceDesign } from '../schema/types';

/**
 * The Templates tool (Plan M13): search and filter the template catalogue, see whether each one
 * suits this product, open one for a closer look, and apply it to this side (or both sides) as
 * one undo step. A side that already has artwork asks first: replace it, add on top, or cancel.
 * Previews are static SVGs (templates/template-preview.tsx), never live canvases.
 */
export function TemplatesTool() {
  const registry = useTemplateRegistry();
  const graphics = useGraphicsLibrary();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  /** The card to focus when coming back from a template's details. */
  const [returnTo, setReturnTo] = useState<string | null>(null);

  if (registry.status === 'loading') {
    return (
      <output className="flex items-center gap-3 py-6 text-body-sm text-fg-muted">
        <Spinner size="sm" /> Loading templates…
      </output>
    );
  }
  if (registry.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-md bg-surface-subtle p-4" role="alert">
        <p className="text-body-sm font-semibold text-fg">Templates couldn’t be loaded</p>
        <p className="text-caption text-fg-muted">Check your connection and try again. Your design is safe.</p>
        <Button variant="secondary" size="sm" onClick={() => loadTemplates({ retry: true })}>
          Try again
        </Button>
      </div>
    );
  }

  // Only templates whose graphics are all in the approved library (M9 rights) are offered.
  const templates = registry.catalogue.templates.filter((t) => templateGraphicIds(t).every((id) => graphicById(graphics, id)));
  const graphicUrl = (id: string) => graphicById(graphics, id)?.url ?? null;
  const open = openId ? templates.find((t) => t.id === openId) : undefined;

  if (open) {
    return (
      <TemplateDetails
        template={open}
        graphicUrl={graphicUrl}
        onBack={() => {
          setReturnTo(open.id);
          setOpenId(null);
        }}
      />
    );
  }
  return (
    <TemplateBrowser
      templates={templates}
      graphicUrl={graphicUrl}
      query={query}
      onQuery={setQuery}
      category={category}
      onCategory={setCategory}
      showOthers={showOthers}
      onShowOthers={setShowOthers}
      returnTo={returnTo}
      onReturned={() => setReturnTo(null)}
      onOpen={(id) => setOpenId(id)}
    />
  );
}

// ------------------------------------------------------------------ Browser

interface BrowserProps {
  templates: StudioTemplate[];
  graphicUrl: (id: string) => string | null;
  query: string;
  onQuery(query: string): void;
  category: TemplateCategory | null;
  onCategory(category: TemplateCategory | null): void;
  showOthers: boolean;
  onShowOthers(show: boolean): void;
  returnTo: string | null;
  onReturned(): void;
  onOpen(id: string): void;
}

const FIT_ORDER: Record<FitLevel, number> = { exact: 0, adapted: 1, none: 2 };

function TemplateBrowser({ templates, graphicUrl, query, onQuery, category, onCategory, showOthers, onShowOthers, returnTo, onReturned, onOpen }: BrowserProps) {
  const { profile } = useStudioSession();
  // Only the side's print size (the same object between edits), so editing never redraws the previews.
  const print = useStudio((s) => selectActiveSurface(s)?.print ?? null);
  const searchId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const categories = TEMPLATE_CATEGORIES.filter((c) => templates.some((t) => t.category === c));
  const results = filterTemplates(templates, query, category)
    .map((template) => ({ template, fit: print ? templateFit(template, profile.family, print) : ({ level: 'none', label: 'No side to design' } as TemplateFit) }))
    .sort((a, b) => FIT_ORDER[a.fit.level] - FIT_ORDER[b.fit.level]);
  const fitting = results.filter((r) => r.fit.level !== 'none');
  const others = results.filter((r) => r.fit.level === 'none');
  const filtered = Boolean(query.trim() || category);

  // Back from a template's details: focus returns to its card (opening "other products" if it's there).
  const returnsToOther = Boolean(returnTo && others.some((r) => r.template.id === returnTo));
  useEffect(() => {
    if (!returnTo) return;
    if (returnsToOther && !showOthers) {
      onShowOthers(true);
      return;
    }
    listRef.current?.querySelector<HTMLElement>(`[data-template-id="${CSS.escape(returnTo)}"]`)?.focus();
    onReturned();
  }, [returnTo, returnsToOther, showOthers, onShowOthers, onReturned]);

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border-strong/60 bg-surface-subtle px-5 py-8 text-center" data-testid="templates-empty">
        <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent-strong">
          <LayoutTemplate aria-hidden="true" className="size-5" />
        </span>
        <p className="text-body-sm font-semibold text-fg">No templates are available yet.</p>
        <p className="text-caption text-fg-muted">Build your design with text, shapes and your own images.</p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex flex-col gap-4">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search templates
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
        <input
          id={searchId}
          type="search"
          value={query}
          placeholder="Search templates"
          autoComplete="off"
          onChange={(event) => onQuery(event.currentTarget.value)}
          className="h-10 w-full rounded-sm border border-border-strong bg-surface pr-9 pl-9 text-body-sm text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-offset-0 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onQuery('')}
            className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-sm text-fg-muted hover:bg-surface-subtle"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>

      {categories.length > 1 && (
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
          <legend className="sr-only">Template categories</legend>
          {[null, ...categories].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              aria-pressed={category === c}
              onClick={() => onCategory(c)}
              className={cn(
                'h-8 rounded-full border px-3 text-caption font-medium transition-colors pointer-coarse:h-10',
                category === c ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border-strong bg-surface text-fg-muted hover:border-border-hover hover:text-fg',
              )}
            >
              {c ?? 'All'}
            </button>
          ))}
        </fieldset>
      )}

      <p aria-live="polite" className="sr-only">
        {filtered ? `${results.length} ${results.length === 1 ? 'template' : 'templates'} found, ${fitting.length} for this product` : ''}
      </p>

      {results.length === 0 ? (
        <div className="flex flex-col items-start gap-2" data-testid="templates-no-results">
          <p className="text-body-sm text-fg-muted">No templates match your search.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onQuery('');
              onCategory(null);
            }}
          >
            Clear search and filters
          </Button>
        </div>
      ) : (
        <>
          <section aria-labelledby="templates-fitting" className="flex flex-col gap-2">
            <h3 id="templates-fitting" className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
              For this product
            </h3>
            {fitting.length === 0 ? (
              <p className="text-body-sm text-fg-muted" data-testid="templates-none-fit">
                {filtered ? 'None of the matching templates fit this product.' : 'No templates fit this product’s size and shape yet. Build your design with text, shapes and your own images.'}
              </p>
            ) : (
              <TemplateGrid items={fitting} graphicUrl={graphicUrl} onOpen={onOpen} />
            )}
          </section>
          {others.length > 0 && (
            <section aria-labelledby="templates-others" className="flex flex-col gap-2">
              <h3 id="templates-others">
                <button
                  type="button"
                  aria-expanded={showOthers}
                  onClick={() => onShowOthers(!showOthers)}
                  className="flex w-full items-center justify-between gap-2 rounded-sm py-1 text-caption font-semibold tracking-wide text-fg-muted uppercase hover:text-fg"
                >
                  Made for other products ({others.length})
                  <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', showOthers && 'rotate-180')} />
                </button>
              </h3>
              {showOthers && <TemplateGrid items={others} graphicUrl={graphicUrl} onOpen={onOpen} />}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TemplateGrid({ items, graphicUrl, onOpen }: { items: { template: StudioTemplate; fit: TemplateFit }[]; graphicUrl: (id: string) => string | null; onOpen(id: string): void }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {items.map(({ template, fit }) => (
        <li key={template.id}>
          <TemplateCard template={template} fit={fit} graphicUrl={graphicUrl} onOpen={() => onOpen(template.id)} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The card's accessible name is exactly what it shows (name, "2 sides", "Fitted" / "Other
 * product"), then the details: "Minimal centred 2 sides. Business. Fits this product."
 */
function cardName(template: StudioTemplate, fit: TemplateFit): string {
  const lead = isTwoSided(template) ? `${template.name} 2 sides` : template.name;
  if (fit.level === 'exact') return `${lead}. ${template.category}. ${fit.label}.`;
  if (fit.level === 'adapted') return `${lead} ${fit.label}. ${template.category}.`;
  return `${lead} Other product: ${fit.label}. ${template.category}.`;
}

function TemplateCard({ template, fit, graphicUrl, onOpen }: { template: StudioTemplate; fit: TemplateFit; graphicUrl: (id: string) => string | null; onOpen(): void }) {
  const twoSided = isTwoSided(template);
  // The preview sits outside the button (its sample text isn't the button's label); the button
  // stretches over the whole card, so the card is one target.
  return (
    <div
      className={cn(
        'relative flex w-full flex-col gap-1.5 rounded-md border border-border bg-surface p-1.5 transition-colors hover:border-accent has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-accent',
        fit.level === 'none' && 'bg-surface-subtle',
      )}
    >
      <div aria-hidden="true" className={cn('grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-sm bg-surface-subtle p-2', fit.level === 'none' && 'opacity-60')}>
        <TemplatePreview surface={template.surfaces.front} graphicUrl={graphicUrl} className="max-h-full max-w-full drop-shadow-sm" />
      </div>
      <button
        type="button"
        data-template-id={template.id}
        data-fit={fit.level}
        onClick={onOpen}
        aria-label={cardName(template, fit)}
        className="flex flex-col gap-1.5 text-left outline-none after:absolute after:inset-0 after:rounded-md after:content-['']"
      >
        <span className="truncate px-0.5 text-caption font-medium text-fg">{template.name}</span>{' '}
        <span className="flex flex-wrap items-center gap-1 px-0.5 text-[0.6875rem] leading-4 text-fg-muted">
          {twoSided && <span className="rounded-sm bg-surface-subtle px-1 font-medium">2 sides</span>}{' '}
          {fit.level === 'adapted' && (
            <span className="inline-flex items-center gap-0.5">
              <Scaling aria-hidden="true" className="size-3" /> Fitted
            </span>
          )}
          {fit.level === 'none' && (
            <span className="inline-flex items-center gap-0.5">
              <Ban aria-hidden="true" className="size-3" /> Other product
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ Details

type Scope = 'side' | 'both';

function TemplateDetails({ template, graphicUrl, onBack }: { template: StudioTemplate; graphicUrl: (id: string) => string | null; onBack(): void }) {
  const studio = useStudioStoreApi();
  const { profile } = useStudioSession();
  const { layout, openTool } = useStudioUi();
  const print = useStudio((s) => selectActiveSurface(s)?.print ?? null);
  const activeLabel = useStudio((s) => selectActiveSurface(s)?.label ?? null);
  const surfaceIds = useStudio((s) => s.document.surfaces.map((x) => x.id).join(' '));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState<{ scope: Scope; busy: SurfaceDesign[] } | null>(null);
  /** The Apply button that asked, so focus goes back to it when the question closes. */
  const asker = useRef<HTMLElement | null>(null);

  useEffect(() => headingRef.current?.focus(), [template.id]);

  const fit = print ? templateFit(template, profile.family, print) : null;
  const twoSided = isTwoSided(template);
  const ids = surfaceIds.split(' ');
  const sideLabel = ids.length > 1 ? (activeLabel?.toLowerCase() ?? 'side') : 'design';
  const canBoth = twoSided && ids.includes('front') && ids.includes('back');
  const usable = Boolean(fit && fit.level !== 'none');
  const made = finishedSizeMm(template.surfaces.front.print);

  const apply = (scope: Scope, mode: 'replace' | 'add') => {
    setPending(null);
    if (!studio.getState().actions.applyTemplate(template, scope, mode)) return;
    if (layout === 'phone' || layout === 'tablet') openTool(null);
  };

  const request = (scope: Scope) => {
    asker.current = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
    const state = studio.getState();
    const targets = templateTargets(template, state.document, state.editor.activeSurfaceId, scope);
    const busy = targets.map((t) => state.document.surfaces.find((s) => s.id === t.surfaceId)).filter((s): s is SurfaceDesign => Boolean(s && !isSurfaceEmpty(s)));
    if (busy.length > 0) setPending({ scope, busy });
    else apply(scope, 'replace');
  };

  const target = pending?.scope === 'both' ? 'both sides' : `the ${sideLabel}`;
  const short = pending?.scope === 'both' ? 'both sides' : sideLabel;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex items-center gap-1 self-start rounded-sm px-1 py-0.5 text-body-sm font-medium text-accent-strong hover:bg-surface-subtle pointer-coarse:min-h-11"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> All templates
      </button>

      <div className="flex flex-col gap-1">
        <h3 ref={headingRef} tabIndex={-1} className="text-body font-semibold text-fg outline-none">
          {template.name}
        </h3>
        <p className="text-caption text-fg-muted">
          {template.category}
          {template.tags.length > 0 &&
            ` · ${template.tags
              .filter((t) => t !== 'two-sided')
              .slice(0, 3)
              .join(', ')}`}
        </p>
      </div>

      <div className={cn('grid gap-2', twoSided ? 'grid-cols-2' : 'grid-cols-1')}>
        {(['front', 'back'] as const).map((side) => {
          const s = template.surfaces[side];
          if (!s) return null;
          return (
            <figure key={side} className="flex flex-col gap-1">
              <div className="grid aspect-[4/3] place-items-center rounded-md bg-surface-subtle p-3">
                <TemplatePreview surface={s} label={`${template.name}, ${side} preview`} graphicUrl={graphicUrl} className="max-h-full max-w-full drop-shadow" />
              </div>
              {twoSided && <figcaption className="text-center text-caption text-fg-muted">{side === 'front' ? 'Front' : 'Back'}</figcaption>}
            </figure>
          );
        })}
      </div>

      {template.description && <p className="text-body-sm text-fg">{template.description}</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm">
        <dt className="text-fg-muted">Sides</dt>
        <dd className="text-right text-fg">{twoSided ? 'Front and back' : 'One side'}</dd>
        <dt className="text-fg-muted">Made for</dt>
        <dd className="text-right text-fg tabular-nums">
          {roundTo(made.width, 1)} × {roundTo(made.height, 1)} mm
        </dd>
      </dl>

      {fit && <FitStatus fit={fit} />}

      {usable && (
        <div className="flex flex-col gap-2">
          {canBoth ? (
            <>
              <Button onClick={() => request('both')} className="pointer-coarse:h-11">
                Apply to both sides
              </Button>
              <Button variant="secondary" onClick={() => request('side')} className="pointer-coarse:h-11">
                Apply to {sideLabel} only
              </Button>
            </>
          ) : (
            <Button onClick={() => request('side')} className="pointer-coarse:h-11">
              Apply to {sideLabel}
            </Button>
          )}
          <p className="text-caption text-fg-muted">Everything stays editable. You can undo this.</p>
        </div>
      )}

      <Dialog open={Boolean(pending)} onOpenChange={(isOpen) => !isOpen && setPending(null)}>
        {pending && (
          <DialogContent
            size="md"
            onCloseAutoFocus={(event) => {
              if (!asker.current?.isConnected) return;
              event.preventDefault();
              asker.current.focus();
            }}
            title={`Replace what’s on ${target}?`}
            description={`${pending.busy.map((s) => `The ${s.label.toLowerCase()} has ${describeContents(s)}`).join('. ')}. Replace ${pending.busy.length > 1 ? 'them' : 'it'} with “${template.name}”, or add the template on top. You can undo this.`}
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <Button variant="secondary" onClick={() => apply(pending.scope, 'add')}>
                  Add to {short}
                </Button>
                <Button onClick={() => apply(pending.scope, 'replace')}>Replace {short}</Button>
              </>
            }
          />
        )}
      </Dialog>
    </div>
  );
}

function FitStatus({ fit }: { fit: TemplateFit }) {
  const Icon = fit.level === 'exact' ? CircleCheck : fit.level === 'adapted' ? Scaling : Ban;
  const detail =
    fit.level === 'exact'
      ? 'Laid out for this size: everything lands where it was designed.'
      : fit.level === 'adapted'
        ? 'Scaled to fit this product’s safe area. Check the layout after applying.'
        : 'It can’t be applied here.';
  return (
    <div
      data-testid="template-fit"
      data-fit={fit.level}
      className={cn(
        'flex items-start gap-2 rounded-md p-3 text-body-sm',
        fit.level === 'exact' ? 'bg-success-soft text-success-strong' : fit.level === 'adapted' ? 'bg-accent-soft text-accent-strong' : 'bg-surface-subtle text-fg',
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        <span className="font-semibold">{fit.level === 'none' ? `Not for this product. ${fit.label}.` : `${fit.label}.`}</span>{' '}
        <span className={cn(fit.level === 'none' && 'text-fg-muted')}>{detail}</span>
      </p>
    </div>
  );
}
