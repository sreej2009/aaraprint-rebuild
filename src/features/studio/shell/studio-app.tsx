import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useStore } from 'zustand';
import { resolvePrice } from '@/features/product-workflow/pricing';
import type { Product } from '@/lib/catalogue/types';
import { describePrint } from '../profile/describe';
import type { StudioProfile } from '../profile/types';
import { sampleDesignFor } from '../demo/sample-design';
import { createBlankDesign } from '../schema/create';
import { createInteractionStore, InteractionStoreContext, type InteractionStore } from '../canvas/interaction-store';
import { useTextLayout } from '../canvas/use-text-layout';
import { useZoomShortcuts } from '../canvas/use-zoom-shortcuts';
import { useStudioShortcuts } from '../keyboard/use-studio-shortcuts';
import { ViewportStoreContext } from '../canvas/viewport-context';
import { createViewportStore, type ViewportStore } from '../canvas/viewport-store';
import { createUploadLibrary, setAssetSource, UploadLibraryContext } from '../assets/asset-library';
import type { DecodedImage } from '../assets/uploads';
import { SaveControllerContext, useSaveState } from '../persistence/persistence-context';
import { browserRepository, type DesignRepository } from '../persistence/repository';
import { openSavedDesign, type OpenResult } from '../persistence/restore';
import { createSaveController, type SaveController } from '../persistence/save-controller';
import { createStudioStore, selectActiveSurfaceId, StudioProvider, useStudio, useStudioStoreApi } from '../store';
import { StudioSessionContext, type StudioSession } from './session-context';
import { StudioShell } from './studio-shell';
import { StudioLoading, StudioOpenProblem } from './studio-states';
import type { ToolId } from './tools';
import { StudioUiProvider } from './ui-provider';
import { resolveStudioVariant, variantSummary } from './variant';
import { resolveWorkspace } from '../workspace/workspace';
import { TOOL_FOR_INITIAL } from './tools';
// The Studio's own typefaces (decision D3), loaded only here.
import '../assets/studio-fonts.css';

export interface StudioAppProps {
  product: Product;
  profile: StudioProfile;
  variantId: string | null;
  initialSurface: string | null;
  initialTool: ToolId | null;
  /** Start from the sample card (`?sample=1`) instead of a blank or saved design. */
  sample?: boolean;
  /** `?design=`: continue exactly this saved design. */
  designId?: string | null;
  /** Where designs are saved (IndexedDB in the browser; injectable for tests). */
  repository?: DesignRepository;
  /** How uploads are decoded (the browser's own decoder; injectable for tests). */
  decodeImage?: (blob: Blob) => Promise<DecodedImage>;
}

type Opened = OpenResult | { kind: 'sample' };

/**
 * The Studio for one product. First it finds the design to continue (M11): `?sample=1` opens the
 * sample; `?design=` that saved design; otherwise the latest design saved in this browser for
 * this product, or a new blank one. Problems (damaged, another product's, not in this browser)
 * get their own screen — nothing is deleted. "Start a new design" begins a fresh session.
 */
