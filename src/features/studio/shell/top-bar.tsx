import { ArrowLeft, ArrowRight, PanelRightOpen, Redo2, Undo2 } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, IconButton, Separator, Tooltip } from '@/design-system';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/cn';
import { selectCanRedo, selectCanUndo, selectRedoLabel, selectUndoLabel, useStudio, useStudioActions } from '../store';
import { ZoomControl } from '../canvas/zoom-control';
import { PrintCheckButton } from '../preflight/print-check-dialog';
import { PreviewButton } from '../preview/preview-dialog';
import { SaveStatus } from './save-status';
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
      {/* Tablets drop the dividers to give the design name room. */}
      <Separator orientation="vertical" className="mx-1 h-6 max-lg:hidden" />
      <DesignTitle />

      <div className={cn('flex items-center gap-1 md:gap-2', phone ? 'ml-auto' : 'mx-auto')}>
        <HistoryButtons />
        {!phone && (
          <>
            <Separator orientation="vertical" className="mx-1 h-6 max-lg:hidden" />
            <ZoomControl />
            <Separator orientation="vertical" className="mx-1 h-6 max-lg:hidden" />
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
        {/* The finished design, full screen (M14). Icon only where the bar is tight. */}
        <PreviewButton iconOnly={layout === 'phone' || layout === 'tablet'} />
        {/* Print check and proof download (M15): advice and a PNG proof, never blocking. */}
        <PrintCheckButton iconOnly={layout === 'phone' || layout === 'tablet'} />
        <ComingSoon hint="Reviewing and ordering your design is coming soon" primary>
          {/* Icon only on tablets, so the design name keeps its room next to Preview and Print check. */}
          <span className={cn(layout === 'tablet' && 'sr-only')}>{phone ? 'Next' : 'Continue'}</span>
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
    <div className="flex min-w-16 flex-col leading-tight max-md:max-w-[38vw]">
      <p className="truncate text-body-sm font-semibold text-fg" title={name}>
        {name}
      </p>
      {/* Saved in this browser (M11): status, Save now, Version history, Start a new design. */}
      <SaveStatus />
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
