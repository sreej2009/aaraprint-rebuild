import { ImageOff, ImageUp, Trash2, Upload } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { useStore } from 'zustand';
import { Button, IconButton, Spinner } from '@/design-system';
import { cn } from '@/lib/cn';
import { thumbnailUrl, useUploadLibrary, useUploadList } from '../assets/asset-library';
import { imagePlacement } from '../assets/image-placement';
import { designAssetFor, formatBytes, UPLOAD_ACCEPT } from '../assets/uploads';
import type { AssetSummary } from '../persistence/records';
import { createImageElement } from '../schema/create';
import { selectActiveSurface, useStudio, useStudioStoreApi } from '../store';
import { useStudioUi } from '../shell/ui-context';

const PHASE_LABELS = { reading: 'Reading…', processing: 'Processing…', saving: 'Saving…' } as const;

/**
 * The Uploads tool (Plan M12): add images from this device and place them. Uploading stores the
 * file in this browser and lists it under "My uploads" — no design change, no undo step; choosing
 * an upload places it on the side being edited (one undo step). Files never leave the device.
 */
export function UploadsTool() {
  const library = useUploadLibrary();
  useUploadList(library);
  const items = useStore(library?.state ?? fallback, (s) => s.items);
  const loaded = useStore(library?.state ?? fallback, (s) => s.loaded);
  const phase = useStore(library?.state ?? fallback, (s) => s.phase);
  const error = useStore(library?.state ?? fallback, (s) => s.error);
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const busy = phase !== 'idle';

  const upload = async (files: File[]) => {
    if (!library || files.length === 0) return;
    const stored = await library.upload(files);
    setStatus(stored.length ? `${stored.length === 1 ? stored[0]!.name : `${stored.length} images`} added to My uploads. Choose it to place it on the design.` : '');
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    // Files only: dragged text, links or page elements are ignored.
    void upload([...event.dataTransfer.files]);
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        hidden
        data-testid="upload-input"
        onChange={(event) => {
          void upload([...(event.currentTarget.files ?? [])]);
          event.currentTarget.value = ''; // picking the same file again works
        }}
      />
      <div
        data-testid="upload-drop-zone"
        onDragOver={(event) => {
          if (![...event.dataTransfer.types].includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-5 text-center transition-colors',
          dragging ? 'border-accent bg-accent-soft/50' : 'border-border-strong/60 bg-surface-subtle',
        )}
      >
        <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent-strong">
          <ImageUp aria-hidden="true" className="size-5" />
        </span>
        <Button onClick={() => input.current?.click()} disabled={busy || !library} aria-describedby={error ? errorId : undefined} className="pointer-coarse:h-11">
          <Upload aria-hidden="true" />
          Upload image
        </Button>
        <p className="text-caption text-fg-muted">
          <span className="pointer-coarse:hidden">Or drop files here. </span>PNG, JPEG or WebP, up to 10 MB. Saved in this browser only.
        </p>
      </div>

      <output className={cn('flex items-center gap-2 text-body-sm text-fg-muted', !busy && 'sr-only')} data-testid="upload-status">
        {busy ? (
          <>
            <Spinner size="sm" /> {PHASE_LABELS[phase as keyof typeof PHASE_LABELS]}
          </>
        ) : (
          status
        )}
      </output>
      {error && (
        <div id={errorId} role="alert" className="flex items-start gap-2 rounded-md bg-danger-soft p-3 text-body-sm text-danger">
          <span className="flex-1">{error}</span>
          <button type="button" className="shrink-0 text-caption font-medium underline" onClick={() => library?.dismissError()}>
            Dismiss
          </button>
        </div>
      )}

      <section aria-labelledby="my-uploads-heading" className="flex flex-col gap-2">
        <h3 id="my-uploads-heading" className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
          My uploads
        </h3>
        {!loaded ? (
          <Spinner size="sm" label="Loading your uploads" />
        ) : items.length === 0 ? (
          <p className="text-body-sm text-fg-muted">No uploaded images yet.</p>
        ) : (
          <ul aria-labelledby="my-uploads-heading" className="flex flex-col gap-2">
            {items.map((item) => (
              <UploadRow key={item.assetId} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UploadRow({ item }: { item: AssetSummary }) {
  const studio = useStudioStoreApi();
  const library = useUploadLibrary();
  const surface = useStudio(selectActiveSurface);
  const { layout, openTool } = useStudioUi();
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = thumbnailUrl(item);
  const details = `${item.naturalWidth} × ${item.naturalHeight} px · ${formatBytes(item.bytes)}`;

  const place = () => {
    const state = studio.getState();
    const target = selectActiveSurface(state);
    if (!target) return;
    const element = createImageElement({ kind: 'asset', assetId: item.assetId }, imagePlacement(item, target.print, target.elements));
    // The file is already stored, so the design only ever refers to something that exists.
    if (!state.actions.addImage(designAssetFor(item), element, { surfaceId: target.id })) return;
    if (layout === 'phone' || layout === 'tablet') openTool(null);
  };

  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-surface p-1.5 pr-1">
      <button
        type="button"
        disabled={!surface}
        onClick={place}
        aria-label={`Add image: ${item.name} ${details}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left hover:bg-surface-subtle disabled:opacity-50"
      >
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-sm bg-surface-subtle">
          {thumb && !thumbFailed ? <img src={thumb} alt="" className="max-h-full max-w-full object-contain" onError={() => setThumbFailed(true)} /> : <ImageOff aria-hidden="true" className="size-5 text-fg-subtle" />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body-sm font-medium text-fg" title={item.name}>
            {item.name}
          </span>{' '}
          <span className="text-caption text-fg-muted tabular-nums">{details}</span>
        </span>
      </button>
      <IconButton
        label={`Remove ${item.name} from My uploads`}
        icon={<Trash2 />}
        size="sm"
        className="shrink-0 text-fg-muted pointer-coarse:size-11"
        onClick={() => void library?.remove(item.assetId, studio.getState().document)}
      />
    </li>
  );
}

const fallback = {
  getState: () => ({ items: [], loaded: true, phase: 'idle' as const, error: null, lastAdded: null }),
  subscribe: () => () => {},
  getInitialState: () => ({ items: [], loaded: true, phase: 'idle' as const, error: null, lastAdded: null }),
  setState: () => {},
} as unknown as NonNullable<ReturnType<typeof useUploadLibrary>>['state'];
