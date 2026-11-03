# Aaraprint Rebuild — Frontend Implementation Plan

**Status:** Proposal for approval (no code written) · **Date:** 31 Oct 2026
**Project:** `aaraprint-rebuild` (React 19.3 · Vite 8.3 · TypeScript 7.0 · oxlint) — already has `konva`, `react-konva`, `zustand`, `lucide-react` installed.
**Inputs:** `AARAPRINT_RECONNAISSANCE.md` (what exists), `AARAPRINT_UI_UX_BLUEPRINT.md` (what it should feel like), `AARAPRINT_ASSET_INVENTORY.md` (what we can reuse).

---

## 1. Key findings that shape the architecture

| Finding (confirmed) | Consequence for the rebuild |
|---------------------|-----------------------------|
| The original editor is built on **react-konva** (Konva), not Fabric.js | Our installed stack (react-konva) is the right choice; proven for this product range. |
| 3D previews are **procedural React-Three-Fiber scenes** (cylinder, cone, box, card, stamp, round pad) plus **one GLB** (polo) | Most 3D needs no model files — textures from the 2D canvas on simple geometry. |
| Product data is **option groups → variants (SKU) with price deltas**; 533 products, 11 categories; per-product **print config** (canvas px, DPI, bleed, safe zone, trim shape, category flat_print / apparel / wrap, mockup URLs) | A typed product-configuration layer drives both PDP and Studio. |
| Design JSON is a small, portable schema (`schemaVersion: 1`, `printAreas`, `elements[]` with `content`) | Keep the concept, version it as v2, write a v1 → v2 importer. |
| Original is a server-rendered Next.js app (SEO for 553 sitemap URLs) | A pure SPA would lose SEO. Needs SSR or prerendering for public pages (decision in §3). |
| Guest drafts live in IndexedDB; signed-in designs saved via server actions (`saveDesign`, `uploadDesignPreview`, `uploadDesignAsset`) | Same split: local-first drafts + cloud sync API. |

---

## 2. Recommended stack

| Concern | Choice | Status | Justification |
|---------|--------|--------|---------------|
| UI | React 19 + TypeScript | installed | — |
| Build | Vite 8 | installed | — |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`) with design tokens in `@theme` | to add | Requested; tokens from the Blueprint map 1:1 to CSS variables. |
| Accessible primitives | **Radix UI primitives** (Dialog, Popover, DropdownMenu, Select, Tabs, Tooltip, Slider, ToggleGroup, ScrollArea) | to add | Focus management, ARIA and keyboard support we shouldn't hand-roll. Unstyled, so the new look is ours. |
| Icons | lucide-react | installed | — |
| Routing | **React Router v7** | to add | Nested layouts, lazy routes, data loaders, search-param state for filters. Supports SSR/prerender (see §3). |
| Server state | React Router loaders / `clientLoader` + typed API client | in use | **Phase 1 decision:** TanStack Query deferred to avoid overlapping data layers. Re-evaluate in Phase 6 if cart/account caching needs it. |
| Client state | **Zustand v5** (+ `immer` middleware) | Zustand installed; immer to add | Studio store and UI state. Immer gives structural sharing and **patches for undo/redo**. |
| 2D canvas | **Konva + react-konva** | installed | Matches the proven original engine; Transformer, hit graph, export to image. |
| 3D | **three + @react-three/fiber + @react-three/drei** | to add (lazy chunk) | Same approach as the original; loaded only when 3D preview opens. |
| Local drafts | **idb** (≈1 KB IndexedDB wrapper) | to add | Promise API, typed stores, versioned upgrades. |
| Forms & validation | **react-hook-form + zod** | to add | Checkout, address, auth forms; zod schemas reused for API contracts and design JSON validation. |
| QR codes | **qrcode** (generator to SVG/canvas) | to add | Original generated QR locally with high error correction. |
| IDs | `nanoid` | to add (tiny) | Element and draft IDs. |
| Toasts | `sonner` | to add (small) | Accessible toasts with actions ("Undo"). Optional — can be built on Radix Toast. |
| Fonts | `@fontsource-variable/inter`, `@fontsource-variable/manrope`; Studio fonts self-hosted woff2 loaded via `FontFace` | to add | No third-party font CDN at runtime; fonts must be embeddable in print files. |
| Testing | Vitest + Testing Library + Playwright + @axe-core/playwright | to add | See §14. |

Not recommended now: Redux, Fabric.js, a CSS-in-JS runtime, Framer Motion (CSS transitions are enough; add only if a specific interaction needs it), heavy date libraries.

---

## 3. Rendering strategy (decision needed)

| Option | How | Pros | Cons |
|--------|-----|------|------|
| **A. SPA + build-time prerender** | React Router library mode; prerender home, categories, product pages to static HTML at build from the catalogue API | Simple hosting (static + API), fast | Rebuild needed when catalogue changes; prices in HTML may be stale (client refreshes). |
| **B. React Router framework mode (SSR on Vite)** | Server-render public routes; Studio, cart, checkout, account are client-only routes | SEO parity with the current Next.js site, fresh prices, social previews | Needs a Node runtime for the frontend. |

The Studio is client-only in both options (`ssr: false` equivalent via lazy route).

**Decision (Phase 1, approved):** option A using React Router 8 framework mode with `ssr: false` + `prerender` (`react-router.config.ts`). Home and content pages are pre-rendered now; Phase 2 adds every `/categories/:slug` and `/products/:slug`. Everything else is served by `__spa-fallback.html` — hosting rules are implemented in `scripts/serve-build.mjs`.

---

## 4. Folder structure

```
src/
  app/                      # app shell, providers, router, error boundaries
    routes/                 # route modules (lazy)
  design-system/            # tokens.css, primitives (Button, Chip, Swatch, Sheet, Dialog…)
  features/
    catalogue/              # categories, listing, search, filters, product card, quick view
    product/                # PDP: gallery, option selector, price block, tiers, specs
    pricing/                # pure pricing engine (variant resolution, tiers, shipping)
    cart/                   # cart drawer, cart page, cart store/queries
    checkout/               # steps, address/PIN lookup, payment methods, confirmation
    account/                # overview, orders, designs, addresses, settings
    auth/                   # sign in/up, reset, Google, return-to
    tracking/               # public order tracking
    studio/                 # Design Studio (see §7)
  lib/
    api/                    # typed API client, endpoints, zod contracts
    storage/                # idb setup, local draft repository
    format/                 # currency (en-IN), units (px↔mm), dates
    analytics/              # event helpers (optional)
  content/                  # static pages (FAQ, policies) as MD/MDX or JSON
  test/                     # fixtures (recovered catalogue JSON), helpers
