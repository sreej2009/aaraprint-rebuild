/**
 * Design Studio profile: everything the editor needs to know about a product's print area.
 * Generated per product by scripts/studio/build-studio-profiles.mjs into
 * public/api/v1/studio/<slug>.json (mock API until the backend exists).
 */

/** Workspace the product will use. In Phase 3 every mode opens on the flat print area. */
export type StudioMode = 'flat' | 'apparel' | 'wrap';

export type StudioFamily =
  | 'visiting-card'
  | 'stationery'
  | 'stamp'
  | 'sign-poster'
  | 'label-packaging'
  | 'bag'
  | 'apparel'
  | 'polo'
  | 'rainwear'
  | 'umbrella'
  | 'gift'
  | 'mug'
  | 'drinkware'
  | 'pen'
  | 'round-pad';

export type SideId = 'front' | 'back';

/**
 * Usage rights of a recovered asset. Only `cleared` and `attribution-required` assets may be
 * shown in the Studio; `unconfirmed` ones are recorded but not used.
 */
export type RightsStatus = 'cleared' | 'attribution-required' | 'unconfirmed';

export interface StudioPrintSpec {
  /** Finished (trim) size in print pixels. Bleed is added outside (decision D1). */
  widthPx: number;
  heightPx: number;
  dpi: number;
  bleedPx: number;
  /** Distance inside the trim edge that important content should keep clear of. */
  safeZonePx: number;
  /** Original apparel layout scale (polos 1.5); used by on-product workspaces in Phase 4. */
  printAreaSizeMultiplier: number;
}

export type TrimShapeKind = 'rectangle' | 'rounded-rectangle' | 'ellipse';

export interface StudioTrim {
  shape: TrimShapeKind;
  cornerRadiusPx: number;
  source: 'print-config' | 'product-override';
  note?: string;
}

export interface StudioMockup {
  ref: string;
  format: 'png' | 'webp' | 'gif';
  width: number;
  height: number;
  /** Fabric mask (umbrellas, rainwear): white where the product's colour is. Rights recorded since M3. */
  mask: { ref: string; width: number; height: number; rights?: RightsStatus } | null;
  rights: RightsStatus;
}

/**
 * Where the artwork sits on a side's mockup photo, in the photo's pixels (Phase 4 M1): it is
 * fitted inside this box, keeping its proportions, and centred. Copied from the original Studio
 * (scripts/studio/extract-product-views.mjs); never estimated.
 */
export interface StudioPlacement {
  centerX: number;
  centerY: number;
  maxWidth: number;
  maxHeight: number;
}

export interface StudioSide {
  id: SideId;
  label: string;
  mockup: StudioMockup | null;
  /** Only on products with an on-product preview; null when the photo has no placement. */
  placement?: StudioPlacement | null;
  /** The colour this side's photo was taken in, e.g. "Black" (products with colours, M3). */
  photoColour?: string | null;
  /**
   * Pens and mugs (M4): the frame the placement is measured in, and where the photo — or a crop
   * of it, in photo px — is drawn inside it. Without one, the frame is the photo itself (M1).
   */
  photoFrame?: StudioPhotoFrame | null;
}

export interface StudioPhotoFrame {
  width: number;
  height: number;
  crop: { x: number; y: number; width: number; height: number } | null;
  at: { x: number; y: number; width: number; height: number };
}

/** A product colour the on-product view can show (Phase 4 M3): one of the product's own colour options. */
export interface StudioProductColour {
  /** The catalogue option value id. */
  id: string;
  label: string;
  /** #rrggbb, from the original palette. */
  hex: string;
}

/** Products whose Preview can show the design on a product photo (Phase 4 M1). */
export type ProductViewKind = 'umbrella' | 'rainwear' | 'drinkware-wrap' | 'pen' | 'mug';

export interface StudioModel3d {
  ref: string;
  format: 'glb';
  bytes: number;
  rights: RightsStatus;
  attribution?: string;
  colorMaterialName: string | null;
  printAreas: { id: string; uvOffset: [number, number]; uvScale: [number, number] }[];
}

/** A size named in the product (A4, A5, DL…) compared with its canvas. Informational (decision D2). */
export interface StudioSizeCheck {
  namedSize: string;
  expectedMm: [number, number][];
  actualMm: [number, number];
  matches: boolean;
}

export interface StudioProfile {
  schemaVersion: 1;
  slug: string;
  productId: string;
  name: string;
  mode: StudioMode;
  family: StudioFamily;
  /** Set when the Preview can show the design on the product (Phase 4 M1). */
  productView?: ProductViewKind;
  /** Development only: the photos are generated stand-ins (product-view/dev-fixtures.ts). Never in real profiles. */
  devFixtures?: true;
  /** Colours the product photo can be shown in (umbrellas and rainwear, Phase 4 M3). */
  productColours?: { options: StudioProductColour[]; defaultId: string };
  print: StudioPrintSpec;
  trim: StudioTrim;
  sides: StudioSide[];
  model3d: StudioModel3d | null;
  sizeCheck: StudioSizeCheck | null;
  /** Options that change the real print size or shape; not applied to the canvas in Phase 3. */
  geometryOptions: string[];
}

export function canUseAsset(rights: RightsStatus): boolean {
  return rights !== 'unconfirmed';
}