export function StudioApp(props: StudioAppProps) {
  const { product, sample = false, designId = null } = props;
  const [repository] = useState(() => props.repository ?? browserRepository());
  const [opened, setOpened] = useState<{ key: number; result: Opened } | null>(() => {
    if (sample) return { key: 0, result: { kind: 'sample' } };
    // No IndexedDB at all (very old browsers, some private modes): edit in memory, and say so.
    if (!props.repository && typeof globalThis.indexedDB === 'undefined') return { key: 0, result: { kind: 'new', storageError: 'This browser can’t store designs.' } };
    return null;
  });
  const lookedUp = opened !== null;

  useEffect(() => {
    if (lookedUp) return;
    let live = true;
    void openSavedDesign(repository, { productSlug: product.slug, designId }).then((result) => {
      if (live) setOpened({ key: 0, result });
    });
    return () => {
      live = false;
    };
    // Only the first lookup: later sessions start from "Start a new design".
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, product.slug, designId]);

  const startNew = () => setOpened((current) => ({ key: (current?.key ?? 0) + 1, result: { kind: 'new' } }));
  const productHref = `/products/${product.slug}`;

  if (!opened) return <StudioLoading />;
  const { result } = opened;
  if (result.kind === 'corrupt' || result.kind === 'missing' || result.kind === 'mismatch') {
    return (
      <StudioOpenProblem
        kind={result.kind}
        productHref={productHref}
        {...(result.kind === 'corrupt' ? { detail: result.reason } : {})}
        {...(result.kind === 'mismatch' ? { detail: result.name, otherProductHref: `/products/${result.productSlug}/design?design=${encodeURIComponent(result.designId)}` } : {})}
        onStartNew={startNew}
      />
    );
  }
  return <EditorSession key={opened.key} {...props} opened={result} repository={repository} onStartNew={startNew} />;
}

interface EditorSessionProps extends StudioAppProps {
  opened: Exclude<Opened, { kind: 'corrupt' | 'missing' | 'mismatch' }>;
  repository: DesignRepository;
  onStartNew(): void;
}

/**
 * One editing session: the Studio store for one design, its save controller, and the product facts
 * and editor chrome state for the shell. A new design is a new session.
 */
function EditorSession({ product, profile, variantId, initialSurface, initialTool, opened, repository, onStartNew, decodeImage }: EditorSessionProps) {
  const restored = opened.kind === 'restored' ? opened : null;
  // The saved design is the single source of truth for its product (M4-C): a restored design keeps
  // its own variant (colour, size…); `?variantId=` only seeds a new design. The product page saves
  // its choices into the same design before opening the Studio, so they always agree.
  const effectiveVariantId = resolveStudioVariant(product, restored?.document.product.variantId ?? variantId ?? null)?.id ?? null;
  const [store] = useState(() => {
    const blank = createBlankDesign(profile, { variantId: effectiveVariantId, catalogue: product });
    const document = restored ? restored.document : opened.kind === 'sample' ? sampleDesignFor(blank) : blank;
    const studio = createStudioStore({ document, catalogue: product, ...(initialSurface ? { surfaceId: initialSurface } : {}) });
    // Not an undo step: the design's own variant fills the product configuration (a design saved
    // before schema v3 has none yet); a saved choice is never replaced by a default.
    if (restored) studio.getState().actions.syncProductVariant(effectiveVariantId);
    return studio;
  });
  // The workspace comes from the design's persisted product configuration (M4): product-first
  // families open on the product straight away (no flat first, no flicker).
  const familyId = useStore(store, (s) => s.document.product.familyId);
  const workspace = useMemo(() => resolveWorkspace({ slug: product.slug, familyId }, profile), [product.slug, familyId, profile]);
  const [viewportStore] = useState(() => createViewportStore({ productView: workspace.initialView === 'product' }));
  const [interactionStore] = useState(() => createInteractionStore());
  const [controller] = useState<SaveController>(() =>
    createSaveController({
      studio: store,
      repository,
      productSlug: product.slug,
      productId: product.id,
      record: restored?.record ?? null,
      sample: opened.kind === 'sample',
      ...(opened.kind === 'new' && opened.storageError ? { storageError: opened.storageError } : {}),
    }),
  );
  // Watches the design while the session is on screen; leaving writes anything still pending.
  useEffect(() => controller.start(), [controller]);
  // Uploaded images on this device (M12): the library, and where the canvas reads their files.
  const [uploads] = useState(() => createUploadLibrary(repository, decodeImage ? { decode: decodeImage } : {}));
  useEffect(() => {
    setAssetSource(repository);
    return () => setAssetSource(null);
  }, [repository]);

  // What's being designed follows the design itself: a product option changed in the Studio
  // updates the variant, SKU and price shown everywhere (M4).
  const designVariantId = useStore(store, (s) => s.document.product.variantId);
  const configuration = useStore(store, (s) => s.document.product.configuration);
  const price = useMemo(() => resolvePrice(product, workspace.workflow, configuration), [product, workspace.workflow, configuration]);
  const session = useMemo<StudioSession>(() => {
    const variant = resolveStudioVariant(product, designVariantId ?? effectiveVariantId);
    const params = new URLSearchParams(variant ? { variantId: variant.id } : {});
    return {
      product,
      profile,
      variant,
      variantLabel: variantSummary(product, variant),
      print: describePrint(profile),
      productHref: `/products/${product.slug}${params.size ? `?${params}` : ''}`,
      startNewDesign: onStartNew,
      workspace,
      price,
    };
  }, [product, profile, designVariantId, effectiveVariantId, onStartNew, workspace, price]);

  return (
    <StudioProvider store={store}>
      <SaveControllerContext.Provider value={controller}>
        <UploadLibraryContext.Provider value={uploads}>
        <StudioSessionContext.Provider value={session}>
          <ViewportStoreContext.Provider value={viewportStore}>
            <InteractionStoreContext.Provider value={interactionStore}>
              <StudioUiProvider initialTool={initialTool} defaultTool={TOOL_FOR_INITIAL[workspace.initialTool]}>
                <SideInUrl />
                <DesignInUrl />
                <VariantInUrl />
                <Shortcuts viewport={viewportStore} interaction={interactionStore} />
                <StudioShell />
              </StudioUiProvider>
            </InteractionStoreContext.Provider>
          </ViewportStoreContext.Provider>
        </StudioSessionContext.Provider>
        </UploadLibraryContext.Provider>
      </SaveControllerContext.Provider>
    </StudioProvider>
  );
}