```

---

## 5. Page modules and reusable components

| Route | Module | Main components |
|-------|--------|-----------------|
| `/` | Home | Hero, SearchField, CategoryGrid, ProductRail, HowItWorks, StudioPromo, OccasionGrid, TrustBand, Reviews |
| `/c/:category` (+ `?type&finish&min&max&sort&page`) | Listing | FilterPanel, ActiveFilterChips, SortMenu, ProductGrid, ProductCard, QuickView, Pagination |
| `/search?q=` | Search | same as listing + DidYouMean, ZeroResults |
| `/p/:slug` (+ `?variantId&designId`) | PDP | Gallery, Mockup3DToggle, OptionStepper, OptionChip/Swatch/Tile, QuantityTiers, PriceBlock, DeliveryEstimate, ArtworkChoice, SpecsAccordion, Related |
| `/p/:slug/design` (+ `?variantId&designId`) | Studio | see §7 |
| `/cart` | Cart | CartLine, DesignThumb, FreeShippingProgress, OrderSummary |
| `/checkout` | Checkout | CheckoutSteps, ContactForm, AddressForm (PIN lookup), PaymentMethod, ReviewStep |
| `/order/:number/confirmed` | Confirmation | OrderTimeline, NextSteps |
| `/track` | Tracking | TrackForm, TrackResult |
| `/account/*` | Account | AccountNav, OrderList, OrderDetail, DesignGrid, AddressBook, SettingsForm |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Auth | AuthCard, GoogleButton, ReturnTo handling |
| `/about`, `/contact`, `/faq`, `/shipping`, `/refund-policy`, `/privacy`, `/terms`, `/credits` | Content | ProsePage, TOC, Accordion |

**URL note:** we can keep the original URL shapes (`/categories/:slug`, `/products/:slug`, `/products/:slug/design`) to preserve SEO and inbound links, or adopt shorter ones with 301 redirects. Recommendation: **keep the original paths** — zero migration risk.

---

## 6. Product configuration architecture

### 6.1 Types

```ts
type PrintCategory = 'flat_print' | 'apparel' | 'wrap';
type StudioMode =
  | 'flat' | 'folded' | 'apparel' | 'wrap' | 'umbrella' | 'box' | 'stamp' | 'gift-perspective';

interface Product {
  id: string; slug: string; name: string;
  categorySlug: string; subTypes: string[];
  shortDescription: string; description: string;
  images: ProductImage[];                 // gallery (front/back/lifestyle)
  isCustomizable: boolean; isFeatured: boolean; badges: ('bestseller'|'new')[];
  basePriceCents: number; currency: 'INR';
  optionGroups: OptionGroup[];
  variants: Variant[];
  setsAllowed?: { min: number; max: number }; // the original "Batches" stepper
  dispatchDays: [min: number, max: number];   // "dispatch in 2–3 days"
  print?: PrintConfig;                         // absent for non-customisable items
  studio?: StudioProfile;                      // mode + product-specific settings
}

interface OptionGroup {
  id: string; name: string;                 // "Quantity", "Ink Style", "Lid Type"…
  display: 'chip' | 'swatch' | 'tile' | 'tier' | 'dropdown';
  affects: ('sku' | 'price' | 'render' | 'print')[];   // see 6.3
  values: { id: string; key: string; label: string; priceDeltaCents: number;
            hex?: string; imageUrl?: string; quantity?: number }[];
}

interface Variant {
  id: string; sku: string; priceCents: number; compareAtPriceCents: number | null;
  stockStatus: 'in_stock' | 'out_of_stock' | 'made_to_order';
  isDefault: boolean; optionValueIds: string[];
}

interface PrintConfig {
  category: PrintCategory;
  canvasWidthPx: number; canvasHeightPx: number; dpi: number;
  bleedPx: number; safeZonePx: number;
  trimShape: 'rectangle' | 'rounded-rectangle' | 'circle' | 'oval';
  printAreas: PrintArea[];                 // front/back/flap/inside/cover-front… (resolved per mode)
  mockups?: { front?: string; back?: string; frontMask?: string; backMask?: string };
  model3d?: { kind: 'glb' | 'cylinder' | 'cone' | 'box' | 'card' | 'stamp' | 'round-pad'; url?: string; params?: Record<string, number> };
  printAreaSizeMultiplier?: number;         // polo uses 1.5 in the original
}

interface PrintArea {
  id: string; label: string;                // "Front", "Upper back", "Left chest", "Flap"
  widthPx: number; heightPx: number;
  placementOnMockup?: { x: number; y: number; w: number; h: number; quad?: [number, number][] };
  optional?: boolean; priceDeltaCents?: number;   // e.g. printing the back costs extra
}
```

### 6.2 Pricing engine (pure, unit-tested)

- `resolveVariant(product, selectedValueIds)` → exact variant by `optionValueIds` match.
- `priceFor(variant, sets)` = `variant.priceCents × sets` (confirmed on the original: variant price = base + Σ deltas, e.g. ₹229 + ₹8 = ₹237).
- `tiers(product, otherSelections)` → per-unit price and savings % for each Quantity value (powers the tier picker; original "Quantity price breaks" table appears on 307 products).
- `shipping(subtotal)` → ₹0 if ≥ ₹1,999 else ₹99 (from Shipping policy).
- **Server is authoritative**: the client shows a quote; the cart/checkout API recomputes and returns the final price.

### 6.3 Option effects

The original mixes options that change SKU/price (quantity, ink style), options that only change rendering (garment colour, mug part colours) and options that change print geometry (size, orientation, envelope size). Tag each group with `affects` so:

- `sku`/`price` → PDP price + cart line.
- `render` → Studio mockup tint/part colour only.
- `print` → Studio recomputes canvas size and re-fits both sides ("Your front and back designs resize together" — kept from original).

### 6.4 Studio mode registry

```ts
interface StudioModeDefinition {
  mode: StudioMode;
  resolvePrintAreas(product: Product, selection: Selection): PrintArea[];
  Workspace: React.ComponentType<WorkspaceProps>;         // Konva stage + mockup/guides
  OptionsPanel?: React.ComponentType<OptionsPanelProps>;   // part colours, cap type, fold…
  Preview3D?: React.LazyExoticComponent<React.ComponentType<Preview3DProps>>;
  preflight?: PreflightRule[];                             // mode-specific checks
  exportArea(area: PrintAreaDesign, opts: ExportOpts): Promise<Blob>;
}
```

Modes map to the families found in the original code (`isPolo`, `isPen`, `isMug`, `isDrinkware`, `isUmbrellaRainwear`, `isSignPoster`, `isGiftFlat`, `isRoundMousePad`, `isCardOrientation`, `isOvalCard`, `isTwoSidedCard`, `isEngagementCard`, notebook/diary/folder/envelope/stamp lists). We replace hard-coded slug lists with `studio.mode` + `studio.profile` fields in product data.

---

## 7. Design Studio architecture

### 7.1 Module layout

```
features/studio/
  StudioRoute.tsx            # loads product, draft; error/loading states
  shell/                     # TopBar, ToolRail, ToolPanel, Inspector, MobileBottomBar, Sheets
  canvas/
    Stage.tsx                # Konva Stage, zoom/pan, pointer & touch gestures
    layers/                  # MockupLayer, GuidesLayer (trim/bleed/safe), ElementsLayer, OverlayLayer
    nodes/                   # TextNode, ImageNode, ShapeNode, QrNode, TableNode, GroupNode, CurvedTextNode
    transformer/             # selection, multi-select marquee, handles, rotate
    snapping/                # smart guides engine (pure functions)
  tools/                     # Templates, Text, Uploads, Graphics, Shapes, QR, Background, ProductOptions
  inspector/                 # sections: Content, Style, PositionSize, Effects, Layers
  modes/                     # flat, folded, apparel, wrap, umbrella, box, stamp, gift-perspective
  preview3d/                 # lazy: FlatCard, Cylinder, Cone, Box, Stamp, RoundPad, PoloGlb
  preflight/                 # rules + runner + fix actions
  persistence/               # local drafts (idb), cloud sync, version history
  export/                    # proof PNG/PDF, preview thumbnails, print-file payload
  store/                     # zustand slices (see 7.2)
  schema/                    # design JSON v2 types, zod validators, v1 importer
```

### 7.2 State management (Zustand slices)

| Slice | State | Notes |
|-------|-------|-------|
| `document` | `DesignDoc` (all print areas), active area | The only thing that is saved. Changed only through **commands**. |
| `selection` | selected ids, hovered id, editing text id | Not saved, not in history. |
| `viewport` | zoom, pan, fit mode, guides visible, view (product/flat) | Saved per user preference (localStorage). |
| `history` | past/future stacks of immer patches, coalescing key | Capped at 100 entries. |
| `sync` | `dirty`, `localSavedAt`, `cloudSavedAt`, status, error, version | Drives the save indicator. |
| `ui` | active tool, panel open, sheet state, dialogs | — |
| `product` | product, print config, selection of options, price quote | Read-mostly. |

Rendering performance: components subscribe with narrow selectors; element nodes are memoised by id; drag/transform updates write to Konva nodes directly and **commit once on drag end** (as the original does with `{commit: true}`).

### 7.3 Canvas architecture

- **Coordinate system:** design units = print pixels at product DPI (same as original: canvas width/height in px at 300/150/100 DPI). The stage scales to screen with `scale = zoom × fitScale`. Inspector shows mm/cm via `px / dpi × 25.4`.
- **Layers (Konva):**
  1. Mockup layer (product photo, tinted parts, masks) — `listening: false`.
  2. Clip group for the print area (trim shape path: rect, rounded rect, circle/ellipse; wrap areas unrolled).
  3. Elements layer (user content), clipped to bleed box.
  4. Guides layer (bleed, trim, safe, centre lines) — `listening: false`.
  5. Overlay layer (Transformer, smart guides, marquee, DPI badges).
- **Text:** Konva `Text` with measured wrapping; curved text via per-glyph layout on an arc (the original's `layoutCurvedText` algorithm: arc top/bottom, radius from box size).
- **Images:** stored as `storagePath` + `naturalWidth/Height`; crop rectangle in element content; optional tint (single-colour logos) via Konva filters or offscreen canvas.
- **Hit testing & selection:** Konva hit graph; marquee via intersecting rects; locked elements not listening.
- **Gestures:** wheel zoom around pointer, Ctrl/⌘ + wheel; space-drag pan; touch pinch-zoom and two-finger pan; one-finger drag moves the selected element.
- **Snapping engine (pure TS, unit-tested):** candidates = canvas centre/edges, safe-zone edges, other elements' edges/centres; threshold 6 screen px; returns adjusted position + guide lines to draw.
- **Export:** hide overlay/guides (original hides the Transformer before export), `stage.toCanvas({ pixelRatio })` per print area at full print resolution in a worker-friendly offscreen stage; previews at 1–2× screen.

### 7.4 Design JSON v2

```ts
interface DesignDoc {
  schemaVersion: 2;
  id: string; name: string;
  productId: string; productSlug: string; variantId?: string;
  dpi: number;
  areas: Record<string, AreaDesign>;     // "front", "back", "flap", "cover-front", "inside"…
  activeAreaId: string;
  productState?: {                        // render-only choices (original: mugColors, penColors, drinkware, giftPartColors)
    partColors?: Record<string, string>; capType?: string; orientation?: 'portrait'|'landscape';
    sameDesignBothSides?: boolean;
  };
  meta: { createdAt: string; updatedAt: string; appVersion: string; revision: number };
}

interface AreaDesign {
  widthPx: number; heightPx: number;
  background: { color: string | null; image?: ImageRef; extendToBleed: boolean };
  elements: DesignElement[];              // z-order = array order (no separate zIndex drift)
}

type DesignElement = TextEl | ImageEl | ShapeEl | QrEl | TableEl | GroupEl;
interface BaseEl { id: string; type: string; name?: string; x: number; y: number; width: number; height: number;
                   rotation: number; opacity: number; locked: boolean; hidden: boolean; }
interface TextEl extends BaseEl { type: 'text'; text: string; fontFamily: string; fontSize: number;
  fontWeight: 400|500|600|700|800; italic: boolean; underline: boolean; color: string;
  align: 'left'|'center'|'right'|'justify'; lineHeight: number; letterSpacing: number;
  curve?: { direction: 'top'|'bottom'; radius?: number } }
interface ImageEl extends BaseEl { type: 'image'; src: ImageRef; crop?: { x: number; y: number; w: number; h: number };
  tint?: string; placement: 'contain'|'cover'|'free' }
interface ShapeEl extends BaseEl { type: 'shape'; shape: 'rect'|'ellipse'|'line'|'triangle'|'star'|'polygon'|'arrow';
  fill: string|null; stroke: string|null; strokeWidth: number; cornerRadius?: number; points?: number }
interface QrEl extends BaseEl { type: 'qr'; data: string; kind: 'url'|'tel'|'email'|'text'|'upi'|'whatsapp';
  fg: string; bg: string|null; ecc: 'M'|'Q'|'H' }
interface TableEl extends BaseEl { type: 'table'; rows: string[][]; header: boolean; fontFamily: string; fontSize: number;
  color: string; border: string }
interface GroupEl extends BaseEl { type: 'group'; children: DesignElement[] }
interface ImageRef { storagePath?: string; localBlobId?: string; naturalWidth: number; naturalHeight: number; mime: string }
```

**v1 importer** maps the original shape `{schemaVersion:1, productId, printAreaId, canvasWidth, canvasHeight, backgroundColor, elements:[{id,type,x,y,width,height,rotation,opacity,locked,zIndex,content:{…}}], printAreas:{[id]:{backgroundColor,elements}}, giftPartColors?, mugColors?, penColors?, drinkware?}` → v2 (zIndex → array order; "hidden as opacity 0" stays opacity 0 since intent can't be inferred).

### 7.5 Templates

- Templates are data, not code: `{ id, name, style: 'minimal'|'bold'|'elegant'|'floral'|'photo', categories: PrintCategory[], productSlugs?: string[], perArea: Record<areaId, TemplateLayout> }` with element geometry **relative** to the canvas (0–1), exactly the original's approach (`x: .07 * w`), so one template fits all sizes.
- The 95 original templates (list in Reconnaissance Appendix B) can be re-authored into this format as a content task. Text copy can be reused; the visual styling should be refreshed to the new brand.

---

## 8. Local draft architecture (IndexedDB)

Database `aaraprint-studio` (v1):

| Store | Key | Indexes | Content |
|-------|-----|---------|---------|
| `drafts` | `draftId` | `productId`, `updatedAt`, `cloudDesignId` | Latest `DesignDoc` + history snapshot (last ≤100 patches compressed) + `dirtyCloud` flag |
| `versions` | `versionId` | `draftId`, `createdAt` | Named or automatic snapshots (keep last 20 automatic per draft) |
| `blobs` | `blobId` | `draftId` | Uploaded images not yet in cloud storage (so guests never lose an upload) |
| `meta` | key | — | Last opened draft per product, onboarding flags, recent colours, recent fonts |

Rules:
- Write on every committed change, debounced 500 ms; use a single transaction per save.
- On Studio open: if `?designId` → load cloud design (and compare with local draft revision; offer "Restore newer local changes?" if local is newer). Else → most recent local draft for this product (toast "Restored your last design · Start fresh").
- **Return-after-login:** before redirecting to sign-in, store `{draftId, productSlug, variantId}` in `sessionStorage` (original key: `aaraprint:restore-design-after-sign-in`); after login, upload blobs and the draft to the cloud, then reopen.
- Quota/availability errors (private mode) fall back to in-memory with a visible "Can't save on this device" banner (original shows "Couldn't save this design on your device").
- Clean-up: drafts not touched in 60 days and already in the cloud are pruned.

---

## 9. Save & history architecture

```
User action → command(document, args) ──immer produceWithPatches──▶ new doc + patches/inversePatches
     │                                                                 │
     ├─▶ history.push({patches, inverse, coalesceKey})  (cap 100)      │
     └─▶ sync.markDirty() ──debounce 500ms──▶ localRepo.save(draft)   │
                          └─throttle 5s (signed-in)─▶ cloud.saveDesign(doc, baseRevision)
                                                         ├─ 200: revision++, status "Saved"
                                                         ├─ 409: conflict → keep both / reload dialog
                                                         ├─ 401/403: read-only ("belongs to another account") → offer copy
                                                         └─ network error: retry with backoff, status "Couldn't save — retrying"
```

- **Coalescing:** consecutive edits with the same key (e.g. typing in one text box, dragging a slider) merge into one history entry within 600 ms.
- **Undo/redo** apply inverse patches; selection is restored from patch metadata.
- **Uploads:** file → validate type (PNG/JPG/WEBP/GIF/SVG) and size (≤ 20 MB, same as original) → decode dimensions → store blob locally → show immediately → upload in background to `uploadDesignAsset` (signed URL) → swap `localBlobId` for `storagePath`. SVGs sanitised before use.
- **Preview thumbnails:** rendered after each cloud save (front side, 600 px) and uploaded (`uploadDesignPreview` equivalent) for account grids and cart lines.
- **Approve:** flush local + cloud saves (`await` the in-flight save, as the original does), run preflight, then attach `{designId, revision}` to the cart line. The ordered revision is frozen server-side (later edits create a new revision).

---

## 10. 3D preview architecture

- Lazy-loaded route chunk (`preview3d/`), only on "3D" toggle or PDP 3D view. Fallback to 2D on WebGL failure (`Product3DErrorBoundary` pattern from the original).
- One `<Canvas>` with `frameloop="demand"`, DPR capped at 1.5 (1 on low-end mobile), soft environment + contact shadow, OrbitControls (rotate, zoom limits), auto-rotate off by default (respect reduced motion).
- **Texture pipeline:** Konva stage → offscreen canvas per print area at preview resolution (e.g. 1024 px long edge) → `THREE.CanvasTexture` (sRGB) → update throttled to 250 ms during editing, immediate on open. Dispose textures on unmount.
- **Geometries:** FlatCard (extruded shape with thickness and rounded/circle/oval trim, optional book/flap hinge), Cylinder (mugs, bottles, tumblers, pens; body/cap/handle colours; wrap UV from circumference × height), Cone (umbrella canopy panels), Box (packaging faces), Stamp, Round mouse pad, **Polo GLB** with decal projection for front/back print boxes.
- Assets: `/models/polo-shirt.glb` (CC BY 4.0, attribution required — see Asset Inventory). Draco decoder only if we compress models.

---

## 11. Backend integration requirements (for the separate backend design)

Derived from the original's server actions (`signIn`, `signUp`, `signOut`, `resendConfirmation`, `requestPasswordReset`, `getSearchSuggestions`, `addToCart`, `updateCartItemQuantity`, `removeCartItem`, `trackOrder`, `saveDesign`, `uploadDesignPreview`, `uploadDesignAsset`, `getSignedImageUrl`) and page data.

| Area | Endpoints / capabilities needed | Notes |
|------|-------------------------------|-------|
| Catalogue | list categories (with counts, hero image), list products (filters by category, sub-type, option values, price range, customisable, featured; sort; pagination), product by slug (option groups, variants, print config, studio profile, images), search + suggestions | Facet counts for filters. |
| Pricing | quote(productId, valueIds, sets) → price, tiers | Server authoritative; same engine as client. |
| Cart | guest cart token (cookie) + user cart merge on login; add/update/remove line (variantId, sets, designId+revision) | Original has a `CartCacheSync` client component. |
| Checkout | create order (contact, address, payment method), COD; online payment: Razorpay order create + signature verify + webhook (if enabled); discount codes | Order number format observed `NX261023-C8883A`. |
| Auth | email/password sign-up with email confirmation, sign-in, sign-out, reset, Google OAuth; return-to URL | Original uses Supabase auth. |
| Designs | create/update (with revision for conflict detection), list mine, get by id (ownership check, read-only for others), duplicate, rename, delete, versions; asset upload via signed URL; preview upload; signed read URLs for private assets | Original returns "Not your design." for foreign designs. |
| Print files | server-side render of approved revision to print-ready PDF/PNG per area at product DPI with bleed, fonts embedded | Needed for production; the browser export is for proofs only. |
| Orders | list mine, detail (status history, courier, tracking no., items, subtotal, GST, shipping), cancel (only "Confirmed"), reorder, invoice PDF | Statuses: Awaiting payment, Confirmed, Processing, Shipped, Delivered (+ Cancelled). |
| Tracking | public lookup by order number + checkout email | Rate-limited. |
| Addresses | CRUD, default address; PIN-code lookup (city/state) and serviceability/ETA | ETA is a new feature. |
| Account | profile update, password change, account deletion request (DPDP Act) | — |
| Content | contact / bulk enquiry form, reviews (optional), CMS for banners and policies (optional) | — |

Contracts: OpenAPI or a typed RPC; the frontend generates/hand-writes zod schemas in `lib/api`. Until the backend exists, a **mock API** serves the recovered catalogue (533 products, print configs) so frontend work isn't blocked.

---

## 12. Development phases

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| **1. Foundations** ✅ done | Tailwind v4 + tokens, fonts, Radix primitives styled to the Blueprint, router + layouts (React Router 8 framework mode, SPA + pre-rendering), API client + mock data from the recovered catalogue, asset recovery into `recovered-additional/`, Vitest/Playwright/axe setup, lint/typecheck | Storybook-like component page (or Ladle) shows Button, Chip, Swatch, Tier, Dialog, Sheet in all states; a11y checks pass. |
| **2. Catalogue, PDP & content** ✅ done | Mega-menu, search with suggestions, category / all-products / search listings with data-driven filters, sort and pagination, 533 product pages with option-driven pricing, quantity tiers, print specs and gallery, content & policy pages | All 533 products render from the catalogue data; every SKU price verified in unit tests; 11 sample products verified in the browser. Lighthouse not yet measured (see §17). |
| **3. Studio core** (≈5 wks) — detailed plan in §18, awaiting approval | Studio profiles and print geometry, design schema and commands, store with undo/redo, Studio route and **responsive shell (desktop, tablet, phone)**, Konva stage with zoom/pan and trim/bleed/safe guides, text/shape/graphic/image elements with selection and transform, inspector and layers, front/back, IndexedDB drafts with autosave and restore, version history, templates engine + first 15 templates, preview and proof PNG | A visiting card (rectangle, round, rounded), an A4 flyer and a polo's flat print area can be designed front/back, survive reload (uploads and undo history included) and export a proof; keyboard-only task and axe pass on desktop, tablet and phone. |
| **4. Studio advanced** (≈3 wks) | Smart guides/snapping, multi-select/align/group, crop, curved text, QR, tables, background/CMYK, Studio fonts incl. Indic, preflight + review modal, apparel mode (mockups, placements, colours), wrap mode (unwrap + parts), product options panel, mobile Studio refinements and usability test | Polo, mug, bottle, pen editable with correct mockups; preflight blocks placeholder text; mobile usability test passes. |
| **5. 3D & remaining modes** (≈2 wks) | Lazy 3D previews (card, cylinder, cone, box, stamp, round pad, polo GLB), folded (envelopes, folders, notebooks/diaries), umbrella, box/packaging, stamp, gift-perspective modes; remaining templates | Every product family opens in the right mode; 3D toggles work and fall back gracefully. |
| **6. Commerce & accounts** (≈3 wks, needs backend) | Auth (email + Google), cart (guest + merge), checkout (COD first, Razorpay if confirmed), confirmation, account (orders, designs, addresses, settings), tracking, cloud design sync + conflict handling, return-after-login | End-to-end: guest designs → adds to cart → checks out (COD) → tracks order; signed-in user sees saved designs. |
| **7. Polish & launch** (≈2 wks) | Accessibility audit and fixes, performance (code-split, image CDN, font subsetting), SEO (SSR/prerender, sitemap, structured data `Product`/`Offer`), analytics, error monitoring, content QA, redirects | WCAG 2.2 AA audit clean; Core Web Vitals green; production checklist signed off. |

Phase numbers follow the approved sequence (Foundations = Phase 1). Estimates assume one experienced frontend developer; parallelise phases 1 and 2 with two developers.

---

## 13. Performance budget

- Storefront JS ≤ 170 KB gzip initial; Studio route ≤ 350 KB gzip (Konva included); 3D chunk ≤ 250 KB gzip, loaded on demand.
- Images: AVIF/WebP via an image CDN with width-based `srcset`; product mockups 1600 px max for Studio, 800 px for cards. Current mockups are 0.3–1.6 MB PNGs — convert to WebP/AVIF (see Asset Inventory).
- Studio: 60 fps drag with 50 elements on a mid-range phone; text measurement cached; exports off the main thread where possible (`OffscreenCanvas` in a worker when supported).

---

## 14. Testing strategy

| Layer | Tool | What |
|-------|------|------|
| Unit | Vitest | Pricing engine (variant resolution, tiers, shipping), snapping math, unit conversions, design JSON v1→v2 importer, preflight rules, history coalescing, template layout scaling. |
| Component | Vitest + Testing Library | Option selectors (keyboard, ARIA), price block live updates, inspector forms, layers list, dialogs/sheets focus traps. |
| Canvas | Vitest (jsdom + `canvas` package) or Playwright component tests | Node rendering from JSON, transform commits, export dimensions = print px. |
| Visual regression | Playwright screenshots | Key pages at 3 breakpoints; Studio with fixed fixtures per mode; 3D snapshot with deterministic camera. |
| E2E | Playwright | 10 journeys from the Reconnaissance doc, including guest → login → restore draft, offline autosave, conflict dialog, COD checkout (against mock/staging). |
| Accessibility | @axe-core/playwright + manual screen-reader passes (NVDA, VoiceOver) | Every page; Studio keyboard-only design task. |
| Performance | Lighthouse CI, Studio FPS trace | Budgets in §13. |
| Contract | zod schema tests against backend OpenAPI | Catch API drift early. |

Fixtures come from the recovered catalogue (product JSON + print configs) so tests use real-shaped data.

---

## 15. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| SEO loss if shipped as a pure SPA | Decided in Phase 1: SPA + build-time pre-rendering (§3). |
| Asset rights: brand-name product photos (Adidas, Puma, Levi's…), Unsplash photos, CC-BY polo model | Confirm rights with the business; keep attribution page; replace stock images. |
| Incomplete asset recovery (≈30 % of mockups not downloaded) | Done in Phase 1: 189 files recovered into `recovered-additional/` (Asset Inventory §8). |
| Print accuracy (browser render ≠ print output) | Server-side print-file renderer from the same JSON; golden-file tests comparing browser and server output. |
| Fonts differing between proof and print | Self-host fonts, embed in print files, block unknown fonts. |
| Backend timeline | Mock API from recovered data; contract-first design. |
| Payment model unclear (COD vs online) | Build COD first; Razorpay behind a feature flag. |

---

## 16. Decisions needed before development

1. Rendering: SSR (React Router framework mode) vs SPA + prerender.
2. Keep original URL paths? (recommended: yes)
3. Online payment in scope for launch?
4. Backend platform (keep Supabase-style auth/storage or new backend) — affects auth and upload adapters only.
5. Approve the visual direction and palette adjustments in the Blueprint.
6. Approve additional dependencies listed in §2 (Tailwind v4, Radix, React Router, TanStack Query, immer, three/R3F/drei, idb, react-hook-form, zod, qrcode, nanoid, sonner, fontsource).

## 17. Phase reports

### Phase 1 — Foundations (complete)

Design tokens, ~30 accessible components, app shell, routing with pre-rendering, catalogue import, asset recovery (189 files into `recovered-additional/`), unit/E2E/axe test setup. Initial commit `4282fb3`.

### Phase 2 — Catalogue, product pages and content (complete)

**Delivered**

| Area | What was built |
|------|----------------|
| Category pages | All 11 categories plus `/categories/view-all` (533 products), pre-rendered. Product-type chips, filters, sort, 24 per page, active-filter chips, empty states, mobile filter sheet. |
| Product types | Every product classified by slug rules (`scripts/catalogue/product-types.mjs`) into 2–8 types per category. Original `?type=` slugs reused where meaningful (`caps`, `bags`, `printed-t-shirts`, `custom-office-shirts`, `notebooks-diaries`, `invitations-announcements`, `weddings`, `technology`, `mugs`, `calendars`, `magnets`, `gift-hampers`); unknown values are ignored instead of emptying the page. |
| Filters | Generated from the products' own option data (e.g. Colour, Size, Finish, Capacity, Lid type), with disjunctive counts, OR within a group and AND across groups. Plus price range, Bestsellers and New. All state is in the URL. |
| Sorting | Recommended (bestsellers, then new), price low→high and high→low, newest, name. Search keeps relevance order for "Recommended". |
| Search | `/search?q=` (client-rendered) with word-prefix matching, plural folding and synonyms (business/visiting card, tee/t-shirt, cup/mug…). Header autocomplete is an ARIA combobox showing categories, 6 products and "see all", with the index loaded on first focus. |
| Product pages | All 533 pre-rendered with Product and Breadcrumb structured data. Gallery (photos + Studio mockups, shared polo mockup). Options render automatically as quantity tiers, colour swatches (incl. two-tone), chips or a dropdown; unavailable combinations stay focusable and say why. Sets/quantity stepper. Live price, per-unit price and SKU. `?variantId=` deep links in both directions. Design / upload buttons to the Studio route. Print specs in mm with a "for designers" pixel view. Delivery & returns. Related products. Sticky mobile buy bar. |
| Mega-menu | Vertical category tabs (hover or arrow keys); each panel shows product types and the original curated product groups (fetched once on first open), plus "view all". New "All products" nav item. |
| Content | About, shipping, refund policy, privacy and terms imported as structured blocks (`scripts/content/import-content.mjs`) with summary cards, table of contents and numbered sections. FAQ (accordion + FAQPage structured data), contact (support cards + grievance redressal), credits (131 Unsplash credits + polo model CC BY 4.0). |
| Home | Added a bestsellers rail (one per category, real imagery only). |
| Responsive | Desktop: filter sidebar, 4-column grid, sticky gallery. Tablet: 3 columns, filter sheet. Phone: 2 columns, bottom filter sheet, horizontally scrolling chips, sticky buy bar. |

**Test results (all passing)**

- Lint (oxlint with jsx-a11y) and typecheck: clean.
- Unit: 97 tests in 11 files. Covers listing filters and facets on every category, sorting, URL helpers, search ranking and synonyms, option display rules, availability, deep links, print-spec conversion, and **every one of the 5,546 SKU prices reproduced by the product-page price logic** (× 1 and × 3 sets).
- End-to-end (Chrome, desktop 1440×900 and Pixel 7): 112 passed, 10 skipped by design (desktop-only or mobile-only).
  - All 11 categories and "all products" show the right counts.
  - Type chips and legacy `?type=` links, option filters, price filter, sorting and pagination all work.
  - Mobile filter sheet, card → product → breadcrumb navigation.
  - On one product per category, the displayed price matches the selected SKU in the data after every option change; Classic Visiting Cards is checked in detail, including deep links.
  - Search results, empty states, keyboard suggestions, mega-menu, and all 8 content pages.
- Accessibility: axe WCAG 2.2 AA + best practices on 19 page types × 2 viewports, no violations. Fixed during the phase: low-contrast number labels, a missing results heading, unlinked price labels.
- Production build: 555 pre-rendered pages in about 75 s.
- Before the Phase 2 commit, two timing-sensitive E2E tests were hardened: specs now use `e2e/fixtures.ts`, whose `page.goto` waits for the pre-rendered page to hydrate, and the radio arrow-key test holds each key until focus moves. The full suite then passed again (112 passed, 10 skipped).

**Remaining limitations**

- Add to cart, checkout and accounts are Phase 6. Product pages link to the Studio placeholder and show a note instead of a cart button.
- Quick view, product comparison, recently viewed and PIN-code delivery estimates are not built (the last needs a backend).
- 83 products have no image (a calm placeholder is shown) and 67 use Unsplash stock photos (credited). Real photography is still needed.
- The support email is not configured: set `VITE_SUPPORT_EMAIL`. Until then pages link to the contact page.
- Pre-rendered pages show unfiltered results for a moment before applying URL filters or `?variantId=` (this avoids hydration mismatches). Actions taken in the first moments after load, before hydration, are ignored.
- `/categories/view-all` embeds all 533 summaries (≈80 KB gzipped). Fine for now; move to server-side pagination when the backend exists.
- Structured data uses relative URLs until `VITE_SITE_URL` is set.
- Lighthouse and real-device performance have not been measured yet (planned for Phase 7).

## 18. Phase 3 — Design Studio core: detailed plan

**Status:** approved (decisions in §18.17). In progress — see §18.19 for milestone status and findings.

**Goal.** A customer can open any customisable product at `/products/:slug/design` and design the front and back with text, shapes, graphics and their own images. They can see exactly what will be trimmed, undo anything, close the tab and come back to the same design, and download a proof, on desktop, tablet and phone. Flat-print products (354) get the complete experience. Apparel and wrap products (178) open the same editor on their flat print area; their on-product workspaces follow in Phase 4 (decision D4).

**Not in Phase 3**

| Later phase | Items |
|-------------|-------|
| Phase 4 | Smart guides and snapping; multi-select, group, align and distribute; image crop UI; curved text; QR codes; tables; CMYK input; the full font library including Indian scripts; preflight list with blocking; review and approval flow; on-product workspaces (apparel, wrap, umbrella, sign, gift); product options panel inside the Studio; PDF proof |
| Phase 5 | 3D previews; folded and multi-panel products (envelope flap, folder pockets, notebook covers) |
| Phase 6 | Cloud save, sign-in, return after login, add to cart, server-side print files, importing original v1 designs |

### 18.1 What the research shows

| Source | Finding | Consequence |
|--------|---------|-------------|
| Print configs (532 products) | 354 `flat_print`, 104 `apparel`, 74 `wrap`. 493 at 300 DPI, the rest 100–200 DPI. Trim: 499 rectangle, 17 circle, 16 rounded. Bleed is 0 on 304 products (all pens, stamps and apparel, plus some gifts and stationery) and 12–40 px elsewhere. Safe zone 15–60 px. 181 different canvas sizes, from 450×450 px (stamps) to 9000×3358 px (canopy tent, 30 MP). | One engine driven by data. The canvas never renders at print resolution on screen. Proof export must respect browser canvas limits. |
| Mockups | 277 products have front and back mockups. All of them are now in `recovered/` + `recovered-additional/`. 153 of these are flat-print (signs, labels, bags). They are photos (1024–2119 px) with sample artwork baked in. | Use mockups as side thumbnails and an "on the product" reference in Preview. Keep the editing surface a clean sheet (§18.14). |
| Original layout code (`recovered/_next/static/chunks/10tigen5gn4-f.js`) | Flat products: stage = print area, mockup stretched behind it. Generic apparel: stage 2.4× the print area, area centred at 32 % of the height. Polos: 3.6×, at 51 %. Pens, mugs, drinkware, umbrellas, gifts and the round mouse pad each have their own `…PrintRect` functions. Signs and gifts use hard-coded per-product "face" profiles. | Phase 4's mode registry reuses these numbers; Phase 3 doesn't need them. |
| Original guides | The canvas edge is drawn as the **bleed** edge. The trim line is inset by `bleedPx` and the safe zone by `bleedPx + safeZonePx`. | This conflicts with our product pages, which present the canvas as the finished size (decision **D1**). |
| Size audit | Several products' canvas sizes don't match the size in their name: `flyer-a5-*` = 105×148 mm (that's A6); `flyer-a6-mini` = 74×105 mm (A7); `stationery-notepad-a5` = 148×105 mm; `stationery-notebook-a4` = 76×102 mm; `stationery-diary-a5-personalised` = 72×102 mm. A4 and DL products are correct. | Decision **D2**. |
| Graphics | 33 SVGs are stored as strings in the original Studio chunk (`eJ("Business growth", '<svg …>')`). | They can be extracted read-only into app data (M9). |
| Templates | 95 templates exist as `build()` functions with relative geometry (e.g. `x = .07 × width`), set in Fraunces and Plus Jakarta Sans. | Re-author them as data. The first 15 are in Phase 3 (M14, decision **D3** for fonts). |
| 3D | `polo-shirt.glb` (CC BY 4.0) is in `recovered-additional/models/` and `shirt_baked.glb` (licence unknown) is in `recovered/`. three.js and React Three Fiber are not installed. | Phase 3 records the models in Studio profiles and checks they're valid. Rendering is Phase 5. |

### 18.2 Architecture and routing

- **URL (unchanged from the original):** `/products/:productSlug/design`. Query parameters:
  - `variantId` — the product pages already send it.
  - `mode=upload` — the product page's "Upload your design" button; opens the Uploads panel.
  - `draftId` — opens a specific design saved on this device.
  - `side=front|back`.
- **Route module:** `routes/studio.tsx` replaces `routes/studio-planned.tsx`. It's client-only:
  - `clientLoader` loads `catalogueApi.getProduct(slug)` and the Studio profile `/api/v1/studio/<slug>.json` in parallel.
  - No build-time loader and no pre-rendering; the host's `__spa-fallback.html` rule serves it, as it already does for the placeholder.
  - `HydrateFallback` shows a Studio-shaped skeleton. `meta` sets noindex.
  - `ErrorBoundary` handles an unknown product (404 with "Browse all products").
  - The one non-customisable product (`card-accessory-metal-holder`) shows a friendly "printed as shown" page linking back to the product.
- **Layout:** full screen, outside the storefront layout (like the placeholder today). Uses only the existing tokens and design-system components.
- **Code splitting:** React Router splits route modules. Konva and react-konva are imported only under `features/studio/canvas/`, so storefront pages never download them. An E2E test enforces this.
- **Module layout** (refines §7.1):

```
src/features/studio/
  profile/      Studio profile types, side list, trim profile (data from M1)
  geometry/     units (px ↔ mm ↔ pt), trim/bleed/safe boxes, trim-shape paths, rotated bounds, DPI, viewport maths — pure TS
  schema/       DesignDoc v2 types, createBlankDesign, parseDesign / migrate
  commands/     pure document commands (add, update, remove, duplicate, reorder, background, sides…)
  store/        createStudioStore (zustand vanilla), StudioProvider, selectors, history
  canvas/       StudioCanvas (Konva Stage), layers/, nodes/, selection transformer, gestures, text-edit overlay
  shell/        TopBar, ToolRail, ToolPanel, InspectorPanel, MobileToolbar, SideSwitcher, ZoomControl, SaveStatus, ProjectMenu
  tools/        TextTool, ShapesTool, GraphicsTool, UploadsTool, TemplatesTool, BackgroundTool
  inspector/    Content, Style, PositionSize, Effects sections; LayersPanel
  persistence/  IndexedDB wrapper, draft repository (IndexedDB + in-memory), autosave, restore, versions, blob store
  assets/       font registry and loader, image decode/downscale, upload validation, SVG sanitiser, graphics library
  templates/    template types, layout engine, data/
  export/       render a side to a canvas, proof PNG
  keyboard/     shortcut map and handler
```

- **New design-system components** (reusable, documented on `/design-system`):
  - `NumberField` — numeric input with unit, steppers, arrow keys and Shift for ×10.
  - `ColorField` — swatches, recent colours and hex input.
  - `Slider` — Radix Slider, styled.
  - `IconToggle` — toolbar toggle buttons.

### 18.3 Canvas (React Konva)

**Coordinates**
- World units are print pixels. The origin is the **trim** top-left (if D1 is accepted).
- The bleed area has negative coordinates down to `-bleedPx`. The safe box is the trim inset by `safeZonePx`.
- Elements store their unrotated box (`x, y, width, height`) and a rotation in degrees around the box centre.

**Stage**
- Sized to the workspace with a ResizeObserver.
- View transform `{ scale, x, y }`. `pixelRatio` is `devicePixelRatio`, capped at 2.

**Konva layers**

| # | Layer | Listening | Contents |
|---|-------|-----------|----------|
| 1 | Workspace | no | Workspace backdrop, sheet shadow, side background colour filled to the bleed edge |
| 2 | Design | yes | Group clipped to the bleed box using the trim-shape path (rect, rounded rect, ellipse); elements in array order |
| 3 | Guides | no | Bleed edge, trim line, dashed safe zone; centre lines while dragging. Toggle with `Ctrl ;` |
| 4 | Overlay | partly | Transformer, hover outline, amber (outside safe zone) and red (outside trim) outlines |

Labels such as the guide legend, the DPI badge and the empty-canvas card are HTML positioned over the stage, so screen readers can read them.

**Nodes**
- `TextNode`: Konva `Text`.
- `ShapeNode`: `Rect`, `Ellipse`, `Line`, `RegularPolygon`, `Star` or `Arrow`.
- `ImageNode`: Konva `Image` drawn from a decoded, downscaled preview bitmap. Used for both uploads and graphics.
- Each node is memoised and subscribes only to its own element.

**Interaction**
- During a drag or transform, Konva nodes move directly without React re-renders. One command is dispatched on `dragend`/`transformend`, so each gesture is one undo step (the original does the same with `{commit: true}`).
- Transformer:
  - 8 anchors, minimum size 2 mm.
  - Images and graphics keep their proportions unless Shift is held.
  - Text: side anchors change the box width (text re-wraps); corner anchors scale the font size.
  - Rotation handle snaps to 0/45/90° within 5°.
  - Anchors are 10 px for a mouse and 24 px for touch, chosen by `pointer: coarse`.
- Outside-the-print-area warnings use the rotated corners. Amber means part of the element is outside the safe zone; red means outside the trim. The inspector repeats it in words, e.g. "Part of this layer is outside the safe area and may be trimmed."
- **Text editing:**
  - Desktop: double-click or Enter opens an HTML textarea over the node, matched to font, size and rotation. Esc cancels; Ctrl+Enter or clicking away commits.
  - Phones: editing opens a full-width bottom sheet.

### 18.4 State management and data model

**Store**
- `createStudioStore({ product, variant, profile, draft })` creates one Zustand vanilla store per Studio session, provided through React context.
- It's recreated per product, has no global singletons, and is easy to test.

| Slice | State | Saved? |
|-------|-------|--------|
| `document` | `DesignDoc` (all sides), active side | Yes, the only thing saved |
| `selection` | selected id, editing-text id, hovered id | No |
| `viewport` | zoom, pan, guides on/off | Preferences in localStorage |
| `history` | past / future entries | Last 50 entries, saved with the draft |
| `save` | status, last saved time, error | No |
| `ui` | active tool, panel open, sheet and dialog state | Last tool in localStorage |
| `product` | product, variant, Studio profile (read-only) | No |

**Commands**
- Pure functions `(doc, args) => doc` dispatched through `dispatch(command, { label, coalesceKey })`.
- Components never change the document directly.

**Undo/redo without Immer** (a change from §2 and §9)
- Documents are immutable and commands replace only the side that changed.
- So a history entry is `{ label, sideId, before, after, selectionBefore, selectionAfter }`, where `before`/`after` are side objects that share structure.
- Edits with the same `coalesceKey` within 600 ms merge into one entry (typing, slider drags). The history holds up to 100 entries.
- Undo switches to the side it affects.

**DesignDoc v2.** As in §7.4, with these refinements:
- `sides: Record<'front' | 'back', SideDesign>`; other side ids are reserved for Phase 5.
- `ImageEl.src` is one of:
  - `{ kind: 'upload', blobId, name, mime, naturalWidth, naturalHeight }`
  - `{ kind: 'graphic', graphicId }`
- `TextEl` has `fontSize` stored in print px and shown in pt, plus `letterSpacing` and `isPlaceholder` (used by Phase 4 preflight).
- `hidden` is a real hide, not opacity 0 as in the original.
- `meta.revision` goes up on every save. History lives in the draft record, not inside the document.
- `parseDesign()` validates with hand-written type guards: zod is not installed and isn't needed until Phase 6 forms. `migrate()` is keyed on `schemaVersion`.

**IDs:** `crypto.randomUUID()`, falling back to `crypto.getRandomValues()`. `randomUUID` only works over HTTPS, and the staging server is plain HTTP. No `nanoid` needed.

### 18.5 Tools

| Tool | Phase 3 scope |
|------|---------------|
| **Text** | Presets: Heading, Subheading, Body, Name + title. Font, size (pt), weight, italic, underline, colour, alignment, line height and letter spacing (the original had no letter spacing). New text is placed centred inside the safe area. |
| **Shapes** | Rectangle, rounded rectangle, circle/ellipse, line, triangle, star, arrow (the original had 3). Fill, border colour and width, corner radius, opacity. |
| **Graphics** | The 33 original SVGs (M9), grouped Business, Contact, Celebration, Badges, Backgrounds, with search. Inserted at 30 % of the trim width, centred. Recolouring is Phase 4. |
| **Uploads** | Drop zone, file picker, drop onto the canvas, paste from clipboard. PNG, JPG, WEBP, GIF (first frame) and SVG up to 20 MB, as in the original; HEIC is rejected with a clear message. Decoded with `createImageBitmap`; the canvas uses a preview of at most 2048 px on the long side, and the original file is kept for proofs. Placement: Fit (inside the safe area) or Fill (cover to the bleed edge). Replace keeps the box. Recent uploads on this device. |
| **Effective DPI** | `naturalWidth × productDPI / elementWidthPx`. Shown in the inspector and as a badge: warning below 75 % of the product DPI, "may look blurry" below 40 % (Blueprint §11.7 wording). Blocking is Phase 4. |
| **SVG safety** | Uploaded SVGs are parsed with `DOMParser`; scripts, `foreignObject`, event-handler attributes and external references are removed before storing. They are drawn through `<img>`, so scripts never run. |
| **Background** | Swatches, recent colours (this device) and hex input; fills to the bleed edge automatically. CMYK is Phase 4. |
| **Templates** | Engine and 15 templates (M14). |

### 18.6 Selection, resizing, rotation and positioning

- Click or tap to select; click empty space or press Esc to deselect. Locked items can't be selected on the canvas; select them from Layers instead.
- **Nudge:** arrow keys move 0.5 mm, Shift+arrow 5 mm, converted to pixels from the product DPI. This differs from the original's 1 px / 10 px: at 300 DPI, 1 px is 0.08 mm and too small to notice.
- **Shortcuts:**
  - Delete or Backspace removes the selection.
  - Ctrl D duplicates it, offset by 3 mm.
  - Ctrl ] / Ctrl [ moves it forward or back one layer.
  - Shortcuts are ignored while typing in an input.
- **Inspector "Position & size":**
  - X, Y, W, H in mm (one decimal), with proportion lock and rotation.
  - Actions: Centre horizontally, Centre vertically, Fit inside safe area, and Fill to bleed (images and shapes).
- Every inspector change is one undo step per commit (Enter, blur or end of a slider drag).

### 18.7 Layers panel and properties

- **Inspector sections** (Blueprint §11.5): Content, Style, Position & size (collapsed), Effects (collapsed).
  - Empty state: "Select something on the canvas to edit it — or add text from the left."
- **Layers:**
  - Top item first. Names are automatic (text content, shape type, file name) and can be renamed.
  - Each row: select, show/hide, lock, delete.
  - Reorder by dragging, or with Move up/down buttons and Alt+↑/↓ for keyboard and screen-reader users.
- The side switcher shows the element count per side.
- **Canvas accessibility:**
  - The stage container is a labelled, focusable region, e.g. "Design canvas, Front, 3 items".
  - A polite live region announces changes such as "Heading selected, 12.0 mm from left, 8.0 mm from top" and "Moved", "Deleted · Undo available".
  - Everything doable on the canvas can also be done from the layers list and inspector.

### 18.8 Front/back design support

- Every Phase 3 product gets a front and a back side. Labels come from the Studio profile (e.g. polos: "Left chest" / "Upper back", as in the original).
- Each side has its own background and elements.
- **Copy front to back** offers Replace / Keep both (from the original); copied elements get new ids.
- **Clear side** asks for confirmation and can be undone.
- An empty back shows "The back is blank." Linking this to "Sides"/"Sides printed" options and their prices is Phase 4, with the options panel.
- `?side=` follows the active side (replace, no history entry). Undo and redo switch to the side they change.

### 18.9 Zoom, pan and canvas controls

- **Zoom range:** shown as a percentage of real size (100 % ≈ the printed size on a typical screen). It runs from 10 % (or the fitted size, if smaller, for large banners) to 400 %. Opens at **Fit**.
- **Zoom controls:**
  - − / + buttons step through 10, 25, 50, 75, 100, 150, 200, 300, 400 %.
  - A zoom menu offers Fit (Shift 1), 50 %, 100 % and 200 %.
  - Ctrl + / Ctrl −.
  - Ctrl or ⌘ + wheel, and trackpad pinch, zoom around the pointer.
- **Pan:**
  - Wheel or trackpad scroll; Space + drag; middle-button drag.
  - Touch: two-finger pan and pinch. One finger drags the selected element, or deselects when tapping empty space.
  - Panning is limited so the sheet can't be lost off-screen.
- **Guides:** toggle (Ctrl ;) plus a small legend (Trim · Safe area · Bleed).
- Zoom stays relative to Fit when the window resizes or a phone rotates. The guides preference is remembered.

### 18.10 Undo/redo and design history

- **Undo/redo:**
  - Top-bar buttons with tooltips naming the step ("Undo move heading"), plus Ctrl Z / Ctrl Shift Z / Ctrl Y.
  - 100 steps; the last 50 survive a reload.
- **Version history** (on this device):
  - Snapshots are taken automatically every 5 minutes of active editing, and before Copy front to back, Clear side and Apply template.
  - The last 20 per design are kept.
  - The "Version history" dialog lists time, side thumbnails and element counts.
  - Restoring replaces the current design as one undoable step, with the toast "Version restored · Undo".

### 18.11 Autosave and local draft restoration

**Storage**
- IndexedDB database `aaraprint-studio` v1, using the native API through a ~100-line promise wrapper (no `idb` dependency; a change from §2).
- Stores:
  - `drafts` (indexes `productSlug`, `updatedAt`)
  - `versions` (index `draftId`)
  - `blobs` (uploaded files; index `draftId`)
  - `meta` (recent colours, recent uploads, onboarding flags, preferences)

**Autosave**
- Runs 500 ms after each committed change and flushes on `visibilitychange`/`pagehide`. Each save is one transaction.
- Status: *Saving…* → *Saved on this device* (tooltip with the time).
- Failure shows a *Couldn't save on this device* banner with Retry and a suggestion to download a proof.
- Private mode or a full disk falls back to memory, with a visible banner.

**Restore**
- `?draftId=` opens that draft. Otherwise the most recent draft for the product opens, with the toast "Restored your last design · Start fresh".
- *Start fresh* keeps the old draft.
- The project menu lists **Designs on this device** for the product: open, rename, duplicate, delete (with confirmation).

**Edge cases**
- Opening with a different `variantId` keeps the design and updates the variant; all variants of a product share one print size in Phase 3.
- A second tab on the same draft shows "This design is open in another tab" (BroadcastChannel). The newer revision wins only after the customer confirms.
- No "leave page?" prompt is needed, because local saves happen right away. This matches Blueprint §11.12; cloud save in Phase 6 adds the prompt.
- Drafts untouched for 90 days are pruned when the Studio opens (local only).

### 18.12 Responsive editor (desktop, tablet, mobile)

| Width | Layout |
|-------|--------|
| ≥ 1280 px | Top bar 56 px · tool rail 64 px + panel 320 px (collapsible) · workspace · inspector 300 px with layers |
| 1024–1279 px | Rail + panel; the inspector becomes a right drawer that opens on selection |
| 768–1023 px | Rail; the panel overlays the canvas; inspector drawer |
| < 768 px | Top bar 52 px (back, name, save status, undo/redo, Next) · side switcher as a segmented control · full-screen canvas · bottom toolbar 64 px (Templates, Text, Uploads, Graphics, Shapes, More). Tools open as bottom sheets (peek 40 % / expanded 90 %) with the canvas visible above. A contextual pill above the selection offers Edit, Font, Colour and ⋯. Inspector and layers live in "More". |

- Touch targets are at least 44 px; canvas handles are 24 px.
- Handle size follows `pointer: coarse`, not screen width, so touch laptops work too.
- On a landscape phone, the bottom toolbar becomes a side rail.

### 18.13 Print dimensions, DPI, bleed and safe zone

- **Trim** = `canvasWidthPx × canvasHeightPx` at `dpi` (D1), with bleed added outside and the safe zone inside. Products with bleed 0 show only trim and safe guides.
- **Trim shapes:**
  - Rectangle.
  - Rounded rectangle: default corner radius 3 mm. Per-product overrides in the profile; for example `business-card-oval` and `business-card-leaf`, which the original detected by slug.
  - Circle: drawn as an ellipse when not square.
  - Clipping and guides follow the shape.
- **Units:** the inspector uses mm and text sizes use pt; a "for designers" toggle shows px. This matches the product page's print-spec view.
- **DPI and warnings:** product DPI and the safe-zone explanation are in Help → Print tips. Image DPI and outside-safe/trim warnings are live (above). The full preflight list and blocking are Phase 4.
- **Proofs** show the trim line and a light bleed tint. Print-ready files are made server-side in Phase 6; browser exports are proofs only.

### 18.14 Recovered mockups and 3D assets

**Studio profiles**
- A new script `scripts/studio/build-studio-profiles.mjs` reads both recovered folders (read-only) and the catalogue. It writes `public/api/v1/studio/<slug>.json` with:
  - mode hint (`flat` / `apparel` / `wrap`) and family (polo, pen, mug, drinkware, umbrella-rainwear, sign-poster, gift-flat, round-pad, card-orientation, oval…), from the original's detector rules
  - sides and labels
  - trim profile
  - mockups `{ front, back, width, height, frontMask?, backMask? }`
  - `model3d { src, licence }`
- It also reports missing files and the size audit (D2).
- Image sizes are read from the PNG/WebP headers; no image library is needed.

**How Phase 3 uses mockups**
- As side-switcher thumbnails.
- As an "On the product" reference photo next to the trimmed design in Preview.

**Why the editing surface stays a clean sheet**
- Most mockups contain sample artwork.
- Placement on signs and gifts depends on per-product face profiles hard-coded in the original.
- Compositing artwork onto mockups is mode work for Phase 4/5, reusing the numbers in §18.1.

**Serving and optimisation**
- Served through `/media` (dev and preview) or `VITE_MEDIA_BASE_URL`. Recovered folders are never written to.
- Mockups (0.3–1.6 MB PNGs) load lazily, only when shown. WebP/AVIF conversion is part of the Phase 7 image-CDN work.

**3D**
- Profiles record each model and its licence. A unit test checks both GLB files have a valid glTF header.
- The CC BY 4.0 credit for the polo model is already on `/credits`.
- Rendering (three + @react-three/fiber + drei, lazy chunk) is Phase 5.

### 18.15 Testing strategy and performance

**Testing**

| Layer | What |
|-------|------|
| Unit (Vitest) | Geometry and unit conversion, viewport maths, every command, history and coalescing (fake timers), schema parse/migrate, draft repository contract (in-memory), autosave debounce, upload validation and DPI, SVG sanitiser, template layout at extreme aspect ratios, Studio profiles for all 532 products (every mockup file exists) |
| Component (Testing Library) | Inspector sections, NumberField/ColorField, layers list keyboard use, side switcher, save status, tool panels. The Konva canvas is replaced by a stub in jsdom: jsdom has no canvas, and the native `canvas` package isn't worth adding |
| E2E (Playwright, Chrome) | Desktop 1440×900, Pixel 7, plus a new tablet project (820×1180) for Studio specs. Results are read through the accessible UI (inspector values, layers list, live region), the saved IndexedDB draft (`page.evaluate`) and proof PNG dimensions (PNG header) |
| Visual regression | Fixed Studio fixtures (business card front/back, circle and rounded trims, a banner) with `toHaveScreenshot` at three viewports; baselines committed |
| Accessibility | axe on the empty Studio, with a selection, on each panel and each dialog; a keyboard-only task (add text, edit, move via the inspector, reorder, switch side, download proof) |
| Bundle | E2E asserts storefront pages never load the Konva chunk; the build reports the Studio chunk size against the 350 KB gzip budget (§13) |
| Regression | All Phase 1–2 suites stay green after every milestone |

**Performance**
- Target 60 fps when dragging among 50 elements on a mid-range phone, checked with a Chrome trace at 4× CPU throttling.
- Konva: `listening: false` on static layers, `perfectDrawEnabled: false` on shapes, `batchDraw`. Drag state never goes through React.
- Narrow Zustand selectors; nodes are memoised per element.
- Images are drawn from downscaled bitmaps; object URLs are revoked on unmount.
- The stage is never rendered at print resolution.
- Proof export is capped at 16 MP (the iOS canvas limit). The 30 MP canopy tent exports a scaled proof.
- Fonts load on demand; text renders after `document.fonts.load`.
- Autosave is debounced and never blocks input.

### 18.16 Milestones

Each milestone is small, can be tested on its own, leaves all existing tests green, and ends with lint, typecheck, unit tests, build and E2E.

| # | Milestone | Depends on | Est. |
|---|-----------|-----------|------|
| M1 | Studio profiles and print geometry (data only) | — | 1 d |
| M2 | Design document schema and commands | M1 | 1 d |
| M3 | Studio store, history and selection | M2 | 1 d |
| M4 | Studio route and responsive shell | M1, M3 | 2 d |
| M5 | Canvas: stage, zoom/pan and guides | M4 | 2 d |
| M6 | Elements, selection and transform | M5 | 2 d |
| M7 | Inspector and layers panel | M6 | 2 d |
| M8 | Text tool | M7 | 1.5 d |
| M9 | Shapes and graphics | M7 | 1.5 d |
| M10 | Front/back sides | M6 | 1 d |
| M11 | Local drafts, autosave and restore | M3, M10 | 2 d |
| M12 | Image uploads | M11 | 2 d |
| M13 | Version history | M11 | 1 d |
| M14 | Templates engine and first 15 templates | M8, M9, M10 | 2 d |
| M15 | Preview, proof, shortcuts and help | M8–M14 | 1.5 d |
| M16 | Hardening and Phase 3 report | all | 1.5 d |

Total ≈ 25 working days (≈ 5 weeks). The original estimate was 3 weeks; the mobile Studio layout (moved here from Phase 4) and the drafts/versions work add the rest.

#### M1 — Studio profiles and print geometry

- **Features:**
  - Profile builder script (§18.14).
  - Pure geometry module: px/mm/pt conversion; trim, bleed and safe boxes; trim-shape paths; rotated bounds; effective DPI.
  - Size audit output (D2).
  - API client method `getStudioProfile(slug)`.
- **Files:**
  - new `scripts/studio/build-studio-profiles.mjs`, `scripts/studio/studio-families.mjs`
  - generated `public/api/v1/studio/*.json`
  - new `src/features/studio/profile/types.ts`, `src/features/studio/geometry/{units,boxes,shapes,bounds,dpi}.ts`
  - modify `src/lib/api/catalogue.ts` (or new `src/lib/api/studio.ts`)
  - modify `package.json` (`studio:profiles` script)
- **Dependencies:** none.
- **Acceptance:**
  - 532 profiles, and none for `card-accessory-metal-holder`.
  - Every referenced mockup resolves to a file in the recovered folders (expect 0 missing).
  - Recovered folder file counts unchanged (1,722 / 192).
  - Audit list produced.
- **Unit:**
  - 1050 px @ 300 DPI = 88.9 mm.
  - Boxes for each trim shape; rotated bounds; DPI formula.
  - Profile test across all products; GLB header check.
- **E2E:** the preview server returns `/api/v1/studio/business-card-classic.json`.

#### M2 — Design document schema and commands

- **Features:**
  - `DesignDoc` v2 types.
  - `createBlankDesign(product, variant, profile)`.
  - `parseDesign`/`migrate`.
  - Commands: add, update, remove, duplicate, reorder, set background, show/hide, lock, rename, copy side, clear side.
  - ID helper.
- **Files:** new `src/features/studio/schema/{types,create,parse}.ts`, `src/features/studio/commands/*.ts`, `src/features/studio/ids.ts`.
- **Dependencies:** none.
- **Acceptance:**
  - A blank design can be created for every customisable product.
  - Commands never mutate their input.
  - `parseDesign` rejects malformed data with a reason.
- **Unit:**
  - Each command on deep-frozen input.
  - Z-order rules; copy side produces new ids.
  - Parse round trip; migration from a stub v1.
- **E2E:** none (logic only).

#### M3 — Studio store, history and selection

- **Features:**
  - `createStudioStore` with the slices in §18.4 and `StudioProvider`.
  - `dispatch` with history: coalescing, 100-step cap, selection restore, switching side on undo.
- **Files:** new `src/features/studio/store/{create-store,provider,selectors,history}.ts`.
- **Dependencies:** Zustand (installed).
- **Acceptance:**
  - Undo/redo restores documents exactly.
  - Coalesced typing is one step; the 101st step drops the oldest.
- **Unit:** history sequences, coalescing with fake timers, cap, selection restore, side switching.
- **E2E:** none.

#### M4 — Studio route and responsive shell

- **Features:**
  - `routes/studio.tsx` with `clientLoader`, skeleton, noindex and error states.
  - Top bar:
    - back to product (keeps `variantId`)
    - design name
    - product · variant · price, using the existing pricing lib
    - placeholders for save status, undo/redo and zoom
  - Tool rail and panel; inspector region.
  - Responsive layouts from §18.12; mobile bottom toolbar and sheets.
  - `?mode=upload` selects Uploads.
- **Files:**
  - new `src/routes/studio.tsx`, `src/features/studio/shell/*.tsx`
  - modify `src/routes.ts` (point the existing path at the new module)
  - delete `src/routes/studio-planned.tsx`
  - modify `e2e/a11y.spec.ts` (placeholder entry → Studio)
  - modify `playwright.config.ts` (tablet project for `studio*.spec.ts`)
  - new `e2e/studio.spec.ts`
- **Dependencies:** M1, M3.
- **Acceptance:**
  - "Start designing" on a product page opens the Studio with the right product, variant and price; Back returns with the same `variantId`.
  - An unknown slug shows a 404; the non-customisable product shows its message.
  - Layouts are correct at 1440, 1024, 820 and 390 px.
  - axe clean. The storefront never loads Konva. Phase 2 suites unchanged.
- **Unit:** variant resolution from `variantId` (invalid → default).
- **E2E:** product page → Studio → back; error states; layout per viewport; axe; Konva-not-loaded check on home, category and product pages.

#### M5 — Canvas: stage, zoom/pan and guides

- **Features:**
  - Konva stage with ResizeObserver sizing; workspace, design and guides layers.
  - Background to the bleed edge.
  - Trim/bleed/safe guides for rectangle, rounded and circle; guides toggle and legend.
  - Zoom (all inputs in §18.9) and pan (mouse, trackpad, touch).
  - Zoom control in the top bar.
- **Files:** new `src/features/studio/canvas/{studio-canvas,layers/workspace-layer,layers/guides-layer,gestures}.tsx`, `src/features/studio/geometry/viewport.ts`, `src/features/studio/shell/zoom-control.tsx`.
- **Dependencies:** Konva, react-konva (installed).
- **Acceptance:**
  - The sheet fits on open at every viewport.
  - Zoom stays within 10–400 % and keeps the point under the pointer fixed.
  - Fit restores; panning can't lose the sheet.
  - Bleed-0 products show no bleed guide.
- **Unit:** viewport maths (zoom at point, clamps, fit, resize keeps relative zoom).
- **E2E:**
  - Buttons and keyboard change the percentage; Fit.
  - Ctrl+wheel zoom.
  - Two-finger pinch on mobile via CDP touch events.
  - Screenshots of the three trim shapes.

#### M6 — Elements, selection and transform

- **Features:**
  - Text, shape and image nodes rendered from the document.
  - Click/tap selection; Transformer (resize, rotate with snaps, keep ratio).
  - Drag with a commit at the end; locked and hidden behaviour.
  - Amber/red bounds outlines.
  - Keyboard: nudge, delete, duplicate, Esc, layer order; undo/redo buttons and shortcuts.
  - Selection summary live region (also the screen-reader announcement).
- **Files:** new `src/features/studio/canvas/nodes/{element-node,text-node,shape-node,image-node}.tsx`, `canvas/selection-transformer.tsx`, `canvas/bounds-outline.tsx`, `keyboard/{shortcuts,use-studio-shortcuts}.ts`.
- **Dependencies:** M5.
- **Acceptance:**
  - Fixture designs render correctly.
  - One drag = one undo step; resize and rotate work.
  - Locked elements can't move; hidden ones aren't drawn.
  - Outlines appear at the right boundaries.
  - All shortcuts work and are ignored while typing.
- **Unit:** transform → element mapping (text width vs font scale, images keep ratio), nudge in mm, bounds classification.
- **E2E:** mouse drag changes the announced position; rotate handle; nudge with arrows; delete then undo; locked element can't be dragged.

#### M7 — Inspector and layers panel

- **Features:**
  - Inspector sections by element type.
  - Position & size in mm with ratio lock, rotation and centre/fit actions; opacity.
  - Layers: select, rename, show/hide, lock, delete, reorder (drag + buttons + Alt+↑/↓).
  - Empty state. Mobile "More" sheet. New `NumberField`, `ColorField`, `Slider`, `IconToggle`, added to `/design-system`.
- **Files:**
  - new `src/features/studio/inspector/*.tsx`
  - new `src/design-system/{number-field,color-field,slider,icon-toggle}.tsx`
  - modify `src/design-system/index.ts` and `src/components/docs/component-demos.tsx`
- **Dependencies:** M6; `radix-ui` Slider (already part of the installed package).
- **Acceptance:**
  - Every field updates the canvas, and one commit is one undo step.
  - Layer actions mirror the canvas.
  - Reorder is possible with the keyboard alone. axe clean.
- **Unit/component:** NumberField (units, steppers, Shift ×10, invalid input), ColorField (hex validation), LayersPanel keyboard reorder, inspector dispatches.
- **E2E:** keyboard-only: select via layers, set X/Y/W in mm, rotate, hide, lock, reorder; design-system page axe still clean.

#### M8 — Text tool

- **Features:**
  - Text presets.
  - Inline editing overlay (desktop) and sheet editing (mobile).
  - All text properties in §18.5.
  - Font registry and loader. Fonts: Inter and Manrope (installed), plus Fraunces and Plus Jakarta Sans if D3 is approved.
- **Files:** new `src/features/studio/tools/text-tool.tsx`, `canvas/text-edit-overlay.tsx`, `assets/fonts.ts`, `inspector/text-style-section.tsx`; `package.json` only if D3 is approved.
- **Dependencies:** M7.
- **Acceptance:**
  - Each preset lands centred in the safe area.
  - Typing a word is one undo step.
  - Size is shown in pt and converts correctly.
  - Proofs never show a fallback font.
- **Unit:** pt ↔ px at 100/150/300 DPI; font loader (mocked `document.fonts`); preset placement.
- **E2E:** add a heading, type "Riya Sharma", set 14 pt, bold and centred; undo removes the typing in one step; mobile sheet editing.

#### M9 — Shapes and graphics

- **Features:**
  - 7 shapes with style properties.
  - Graphics extraction script (read-only on `recovered/`) producing 33 sanitised SVGs with names and groups.
  - Graphics panel with search.
  - SVG sanitiser (shared with uploads).
- **Files:** new `scripts/studio/extract-graphics.mjs`, generated `src/data/generated/studio/graphics.json`, `src/features/studio/tools/{shapes-tool,graphics-tool}.tsx`, `assets/svg-sanitise.ts`, `inspector/shape-style-section.tsx`.
- **Dependencies:** M7.
- **Acceptance:**
  - All 33 graphics appear with the names in Asset Inventory §7.
  - Search works; inserted graphics render crisply at any zoom.
  - Shapes are fully editable.
- **Unit:** sanitiser (scripts, `on*` attributes, `javascript:`, external `href`, `foreignObject` removed; valid SVG kept); extraction count and names.
- **E2E:** add a star and change its fill; search "phone" and add the graphic; it appears in Layers.

#### M10 — Front/back sides

- **Features:**
  - Side switcher with labels, counts and thumbnails.
  - Copy front to back (Replace / Keep both); Clear side with confirmation and undo.
  - `?side=` deep link; undo follows the side.
- **Files:** new `src/features/studio/shell/side-switcher.tsx`, `commands/sides.ts`, `shell/dialogs/{copy-side,clear-side}-dialog.tsx`.
- **Dependencies:** M6.
- **Acceptance:**
  - Sides are independent.
  - Copy creates new ids; Keep both appends.
  - Clear can be undone; the deep link opens the back.
- **Unit:** copy/clear semantics.
- **E2E:** design both sides; copy with both choices; clear then undo; open with `?side=back`.

#### M11 — Local drafts, autosave and restore

- **Features:**
  - IndexedDB wrapper and draft repository (with an in-memory version for tests and fallback); autosave and save status.
  - Restore on open with Start fresh; Designs on this device (open, rename, duplicate, delete).
  - History saved with the draft; storage-failure banner; second-tab notice; 90-day pruning.
- **Files:** new `src/features/studio/persistence/{idb,draft-repository,memory-repository,autosave,restore,tab-channel}.ts`, `shell/{save-status,project-menu}.tsx`, `shell/dialogs/designs-on-device-dialog.tsx`.
- **Dependencies:** M3, M10.
- **Acceptance:**
  - A reload restores the design, active side and undo history exactly.
  - Start fresh keeps the old draft; delete asks first.
  - Blocked storage shows the banner without losing the session.
  - Nothing is sent over the network.
- **Unit:** repository contract on the in-memory version, autosave debounce and flush, pruning rule, draft record serialisation.
- **E2E:**
  - Design, reload, everything restored; Start fresh; open an older draft.
  - IndexedDB blocked through `addInitScript` → banner.
  - Two pages → notice.
  - The same repository contract run against real IndexedDB in Chrome.

#### M12 — Image uploads

- **Features:**
  - Uploads panel: drop zone, picker, drop onto the canvas, paste.
  - Validation; decode and downscaled preview; blobs in IndexedDB.
  - Fit/Fill placement; Replace; recent uploads.
  - Effective-DPI badge and inspector line; `?mode=upload`.
- **Files:** new `src/features/studio/tools/uploads-tool.tsx`, `assets/{upload-validate,image-decode}.ts`, `persistence/blob-store.ts`, `canvas/drop-target.tsx`, `inspector/image-section.tsx`.
- **Dependencies:** M11.
- **Acceptance:**
  - Supported files are added inside the safe area.
  - Wrong type or more than 20 MB gives a clear message.
  - DPI is correct (a 600 px-wide image at 50.8 mm wide = 300 DPI).
  - Uploads survive a reload.
- **Unit:** type/size/dimension validation, DPI, Fit/Fill maths, preview size.
- **E2E:**
  - Upload a PNG generated in the test.
  - Reject a .txt file and a 21 MB file.
  - Drop onto the canvas; low-DPI badge; reload keeps the image.
  - The product page "Upload your design" button opens Uploads.

#### M13 — Version history

- **Features:**
  - Automatic snapshots (5-minute timer, before destructive actions); keep 20.
  - Version history dialog; undoable restore.
- **Files:** new `src/features/studio/persistence/versions.ts`, `shell/dialogs/version-history-dialog.tsx`.
- **Dependencies:** M11.
- **Acceptance:** snapshots appear when expected; restore can be undone; the oldest are pruned beyond 20.
- **Unit:** snapshot policy with fake timers; pruning.
- **E2E:** clear a side → restore the previous version → undo the restore.

#### M14 — Templates engine and first 15 templates

- **Features:**
  - Templates as data with relative geometry (§7.5).
  - Layout engine that fits any canvas size, aspect ratio and trim shape inside the safe box.
  - Panel with style filters and live thumbnails.
  - Apply to the current side or both; confirmation when the side isn't empty; Undo toast.
  - Placeholder text marked `isPlaceholder`.
- **The 15 templates:**
  - 8 generic: Blank, Minimal centred, Bold left-aligned, Photo + text, Centred badge, Logo + tagline, Diagonal spotlight, Classic emblem.
  - 7 product-specific: 3 visiting card, 2 flyer, 1 letterhead, 1 label/sticker.
  - All re-authored from Reconnaissance Appendix B in the new visual style.
- **Files:** new `src/features/studio/templates/{types,layout,catalogue}.ts`, `templates/data/*.ts`, `tools/templates-tool.tsx`.
- **Dependencies:** M8, M9, M10.
- **Acceptance:** every template stays inside the safe box on business card, pen barrel (1200×240), A4, circle and banner (9000×3358) canvases; applying is one undo step.
- **Unit:** layout at extreme aspect ratios and on circle trims; placeholder flags.
- **E2E:** apply to an empty card, apply over content (confirm), undo; apply to both sides.

#### M15 — Preview, proof, shortcuts and help

- **Features:**
  - Preview dialog: trimmed render per side, plus the mockup photo as an "on the product" reference where one exists.
  - **Download proof** PNG: front and back side by side with labels, trim line and bleed tint, fonts loaded, guides and handles hidden, capped at 16 MP, named `<design-name>-proof.png`.
  - Shortcuts dialog (Help); tooltips with shortcuts; empty-canvas card; first-visit tips (3 steps, skippable).
  - **Continue** → Preview → **Save and return to product** (add to cart is Phase 6).
- **Files:** new `src/features/studio/export/{render-side,proof}.ts`, `shell/dialogs/{preview,shortcuts}-dialog.tsx`, `shell/{empty-canvas,first-visit-tips}.tsx`.
- **Dependencies:** M8–M14.
- **Acceptance:**
  - Proof dimensions match the formula.
  - The proof contains no guides or handles.
  - Every shortcut appears in the dialog; dialogs pass axe.
- **Unit:** proof size calculation (normal card, 30 MP banner capped), file name.
- **E2E:**
  - Download the proof and check PNG width/height from its header.
  - Preview shows both sides.
  - Return to the product with `variantId` kept.

#### M16 — Hardening and Phase 3 report

- **Features:**
  - Performance trace (50 elements, 4× throttle) and fixes; Studio bundle budget check.
  - Full axe sweep of Studio states; visual baselines; review screenshots at four widths.
  - README and §17 Phase 3 report; full lint, typecheck, unit, build and E2E.
- **Acceptance (Phase 3 exit criteria):**
  - A rectangular visiting card, the round card, the rounded card, an A4 flyer and a polo's flat print area can each be designed front and back.
  - They survive a reload (including uploads and undo history) and export a proof.
  - A keyboard-only design task works; axe is clean on desktop, tablet and phone.
  - The storefront still doesn't load Konva; all Phase 1–2 tests pass.

### 18.17 Decisions needed before starting

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | What does the canvas size mean? | (a) Finished (trim) size; bleed is added outside. (b) As the original Studio drew it: the canvas includes bleed, and trim sits `bleedPx` inside. | **(a).** It matches our product pages, which already show the canvas as the finished size, and standard sizes: 1050×600 px @ 300 DPI is exactly 3.5×2 in. With (b), every business card would be 85.9×47.8 mm. |
| D2 | Fix products whose canvas doesn't match the size in their name (§18.1)? | (a) Fix through an override file after the business confirms real sizes. (b) Leave as is. | **(a), after confirmation.** It changes the print specs shown on 8 product pages, so it needs your approval as a change to Phase 2 output. |
| D3 | Fonts for templates | (a) Add Fraunces + Plus Jakarta Sans (2 OFL `@fontsource-variable` packages, loaded only in the Studio). These are the fonts the original templates were designed in. (b) Use only Inter and Manrope until the Phase 4 font library. | **(a).** Two small dependencies, no runtime CDN. |
| D4 | Apparel and wrap products (178) in Phase 3 | (a) Open in the editor on their flat print area, with the mockup as a reference. (b) Keep the placeholder until Phase 4. | **(a).** Everyone gets a working editor now; Phase 4 adds on-product workspaces. |
| D5 | Studio graphics | (a) Reuse the original 33 SVGs, subject to the same rights check as the other recovered assets. (b) Commission or license a new set. | **(a)**, refreshed to the new palette later if needed. |

**Outcome (approved):**

| # | Decision |
|---|----------|
| D1 | **Approved:** the canvas is the finished trim size; bleed is added outside. |
| D2 | **On hold:** the 8 product sizes stay unchanged until the business confirms. The discrepancies are documented in §18.19. |
| D3 | **Approved:** Fraunces and Plus Jakarta Sans, in the Studio only; licences to be verified and kept (M8). |
| D4 | **Approved:** all 178 apparel and wrap products open on their flat print area in Phase 3. |
| D5 | **Conditionally approved:** reuse the 33 graphics only after checking their licences and usage rights (M9). Assets with uncertain rights are documented and not used. |

**Dependency note:** apart from D3, Phase 3 needs **no new packages**. Konva, react-konva and Zustand are already installed. §2 proposed Immer, `idb` and `nanoid`; the plan replaces them with immutable history entries, a small IndexedDB wrapper and `crypto` IDs.

### 18.18 Proposed sequence

1. **Foundations without UI:** M1 → M2 → M3 (logic and data, fully unit-tested).
2. **Visible editor:** M4 → M5 → M6 (route, canvas, manipulation). First usable build: move fixture elements around on every product.
3. **Editing:** M7 → M8 → M9 → M10 (inspector, text, shapes, graphics, sides). First full design possible.
4. **Persistence:** M11 → M12 → M13 (drafts, uploads, versions). Designs survive reloads.
5. **Finishing:** M14 → M15 → M16 (templates, preview and proof, hardening and report).

I'll report after steps 2, 4 and 5 (or after each milestone, if you prefer). Each milestone is committed separately as `Phase 3 / Mn: …`.

### 18.19 Phase 3 progress and findings

| Milestone | Status |
|-----------|--------|
| M1 Studio profiles and print geometry | Done |
| M2–M16 | Not started |

#### M1 findings

**Studio profiles.** `npm run studio:profiles` (`scripts/studio/build-studio-profiles.mjs`) writes 532 profiles to `public/api/v1/studio/<slug>.json` and a summary to `src/data/generated/studio/profiles-meta.json`.
- It reads only product JSON and media file headers; the recovered folders are opened read-only.
- Every referenced mockup, mask and model was found: 320 products have front/back mockups (including the shared polo mockup the original used), 35 have fabric masks, and 44 have a 3D model.
- Print sizes are copied unchanged from the catalogue.

**Named-size discrepancies (D2, on hold — not changed).**

| Product | Named size | Canvas (finished size) | Named size should be |
|---------|-----------|------------------------|----------------------|
| flyer-a5-heavyweight, flyer-a5-matte, flyer-a5-recycled, flyer-a5-standard | A5 | 105 × 148 mm (= A6) | 148 × 210 mm |
| flyer-a6-mini | A6 | 74 × 105 mm (= A7) | 105 × 148 mm |
| stationery-notepad-a5 | A5 | 148 × 105 mm (= A6 landscape) | 148 × 210 mm |
| stationery-notebook-a4 | A4 | 76.2 × 101.6 mm | 210 × 297 mm — may be a cover print area, not the page |
| stationery-diary-a5-personalised | A5 | 72 × 101.6 mm | 148 × 210 mm — may be a cover print area, not the page |

The other named-size products match: 3 A4 brochures, A4 flyer, DL flyer and DL envelope.

**Options that change the real size or shape (not applied in Phase 3).** 106 products have options such as Size (signs, gifts, stamps, labels), Diameter (round cards, stamps), Corner Radius, Shape, Width/Height or Oval/Leaf style. The catalogue has one canvas per product, so these options don't resize the canvas. The full list is in `profiles-meta.json` (`optionDrivenSizes`). Example: the round visiting card offers 55 mm and 65 mm, but its canvas is 59.3 mm. Applying size options needs business confirmation of each size (as D2) and belongs with the Phase 4 options panel. Garment sizes (S/M/L) are ignored.

**Trim shapes.**
- 499 rectangle, 15 rounded rectangle (3 mm default radius, matching the "Standard (3mm)" corner option), 18 ellipse.
- Ellipses are the 17 circle trims, one of which is non-square (`sticker-die-cut-shape`), plus `business-card-oval`. The oval card is drawn as an ellipse, like the original Studio; its size is unchanged.
- `business-card-leaf` and `business-card-custom-shape` are die-cut shapes approximated by a rounded rectangle.

**Asset rights register.** Profiles record a rights status for every asset. The Studio only uses `cleared` or `attribution-required` assets.

| Asset | Status | Use in the Studio |
|-------|--------|-------------------|
| 556 product mockup images + 70 fabric masks (incl. the shared polo mockup) | Unconfirmed — origin and licence unknown; some show brand-name products | **Not used** until the business confirms rights. Side thumbnails and the Preview reference (M10, M15) are drawn from the customer's own design instead. |
| `models/polo-shirt.glb` | Attribution required — CC BY 4.0 (credit on `/credits`) | Allowed (3D is Phase 5). |
| `shirt_baked.glb` | Unconfirmed | Not used. |
| 33 Studio graphics | To be checked in M9 | — |
| Fraunces, Plus Jakarta Sans | To be verified in M8 (SIL OFL expected) | — |

Note: the Phase 2 product pages already show mockups as gallery images on 234 products (approved in Phase 2). They are unchanged; the business may want to confirm those rights too.
