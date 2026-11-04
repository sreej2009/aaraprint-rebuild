import { ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, IconButton } from '@/design-system';
import { cn } from '@/lib/cn';
import { formatZoom as formatPercent } from '../geometry/viewport';
import { useViewport, useViewportStoreApi } from './viewport-context';
import { limitsOf, percentOf } from './viewport-store';

/** − [100% ▾] + — the percentage opens Fit, Actual size, presets and Show guides. */
export function ZoomControl({ className }: { className?: string }) {
  const { actions } = useViewportStoreApi().getState();
  const percent = useViewport(percentOf);
  // Primitive selections only: a new object per read would re-render forever.
  const minPercent = useViewport((s) => limitsOf(s).minPercent);
  const maxPercent = useViewport((s) => limitsOf(s).maxPercent);
  const limits = { minPercent, maxPercent };
  const mode = useViewport((s) => s.mode);
  const showGuides = useViewport((s) => s.showGuides);
  const label = formatPercent(percent);
  return (
    <div className={cn('flex items-center', className)}>
      <IconButton label="Zoom out" shortcut="Ctrl −" icon={<ZoomOut />} size="sm" disabled={percent <= limits.minPercent + 0.05} onClick={() => actions.zoomStep(-1)} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Zoom ${label}, view options`} className="min-w-18 gap-0.5 px-2 tabular-nums">
            {label}
            <ChevronDown aria-hidden="true" className="text-fg-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-56">
          <DropdownMenuItem shortcut="Shift 1" onSelect={() => actions.fit()} disabled={mode === 'fit'}>
            Fit to screen
          </DropdownMenuItem>
          <DropdownMenuItem shortcut="Ctrl 0" onSelect={() => actions.actualSize()}>
            Actual size (100%)
          </DropdownMenuItem>
          {[50, 200].map((p) => (
            <DropdownMenuItem key={p} onSelect={() => actions.zoomTo(p)} disabled={p < limits.minPercent || p > limits.maxPercent}>
              {p}%
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem shortcut="Ctrl ;" checked={showGuides} onCheckedChange={(checked) => actions.setShowGuides(checked === true)}>
            Show print guides
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton label="Zoom in" shortcut="Ctrl +" icon={<ZoomIn />} size="sm" disabled={percent >= limits.maxPercent - 0.05} onClick={() => actions.zoomStep(1)} />
    </div>
  );
}

/** Tells screen-reader users the zoom level once it settles (not on every pinch frame). */
export function ZoomAnnouncer() {
  const percent = useViewport(percentOf);
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(`Zoom ${formatPercent(percent)}`), 500);
    return () => clearTimeout(timer);
  }, [percent]);
  return (
    <p className="sr-only" aria-live="polite">
      {announced}
    </p>
  );
}