/** Session-wide behaviour: keyboard shortcuts, and text heights kept true as fonts load. */
function Shortcuts({ viewport, interaction }: { viewport: ViewportStore; interaction: InteractionStore }) {
  const studio = useStudioStoreApi();
  useZoomShortcuts(viewport);
  useStudioShortcuts(studio, interaction);
  useTextLayout(studio);
  return null;
}

/** Keeps `?side=` in step with the active side (also after undo/redo), so links and reloads reopen it. */
function SideInUrl() {
  const active = useStudio(selectActiveSurfaceId);
  const first = useStudio((s) => s.document.surfaces[0]?.id);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const wanted = active === first ? null : active;
    if (params.get('side') === wanted) return;
    const next = new URLSearchParams(params);
    if (wanted) next.set('side', wanted);
    else next.delete('side');
    setParams(next, { replace: true, preventScrollReset: true });
  }, [active, first, params, setParams]);
  return null;
}

/**
 * A `?variantId=` in the URL follows the design's variant (M4: Product options can change it in
 * the Studio), so a reload or a shared link never undoes a choice made here. It is never added.
 */
function VariantInUrl() {
  const variantId = useStudio((s) => s.document.product.variantId);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (!params.has('variantId') || !variantId || params.get('variantId') === variantId) return;
    const next = new URLSearchParams(params);
    next.set('variantId', variantId);
    setParams(next, { replace: true, preventScrollReset: true });
  }, [variantId, params, setParams]);
  return null;
}

/**
 * Once a design is saved, `?design=` names it, so a reload or a bookmark reopens exactly this one
 * (several designs can exist for one product). A saved sample stops being a sample.
 */
function DesignInUrl() {
  const id = useStudio((s) => s.document.id);
  const persisted = useSaveState((s) => s.persisted);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const wanted = persisted ? id : null;
    const stale = params.get('design') !== wanted || (persisted && params.has('sample'));
    if (!stale) return;
    const next = new URLSearchParams(params);
    if (wanted) next.set('design', wanted);
    else next.delete('design');
    if (persisted) next.delete('sample');
    setParams(next, { replace: true, preventScrollReset: true });
  }, [id, persisted, params, setParams]);
  return null;
}
