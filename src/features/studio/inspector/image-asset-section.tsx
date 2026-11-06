import { CircleAlert, CircleCheck, RefreshCw, Replace, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button, Callout } from '@/design-system';
import { cn } from '@/lib/cn';
import { retryAsset, useAssetImage, useUploadLibrary } from '../assets/asset-library';
import { effectiveDpi, replacementBox, resolutionLevel, RESOLUTION_LABELS, type ResolutionLevel } from '../assets/image-placement';
import { designAssetFor, formatBytes, UPLOAD_ACCEPT } from '../assets/uploads';
import * as cmd from '../commands';
import { describeElements } from '../naming';
import type { ImageElement, SurfacePrint } from '../schema/types';
import { selectDocument, useStudio, useStudioStoreApi } from '../store';

const LEVEL_STYLES: Record<ResolutionLevel, string> = {
  good: 'text-success-strong',
  acceptable: 'text-fg',
  low: 'text-warning-strong',
};

/**
 * An uploaded image in the inspector (Plan M12): the file, its pixels and size, the resolution it
 * prints at the size it has now, and Replace image (same place, size and layer; one undo step).
 * When this device doesn't have the file the layer stays, with Retry, Replace and Delete.
 */
export function ImageAssetSection({ element, print }: { element: ImageElement; print: SurfacePrint }) {
  const document = useStudio(selectDocument);
  const studio = useStudioStoreApi();
  const library = useUploadLibrary();
  const assetId = element.source.kind === 'asset' ? element.source.assetId : null;
  const asset = assetId ? document.assets[assetId] : undefined;
  const image = useAssetImage(assetId);
  const input = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const [replaceError, setReplaceError] = useState<string | null>(null);
  if (!assetId) return null;

  const unavailable = image?.status === 'missing' || image?.status === 'error';
  const dpi = asset ? effectiveDpi(element, asset, print) : 0;
  const level = resolutionLevel(dpi);
  const disabled = element.locked;

  const replace = async (file: File | undefined) => {
    if (!file || !library) return;
    setReplaceError(null);
    const [stored] = await library.upload([file]);
    if (!stored) {
      setReplaceError(library.state.getState().error);
      return;
    }
    const next = designAssetFor(stored);
    const state = studio.getState();
    const surfaceId = state.editor.activeSurfaceId;
    // One step: the new file joins the design, the element points at it, the box follows its shape.
    state.actions.execute(`Replace image ${describeElements([element], state.document)}`, (d) =>
      cmd.updateElement<ImageElement>(cmd.addAsset(d, next), surfaceId, element.id, {
        source: { kind: 'asset', assetId: next.id },
        ...replacementBox(element, next),
      }),
    );
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
        Image
      </h3>
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        hidden
        data-testid="replace-input"
        onChange={(event) => {
          const target = event.currentTarget;
          const picked = target.files?.[0];
          target.value = ''; // picking the same file again works
          void replace(picked);
        }}
      />
      {unavailable ? (
        <Callout
          tone="warning"
          title="Image unavailable"
          className="p-3"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" className="pointer-coarse:h-11" onClick={() => retryAsset(assetId)}>
                <RefreshCw aria-hidden="true" />
                Retry
              </Button>
              <Button variant="secondary" size="sm" className="pointer-coarse:h-11" disabled={disabled} onClick={() => input.current?.click()}>
                <Replace aria-hidden="true" />
                Replace image
              </Button>
              <Button variant="secondary" size="sm" className="text-danger pointer-coarse:h-11" disabled={disabled} onClick={() => studio.getState().actions.removeElements([element.id])}>
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            </div>
          }
        >
          {asset ? `“${asset.name}”` : 'The file'} isn’t in this browser, so it can’t be shown or printed. The layer stays until you replace or delete it.
        </Callout>
      ) : (
        asset && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm">
              <dt className="text-fg-muted">File</dt>
              <dd className="truncate text-right font-medium text-fg" title={asset.name}>
                {asset.name}
              </dd>
              <dt className="text-fg-muted">Pixels</dt>
              <dd className="text-right text-fg tabular-nums">
                {asset.naturalWidth} × {asset.naturalHeight}
              </dd>
              <dt className="text-fg-muted">File size</dt>
              <dd className="text-right text-fg tabular-nums">{formatBytes(asset.bytes)}</dd>
              <dt className="text-fg-muted">Resolution</dt>
              <dd className={cn('flex items-center justify-end gap-1.5 font-medium tabular-nums', LEVEL_STYLES[level])} data-testid="image-resolution" data-level={level}>
                {level === 'low' ? <CircleAlert aria-hidden="true" className="size-4" /> : <CircleCheck aria-hidden="true" className="size-4" />}
                {RESOLUTION_LABELS[level]} · {dpi} DPI
              </dd>
            </dl>
            {level === 'low' && <p className="text-caption text-fg-muted">At this size the image may print soft. A smaller size, or a larger original, prints sharper. You can still use it.</p>}
            <Button variant="secondary" size="sm" className="self-start pointer-coarse:h-11" disabled={disabled} onClick={() => input.current?.click()}>
              <Replace aria-hidden="true" />
              Replace image
            </Button>
          </>
        )
      )}
      {replaceError && (
        <p role="alert" className="text-caption font-medium text-danger">
          {replaceError}
        </p>
      )}
    </section>
  );
}
