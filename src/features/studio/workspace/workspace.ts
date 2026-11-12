import { familyIdForSlug, productWorkflow, type ProductWorkflow } from '@/features/product-workflow/registry';
import type { InitialTool, ProductFamilyId, WorkspaceKind, WorkspaceView } from '@/features/product-workflow/types';
import type { StudioProfile } from '../profile/types';
import type { DesignProductRef } from '../schema/types';

/**
 * Which workspace the Studio opens (Phase 4 M4), resolved from the design's persisted product
 * configuration — its family (`product.familyId`, or the registry's family for its slug when a
 * migrated design hasn't recorded one) — never from the URL or a list of slugs.
 *
 * The registry says what the original showed (product photo frame, perspective "On product" with
 * a Flat artwork switch, polo stage, gift frame, flat print area). Whether we can show the product
 * depends on the data we hold: photo frames with the original's placements (umbrella, rainwear,
 * drinkware, pen, mug) can; perspective faces, gift frames and the drawn polo exist in the
 * original source but are not imported yet, so those open on the flat print area — the same
 * design, nothing invented — and say so.
 */

/** How the editing canvas shows the design: on the product photo, or as the flat print area. */
export type CanvasView = 'product' | 'flat';

export type ProductRepresentation =
  /** The original's photo frame with exact placements (M1–M4 product view; rights-gated). */
  | 'product-photo'
  /** The original shows the product, but its geometry isn't imported yet: flat print area. */
  | 'not-imported'
  /** A flat print product: the print area is the workspace. */
  | 'none';

export interface StudioWorkspace {
  familyId: ProductFamilyId | null;
  workflow: ProductWorkflow | null;
  kind: WorkspaceKind;
  /** The canvas views the original offered, in its order (the first is where it opened). */
  views: readonly CanvasView[];
  /** Where this Studio opens: the original's first view when the product can be shown, else flat. */
  initialView: CanvasView;
  representation: ProductRepresentation;
  /**
   * Show the On the product / Flat switch: whenever the product can be shown. Photo-frame products
   * open on the product (the original's only view) and keep the Studio's existing Flat view for
   * precise work; perspective families gain it when their faces are imported.
   */
  toggle: boolean;
  /** The flat view's name in the switch ("Flat artwork", "Seal design"). */
  flatLabel: string;
  /** The tool the Studio opens on (registry, as observed on the original). */
  initialTool: InitialTool;
  /** The original shows one printable surface (no side switch). */
  singleSurface: boolean;
}

const VIEW: Record<WorkspaceView, CanvasView> = {
  'on-product': 'product',
  'flat-artwork': 'flat',
  'seal-design': 'flat',
  'print-area': 'flat',
  garment: 'flat',
};

const FLAT_LABEL: Partial<Record<WorkspaceView, string>> = { 'flat-artwork': 'Flat artwork', 'seal-design': 'Seal design' };

/** Unknown products (not in the registry) get the plain flat print area: nothing assumed. */
const UNKNOWN: Omit<StudioWorkspace, 'familyId' | 'workflow'> = {
  kind: 'flat',
  views: ['flat'],
  initialView: 'flat',
  representation: 'none',
  toggle: false,
  flatLabel: 'Flat',
  initialTool: 'text',
  singleSurface: false,
};

export function resolveWorkspace(product: Pick<DesignProductRef, 'slug' | 'familyId'>, profile: Pick<StudioProfile, 'productView'> | null): StudioWorkspace {
  const familyId = product.familyId ?? familyIdForSlug(product.slug);
  const workflow = productWorkflow(product.slug);
  if (!familyId || !workflow || workflow.family.id !== familyId) return { familyId, workflow: null, ...UNKNOWN };

  const kind = workflow.initialStudio.workspace;
  const registryViews = workflow.family.initialStudio.views;
  const views = [...new Set(registryViews.map((v) => VIEW[v]))];
  const representation: ProductRepresentation = kind === 'flat' ? 'none' : kind === 'photo-frame' && profile?.productView ? 'product-photo' : 'not-imported';
  const flatView = registryViews.find((v) => VIEW[v] === 'flat');
  return {
    familyId,
    workflow,
    kind,
    views,
    // Opens on the product only when it can be shown; otherwise on the flat print area.
    initialView: representation === 'product-photo' ? (views[0] ?? 'flat') : 'flat',
    representation,
    toggle: representation === 'product-photo',
    flatLabel: (flatView && FLAT_LABEL[flatView]) ?? 'Flat',
    initialTool: workflow.initialStudio.tool,
    singleSurface: workflow.surfaces.length === 1,
  };
}

/** Footer note when the original shows the product but this Studio can't yet (or not here). */
export function workspaceNote(workspace: StudioWorkspace, productShown: boolean, photoOffered: boolean): string | null {
  if (productShown || workspace.representation === 'none') return null;
  if (workspace.representation === 'not-imported') return 'On-product view for this product isn’t available yet: you’re designing the flat print area.';
  return photoOffered ? null : 'The product photo isn’t available here: you’re designing the flat print area.';
}
