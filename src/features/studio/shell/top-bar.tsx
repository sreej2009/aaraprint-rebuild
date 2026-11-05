import { ArrowLeft, ArrowRight, CloudOff, Eye, PanelRightOpen, Redo2, Undo2 } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, IconButton, Separator, Tooltip } from '@/design-system';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/cn';
import { selectCanRedo, selectCanUndo, selectRedoLabel, selectUndoLabel, useStudio, useStudioActions } from '../store';
import { ZoomControl } from '../canvas/zoom-control';
import { useStudioSession } from './session-context';
import { SideMenu, SideSwitcher } from './side-controls';
import { useStudioUi } from './ui-context';

/** Studio top bar (Blueprint §11.1 desktop, §13.2 phone). Holds the page's (visually hidden) h1. */
export function TopBar({ title }: { title: string }) {
  const { layout, inspectorOpen, setInspectorOpen } = useStudioUi();
  const phone = layout === 'phone';
  return (
    <header className="flex h-13 shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2 md:h-14 md:gap-2 md:px-3">
      <h1 className="sr-only">{title}</h1>
      <BackToProduct compact={layout !== 'desktop'} />
      <Separator orientation="vertical" className="mx-1 h-6 max-md:hidden" />
      <DesignTitle />

      <div className={cn('flex items-center gap-1 md:gap-2', phone ? 'ml-auto' : 'mx-auto')}>
        <HistoryButtons />
        {!phone && (
          <>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <ZoomControl />
            <Separator orientation="vertical" className="mx-1 h-6" />
            <div className="flex items-center gap-0.5">
              <SideSwitcher size="sm" />
              <SideMenu />
            </div>
          </>
        )}
      </div>

      <div className={cn('flex items-center gap-2', !phone && 'ml-auto')}>
        {layout === 'desktop' && <ProductSummary />}
        {(layout === 'tablet' || layout === 'laptop') && (
          <IconButton
            label="Layers and properties"
            icon={<PanelRightOpen />}
            size="sm"
            aria-haspopup="dialog"
            aria-expanded={inspectorOpen}
            onClick={() => setInspectorOpen(true)}
          />
        )}
        {/* Tablets are tight once zoom is in the bar; Preview returns there with M15. */}
        {(layout === 'laptop' || layout === 'desktop') && (
          <ComingSoon hint="Preview and proof downloads are coming soon">
            <Eye aria-hidden="true" />
            <span className="max-xl:sr-only">Preview</span>
          </ComingSoon>
        )}
        <ComingSoon hint="Reviewing and ordering your design is coming soon" primary>
          <span>{phone ? 'Next' : 'Continue'}</span>
          <ArrowRight aria-hidden="true" className="max-md:hidden" />
        </ComingSoon>
      </div>
    </header>
  );
}

function BackToProduct({ compact }: { compact: boolean }) {
  const { productHref } = useStudioSession();
  const link = (
    <Button asChild variant="ghost" size="sm" className={cn(compact && 'size-9 px-0')}>
      <Link to={productHref} aria-label={compact ? 'Back to product' : undefined}>
        <ArrowLeft aria-hidden="true" />
        {!compact && 'Back to product'}
      </Link>
    </Button>
  );
  return compact ? <Tooltip content="Back to product">{link}</Tooltip> : link;
}

function DesignTitle() {
  const name = useStudio((s) => s.document.name);
  return (
    <div className="flex min-w-0 flex-col leading-tight max-md:max-w-[38vw]">
      <p className="truncate text-body-sm font-semibold text-fg" title={name}>
        {name}
      </p>
      {/* Autosave arrives with local drafts (M11); until then nothing is stored. */}
      <p className="flex items-center gap-1 text-caption text-fg-muted">
        <CloudOff aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">Not saved yet</span>
      </p>
    </div>
  );
}

function HistoryButtons() {
  const actions = useStudioActions();
  const canUndo = useStudio(selectCanUndo);
  const canRedo = useStudio(selectCanRedo);
  const undoLabel = useStudio(selectUndoLabel);
  const redoLabel = useStudio(selectRedoLabel);
  return (
    <fieldset className="m-0 flex min-w-0 items-center border-0 p-0">
      <legend className="sr-only">History</legend>
      <Tooltip content={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'} shortcut="Ctrl Z">
        <span>
          <IconButton label="Undo" icon={<Undo2 />} size="sm" tooltip={false} disabled={!canUndo} onClick={() => actions.undo()} />
        </span>
      </Tooltip>
      <Tooltip content={redoLabel ? `Redo: ${redoLabel}` : 'Nothing to redo'} shortcut="Ctrl Shift Z">
        <span>
          <IconButton label="Redo" icon={<Redo2 />} size="sm" tooltip={false} disabled={!canRedo} onClick={() => actions.redo()} />
        </span>
      </Tooltip>
    </fieldset>
  );
}

function ProductSummary() {
  const { product, variant, variantLabel } = useStudioSession();
  return (
    <div className="flex max-w-72 min-w-0 flex-col items-end text-right leading-tight">
      <p className="truncate text-caption text-fg-muted" title={product.name}>
        {product.name}
      </p>
      <p className="truncate text-body-sm text-fg" title={variantLabel}>
        {variantLabel && <span className="text-fg-muted">{variantLabel} · </span>}
        {variant && <span className="font-semibold tabular-nums">{formatINR(variant.priceCents)}</span>}
      </p>
    </div>
  );
}

/**
 * A control whose feature arrives later in Phase 3. It stays focusable (aria-disabled, not
 * disabled) so keyboard and screen-reader users can find out why it doesn't do anything yet.
 * Its accessible name is its visible text (sr-only where the text is hidden), per WCAG 2.5.3.
 */
function ComingSoon({ hint, primary, children }: { hint: string; primary?: boolean; children: ReactNode }) {
  const ignore = (event: MouseEvent) => event.preventDefault();
  return (
    <Tooltip content={hint}>
      <Button
        variant={primary ? 'primary' : 'secondary'}
        size="sm"
        aria-disabled="true"
        aria-description={hint}
        onClick={ignore}
        className={cn(primary ? 'bg-accent/45 hover:bg-accent/45' : 'text-fg-muted hover:bg-transparent')}
      >
        {children}
      </Button>
    </Tooltip>
  );
}
