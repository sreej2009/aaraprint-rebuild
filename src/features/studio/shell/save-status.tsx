import { AlertTriangle, Check, ChevronDown, CloudOff, FilePlus2, History, Loader2, PencilLine, RotateCcw, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system';
import { cn } from '@/lib/cn';
import { useSaveController, useSaveState } from '../persistence/persistence-context';
import { VERSION_LABELS, type VersionSummary } from '../persistence/records';
import { formatVersionTime, saveLabel } from '../persistence/save-labels';
import { useStudioSession } from './session-context';

const ICONS = {
  sample: PencilLine,
  idle: CloudOff,
  dirty: PencilLine,
  saving: Loader2,
  saved: Check,
  error: AlertTriangle,
  conflict: AlertTriangle,
} as const;

/** Re-render every 30 s, so "2 min ago" stays true. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Save status and design menu (top bar, every layout): how the design is saved, Save now
 * (Ctrl S), Version history and Start a new design. Designs are saved in this browser only.
 * Screen readers hear saving only when it matters: a save asked for, or a failure.
 */
export function SaveStatus() {
  const controller = useSaveController();
  const { startNewDesign } = useStudioSession();
  const status = useSaveState((s) => s.status);
  const lastSavedAt = useSaveState((s) => s.lastSavedAt);
  const message = useSaveState((s) => s.message);
  const now = useNow();
  const label = saveLabel({ status, lastSavedAt }, now);
  const Icon = ICONS[status];
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const failed = status === 'error' || status === 'conflict';

  const save = async () => {
    if (!controller) return;
    await controller.saveNow();
    const after = controller.state.getState();
    setAnnouncement(after.status === 'saved' ? 'Saved in this browser.' : (after.message ?? 'Save failed.'));
  };

  // Ctrl/⌘ S saves (instead of the browser's "Save page as").
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });


  /** Dialogs open once the menu has closed and handed focus back to its trigger. */
  const later = (open: () => void) => () => setTimeout(open, 0);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={trigger}
            type="button"
            aria-label={`${label}. Saving and versions`}
            data-testid="save-status"
            data-status={status}
            className={cn(
              '-ml-1 flex max-w-full items-center gap-1 rounded-sm px-1 text-caption hover:bg-surface-subtle pointer-coarse:min-h-8',
              failed ? 'font-medium text-danger' : 'text-fg-muted',
            )}
          >
            <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', status === 'saving' && 'animate-spin')} />
            <span className="truncate">{label}</span>
            <ChevronDown aria-hidden="true" className="size-3 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2 font-normal">
            <span className="text-body-sm font-semibold text-fg">{label}</span>
            <span className="text-caption text-fg-muted">
              {message ?? (status === 'sample' ? 'This sample isn’t saved. Save it to keep it as your own design.' : 'Designs are saved automatically in this browser on this device.')}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<Save />} shortcut="Ctrl S" disabled={!controller || status === 'saving'} onSelect={() => void save()}>
            {failed && status === 'error' ? 'Try again' : 'Save now'}
          </DropdownMenuItem>
          {status === 'conflict' && controller && (
            <DropdownMenuItem icon={<RotateCcw />} onSelect={() => void controller.saveAnyway()}>
              Keep this tab’s version
            </DropdownMenuItem>
          )}
          <DropdownMenuItem icon={<History />} disabled={!controller} onSelect={later(() => setHistoryOpen(true))}>
            Version history…
          </DropdownMenuItem>
          {startNewDesign && (
            <DropdownMenuItem icon={<FilePlus2 />} onSelect={later(() => setNewOpen(true))}>
              Start a new design…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Failures are always announced; otherwise only saves asked for. */}
      <output className="sr-only" data-testid="save-announcer">
        {failed && message ? message : announcement}
      </output>
      {controller && historyOpen && <VersionHistoryDialog onClose={() => setHistoryOpen(false)} onRestored={(text) => setAnnouncement(text)} returnFocus={() => trigger.current?.focus()} />}
      {startNewDesign && (
        <ConfirmDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          title="Start a new design?"
          description="This design stays saved in this browser, with its versions. Bookmark this page first to come back to it later."
          confirmLabel="Start a new design"
          onConfirm={() => {
            setNewOpen(false);
            void controller?.flush().finally(startNewDesign);
          }}
        />
      )}
    </>
  );
}

/** Saved versions of this design, newest first. Restoring asks first and keeps a safety copy. */
function VersionHistoryDialog({ onClose, onRestored, returnFocus }: { onClose(): void; onRestored(text: string): void; returnFocus(): void }) {
  const controller = useSaveController();
  const versions = useSaveState((s) => s.versions);
  const savedFingerprint = useSaveState((s) => s.savedFingerprint);
  const status = useSaveState((s) => s.status);
  const now = useNow();
  const [confirming, setConfirming] = useState<VersionSummary | null>(null);

  useEffect(() => {
    void controller?.refreshVersions();
  }, [controller]);

  const restore = async (version: VersionSummary) => {
    setConfirming(null);
    if (!controller) return;
    const ok = await controller.restoreVersion(version.versionId);
    if (ok) {
      onRestored(`Restored the version from ${formatVersionTime(version.createdAt, Date.now())}. Press Ctrl Z to undo.`);
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="sm"
        title="Version history"
        description="Saved in this browser. The newest 20 versions are kept."
        // Opened from the menu, whose item is gone by now: focus goes back to the save status.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        {versions.length === 0 ? (
          <p className="px-5 pb-6 text-body-sm text-fg-muted sm:px-6">No versions yet. One is kept the first time the design is saved, each time you save it, and every 10 minutes or so while it autosaves.</p>
        ) : (
          <ul aria-label="Saved versions" className="flex flex-col divide-y divide-border px-5 pb-5 sm:px-6">
            {versions.map((version, index) => {
              const time = formatVersionTime(version.createdAt, now);
              const current = version.fingerprint === savedFingerprint && status === 'saved';
              return (
                <li key={version.versionId} className="flex items-center gap-3 py-3" data-testid="version-row">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2 text-body-sm font-medium text-fg">
                      {VERSION_LABELS[version.reason]}
                      {current && <span className="rounded-full bg-accent-soft px-2 text-caption text-accent-strong">Current</span>}
                      {!current && index === 0 && <span className="rounded-full bg-surface-subtle px-2 text-caption text-fg-muted">Latest</span>}
                    </span>
                    <span className="text-caption text-fg-muted">{time}</span>
                  </div>
                  <Button variant="secondary" size="sm" className="pointer-coarse:h-10" aria-label={`Restore ${VERSION_LABELS[version.reason].toLowerCase()} from ${time}`} onClick={() => setConfirming(version)}>
                    Restore
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <ConfirmDialog
          open={confirming !== null}
          onOpenChange={(open) => !open && setConfirming(null)}
          title="Restore this version?"
          description={`The design will be replaced by the version from ${confirming ? formatVersionTime(confirming.createdAt, now) : ''}. A safety copy of what’s here now is kept first, and you can undo this.`}
          confirmLabel="Restore"
          onConfirm={() => confirming && void restore(confirming)}
        />
      </DialogContent>
    </Dialog>
  );
}
