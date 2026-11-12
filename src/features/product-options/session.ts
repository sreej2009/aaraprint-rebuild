import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyConfiguration } from '@/features/product-workflow/configuration';
import { familyIdForSlug, productWorkflow, type ProductWorkflow } from '@/features/product-workflow/registry';
import type { DesignRepository } from '@/features/studio/persistence/repository';
import type { SaveController } from '@/features/studio/persistence/save-controller';
import type { StudioProfile } from '@/features/studio/profile/types';
import { createBlankDesign } from '@/features/studio/schema/create';
import { CURRENT_SCHEMA_VERSION, DESIGN_FORMAT, type DesignDocument } from '@/features/studio/schema/types';
import { createStudioStore, type StudioStore } from '@/features/studio/store';
import type { Product } from '@/lib/catalogue/types';

/**
 * The product page's design session (Phase 4 M2). Product options are the design's product
 * configuration (schema v3), so the page runs the same Studio store and save controller as the
 * Studio: every choice is an M1 product command (one undo step), autosaved to this browser's
 * designs and versions, and the Studio opens the same design when "Start designing" is pressed.
 *
 * - The first render uses a new design from the product's default variant (what the pre-rendered
 *   HTML shows), with no orientation yet: it is asked by the "Design it" entry step (M3). In the browser the latest saved design for the product is then restored — unless
 *   the customer already changed something — and a `?variantId=` link wins over it, as in the Studio.
 * - Nothing is written until the customer changes something.
 * - Saving code (repository, restore, save controller, validator) loads after the page is
 *   interactive, so it never weighs on the product page's first load.
 * - Products ordered without a design (no Studio profile) keep their choices in memory only.
 */

export type SessionPersistence =
  /** Looking for a saved design (first moments in the browser, and pre-rendering). */
  | 'starting'
  /** Choices are saved in this browser with the design. */
  | 'device'
  /** Choices last for this visit only (no Studio profile, or storage unavailable). */
  | 'memory';

export interface ProductDesignSession {
  store: StudioStore;
  workflow: ProductWorkflow | null;
  controller: SaveController | null;
  persistence: SessionPersistence;
  /**
   * Write any pending change now, waiting for the saving code if it is still loading — before
   * the Studio opens, so it restores exactly this design (M3). Resolves even if saving fails.
   */
  flush(): Promise<void>;
}

export interface ProductDesignSessionOptions {
  product: Product;
  profile: StudioProfile | null;
  /** `?variantId=` from the URL (null when absent). */
  linkedVariantId: string | null;
  /** Where designs are saved; defaults to this browser's IndexedDB. Injectable for tests. */
  repository?: DesignRepository | null;
}

/** A configuration-only document for products without a Studio profile (never saved). */
function configurationDocument(product: Product): DesignDocument {
  const now = new Date().toISOString();
  return {
    format: DESIGN_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'configuration',
    name: product.name,
    product: { slug: product.slug, productId: product.id, familyId: familyIdForSlug(product.slug), variantId: null, sku: null, configuration: emptyConfiguration() },
    surfaces: [],
    assets: {},
    meta: { createdAt: now, updatedAt: now, revision: 0 },
  };
}

function defaultVariantId(product: Product): string | null {
  return (product.variants.find((v) => v.isDefault) ?? product.variants[0])?.id ?? null;
}

export function createSessionStore(product: Product, profile: StudioProfile | null, workflow: ProductWorkflow | null): StudioStore {
  const designable = product.isCustomizable && profile !== null;
  const document = designable
    ? createBlankDesign(profile, { variantId: defaultVariantId(product), catalogue: product })
    : configurationDocument(product);
  const store = createStudioStore({ document, catalogue: product, workflow, measureText: null });
  // Not an undo step: the configuration starts from the default variant's own values.
  if (!designable) store.getState().actions.syncProductVariant(defaultVariantId(product));
  return store;
}

export function useProductDesignSession({ product, profile, linkedVariantId, repository: injected }: ProductDesignSessionOptions): ProductDesignSession {
  const workflow = useMemo(() => productWorkflow(product.slug), [product.slug]);
  const [store] = useState(() => createSessionStore(product, profile, workflow));
  const [controller, setController] = useState<SaveController | null>(null);
  const [persistence, setPersistence] = useState<SessionPersistence>('starting');
  // Settles once the session knows where it saves (with the controller in use, or none).
  const settled = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  if (!settled.current) {
    let resolve = () => {};
    const promise = new Promise<void>((r) => (resolve = r));
    settled.current = { promise, resolve };
  }
  const controllerRef = useRef<SaveController | null>(null);
  const flush = useCallback(async () => {
    await settled.current?.promise;
    await controllerRef.current?.flush();
  }, []);

  useEffect(() => {
    const { actions } = store.getState();
    // A `?variantId=` link wins (not an undo step), as in the Studio.
    if (linkedVariantId) actions.syncProductVariant(linkedVariantId);

    const designable = product.isCustomizable && profile !== null;
    if (!designable || injected === null || (injected === undefined && typeof globalThis.indexedDB === 'undefined')) {
      setPersistence('memory');
      settled.current?.resolve();
      return;
    }

    let live = true;
    let stopCurrent = () => {};
    void Promise.all([import('@/features/studio/persistence/repository'), import('@/features/studio/persistence/restore'), import('@/features/studio/persistence/save-controller')]).then(
      async ([{ browserRepository }, { openSavedDesign }, { createSaveController }]) => {
        if (!live) return;
        const repository = injected ?? browserRepository();
        const start = (record: Parameters<typeof createSaveController>[0]['record'] = null) => {
          const controller = createSaveController({ studio: store, repository, productSlug: product.slug, productId: product.id, record });
          stopCurrent = controller.start();
          controllerRef.current = controller;
          setController(controller);
          return controller;
        };
        const first = start();
        // Changes made before the saving code arrived: write them now.
        if (store.getState().history.past.length > 0) void first.saveNow();

        const result = await openSavedDesign(repository, { productSlug: product.slug, designId: null });
        if (!live) return;
        if (result.kind === 'new' && result.storageError) {
          setPersistence('memory');
          settled.current?.resolve();
          return;
        }
        // Continue the saved design, unless the customer already started choosing on this visit.
        if (result.kind === 'restored' && store.getState().history.past.length === 0) {
          stopCurrent();
          store.getState().actions.replaceDocument(result.document);
          store.getState().actions.syncProductVariant(linkedVariantId ?? result.document.product.variantId);
          start(result.record);
        }
        setPersistence('device');
        settled.current?.resolve();
      },
      () => {
        if (live) setPersistence('memory');
        settled.current?.resolve();
      },
    );

    return () => {
      live = false;
      stopCurrent();
    };
    // One session per product page visit (the page remounts per product).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { store, workflow, controller, persistence, flush };
}
