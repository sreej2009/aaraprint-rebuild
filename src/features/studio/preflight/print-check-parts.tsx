import { CircleCheck, CircleMinus, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { SurfacePrint } from '../schema/types';
import { useStudioSession } from '../shell/session-context';
import type { SideCheck } from './print-checks';
import { describeArtwork, printFactNotes, printFacts, READINESS_LABELS, type PrintReadiness, type SideReadiness } from './print-status';

/**
 * Pieces of the print check (Phase 4 M6) shared by Review and the Print check dialog: the status,
 * a side's print facts, its artwork with placement and resolution, and the legend of the print
 * view. Status is always said in words and an icon, never by colour alone.
 */

const STATUS_STYLE: Record<SideReadiness, { Icon: typeof CircleCheck; className: string }> = {
  ready: { Icon: CircleCheck, className: 'bg-success-soft text-success-strong' },
  warning: { Icon: TriangleAlert, className: 'bg-warning-soft text-warning-strong' },
  blocked: { Icon: OctagonAlert, className: 'bg-danger-soft text-danger' },
  blank: { Icon: CircleMinus, className: 'bg-surface-sunken text-fg-muted' },
};

export function ReadinessBadge({ status, className }: { status: SideReadiness; className?: string }) {
  const { Icon, className: tone } = STATUS_STYLE[status];
  return (
    <span className={cn('inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap', tone, className)} data-status={status}>
      <Icon aria-hidden="true" className="size-3.5" />
      {READINESS_LABELS[status]}
    </span>
  );
}

/** The overall status with its sentence, and each side's status when there are two. */
export function ReadinessSummary({ readiness, testId }: { readiness: PrintReadiness; testId?: string }) {
  const sided = readiness.sides.length > 1;
  return (
    <div className="flex flex-col gap-2" data-testid={testId} data-status={readiness.overall}>
      <p className="flex flex-wrap items-center gap-2 text-body-sm text-fg">
        <ReadinessBadge status={readiness.overall} />
        <span>{readiness.summary}</span>
      </p>
      {sided && (
        <ul aria-label="Print check by side" className="flex flex-wrap gap-x-4 gap-y-1">
          {readiness.sides.map((side) => (
            <li key={side.surfaceId} className="flex items-center gap-1.5 text-body-sm text-fg" data-side={side.surfaceId} data-status={side.status}>
              <span className="font-medium">{side.label}:</span> <ReadinessBadge status={side.status} /> <span className="text-fg-muted">{side.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A side's print size, bleed, safe zone, DPI and shape, from its print configuration. */
export function PrintFacts({ print, testId }: { print: SurfacePrint; testId?: string }) {
  const { profile } = useStudioSession();
  const facts = printFacts(print);
  const notes = printFactNotes(profile);
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body-sm" data-testid={testId}>
        {facts.map((f) => (
          <div key={f.term} className="contents">
            <dt className="text-fg-muted">{f.term}</dt>
            <dd className="text-right text-fg tabular-nums [overflow-wrap:anywhere]">{f.value}</dd>
          </div>
        ))}
      </dl>
      {notes.map((note) => (
        <p key={note} className="flex items-start gap-2 text-caption text-fg-muted" data-testid="print-facts-note">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {note}
        </p>
      ))}
    </div>
  );
}

const TONE_ICON = { ok: CircleCheck, notice: Info, warning: TriangleAlert } as const;
const TONE_CLASS = { ok: 'text-success-strong', notice: 'text-fg-muted', warning: 'text-warning-strong' } as const;
const TONE_WORD = { ok: 'Fine', notice: 'Note', warning: 'Check' } as const;

/** Each element on a side, top layer first: where it sits and its resolution (or why there is none). */
export function ArtworkList({ side, print, label }: { side: SideCheck; print: SurfacePrint; label: string }) {
  if (side.artwork.length === 0) return <p className="text-body-sm text-fg-muted">No artwork on this side.</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-1.5" data-testid="artwork-list">
      {side.artwork.map((item) => {
        const d = describeArtwork(item, print.bleedPx > 0);
        const Icon = TONE_ICON[d.tone];
        return (
          <li key={item.elementId} className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2" data-element={item.elementId} data-tone={d.tone} data-resolution={item.resolution.kind}>
            <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', TONE_CLASS[d.tone])} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-body-sm font-medium [overflow-wrap:anywhere] text-fg">
                <span className="sr-only">{TONE_WORD[d.tone]}: </span>
                {item.name} <span className="font-normal text-fg-muted">· {d.type}</span>
              </p>
              <p className="text-caption text-fg-muted">{d.placement}</p>
              <p className="text-caption [overflow-wrap:anywhere] text-fg-muted">{d.resolution}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What the print view's lines mean. Each is told apart by its line style as well as its colour:
 * a tinted band, a solid line, a dashed line and a dotted outline.
 */
export function PrintLegend({ print, compact = false, className }: { print: SurfacePrint; compact?: boolean; className?: string }) {
  const items: { key: string; swatch: ReactNode; text: string; short: string }[] = [];
  if (print.bleedPx > 0) items.push({ key: 'bleed', swatch: <span className="h-3 w-5 rounded-[2px] border border-guide-bleed bg-[rgba(229,72,77,0.25)]" />, text: 'Bleed (cut off)', short: 'Bleed' });
  items.push({ key: 'trim', swatch: <span className="h-0 w-5 border-t-2 border-guide-trim" />, text: print.bleedPx > 0 ? 'Trim (finished edge)' : 'Edge of the print area', short: print.bleedPx > 0 ? 'Trim' : 'Edge' });
  if (print.safeZonePx > 0) items.push({ key: 'safe', swatch: <span className="h-0 w-5 border-t-2 border-dashed border-guide-safe" />, text: 'Safe zone (keep important things inside)', short: 'Safe zone' });
  items.push({ key: 'flag', swatch: <span className="h-3 w-5 rounded-[2px] border-2 border-dotted border-warning" />, text: 'Worth checking', short: 'Check' });
  return (
    <ul aria-label="Print check legend" className={cn('flex flex-wrap items-center gap-y-1 text-caption text-fg-muted', compact ? 'gap-x-3' : 'gap-x-4', className)} data-testid="print-legend">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-1.5" data-legend={i.key}>
          <span aria-hidden="true" className="grid w-5 place-items-center">
            {i.swatch}
          </span>
          {/* Phones show the short word; screen readers always get the full meaning. */}
          {compact ? (
            <>
              <span aria-hidden="true">{i.short}</span>
              <span className="sr-only">{i.text}</span>
            </>
          ) : (
            i.text
          )}
        </li>
      ))}
    </ul>
  );
}
