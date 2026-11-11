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
- Compositing artwork onto mockups is mode work for Phase 4/5, reusing the numbers in §18.1. Phase 4 M1 (§19) adds the first of these, as a Preview view only.

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
| M2 Design document schema and commands | Done |
| M3 Studio store, history and selection | Done |
| M4 Studio page and responsive layout | Done |
| M5 Canvas stage, zoom/pan and print guides | Done |
| M6 Selecting, moving, resizing and rotating | Done |
| M7 Inspector and layers panel | Done |
| M8 Text tool | Done |
| M9 Shapes and graphics | Done |
| M10 Front/back sides and core editor polish | Done |
| M11 Autosave, restore and version history | Done |
| M12 Image uploads and image assets | Done |
| M13 Templates | Done |
| M14 Studio preview | Done |
| M15 Studio proof and print checks | Done |
| M16 Final hardening | Done |

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
| 33 Studio graphics | **Checked in M9: not confirmed.** Hand-written SVGs in the original site's own code; no licence, author or source found, rights holder unknown. | **Not used.** Recorded in `scripts/studio/graphics-register.mjs` as `unconfirmed`; the library ships empty until the business confirms (then set `cleared` and run `npm run studio:graphics`). |
| Fraunces, Plus Jakarta Sans | **Verified in M8: SIL Open Font License 1.1** (`@fontsource-variable` 5.3.0; © The Fraunces Project Authors, © The Plus Jakarta Sans Project Authors). Licence files ship in the packages. | Allowed. Self-hosted, loaded only in the Studio; credited on `/credits` with Inter and Manrope. |

Note: the Phase 2 product pages already show mockups as gallery images on 234 products (approved in Phase 2). They are unchanged; the business may want to confirm those rights too.

#### M2 — design document (schema version 2)

Code: `src/features/studio/schema/` (types, factories, parser/validator, asset and profile checks) and `src/features/studio/commands/`.

```
DesignDocument
  format: "aaraprint.design", schemaVersion: 2
  id, name
  product   { slug, productId, variantId | null }
  surfaces  [ SurfaceDesign ]           ordered; "front", "back" now; any slug later ("flap", "cover-front"…)
    id, label
    print   { widthPx, heightPx, dpi, bleedPx, safeZonePx, trim { shape, cornerRadiusPx } }   explicit per surface
    background { color | null }
    elements [ text | shape | image ]   bottom → top
      common: id, name | null, x, y, width, height (print px, origin = trim top-left),
              rotation (° around centre), opacity, locked, hidden
      text:   text, fontFamily, fontSize (px; shown in pt), fontWeight, italic, underline, color,
              align, lineHeight, letterSpacing (em), placeholder
      shape:  shape (rect | ellipse | line | triangle | star | arrow), fill, stroke, strokeWidth,
              cornerRadius, points
      image:  source { kind: "asset", assetId } | { kind: "graphic", graphicId }
  assets    { [assetId]: { id, kind: "upload", name, mime, bytes, naturalWidth, naturalHeight,
                           storage { kind: "local", blobId } | { kind: "remote", path } } }
  meta      { createdAt, updatedAt, revision }   set by saving, never by edits
```

**Refinements of §18.4**
- `surfaces` is an ordered list, not a front/back record, so multi-surface products need no format change.
- Each surface stores its own print geometry. A size correction (D2) or a size-changing option (Phase 4) is detected with `compareWithProfile()` and applied with `resizeSurface(…, 'fit' | 'keep-size')`, so it's never silent.
- Uploads are referenced by asset id. The parser refuses `data:` URLs and long base64 strings anywhere in the document, plus documents over 1 MB.
- The active side is editor state (M3), not part of the document.

**Parsing**
- `parseDesign()` checks every field and rebuilds the document from known fields only; unknown keys such as stray Konva attributes are dropped.
- Errors carry a JSON path: `invalid-json`, `not-a-design`, `unsupported-version` (v1 = original site format, Phase 6; newer than 2 = "reload to update"), `too-large`, `invalid-field`, `duplicate-id`, `missing-asset`, `embedded-data`.
- Older versions are upgraded through a migration registry (`MIGRATIONS`, empty for now).
- `missingLocalAssets()` finds uploads whose stored file is gone from the device.

**Commands**
- Pure functions: never mutate, return the same document for no-ops, share every unchanged surface and element.
- 100 consecutive edits share all untouched objects (tested).
- Locking is enforced by the editor (M6), not by commands, so "unlock" and inspector edits stay simple.

#### M3 — Studio store, history and selection

Code: `src/features/studio/store/` (store, history, selection rules, selectors, provider and hooks) and `src/features/studio/naming.ts` (layer names and undo labels).

```
StudioState
  document      DesignDocument                 the only saved data (M2)
  editor        { activeSurfaceId, selectedIds[], hoveredId, editingTextId }   session only, never saved
  history       { past[], future[] }           ≤ 100 entries: { label, coalesceKey, at, before, after }
                                               before/after = { document, surfaceId, selection }
  changeCount   number                         + 1 on every document change (edit, undo, redo, load); autosave watches it
  actions       stable functions               execute(label, command, options) + actions built on M2 commands
```

**History and changes**
- One Zustand vanilla store per editing session (`createStudioStore`), provided through React context (`StudioProvider`, `useStudio(selector)`, `useStudioActions()`).
- Every document change goes through `execute()`: it runs a pure M2 command and records one undo step. A command that changes nothing returns `false` and records nothing.
- Undo/redo restores the document and where the customer was (side, selection). A new edit clears redo. The oldest step is dropped after 100.
- Edits with the same key within 600 ms merge into one step (typing, nudging, sliders). Changing the selection or side ends the merge. Merged edits that cancel out leave no step.
- Memory: steps share every unchanged surface and element. After 100 edits to one element, the other elements and surfaces are still single shared objects (tested).

**Selection and locking**
- Selection supports replace / add / toggle, select all (visible, unlocked elements), clear, and multi-element move, nudge, delete, duplicate, hide and lock.
- Selection is always pruned to elements that exist on the active side. Switching side clears it. Hiding an element deselects it.
- Locked elements can't be moved, edited, reordered or deleted (multi-element actions skip them). They can still be selected from layers, renamed, shown/hidden, duplicated (the copy is unlocked) and unlocked.

**Not undoable by design**
- The product variant comes from the product options, so `setVariant` is applied to every history step rather than recorded.
- Loading a draft or version (`replaceDocument`) starts a fresh history; M11 restores saved history separately.

#### M4 — Studio page and responsive layout

**Route** `/products/:productSlug/design` (`src/routes/studio.tsx`, replacing the placeholder):
- Client-only: `clientLoader` loads the product and Studio profile in parallel. Not pre-rendered; served by the SPA fallback. Noindex.
- Query values: `variantId` (unknown → default variant), `side`, `mode=upload` (opens Uploads), `tool`.
- `shouldRevalidate` keeps query changes from reloading or resetting the editor.
- States:
  - loading skeleton in the editor's outline
  - 404 "We couldn't find that product"
  - "This product doesn't need a design" (the card holder)
  - "The Design Studio didn't load" with Try again
- The Studio route chunk loads only on the Studio page (tested).

**Shell** (`src/features/studio/shell/`)
- `StudioApp` creates one Studio store per product (M3) with a blank design (M2), and provides it with the product facts (`StudioSession`) and the chrome state (`StudioUi`: open tool, drawers, sheets).
- Chrome state is deliberately kept out of the store.
- `?side=` follows the active side, including after undo and redo.

| Layout | Width | Arrangement |
|--------|-------|-------------|
| Desktop | ≥ 1280 px | Top bar 56 px · tool rail 72 px · docked panel 320 px (Templates open) · workspace · docked "Layers and properties" 300 px |
| Laptop | 1024–1279 px | Rail + docked panel; layers and properties in a right drawer |
| Tablet | 768–1023 px | Rail; panels float over the canvas (Escape closes, focus returns to the rail); drawer for layers and properties |
| Phone | < 768 px | Top bar 52 px; side switcher above the canvas; bottom toolbar (Templates, Text, Uploads, Graphics, More); tools in bottom sheets (half height, expandable); More holds Shapes, Background, Product, Help, Layers and properties |

**Top bar**
- Back to product (same options), design name, "Not saved yet" (autosave is M11).
- Undo/redo wired to the store, with tooltips naming the step.
- Zoom placeholder (M5).
- Side switcher with element counts.
- Product, options and price on desktop.
- Preview and Continue: focusable but `aria-disabled`, with "coming soon" descriptions (M15). Preview works since M14; Continue is still "coming soon".

**Workspace and panels**
- The workspace draws the active side's real print area, fitted to the screen (`geometry/fit.ts`, which M5's stage reuses): bleed tint, trim, dashed safe area, round and rounded shapes. The footer shows side, size, DPI and a guide legend.
- Product panel: options, price, SKU, and the full print size (finished size, with bleed, bleed, safe area, resolution, shape, sides) with "Change options".
- Help panel: print tips using the product's own values.
- Design tools (Templates, Text, Uploads, Graphics, Shapes, Background) say "Coming soon" until their milestones.
- The inspector shows the empty state and a read-only layer list (editing is M7).

**Accessibility**
- Skip link to the canvas; h1 in the top bar; landmarks: banner, Design tools navigation, tool panel and inspector complementary regions, main.
- The canvas region is labelled with side and size.
- Rail buttons use `aria-pressed`; sheets and drawers are Radix dialogs.
- Visible labels match accessible names (WCAG 2.5.3); measurements never break across lines.
- axe WCAG 2.2 AA is clean on desktop, tablet and phone, with panels, drawers and sheets open.

**Design-system change:** `SegmentedControl` options take an optional `count`, read out as "Back, 2 items".

#### M5 — Canvas stage, zoom/pan and print guides

**Canvas** (`src/features/studio/canvas/canvas-stage.tsx`, React Konva, lazily loaded with the M4 HTML drawing as its loading placeholder)

| # | Layer | Interactive | Exported | Contents |
|---|-------|-------------|----------|----------|
| 1 | `workspace` | no | never | sheet shadow |
| 2 | `artwork` | yes | yes | background colour (to the bleed edge) and elements, clipped to the bleed outline |
| 3 | `guides` | no | never | washed-out bleed band (even-odd fill), red bleed edge, dark trim line, dashed green safe line; 1 screen px at any zoom |

- Guides can be hidden (zoom menu or Ctrl ;); the choice is remembered on the device.
- Rectangles, rounded rectangles (parallel radii for bleed and safe), ovals and circles all come from the M1 geometry.
- Elements are drawn from the M2 document. Each sits in a group at its box centre, rotated, with its opacity; hidden layers are not drawn.
  - text: font, weight, italic, underline, colour, alignment, line height, letter spacing (em → px); re-measured once web fonts load
  - shapes: rectangle, ellipse, line, triangle, star, arrow
  - images: a frame until uploads (M12) and graphics (M9) supply a source
- `exportArtwork()` reads only the artwork layer: bleed box, any resolution, never guides. Proofs (M15) build on it.

**Viewport** (`geometry/viewport.ts`, `canvas/viewport-store.ts`, a separate store from the design)
- Zoom is a percentage of real size (100 % = 96 CSS px per printed inch). The range is 10–400 %, widened to include fit: a 1.5 m banner fits at about 11 %, a 51 × 17 mm stamp strip at over 100 %.
- Controls:
  - − / + step through 10, 25, 50, 75, 100, 150, 200, 300, 400 % and the fit level
  - the percentage menu: Fit to screen, Actual size, 50 %, 200 %, Show print guides
  - Ctrl/⌘ + / − / 0, Shift 1, Ctrl/⌘ ;
- Navigation:
  - Ctrl/⌘ + wheel or trackpad pinch zooms around the pointer
  - wheel scrolls pan (Shift for sideways)
  - drag (left button on empty canvas, middle button or Space) pans
  - touch: one finger pans, two fingers pinch and pan
- The sheet can't be panned off-screen.
- Fit is kept while the window or panels resize; manual views keep their centre. Switching sides keeps the view (same size) and re-fits only if the size differs.
- Buttons floating over the canvas (the phone zoom pill) never start a pan.

**Labels and layout**
- Dimension lines show the finished width and height next to the sheet (screen-only).
- The footer shows side, size, DPI and the guide legend.
- Zoom sits in the top bar on tablet and larger, and in a floating pill on phones. Preview was hidden on tablets until M14, which added it as an icon button on tablets and phones.

**Reference:** `/design-system#canvas-demo` shows the real canvas with a sample card (every element type on both sides, each trim shape, zoom, and the guide-free export). It's also the fixture for the element-rendering tests, since the Studio itself can't add elements until M6.

#### M6 — Selecting, moving, resizing and rotating

**How it's built**
- Selection outline, handles and rotation handle are **HTML over the Konva stage** (`canvas/selection-overlay.tsx`), not canvas nodes, so they can never reach the printable artwork or an export. The Konva stage no longer listens to pointer events.
- Picking and transforms use the document geometry (`geometry/transform.ts`, `canvas/transform-rules.ts`): pure, unit-tested functions. This replaces the Konva Transformer named in §18.3: it keeps the text rules (corner = font scale, side = rewrap) exact and keeps every value in print px.
- Every pointer move updates the design through the Studio store (M2 `updateElement`). All updates of one gesture share a coalesce key and merge into **one undo step, however long the pointer rests** (new `gesture` merge option); the step is sealed when the pointer lifts. Escape or a second finger cancels the gesture and leaves no step. Nudges and inspector arrow steps use the existing 600 ms grouping.
- The M5 gesture hook takes an element "delegate": presses on elements, taps and hover go to the element layer; empty canvas still pans, Space/middle button always pan, two fingers always pinch.

**Pointer rules**

| Input | On an element | On empty canvas |
|-------|---------------|-----------------|
| Mouse | press selects and drags (3 px threshold) | click deselects, drag pans |
| Touch | tap selects; one finger drags only the *selected* element, otherwise pans | tap deselects, drag pans |

- Locked and hidden layers are never picked on the canvas; Layers selects them. Locked selections show a dashed outline with a lock badge and no handles.
- Handles: text gets corners (font scales) and left/right (rewrap); images get corners (proportions kept, Shift frees them); lines get left/right; other shapes get all eight (Shift keeps proportions). Alt resizes from the centre. Minimum size 2 mm (never enlarges an element that is already smaller). Rotation snaps to 0/45/90… within 5°, Shift gives 15° steps.
- Handles have 24 px hit areas with a mouse and about 40 px on touch screens, and sit on a frame of at least 24 / 56 px so they stand clear of small elements.
- A live badge shows X/Y, W × H or the angle while dragging. The outline turns amber outside the safe area and red past the trim (rotated corners, trim shape), with a chip under the selection and the same sentence in the inspector.

**Keyboard** (selection keys apply while the canvas region or the layers list has focus, or nothing in particular; never while typing)
- Arrows 0.5 mm, Shift + arrows 5 mm; Delete / Backspace; Esc deselects (or cancels a drag); Ctrl D duplicates 3 mm down-right; Ctrl ] / [ and Ctrl Shift ] / [ change layer order; Ctrl Z, Ctrl Shift Z, Ctrl Y.
- Locked layers ignore these and the live region says why.

**Inspector and canvas UI**
- Properties shows the selected layer's name and type, the lock/hidden state (with Unlock), the print warning, and **Position & size**: X and Y from the trim's top-left corner, W and H in mm (one decimal), rotation in degrees. Enter or blur commits one undo step; ↑/↓ step 0.1 (Shift 1). Images keep their proportions; text height follows the text (read-only). M7 adds the proportion lock, centre/fit actions and opacity.
- Layer rows are buttons that select (the rest of the layer actions is M7).
- A floating selection toolbar offers Duplicate, Bring forward, Send backward and Delete (Unlock for locked layers) — the touch equivalents of the shortcuts.
- The canvas region is focusable (focus ring only for keyboard focus) and has a polite live region: "“Riya Sharma” selected. 5.9 mm from left, 5.9 mm from top, 52.5 × 7.6 mm.", "Moved …", "Deleted “Star”. Press Ctrl Z to undo.", "Undone: …", plus print warnings.
- Front and back keep separate elements; switching sides clears the selection (M3), and undo returns to the side it changes.

**Sample design (`?sample=1`)**: until the text and shape tools (M8, M9) and templates (M14) can add content, `/products/<slug>/design?sample=1` starts from the demo card fitted to the product's own sides, so element editing can be tried on every product. The demo now includes a locked layer ("Since 2026") as well as a hidden one.

**Known limits**
- Text box height isn't re-measured when the width changes (text tool, M8).
- No snapping or centre guides while dragging (Phase 4), no multi-select or marquee (Phase 4).
- Touch was tested with Chrome's touch emulation, not on physical devices.

#### M7 — Inspector and layers panel

**Inspector** (`src/features/studio/inspector/`): the same content docked on desktop, in the right drawer on laptops and tablets, and in the bottom sheet on phones (also opened from a new Properties button in the selection toolbar).
- Header with the layer's type icon, name and type; notices for locked (with Unlock), hidden and outside-safe-area / past-trim layers.
- Quick actions: Hide/Show and Lock/Unlock toggles (aria-pressed), Duplicate, Delete.
- **Position & size:** X, Y (from the trim's top-left corner), W, H in mm with one decimal; rotation in degrees (wraps 0–360). Proportion lock where it makes sense (shapes start free, images start locked; none for text, whose height follows the text, or lines). Centre horizontally / vertically on the piece.
- **Appearance:** opacity slider and percentage field.
- **Layer order:** Forward, Backward, To front, To back (disabled when they'd do nothing, or for locked layers).
- Fields commit on Enter or leaving the field (one undo step); ↑/↓ and the − / + buttons step by 0.1 mm (Shift ×10) and merge within 600 ms; a slider drag is one step however slow. Unchanged values and invalid text record nothing. Locked layers keep everything except unlock, show/hide, rename and duplicate disabled.
- Hiding from the inspector or the layers list keeps the selection (`setHidden(…, { keepSelection })`), so the same toggle can show it again; elsewhere M3's rule (hidden layers leave the selection) still applies.

**Layers panel**: every layer of the side, top first, with a type icon, name, and the hidden (struck-through, eye-off) and locked (lock) states — also in each row's accessible name ("Since 2026, text, locked").
- Click or tap selects (and highlights it on the canvas on hover); the selected row is highlighted and scrolled into view when the canvas selects.
- Each row has Lock/Unlock and Show/Hide buttons; Move layer up / down and Rename above the list.
- Keyboard: the list is one tab stop (roving focus); ↑/↓, Home/End move between layers and select them; Alt + ↑/↓ reorder; F2 (or a double-click, or the pencil) renames — Enter saves, Escape cancels, an empty name restores the automatic one; Delete and Ctrl shortcuts act on the selection.

**Design system:** new `NumberField` (units, Enter/blur commit, arrow steps, − / + on touch screens, wrap), `Slider` and `IconToggle`, shown under Form controls → Editor controls on `/design-system`. (`ColorField` moves to M8/M9, where colours become editable.)

**Accessibility:** every field and button is labelled ("X, from the left trim edge", "Increase W, width"); changes are announced through the canvas live region, and a second live region inside the drawer/sheet keeps them audible while that modal is open; controls are at least 40 px tall on touch screens.

**Known limits**
- No style controls yet (font, colour, fill, stroke): text tool M8, shapes and graphics M9.
- Layers are reordered with buttons and Alt + arrows, not by dragging (drag-and-drop is Phase 4).
- Fit inside safe area / Fill to bleed (Plan §18.6) are not in M7; they were planned with images (M12), but M12 places images by their pixels instead (see M12) and leaves Fit/Fill for later.

#### M8 — Text tool

**Text tool** (`src/features/studio/tools/`): the Text panel offers four presets: Heading, Subheading, Body text, and Name and title (two layers). They're set in Fraunces and Plus Jakarta Sans and sized from the product's safe area, in half points (13 pt on a business card, over 200 pt on a banner). New text lands centred in the safe area as sample text (`placeholder`), selected and open for typing, in one undo step. On tablets and phones the panel closes first so the canvas shows.

**Editing:**
- **In place** (desktop, laptop, tablet; `canvas/text-edit-overlay.tsx`): a native textarea over the text, matched to its font, size at the zoom, weight, italic, spacing, alignment, colour and rotation. The canvas hides its own drawing meanwhile.
- **Phones:** a bottom sheet (`shell/text-edit-sheet.tsx`) that moves above the on-screen keyboard (`visualViewport`); the canvas above updates live.
- **Opening the editor:** double-click or double-tap. Like the browser's own dblclick it needs two complete clicks, so pressing again to drag right after selecting still drags. Enter on the canvas and the selection toolbar's Edit text button also open it.
- **Keys:** Enter adds a line; Ctrl/⌘ + Enter, clicking away or Done keeps the text; Escape or Cancel restores it. While typing, arrows, Delete, Backspace, Home/End, Ctrl A and Ctrl Z are the textarea's own; no canvas shortcut fires.
- **Undo:** each keystroke updates the design (layer name, inspector, canvas), and a whole edit is one undo step however long it takes (`canvas/text-edit-session.ts`, same mechanism as a drag). Escape leaves no step.
- **Empty text:** committing it deletes the text box in that same step, so one undo brings the original back.
- **Names and sample text:** a name the customer chose is kept; automatic names follow the text. Changed sample text stops being a placeholder.
- **Content field:** the inspector's Content field edits the same way (one step per focus; Escape restores).

**Inspector:**
- New Content and Text style sections: font family (options previewed in their font), weight (Regular to Extra bold), italic and underline, size in pt, line height (×), letter spacing (em), alignment (left, centre, right, justify) and colour.
- **Fonts:** only weights and italics the font really has are offered. Switching to Manrope turns italic off rather than letting the canvas fake it. Fonts the Studio doesn't offer show as "(not available)".
- **Undo:** each change is one undo step; − / + steps merge within 600 ms, and a drag in the colour picker is one step.
- **Colour vs opacity:** text colour is stored on the text, separate from the layer's opacity.
- **No vertical alignment:** text boxes are auto-height, so it isn't offered.
- **Design system:** new `ColorField` (system picker, hex field with validation, named presets). `SegmentedControl` gains icon-only options and `disabled`, `Select` gains per-option style, `SheetContent` gains focus/Escape hooks, and `parseNumber` accepts ×, em and the minus sign.

**Automatic height (fixes the M6/M7 limitation):**
- **When it's re-measured:** a text box's height follows its text, font, size, weight, italic, line height, letter spacing and width.
- **How:** it's measured with Konva's own layout (`canvas/konva-text-measure.ts`, registered when the canvas code loads; `canvas/text-layout.ts` has no Konva import).
- **Same undo step:** the store re-measures every text element a command adds or re-flows before recording the step. So a width drag, a new font or typing changes width/size and height together, and undo restores both.
- **Top edge stays put:** it doesn't move when the height changes, also for rotated text.
- **Inspector:** H shows the measured height, read-only ("follows the text").
- **Resize handles:** side handles change the width only; corner handles scale the font (M6), and the height is then measured.

**Fonts** (`assets/fonts.ts`, `assets/studio-fonts.css`):
- **Registry:** Plus Jakarta Sans and Fraunces (loaded only in the Studio), plus Inter and Manrope (the site's own; Inter italic added).
- **Loading:** faces load through `document.fonts.load()` with the characters the design uses, so unicode-range subsets come too.
- **After a font loads:** the canvas redraws and the store re-measures every text (`relayoutText`). The re-measurement isn't an undo step, isn't announced, and is applied to every history step too. So wrapping measured with a fallback font never lingers.

**Accessibility:**
- Every control is labelled ("Font family", "Font size", "Text colour, hex code", "Horizontal alignment", "Line height", "Letter spacing", "Text content").
- Typing is never announced key by key; the end of an edit is: "Text changed to “…”", "Text edit cancelled", "Deleted the empty text box. Press Ctrl Z to undo".

**Also:** the layers list only scrolls its row into view when the selection changes and the list is on screen, so the inspector no longer jumps while text is edited.

**Known limits**
- Rich per-character formatting, vertical alignment and fixed-height text boxes are not in Phase 3.
- While typing in place, the browser lays the textarea out and may wrap a line slightly differently from the canvas; the canvas (and the stored height) take over as soon as the edit ends.
- Proofs that wait for fonts are M15; the canvas already redraws when fonts arrive.
- Font choice is the four bundled families; a larger font library is Phase 4.

#### M9 — Shapes and graphics

**Shapes** (`tools/shapes-tool.tsx`, `tools/shape-presets.ts`):
- **The picker:** Rectangle, Rounded rectangle, Circle, Ellipse, Triangle, Star, Hexagon (a regular polygon), Line and Arrow, each named "Add …".
- **Size:** follows the product, at 40 % of the safe area's shorter side, so a business card gets a small shape and a banner a large one. Line thickness is in quarter points, at least ½ pt.
- **Placement:** new shapes land centred in the safe area and are selected, in one undo step. A shape that would land exactly on an earlier one steps 3 mm aside.
- **Panel:** closes on tablets and phones so the canvas shows.

**Schema** (same version 2):
- `ShapeKind` gains `circle` and `polygon`. Shapes gain `innerRadius` (stars), `lineCap` and `dash` (lines).
- Designs made before M9 open with defaults (0.5, round, solid).
- A circle is its own kind: it always keeps width = height. An ellipse is separate.
- A line runs along its box's middle. Its length is the width and its height is its thickness (`strokeWidth`), derived and never typed.

**Drawing** (React-Konva `Rect`, `Ellipse`, `Line`, `Arrow`):
- Closed shapes draw their border inside the box, so what's selected is what prints.
- Borders scale with the zoom like the artwork, so they keep their physical width at every zoom.
- Stars and polygons are deterministic point lists that stretch with the box.
- Dotted lines always use round ends.

**Handles (extends M6):**
- Circles have corner handles only.
- Lines and arrows: dragging an end moves that end freely (length and angle; snaps to 45° within 5°, Shift gives 15° steps) while the other end stays put.
- **Proportion lock:** the inspector's "Keep proportions" now also drives the canvas handles.
  - Locked: corners only, which keep proportions.
  - Unlocked: all eight handles, free.
  - Shift reverses the lock while held.
- **Default locks:** graphics, triangles, stars and polygons start locked; rectangles, ellipses and arrows start free.
- **Line end handles always show.** M6 hid side handles on boxes thinner than 40 px, which hid a line's only handles.

**Inspector** (`inspector/shape-style-section.tsx`):
- **Closed shapes:** Fill colour and Border colour (both can be switched off: "No fill", "No border"), Border width in pt (bounded to half the shape), Corner radius in mm (rectangles, bounded), Star points and Inner radius % (stars), Sides (polygons).
- **Lines:** Line colour, Line width (the height follows, keeping the centre), Line ends (flat, round, square) and Line style (solid, dashed, dotted). Arrows have colour, width and ends.
- **Undo:** every change is one undo step; − / + steps merge within 600 ms, and a colour-picker drag is one step.
- **Existing controls reused:** Position & size, opacity, quick actions, layer order, lock/hide/rename and duplicate are M7's, unchanged.
- **ColorField:** gains `noneLabel` (the "none" choice; clearing the hex field also means none). Text colour, fill and border all use it.
- **Layer names:** polygons are named by their sides (Pentagon, Hexagon, Octagon).

**Graphics** (`assets/graphics.ts`, `tools/graphics-tool.tsx`):
- **Rights check (D5):** the 33 original graphics are small hand-written SVGs, defined inline in the original site's own code.
  - None carries a licence, author, copyright or editor metadata, and none matches a known icon set.
  - That points to them being made for the original site, but the rights holder and terms are not confirmed.
  - All 33 are therefore `unconfirmed` in `scripts/studio/graphics-register.mjs`. They're listed and audited (`src/data/generated/studio/graphics-meta.json`) but never copied into the app or shown.
- **Extraction** (`npm run studio:graphics`, `scripts/studio/extract-graphics.mjs`):
  - Reads the original chunk read-only and checks it against the register.
  - Sanitises every SVG with `assets/svg-sanitise.ts`. (M12 doesn't accept SVG uploads at all, so this stays the graphics' own path.) It removes scripts, foreignObject, event handlers, `javascript:` and external references.
  - Writes only cleared graphics to `public/studio/graphics/` and `public/api/v1/graphics.json`.
  - Today that's 0 included and 33 withheld. **To use them once the business confirms the rights:** set `rights` to `cleared` in the register, then run the script.
- **The panel:**
  - Approved graphics are grouped (Backgrounds, Icons, Illustrations, Badges) with local search over names, groups and tags.
  - Shows "Graphics are being prepared for Studio use." while the library is empty, and a retry if it fails to load.
- **Adding a graphic:** it's placed at 30 % of the trim width in its own proportions, shrunk to fit the safe area, centred and selected. Designs store only the graphic id, never the artwork or base64.
- **Rendering:**
  - Graphics are drawn as images in the artwork layer, so they're clipped, rotated, faded, selected, hidden and locked like everything else.
  - The shared image cache (`assets/image-cache.ts`, reused by uploads in M12) decodes each file once for the canvas and the panel thumbnails.
  - While a graphic loads, a light frame stands in.
  - If it's unavailable (not in the approved library) or its file fails, a crossed frame stays and the inspector explains, with a retry. The element is never removed.

**Sample design:** the back's ring is now a real circle, and its divider line is as tall as it is thick.

**Known limits**
- No graphic is selectable until the original graphics' rights are confirmed. The full flow is tested with a stand-in library served by the tests themselves.
- Recolouring graphics, gradients, freehand polygons and per-shape dash styles for borders are Phase 4.
- Triangles are isosceles in their box and polygons are regular; there's no point editing.
- Touch was tested in Chrome's emulation, not on physical devices.

#### M10 — Front/back sides and core editor polish

**Sides** (`shell/side-controls.tsx`, `shell/use-side-actions.ts`, `shell/side-rules.ts`):
- **Switcher:** the Front / Back control (top bar; above the canvas on phones) shows each side's item count. It's a keyboard-operable radio group: arrows move, Space or Enter switches.
- **Switching sides:**
  - finishes text being edited in place first (it commits as it loses focus), so nothing is left half-typed;
  - then clears selection, hover and editing (M3), and is announced: "Back side selected. 5 items.";
  - never changes either side.
- **Deep link:** `?side=` follows the active side (unchanged). An unknown side opens the front.
- **Single-sided profiles:** no switcher; the side menu offers "Clear design". Every Phase 3 profile currently has a front and a back, so this is tested with a one-sided fixture.

**Side menu** ("Side options", next to the switcher):
- **Copy front to back:**
  - Disabled while the front is empty.
  - Onto an empty back, it copies straight away and moves you to the back.
  - Onto a back with artwork, it first asks: Replace back, Keep both (adds on top) or Cancel.
  - Copies get new ids; graphics keep their reference; the front never changes. One undo step, which puts you back where you were.
- **Clear {side}:** clears only the active side, elements and background, after a confirmation. One undo step; disabled (and a no-op) on an empty side.

**Empty side:**
- An empty side shows a card over the canvas: "Back side is empty", with Add text, Add shape and Add graphic. On the back, while the front has artwork, it also offers Copy front to back.
- It's plain HTML: never exported, never stored in the design.

**Background tool** (`tools/background-tool.tsx`; Plan §18.5, previously "Coming soon"):
- One colour per side, running into the bleed, or No background (the unprinted material).
- A colour-picker drag is one undo step.
- Not included: recent colours on this device, and gradients.

**Views:** each side keeps its own zoom and pan (viewport store `showSurface`).
- A side seen for the first time fits.
- A side whose size changed re-fits.
- A resized window keeps the remembered centre.
- Views are editor state: never in the design, never undo steps. The guides preference is shared by both sides.

**Undo across sides:** the global history is unchanged. Undo and redo take you to the side they change and say so ("Undone: … Now on the back.").

**Hardening** (tests over existing code, no new systems):
- **Print warnings:** they cover every element kind, use rotated corners, and update after every move, resize, rotation and property change.
- **Resizes:** never flip and never go below 2 mm or produce non-numbers.
- **Angles:** stay within 0–360° and snap as before.
- **The store:** refuses invalid geometry, and documents stay valid after copy, clear and undo.

**Known limits**
- Side thumbnails are in the Preview (M14); the editor's side switcher keeps its item counts. Linking sides to the "Sides printed" option and its price is Phase 4.
- Flaps, covers and pockets (more than two sides) are supported by the schema but not edited in Phase 3.
- There's no shortcut for switching sides: the switcher is one Tab stop away and works with arrows and Space.
- Touch was tested in Chrome's emulation, not on physical devices.

#### M11 — Autosave, restore and version history

**Milestone order:** version history moved into M11. The remaining milestones are M12 image uploads, M13 templates, M14 preview, M15 proof and download, and M16 hardening.

**Scope:**
- Designs are saved in this browser, in IndexedDB; there's still no cloud or server saving.
- **Autosave:** about 1 s after the last change.
- **Save now:** from the status menu, or Ctrl/⌘ S.
- **Status:** honest wording.
- **On opening:** the design is restored.
- **Versions:** local version history with restore.
- **Undo:** the runtime undo history is never saved.

**Architecture** (`src/features/studio/persistence/`, no React):
- The design document stays the single source of truth: `Design document → Zustand → canvas`, and the controller writes copies, `Design document → validate → plain JSON → IndexedDB`.
- Never the Konva stage (Konva's own advice for React apps), images, base64, selection, hover, text editing, zoom, pan, guides, panels or undo history.
- **Database `aaraprint-studio`** (storage version 1; separate from the design schema version 2):
  - `designs`, keyed by `designId`, with indexes `productSlug` and `updatedAt`. Each record holds the designId, product slug and id, variant, name, schema version, created and updated times, revision, content fingerprint, current version id and the document.
  - `versions`, keyed by `versionId`, with indexes `designId` and `createdAt`. Each holds the design id, time, reason, schema version, fingerprint and the document.
- **`repository.ts`:** one contract with two implementations, IndexedDB (browser) and in-memory (tests). The design record's revision is checked and written in a single transaction.
- **`save-controller.ts`:**
  - Watches the store's document and writes it about 1 s after the last change. Gestures and typing already merge into finished updates, so a drag is one write.
  - Never edits the design, selection, side, view or history.
  - Writes run one at a time, newest content last.
  - Every write validates first (M2 `validateDesign`); an invalid design is never stored.
- **`restore.ts`:** `IndexedDB → parseDesign (migrations) → validate → product check → store`.
- **`fingerprint.ts`:** a content hash over key-ordered JSON, ignoring `meta`, used for dirty state and version de-duplication.

**Dirty and saved:**
- Dirty state compares content, not history length. Undoing back to what was saved shows "Saved" again without writing.
- Status labels: "Not saved yet", "Unsaved changes", "Saving…", "Saved just now / N min ago / 4:05 pm", "Save failed", "Saved in another tab", "Sample · not saved". The menu says designs are saved in this browser on this device; nothing claims cloud or sync.

**Opening** (`/products/:slug/design`):
- `?sample=1` opens the sample. It's never autosaved; Save now turns it into a design of its own.
- `?design=<id>` opens that design.
- Otherwise the latest design saved in this browser for the product opens, or a new blank one.
- Once saved, `?design=` names the design in the URL (replace, no history entry), so reloads and bookmarks reopen exactly it. Several designs can exist per product.
- **Restored state:** nothing is selected, no text editor is open, the side follows `?side=` (M10), and each side fits.
- **Product options:** the options chosen on the product page win (applied as M3's non-undoable variant); otherwise the design keeps its own.
- **Problems** get their own screen, and nothing is deleted:
  - damaged or unmigratable data → "This saved design can't be opened";
  - saved for another product → "This saved design belongs to another product", with "Open it with its product";
  - an unknown `?design=` → "This design isn't saved in this browser".
  - Each offers "Start a new design".

**Versions:**
- **Kept:** the first save ("Initial save"), each Save now that changed something ("Manual save"), an autosave when the newest version is at least 10 minutes old ("Autosave"), and around restores ("Before restore", "Restored version"). Nothing is kept when nothing changed.
- **Limit:** the newest 20 are kept per design (`VERSION_LIMIT`). The design record and the newest version are never pruned.
- **Version history** is in the status menu, on every layout (a bottom sheet on phones). Rows aren't clickable; each has a Restore button and a confirmation.
- **Restoring:**
  - keeps a safety copy first (unless the newest version already is the current design);
  - replaces the design as one undo step ("Restore version from …"); undo and redo move between the two; element ids are kept;
  - then saves. The chosen version is never removed.
- **Start a new design** (status menu): a new id and a blank design. The previous one stays saved with its versions.

**Failures:**
- **Storage problems** (no IndexedDB, blocked, quota, failed transactions): "Save failed — Unable to save locally. Your changes are still in this session." The editor keeps working in memory; Save now ("Try again") retries.
- **Another tab:** each write carries the revision it was based on. If another tab saved in between: "Saved in another tab", nothing is overwritten, and "Keep this tab's version" can overwrite on purpose.
- **Leaving the page:** pending changes are written when the page is hidden or closed. The browser's leave warning appears only when changes can't be kept (save failed or conflict).

**Accessibility:**
- The status button is named "<status>. Saving and versions".
- An `<output>` live region announces saves you asked for, restores and failures, never every autosave.
- The dialogs trap focus and close on Escape; focus returns to the status button.

**Testing:**
- Unit: `persistence/persistence.test.ts` (22 tests).
- Components: `shell/save-status.test.tsx` (11).
- Browser: `e2e/studio-persistence.spec.ts`, covering autosave and reload, Save now, dirty to saved, version restore with undo and redo, front, back and backgrounds after reload, view, selection and editing not kept, samples, another product's design, storage failure, phone UI, and 1440–360 px.

**Known limits**
- Saved only in this browser on this device: no account, no cloud copy, no cross-device recovery (Phase 6). Clearing site data removes designs.
- Two tabs on the same design don't sync live; the second tab is stopped from overwriting and can choose to.
- There's no list of all designs on this device yet; a design is reopened as the product's latest, or by its `?design=` link.
- Undo history isn't kept across reloads (by design); versions are the way back.

#### M12 — Image uploads and image assets

**Scope:**
- Customers add their own PNG, JPEG or WebP images from this device and place them on either side.
- Files are kept in this browser, in IndexedDB. Nothing is uploaded to a server, and there are no accounts.
- Templates (M13), preview (M14), proof and download (M15) and final hardening (M16) are not part of M12.

**Three separate things:**
- **Asset record** (IndexedDB, `assets` store): the file itself plus what was learned from it.
- **Design asset** (`document.assets[id]`, schema v2 as before): name, type, byte size, pixel size and `storage: { kind: 'local', blobId }`. It holds no bytes, base64, `blob:` URLs or decoded images.
- **Image element** (the existing M2 image element; no new element type): `source: { kind: 'asset', assetId }` plus the usual box, rotation, opacity, lock, hidden, name and layer position.
- At runtime, an object URL and a decoded image per asset live in memory only and are never saved.

**IndexedDB** (`aaraprint-studio`, storage version **2**):
- Version 2 adds `assets`, keyed by `assetId`, with an index on `createdAt`.
- Each record holds the asset id, display name, real type, byte size, pixel size, created time, the original Blob and a thumbnail Blob.
- The upgrade only creates what's missing, so M11's `designs` and `versions` are kept untouched. The browser test opens a real version 1 database and checks this.
- `blobId` is the asset id. One record per upload; using it on both sides or in many designs still stores it once.
- The repository (`persistence/repository.ts`) gains `putAsset`, `getAsset`, `listAssets` (newest first, without the Blob), `deleteAsset` and `isAssetReferenced`, in the same IndexedDB and in-memory versions as M11.

**Uploading** (`assets/uploads.ts`):
- **Accepted:** PNG, JPEG and WebP (`UPLOAD_MIME`), up to **10 MB** (`UPLOAD_MAX_BYTES`).
- **Order of checks:** empty file, then size (before reading anything), then the file's first bytes (its signature), then a real decode.
- **The signature decides the type.** The file name and the browser's guess don't. A JPEG called `.png` is stored as JPEG.
- **Refused files:**
  - SVG: "SVG files can't be uploaded. Use a PNG, JPEG or WebP image." Uploaded SVG can never become markup or script. Vector graphics stay with the M9 graphics library and its rights rules.
  - HTML, PDF, GIF and anything else: "This file type isn't supported. Use a PNG, JPEG or WebP image."
  - Too large: "Image is too large. Maximum file size is 10 MB."
  - Damaged: "This file couldn't be read as an image. It may be damaged."
- **Decoding:** `createImageBitmap(blob, { imageOrientation: 'from-image' })`, so phone photos with EXIF rotation are measured, listed and placed upright. The browser test uses a JPEG with orientation 6.
- **Thumbnail:** a WebP at most 240 px (`THUMBNAIL_SIZE`), made from the same decode and stored next to the file, so the panel never decodes full-size images.
- **No pixel limit.** A size the browser can't decode gets the "damaged" message.
- **Names are display text only.** Path parts and control characters are removed and names are cut at 120 characters. Names are only ever rendered as React text. Ids are generated (`asset_<uuid>`), never taken from file names.
- **Progress:** "Reading…", "Processing…" and "Saving…" in a live `<output>`. The file is stored before anything can refer to it, so a design never points at a file that wasn't saved.

**Uploads panel** (`tools/uploads-tool.tsx`; rail, phone toolbar, More sheet, and `?mode=upload` from the product page's "Upload your file"):
- Upload image button, which opens the file picker with only the accepted types.
- Drop zone for files: dragged text and links are ignored. It is hidden on touch.
- **My uploads:** every upload in this browser, newest first, with thumbnail, name, pixel size and file size. Empty: "No uploaded images yet."
- Uploading doesn't change the design and adds no undo step.
- **Choosing an upload** places it on the side being edited as one undo step ("Add image"). It's selected straight away. On phones and tablets the panel closes to show the canvas.
- Drag and drop works only on the panel's drop zone, so dragging on the canvas still pans and moves as in M5/M6.

**Placement** (`assets/image-placement.ts`):
- **Starting size:** the image's pixels at **150 DPI** (`PLACEMENT_DPI`), so a small logo doesn't start blown up.
- **Capped** at **35 %** of the trim width (`PLACEMENT_MAX_SHARE`, within the 30–40 % asked for) and fitted inside the safe area.
- **Proportions:** always the image's own. Images start with proportions locked (M9 rule).
- **Position:** centred in the safe area. If something is already there it steps 3 mm aside.
- The product's size, bleed, safe area and shape never change. M6 transforms, M7 inspector, and the M5 amber and red warnings apply unchanged.

**Resolution:**
- Effective DPI = the smaller of pixel width ÷ printed inches wide and pixel height ÷ printed inches high, at the current size.
- **Bands:** ≥ 300 is "Good" (`DPI_GOOD`), 150–299 "Acceptable", under 150 "Low resolution" (`DPI_ACCEPTABLE`).
- Low resolution is advice, not a block: "At this size the image may print soft… You can still use it."
- It updates as the image is resized.

**Inspector** (`inspector/image-asset-section.tsx`, above M7's position, size, rotation and opacity):
- Shows File, Pixels, File size, Resolution, and Replace image.
- **Replace image** is one undo step ("Replace image "…"").
  - It keeps the element id, layer order, position, width, rotation, opacity, lock, hidden and any custom layer name.
  - The height follows the new image's proportions, so it's never stretched.
  - The new file goes through the same checks.
- **Layer names:** a custom name is kept. Otherwise the layer is named after the file, falling back to "Image" (M7 rule).

**Front and back:** one upload can be placed on both sides. The design lists the asset once and both elements refer to it; the browser test checks one stored record and two references.

**Saving (M11):**
- Placing, moving or replacing an image is an ordinary design change: autosave writes the design (references only) about 1 s later.
- The file itself was written once, at upload. Moving an image never rewrites it.
- Saved designs contain no Blob, base64, `blob:` URL or decoded image; unit and browser tests check this.
- **Version restore** brings back image elements with their `assetId`s; the files are still in the asset store.

**Missing files** (the record is gone, e.g. site data cleared, or a design from elsewhere):
- The layer stays, with its box. The canvas draws a crossed placeholder frame and the inspector shows "Image unavailable".
- Retry looks again. Replace image or Delete fix it.
- The Studio never crashes and nothing is saved over.
- The M6 sample design's logo shows this state, as its file was never uploaded.

**Removing an upload:**
- Deleting an image layer never deletes the file.
- **Remove from My uploads** is allowed only when no design uses the file. That means the open design (including files it still lists after a delete or replace, so undo can bring them back), any saved design and any kept version.
- Otherwise: "This image is used in a design (or one of its saved versions), so it stays in My uploads."
- If the check can't be made, the file is kept.

**Runtime images and memory** (`assets/asset-library.ts`):
- **One object URL per asset**, created when the canvas or inspector first needs it and shared through the M9 image cache, so each image is decoded once.
- **Thumbnails** get their own URL, made once.
- **Releasing:** both are revoked when the upload is removed.
- Nothing is loaded at start-up: the list loads when the panel opens (without Blobs) and full images load when the canvas needs them.
- Konva draws the same element model that preview and proof will use (M14/M15); there's no second export-only image path.

**Security:**
- **Content:** uploads are untrusted. They are checked by signature and decode, and shown only through `<img>`/canvas from a `blob:` URL. File content is never put into HTML, and SVG is refused.
- **Names:** file names are never used as DOM ids or markup.

**Testing:**
- **Unit:** `assets/uploads.test.ts` (14 tests): signatures, accepted and refused files, size and empty checks, names and ids, references without bytes, placement at 150 DPI with the cap, DPI bands, replacement box, library upload and remove rules (open design, saved versions), object URL create-once and revoke, M11 saves carrying references only, one asset on both sides, version restore keeping `assetId`.
- **Component:** `tools/uploads-tool.test.tsx` (8 tests): empty state, upload then place as one undo step, error with Dismiss, removal refused and allowed, phone sheet, inspector resolution and low-resolution advice, Replace keeping place and width as one undo step, the unavailable state with Retry and Delete.
- **Browser:** `e2e/studio-images.spec.ts` (18 tests, with the real decoder and IndexedDB; images are drawn in the page, so no binary files are in the repository):
  - PNG, and JPEG with EXIF rotation;
  - refused SVG, HTML, damaged PNG and GIF (no script runs), and over 10 MB;
  - place, aspect ratio and safe-area centring;
  - move, resize, rotate and reload;
  - DPI bands while resizing;
  - delete and undo;
  - front and back with one record, both resolving after a reload;
  - version restore;
  - missing file with placeholder, Retry and Replace;
  - autosave and reload;
  - a version 1 database upgraded in place;
  - the product page's "Upload your file";
  - phone sheet, tablet panel, 1440–360 px with no sideways scroll;
  - no console errors in any test.
- **Screenshots:** `e2e/studio-visual.spec.ts` "uploads and images" (`SCREENSHOTS=1`).

**Known limits**
- **This browser only.** Uploads stay on this device, with no cloud copy or sync (Phase 6). Clearing site data removes them, and their layers then show "Image unavailable".
- **No crop, Fit inside safe area, Fill to bleed, flip, filters or background removal.** Images are resized as a whole; there's no photo editor.
- **No drag and drop or paste onto the canvas.** Drag and drop is on the panel's drop zone only.
- **No automatic cleanup.** Files still listed by a design or version stay until nothing uses them; there's no clean-up of old uploads beyond Remove.
- **PNG, JPEG and WebP only.** HEIC/AVIF photos must be converted first. No multi-page or vector uploads.
- **Resolution isn't final.** Thresholds are advice; the print check before ordering is M15.

#### M13 — Templates

**Scope:**
- A Templates tool to find, preview and apply ready-made layouts to one side or both sides of a design.
- Everything stays in the app: no server templates, remote URLs, imports, template editor or marketplace.
- This is the plan's original "M14 — Templates engine and first 15 templates" (milestones were renumbered in M11). The relative-geometry layout engine planned there was replaced by the predictable fit rules below.
- Preview (M14), proof and download (M15) and hardening (M16) are not part of M13.

**Templates are design data** (`src/features/studio/templates/`):
- **`types.ts`:** a `StudioTemplate` holds:
  - a stable id, name, description, category and tags;
  - the product families it was laid out for (M1 profiles), its rights status (the M1 `RightsStatus`) and `basedOn` (the original template it was re-authored from, if any);
  - `surfaces.front` and optionally `surfaces.back`. Each side is `{ print, background, elements }`, using M2 elements, an M10 side background, and the print size it was laid out on.
- **What they never hold:** Konva nodes, HTML, SVG markup, object URLs, Blobs, base64 or uploaded images. No new element type or schema change: the M2 document schema is unchanged.
- **`data/`:** the definitions, written in millimetres and points with small helpers (`data/build.ts`) that output plain M2 elements. Template texts are marked `placeholder: true`, the M2 sample-copy flag; editing a text clears it, as in M8.
- **`validate.ts`:** template data is treated as untrusted and checked one template at a time:
  - **Both sides together** go through the M2 parser (`parseDesign`). Element ids are unique across sides, values are in range, unknown fields are dropped and embedded `data:` is refused.
  - **Template-only rules:**
    - id format, name, category, short tags and known families;
    - Studio fonts only (`assets/fonts.ts`) and no uploaded images;
    - every element at least partly on the bleed box, and the back the same size as the front.
  - **Rights:** a template whose rights aren't confirmed is withheld.
  - **Bad entries:** a failing template is left out, with its reasons, in `rejected` (for tests and development). It never stops the others, and a repeated id is dropped.
- **`registry.ts`:** the catalogue loads only when the panel first needs it, as its own chunk, and is checked once. It has loading, ready and error states with Try again; `setTemplateSourceForTests` swaps the source.
- **`registry.ts` search:** local search over name, category and tags. It's case-insensitive, every word must match, and it combines with a category.

**The catalogue: 16 templates.** The original site had 95 code-defined templates (Reconnaissance Appendix B).
- **Nothing reused:** none of their code, copy or artwork is used; the original definitions aren't copied into this repository.
- **The 16 are new layouts in the new visual style:** 10 re-authored from an original layout idea (`basedOn`) and 6 new.
- **Content:** shapes, text and the Studio's OFL fonts only. No M9 graphics (none are cleared yet) and no images, so every template is `rights: 'cleared'`.
- **The other 79 originals** weren't re-authored and aren't offered. Their list stays in Appendix B, not duplicated here.

| Category | Templates | Laid out on |
|---|---|---|
| Business | Minimal centred (2 sides), Bold left-aligned, Diagonal spotlight, Classic emblem (2 sides), Editorial serif | 88.9 × 50.8 mm card |
| Business | Editorial notice | A5 flyer |
| Events | Event poster | A5 flyer |
| Events | Modern wedding (2 sides) | 127 × 177.8 mm invitation |
| Events | Birthday bash | 127 mm square invitation |
| Promotions | Sale announcement | A5 flyer |
| Promotions | Sleek pen wordmark | 101.6 × 20.3 mm pen |
| Stationery | Editorial sidebar letterhead | A4 |
| Stationery | Minimal corporate envelope | DL envelope |
| Labels & stamps | Centred badge | 59.3 mm round |
| Labels & stamps | Product label | 76.2 mm square label |
| Labels & stamps | Address stamp | 50.8 × 16.9 mm stamp |

**Compatibility** (`compat.ts`; shown as text and an icon, never colour alone):
- **Fits this product:** the template's product family, same trim shape (round or straight-edged) and the same finished size within 1 mm. It's applied as laid out: same millimetres, positions, proportions, rotations and layer order (DPI converted).
- **Fitted to W × H mm:** same family and trim shape, proportions within 20 %.
  - The template's safe area is scaled uniformly into this side's safe area and centred, so anything safe stays safe.
  - Rectangles that ran to or into the bleed past an edge (background bands) are stretched to the new edge.
  - Nothing else is rearranged.
- **Not for this product:** another family ("Made for visiting cards"), another trim shape ("Made for round products") or very different proportions ("Made for a different shape (88.9 × 50.8 mm)"). It can be previewed but not applied.
- **Product size:** never changes. D2 is untouched: templates use each side's own print geometry, and the 8 named-size mismatches and 106 option-dependent sizes are not altered.
- **Coverage today:** 199 of the 532 Studio products have at least one fitting template, 117 of them an exact fit.
  - Most visiting cards, pens, stamps and A-size stationery, flyers and signs are covered, plus some labels and gifts.
  - Clothing, bags, drinkware, mugs and umbrellas have none yet; those families say "No templates fit this product's size and shape yet".

**Panel** (`tools/templates-tool.tsx`; the existing tool rail, docked panel, tablet overlay and phone sheet; open by default on desktop as before):
- **Search:** "Search templates", with a polite live count of results.
- **Categories:** All plus the categories that have templates (Business, Events, Promotions, Stationery, Labels & stamps), as toggle buttons in a labelled group.
- **For this product:** templates that fit, exact ones first.
- **Made for other products (N):** collapsed by default.
- **No results:** "No templates match your search." with "Clear search and filters".
- **Cards:** preview, name, "2 sides" and "Fitted" or "Other product". Each card's accessible name is exactly what it shows followed by the details, e.g. "Minimal centred 2 sides. Business. Fits this product." (WCAG label-in-name). The preview sits outside the button, which stretches over the whole card.
- **Details** (in the panel, no navigation):
  - an "All templates" back link; the heading takes focus, and going back returns focus to the card;
  - front and back previews labelled as images;
  - the description, sides and the size it was made for;
  - the fit with its explanation, and the apply buttons.
- **Previews** (`template-preview.tsx`):
  - **Format:** a static SVG built from the same pure drawing descriptions as the canvas (`canvas/drawing.ts`), clipped to the trim shape.
  - **Cost:** no Konva stage per card, no image decoding and no stored thumbnail files, so dozens can show at once.
  - **Text:** follows the template's own line breaks (the templates are laid out not to wrap).
  - **Editing:** the list reads only the side's print size, so editing the design never redraws the previews.

**Applying** (`apply.ts`, a pure command; store action `applyTemplate(template, 'side' | 'both', mode)`):
- **Fresh ids:** every element is a copy with a new `el_` id. Template ids are never reused, and applying the same template twice never repeats an id. The template itself is never changed.
- **Empty side:** applied at once, no question.
- **A side with artwork:** "Replace what's on the front?", saying what's there ("The front has 5 items and a background colour…"), with three choices:
  - **Replace front:** the side's elements and background become the template's.
  - **Add to front:** keeps everything and adds the template on top. The side's background stays; the template's is used only if the side has none.
  - **Cancel:** nothing changes and no undo step is recorded.
  - Escape closes it, and focus returns to the Apply button.
- **One undo step** in every case ("Apply template "…""), however many sides and elements. Undo and redo restore exactly. Nothing is selected afterwards. Searching, filtering and previewing never record history.
- **Announced:** "Applied template "…". Press Ctrl Z to undo."
- **Phones and tablets:** the panel closes after applying, to show the design.
- **Front and back (M10):**
  - A one-sided template goes on the side being edited ("Apply to back").
  - A two-sided template offers "Apply to both sides" (front to front, back to back, one step) or "Apply to front only" (its matching side).
  - The other side is never changed unless "both" was chosen.
- **Backgrounds:** use the M10 side background, never an extra rectangle. Bands that are part of a layout are ordinary editable rectangles.
- **Editable:** everything applied stays editable — text, styles, shapes, positions, layers, names and background. Layer names follow M7 rules: decorative shapes carry names such as "Colour block", "Ring" or "Divider", and texts are named by their content. No locked elements are used.

**Assets and rights:**
- **Graphics:** templates may reference M9 graphics by id only. A template is offered only while every graphic it uses is in the approved library, so blocked graphics keep their templates hidden. Previews draw approved graphics from their library URL. No shipped template uses graphics yet.
- **Images:** templates can't reference uploaded images (M12), since a template can't rely on files in someone's browser. If an image ever went missing it would follow M12's "Image unavailable" handling. Nothing is ever substituted.

**Saving (M11):**
- Applying is an ordinary design change. Autosave stores the design's own elements (references and values only); a reload restores it.
- Saved designs contain no template ids or previews.
- Template designs take part in version history as usual; restoring a version brings its template content back.

**Testing:**
- **Unit:** `templates/templates.test.ts` (15 tests):
  - the shipped catalogue (16 valid and cleared, unique ids, no images, graphics or embedded data, texts inside the safe area, placeholders);
  - validation of broken, unsafe and withheld definitions, and one bad entry not affecting others;
  - compatibility levels and labels;
  - search and categories;
  - applying: fresh ids, applying twice, replace and add with backgrounds, both sides and one-sided targets, same size at another DPI, safe-area fit with edge bands, and the store's single undo step.
- **Component:** `tools/templates-tool.test.tsx` (10 tests):
  - list order, collapsed other products and names;
  - search, categories, the no-result state and Clear;
  - details with focus, previews and fit;
  - apply to both sides with undo and redo, and focus back to the card;
  - cancel, add and replace with focus returning;
  - a template for another product can't be applied;
  - load failure with Try again, and the loading state;
  - broken, withheld and unapproved-graphic templates left out;
  - an approved graphic shown in the preview;
  - the phone sheet.
- **Browser:** `e2e/studio-templates.spec.ts` (15 tests: 13 desktop, 1 tablet, 1 phone):
  - the panel and SVG previews;
  - search, categories and no results;
  - two-sided apply and its single undo;
  - a one-sided template on the back;
  - a template for another product;
  - replace, add and cancel with undo and redo;
  - fresh ids;
  - editing what was applied;
  - a fitted template on A4;
  - autosave and reload, and version restore;
  - keyboard only, with focus and the announcement;
  - tablet and phone;
  - 1440–360 px with no sideways scroll;
  - no console errors in any test.
- **Screenshots:** `e2e/studio-visual.spec.ts` "templates" (`SCREENSHOTS=1`).
- **One existing test changed:** `e2e/studio.spec.ts` now finds the rail's Product button by its exact name, because template cards (open by default on desktop) also say "product".

**Known limits**
- **16 templates, not 95.** The other originals weren't re-authored. Clothing, bags, drinkware, mugs and umbrellas have none, because their on-product layouts come with the mockup work.
- **Simple fitting.** A template only scales and centres into another size within 20 % of its proportions; nothing is rearranged for very different shapes.
- **Approximate previews.** Text in previews follows line breaks but not automatic wrapping, and fonts appear once loaded.
- **No graphics or photos yet.** No template uses M9 graphics (none are cleared) or photo areas.
- **Placeholder text isn't flagged to customers yet.** Template text is marked as placeholder for the Phase 4 preflight; the Studio doesn't warn about unchanged sample text yet.

#### M14 — Studio preview

**Scope:**
- A Preview of the current design as the finished piece, separate from editing. It shows front and back with thumbnails and has its own zoom and pan.
- Proof checks and downloads (M15) and final hardening (M16) are not part of M14.
- There are no product photo or 3D mockups, and no print validation.

**Entry:**
- **Preview** in the Studio top bar, on every layout. It shows a label on large desktops and is icon-only, still named "Preview", elsewhere.
- It replaces the earlier "coming soon" placeholder. **Continue** stays "coming soon" (ordering is later).
- No route or query parameter is added: Preview is a dialog over the Studio, so `?side=`, `?sample=1` and `?design=` are untouched.

**One renderer** (`canvas/artwork.tsx`):
- The artwork nodes are the same as the editor's: background, elements bottom to top, text, shapes, graphics, uploaded images and the M12 placeholders. They moved out of `canvas-stage.tsx` unchanged, so the editor and the preview draw from the same code and the same design-document data.
- Hidden elements aren't drawn. Locked ones are. Order, rotation, opacity, fonts and text settings are exactly the editor's.
- **The difference is the clip.** The editor clips to the bleed; the preview clips to the trim shape (rectangle, rounded rectangle or ellipse), so the customer sees the piece as cut.
- No Konva stage JSON, no second document, no copy of the store.

**Preview** (`preview/`):
- **`preview-dialog.tsx`:** a full-screen modal on every layout.
  - **Header:** "Preview" and the design name, the side thumbnails and zoom controls (in a bottom bar on phones), and Close.
  - **Middle:** the artwork on a neutral backdrop with a soft shadow under the piece.
  - **Footer:** "Front · 88.9 × 50.8 mm, trimmed · guides and bleed hidden".
- **`preview-canvas.tsx`** (loaded with Konva as a separate chunk):
  - **`PreviewCanvas`:** a read-only stage that listens to nothing, with only a shadow layer and an `artwork` layer.
  - **What's absent:** guides, bleed band, trim or safe lines, selection frame, handles, hover, measurement labels, text editor, locked/hidden badges and layer UI never exist in the preview.
- **Thumbnails** (`PreviewThumbnail`):
  - One small stage per side (56 × 40 px), drawn by the same artwork nodes and redrawn only when that side changes.
  - Thumbnails aren't exported images, and there are no hidden full-size stages.
  - If a thumbnail fails, its tile stays neutral and the side can still be chosen.
- **`renderer.ts`:** where the drawings come from. Tests without a canvas swap in stand-ins and a fixed size.
- **`readiness.ts`:** "Preparing preview…" until the fonts the design uses have loaded or fallen back and every uploaded image and graphic has settled.
  - Settled means drawn, missing or failed. It uses the same font loader, asset library and image cache as the editor, so nothing is decoded twice.
  - It waits 8 s at most.
- **Errors:** a drawing failure shows "Preview couldn't be generated. Your design is safe and unchanged." with **Try again** and **Close preview**. The Studio keeps running.

**Read-only:**
- The preview reads the design document in memory, so unsaved changes show straight away.
- It never writes. No undo step, no dirty state, no autosave; the editor's selection, side, zoom and panels are as they were when it closes.
- **Shortcuts:**
  - While the preview is open it takes Ctrl/⌘ shortcut keys and Shift 1 first (window, capture phase), so the editor's window-wide shortcuts (undo, redo, duplicate, save, arrange, zoom) can't act behind it. Ctrl/⌘ + − 0 and Shift 1 zoom the preview instead.
  - Plain keys pass, because the editor only uses them in its own regions.
  - Zoom buttons at their limit stay focusable (`aria-disabled`), so focus never drops to the page.

**Front and back:**
- "Side to preview" is a radio group of thumbnails, each named by its side and its contents ("Front 7 items", "Back Empty").
- Arrow keys and clicks switch sides. The preview starts on the side being edited, and switching never changes the editor's side. A chosen zoom level is kept.
- A product with one side shows no side choice, and no back is invented.
- **Empty states:** "No artwork on this side" and "Your design is empty", over the blank piece. No placeholder artwork is added.

**Zoom and pan** (`preview-view.ts`, pure; separate from the editor's zoom store):
- **Fit** shows the whole trimmed piece in the available space with padding (20 px phones, 32 px tablets, 56 px desktop). It follows window changes.
- **Percentages** mean what they mean in the editor: 100 % is real size (one printed inch = 96 CSS px).
- **Limits:** 25–400 %, widened to include Fit, since a banner fits at a few percent and a stamp at several hundred.
- **Controls:** zoom out, a menu (Fit to screen, 50 %, Actual size 100 %, 200 %), zoom in, and Fit. Steps go through the editor's zoom stops plus Fit. Ctrl/⌘ + wheel or a trackpad pinch zooms around the pointer.
- **Panning** works only when the piece is bigger than the space: drag with mouse, pen or one finger, scroll with the wheel, or use the arrow keys while the artwork region has focus. The piece stays centred along an axis where it fits, and its edges never move further in than the padding.

**Accessibility:**
- The dialog is named "Preview" and described ("How the front of "…" will look once printed and trimmed (88.9 × 50.8 mm). Guides, bleed and editing controls are hidden. Escape closes the preview.").
- Focus moves into the dialog on open and is trapped there. Escape and "Close preview" close it, and focus returns to the Preview button.
- The artwork is a labelled region ("Front side: 7 items, 88.9 × 50.8 mm."), focusable only while zoomed in.
- Zoom changes are announced politely ("Zoom 200%"). Side state is the radio state, never colour alone. Tap targets are at least 44 px on touch.

**Missing files:** an uploaded image this browser doesn't have keeps the M12 crossed frame in the preview too. It isn't removed, and it isn't flagged as a print problem (that's M15).

**Testing:**
- **Unit:** `preview/preview-view.test.ts` (7 tests): fit on the trim with padding, the 25–400 % range widened by Fit, steps, Fit following the space, panning only when bigger and never past the padding, and readiness (immediate for text and shapes, waits for a graphic, gives up after the time limit).
- **Component:** `preview/preview-dialog.test.tsx` (8 tests):
  - focus in, description and focus back on Escape, and the Close button;
  - thumbnails and switching sides, with the editor keeping its side;
  - one-sided products;
  - empty design and empty side;
  - zoom and presets with Ctrl + and Shift 1, editor zoom untouched;
  - editing shortcuts blocked and no history recorded;
  - a drawing failure with Try again.
- **Browser:** `e2e/studio-preview.spec.ts` (11 tests: 8 desktop, 1 tablet, 1 phone, 1 across widths):
  - entry, axe, focus and Escape;
  - the same drawing as the editor (ids, order, rotation, opacity, text, background, a graphic at 40 % turned 30°, an uploaded photo, the sample's missing logo);
  - no guides, handles or editor controls, and clipped at the trim (pixel check);
  - front and back by click and arrow keys;
  - Fit, zoom, the 400 % limit, drag, Ctrl −, presets, and editor zoom untouched;
  - empty design and empty side;
  - unsaved changes shown, no undo step, saving unaffected, reload restores;
  - the full regression flow: upload, template, edit, preview both sides, keep editing, autosave, reload;
  - tablet and phone layouts;
  - 1440–360 px with no sideways scroll;
  - no console errors.
- **Screenshots:** `e2e/studio-visual.spec.ts` "preview" (`SCREENSHOTS=1`).

**Known limits**
- **A flat design view.** No product photos, mockups or 3D (Phase 5), and nothing about print quality (M15).
- **One-sided products** are covered by component tests only: every catalogue product has a front and a back.
- **Touch zoom uses the buttons.** One finger pans, but there's no pinch-zoom on touch screens; a trackpad pinch works on desktop.
- **The error state** can't be triggered in a normal browser session; it's covered by component tests.

#### M15 — Studio proof and print checks

**Scope:**
- **Print check:** advice about the current design, per side, computed from the design document and the product's print geometry.
- **PNG proof:** a picture of the design, unsaved changes included.
- **What stays later:**
  - Warnings never block anything: blocking preflight (with placeholder text) is Phase 4.
  - Browser exports are proofs only; print-ready files are made server-side in Phase 6.
  - Product mockups and on-product workspaces stay in Phases 4–5. There's no PDF proof (Phase 4).

**Entry:**
- **Print check** in the Studio top bar on every layout, next to Preview. It's labelled on large desktops and icon-only elsewhere.
- **Its count** covers warnings in the artwork and settles 300 ms after editing pauses, so dragging and typing never run the checks on every move. The accessible name says it: "Print check 2 warnings", "Print check no warnings", "Print check design is empty".
- **Tablet top bar** (768–1023 px): to fit Preview and Print check, it drops its thin dividers and shows Continue (still "coming soon") as an arrow icon, still named "Continue"; the design name keeps at least 64 px. Laptop, desktop and phone bars are unchanged.
- **The dialog** "Print check and proof" uses the existing dialog: centred on larger screens, a bottom sheet on phones. Focus is trapped, Escape closes it, and focus returns to the button.

**Checks** (`preflight/print-checks.ts`, pure; `evaluatePrintChecks({ document, imageState, graphicState })`):
- **Inputs:** the visible elements of each side. Hidden layers are skipped, as they don't print. Nothing is stored in the design.
- **Past the trim edge** (stronger warning, red icon): any rotated corner outside the trim shape. The rule is the editor's own (`placementFor`, M5/M7).
  - The text says it'll be cut off, that this is expected for a background running into the bleed, and to keep anything important inside the safe zone.
- **Outside the safe zone** (warning, amber icon): inside the trim but crossing the safe zone, with the distance to keep ("at least 2 mm from the edge").
- **Low resolution image — N DPI** (warning): uploaded images under 150 DPI at their current size, with a recommendation. 150–299 DPI is a note ("Acceptable resolution"); 300 or more passes. These are the M12 bands (`effectiveDpi`, `resolutionLevel`). The image is never changed, upscaled or rejected.
- **Image unavailable** (warning): the file isn't in this browser, or there's no record of it. The element and M12's crossed placeholder stay; Replace and Delete (M12) are the way out.
- **Graphic unavailable** (warning): not in the approved M9 library, or the file failed. Nothing is substituted; the 33 graphics with unconfirmed rights stay withheld.
- **Font unavailable** (warning): a text whose font isn't one of the Studio's.
- **Empty:**
  - "Your design is empty" when no side has artwork or a background colour. It shows in the dialog but isn't counted on the button.
  - "No artwork on this side" (a note) for an empty side of a two-sided design. Whether an empty side is allowed isn't decided here.
- **Passes**, listed per side: "Nothing is past the trim edge", "Everything is inside the safe zone", "Images are sharp enough to print (150 DPI or more)", "All images and graphics are available", "All fonts are available".
- **Show** on an issue switches the editor to its side, selects the layer and puts focus on the canvas. It's the customer's choice to fix it; no edit is made for them.
- **Updates:** checks use the M12 asset library and image cache states and are redone when an image settles.

**Proof** (`preflight/proof-layout.ts`, `proof-texts.ts`, `proof-export.ts`, `proof-render.tsx`):
- **Contents:** the chosen sides ("Front and back", "Front only", "Back only"; only sides with artwork), side by side, each whole with its bleed. Above each, its name, finished size and bleed. Then a light bleed tint outside the trim, and the trim line (dark over a light edge, so it shows on any colour).
- **Footer:** design and product name, "Proof only — not a print-ready file. Colours on screen and in print can differ.", what the line and tint mean, the resolution (or how much it was scaled) and the print-check count.
- **Drawn by the editor's own artwork nodes** (`canvas/artwork.tsx`, shared with the canvas and Preview) from the design document in memory: unsaved changes included, no second model, no stage JSON.
  - Each side is redrawn with Konva `toCanvas` at proof resolution on a small off-screen stage, so vector shapes and text are sharp.
  - Images are drawn from their decoded files, never upscaled beyond their placed size.
  - The proof waits for fonts and images first (the M14 readiness check). A missing image shows its crossed placeholder; nothing crashes.
- **Size formula** (print px; L = longest edge of the largest bleed box):
  - margin = gap = round(0.06 L), label band = round(0.08 L), footer = round(0.12 L);
  - width = 2 margin + Σ bleed widths + gap × (sides − 1);
  - height = 2 margin + label band + tallest bleed height + footer;
  - scale = min(1, √(16 000 000 / (width × height)), 16 384 / max(width, height)).
- **Examples:**
  - A business card, both sides: 2367 × 983 px at full 300 DPI; one side is 1216 × 983 px.
  - The 30 MP canopy tent is scaled to stay within 16 MP, and the dialog and footer say so.
- **File name:** `<design-name>-proof.png`, or `<design-name>-<side>-proof.png` for one side. The download uses a temporary object URL, released afterwards.
- **Proof information in the dialog:** product, sides, finished size, resolution, bleed, safe zone, proof image size (full resolution or scaled, with percentage) and the warning count.
- **Empty design:** "Your design is empty. Add something to it to make a proof." There's no blank proof.
- **Read-only:** making a proof never edits the design or its history, and never changes the editor's side.

**Not blocking:** editing, saving, autosave, undo/redo, sides, Preview, templates, image replacement and layers work exactly as before, whatever the checks say.

**Accessibility:**
- The summary is an `<output>`; issues carry a "Warning:" or "Note:" prefix for screen readers, and colour is never the only signal (icons and words).
- "Show" buttons are named after their layer ("Show logo.png"); tap targets are at least 44 px on touch.
- Axe finds no violations in the dialog.

**Testing:**
- **Unit:** `preflight/print-checks.test.ts` (12 tests):
  - safe zone and trim, including rotated and round trims, hidden layers ignored, design unchanged;
  - DPI bands with the image unchanged;
  - unavailable images, graphics and fonts, and loading not counted as missing;
  - empty design, empty side and background-only sides;
  - the proof formula, the 16 MP canopy cap, the edge cap and rounded corners;
  - file names;
  - proof texts.
- **Component:** `preflight/print-check-dialog.test.tsx` (8 tests):
  - the button count;
  - per-side lists, Escape and focus;
  - Show selecting the layer with no edit made;
  - empty design;
  - proof facts and download from the current unsaved design, both sides and the back only, with no history change;
  - failure and retry;
  - only sides with artwork;
  - phones.
- **Browser:** `e2e/studio-proof.spec.ts` (11 tests: 8 desktop, 1 tablet, 1 phone, 1 across widths):
  - a good design and axe;
  - safe zone then trim warnings, Show, editing and undo;
  - low resolution (85 DPI) next to a sharp image;
  - an image lost from storage: unavailable, and the proof still downloads;
  - per-side checks;
  - real PNG proofs: sizes from the header, pixels read back to show the unsaved background colours, the tinted bleed and the white page;
  - back-only proof;
  - Preview still working;
  - saving with warnings and the same checks after a reload;
  - the canopy tent scaled to 16 MP;
  - tablet and phone;
  - 1440–360 px with no sideways scroll;
  - no console errors.
- **Screenshots:** `e2e/studio-visual.spec.ts` "print check" (`SCREENSHOTS=1`).

**Known limits**
- **Proof only.** A browser picture with no CMYK, ICC profile, crop marks or PDF; print-ready files are Phase 6.
- **Advice, not blocking.** Blocking preflight, including unchanged template placeholder text, is Phase 4.
- **Fonts are checked against the Studio's registry.** A Studio font that fails to download shows a fallback without a warning.
- **Bounding boxes, not ink.** The safe-zone and trim checks use the element's box (rotated corners), not the drawn pixels: a circle's empty corners or a text box's unused width can trigger them, as in the editor.

#### M16 — Final Studio hardening

**Scope:** making M1–M15 hold together. No new features. No Phase 4 work: product photos, mockups, 3D, on-product workspaces, blocking preflight, cloud saving and print-ready PDF/CMYK all stay future work.

**Baseline** (before M16, at `434aa50`): lint and typecheck clean; 650 unit and component tests passed; 302 browser tests passed, 0 failed.

**Bugs found and fixed:**
- **Editor shortcuts reached through dialogs.** With the Print check dialog (and the design-system dialogs: version history, restore and clear confirmations, copy-side and template-replace questions) open, Ctrl/⌘ Z, Y, D, [ ], S and the zoom keys still acted on the design behind it. Only Preview isolated them (M14).
  - Every modal dialog now carries `data-modal-dialog` (design-system `DialogContent` and `ConfirmDialog`, and the Preview).
  - The editor's window-wide shortcut and zoom handlers do nothing while one is open (`modalDialogOpen()` in `keyboard/use-studio-shortcuts.ts`).
  - Drawers and tool sheets aren't modal dialogs, so the layers list keeps its keys in the tablet drawer.
- **Desktop top bar clipped Continue at 1280–1399 px.** With labelled Preview and Print check buttons, Continue was partly off screen.
  - The two labels now show from 1400 px; below that the buttons are icons with the same names.
  - The bar fits at every width from 1440 to 360 px (checked).
- **Upload rows failed axe "label in name" (M12).** "Add image: logo.png, 400 × 400 px · 1 KB" didn't match the visible "logo.png" and "400 × 400 px · 1 KB", which had no space between them.
  - The name is now exactly what the row shows, after "Add image:".

**Tests made deterministic:**
- **Three inspector tests** ("steps within 600 ms merge", the opacity slider steps, + and − on font size) assumed two clicks land within 600 ms of wall-clock time, and failed on a busy machine. They now freeze `Date` (timers still run), so the merge window no longer depends on machine speed.
- **The Studio shell test file** now uses the same 20 s budget as every other full-Studio test file; it was the only one on the 5 s default.
- **Fixed sleeps before axe scans** (`waitForTimeout(250–400)` after dialogs and sheets open) are replaced by `settleAnimations()` (`e2e/fixtures.ts`), which waits until no animation is running, ignoring endless spinners. Three sleeps remain on purpose:
  - autosave must not happen (a negative check);
  - the gap between a double-tap's two taps;
  - Chrome's touch-release settling.
- **The full-page axe scans** (`a11y.spec.ts`, Studio canvas accessibility) get 60 s instead of 30 s. Every past failure there was a timeout while all workers ran, never a violation, and they couldn't be reproduced alone (24 of 24 under load).

**New cross-feature coverage** (`e2e/studio-flows.spec.ts`, 16 tests):
- **A · product page to saved design:** text, shape, move and resize, undo and redo, Save now, reload.
- **B · an image:** place, move, resize, DPI, save, reload.
- **C · a file that goes missing:** placeholder after reload, Replace and Delete.
- **D · front and back:** edited separately, saved and reloaded.
- **E · copy front to back:** fresh ids, the back edits alone, undo returns to the front.
- **F · a template:** search, apply, edit, save, reload.
- **G · Preview:** unsaved changes shown, the editor's side, selection, zoom and canvas unchanged.
- **H · Print check:** warning, Show, proof of the unsaved design (PNG header 1216 × 983), history unchanged.
- **I · versions:** autosave, Save now, restore with confirmation, undo and redo of the restore, reload.
- **J · locked and hidden layers:** Delete, arrows, position fields and reordering blocked until unlocked; hidden kept in Layers.
- **Shortcut isolation:** typing in template search, number fields and layer names, and pressing keys behind the Print check dialog, never changes the design.
- **Axe:** Templates panel, inspector and layers with a selection, Uploads with a file, Preview, Print check.
- **Every product family** (14) opens on its flat print area, and Preview, Print check and a proof work: business card, round card, A5 flyer, poster, vinyl banner, mug, bottle, pen, polo, cap, umbrella, backpack, stamp, round mouse pad. Every planned proof stays within 16 MP; real proofs are downloaded for one product per mode (business card, mug, polo), so the run stays light enough not to slow other tests.
- **Tablet critical flow** by touch: text, shape, image, back side, template, Preview, Print check, proof, autosave, reload. The design name keeps at least 56 px.
- **Phone critical flow:** tool sheets, template, Preview, Print check, proof, no sideways scroll.
- **Widths:** 1440, 1280, 1024, 820, 768, 600, 430, 390, 375 and 360 px. No sideways scroll, and the design name, Preview, Print check and Continue/Next are all on screen.

**Audited, no change needed:**
- **Persistence:** IndexedDB v1 → v2 upgrade (M12 test); designs and versions hold references only, never files, base64 or object URLs; stale-write and another-tab protection; save failures keep the Studio working; damaged or foreign designs get their own screens; missing files don't break drawing.
- **Uploads:** checked by signature and decode, size checked before reading, names treated as text, ids generated.
- **Rights:** graphics with unconfirmed rights stay withheld.
- **Proofs:** made from the in-memory design with the shared renderer; trim shape, bleed and the 16 MP / 16 384 px cap hold; no guides or handles; no edits or history.
- **Performance:** autosave is debounced; print-check counts settle after editing pauses; Preview and proof read the document without copying it into a second store.

**Final results:** lint and typecheck clean; 651 unit and component tests passed; 319 browser tests passed, 0 failed, 0 flaky, with retries off (283 skipped, each because it's for a different device layout); production build passes.

**Phase 3 status:** M1–M16 complete. Phase 4 has not started.

---

## 19. Phase 4 — progress

| Milestone | Status |
|-----------|--------|
| M1 Product view foundation | Done |
| M2 On-product workspace | Done |
| M3 Product colour and masked tint | Done |
| M4 Pens and mugs product view | Done |

#### M1 — Product view foundation

**Scope:** an "On the product" view inside the existing Preview, for umbrellas (15 products), rainwear (20) and wrap-printed drinkware (49). It is a visual layer only. The design stays print-space data, and editing, proof, save, autosave and undo are unchanged. Flat-printed drinkware, pens, mugs, apparel, polos, bags, signs and gifts are later milestones.

**Placement data**
- `scripts/studio/extract-product-views.mjs` reads the original Studio chunk as text (strict patterns; nothing is executed) and writes `src/data/generated/studio/product-view-placements.json`:
  - 290 boxes (220 drinkware, 70 umbrella and rainwear), each `[centerX, centerY, maxWidth, maxHeight]` in pixels of a 1122 × 1402 photo;
  - numbers copied exactly; the script fails on conflicting duplicates or a box off its photo;
  - the original's drinkware fallbacks by bottle kind are recorded but unused: every M1 product has its own boxes.
- `build-studio-profiles.mjs` adds `productView` (`umbrella`, `rainwear` or `drinkware-wrap`) and a per-side `placement` to those 84 profiles only. The box is matched by the photo's file name, and only when the photo is 1122 × 1402; no box is guessed. 83 products have boxes for both sides. `gift-water-bottle-steel` has no photo, so it has none. The other 448 profiles are byte-for-byte unchanged.
- **Placement maths** (the original's): the artwork's finished size is fitted inside the box, keeping its proportions, and centred on it. It is a flat rectangle, with no warp or perspective.

**Rights and fallbacks** (`src/features/studio/product-view/product-view.ts`)
- A photo is shown only when its rights are `cleared`, it has a valid box, its path is a plain library path, and the media library is published.
- Every recovered photo is still `unconfirmed`, so customers see no change today: the choice doesn't appear and no photo is requested.
- Rights are not changed to make the feature appear. `attribution-required` also blocks, because mockups carry no attribution line yet.
- Anything else falls back to the Phase 3 flat preview:
  - not an M1 product, no photo, blocked rights, or a missing or invalid box: the choice isn't offered;
  - on GitHub Pages (`VITE_MEDIA_BASE_URL=none`), the same;
  - a photo that fails to load: flat, with the note "On-product preview unavailable for this product."

**In the Preview**
- **The choice:** a "Flat / On the product" choice appears only when a side can be shown. It starts on Flat, which is exactly the Phase 3 preview. It sits in the header on laptops and desktops, and in the bottom bar on tablets and phones (44 px targets on touch).
- **Drawing:** the photo, with the same artwork nodes as the editor drawn over it at the box (clipped to the trim). An empty background stays transparent, so the product shows through (`Artwork blank="none"`; the editor, flat Preview and proof are unchanged).
- **Zoom and pan:** the same controls, over the whole photo. 100 % still means the artwork at real printed size.
- **Loading:** only the shown side's photo is loaded, and only once On the product is chosen.
- **Nothing is kept:** the photo isn't selectable and isn't in the design, saved records, versions, proof, undo history or autosave. Switching views or sides records nothing.

**Tests**
- **Unit** (`product-view.test.ts`, 12):
  - the 290 extracted boxes;
  - which 84 profiles get a product view, and that every side carries its photo's exact box;
  - placement maths on real boxes (golf umbrella, rain cap, aluminium bottle);
  - 100 % = real size;
  - rights: real photos blocked; a cleared fixture allowed; missing, unknown and attribution-required rights blocked;
  - unsupported, missing photo or side, no media, missing or invalid boxes, unsafe paths.
- **Component** (`preview-dialog.test.tsx`, 6 new):
  - no choice for a business card or a real umbrella;
  - Flat selected first;
  - On the product with the original box, front and back;
  - keyboard, with zoom at 100 %;
  - fallbacks with the note;
  - no undo steps;
  - header and bottom-bar placement.
- **Browser** (`e2e/studio-product.spec.ts`): the real umbrella profile is served with its photos swapped for a generated 1122 × 1402 PNG marked cleared, by the test only and never in the catalogue.
  1. Pixels: the photo's mark is drawn the right way round, the background colour fills exactly the box, and nothing is drawn outside it. A blank back lets the product show through. Front and back.
  2. A photo that fails to load stays flat with the note; mugs, polos, bags, flat drinkware and cards show no choice.
  3. The real umbrella, rain cap and bottle photos are never offered or requested.
  4. The saved design, its fingerprint and versions are identical after using the view, and hold no photo, box or image data.
  5. The proof is byte-for-byte the same file before and after.
  6. Widths 1440, 1280, 1024, 820, 768, 600, 430, 390, 375 and 360 px: the choice, zoom and close fit; there is no sideways scroll; the photo draws.
  - Zoom: 100 %, arrow-key panning and Fit.
  - Axe: Flat and On the product on desktop, tablet (touch) and phone.

**Results:** lint and typecheck clean; 670 unit and component tests passed (59 files); 329 browser tests passed, 0 failed (303 skipped, each because it's for a different device layout); production build passes.

**Also fixed (found by the full run):** M16's dialog guard also counted a dialog that was still fading out after Confirm or Cancel. So a shortcut pressed straight after one, such as Ctrl Z after "Clear back", was ignored. Closing dialogs (`data-state="closed"`) no longer count in `modalDialogOpen()`. A unit test covers it, and the front/back browser test passes again. The M16 axe test in `studio-flows.spec.ts` (four scans) now gets the same 60 s budget as the other full-page axe tests. With M1's tests added, it was timing out under full load; it never found a violation.

**Not in M1:** editing on the product, colour tint or recolouring, masks, perspective or umbrella panel shapes, 3D, pens, mugs, apparel, polos, bags, signs and gifts.

#### M2 — On-product workspace

**Scope:** the M1 product photo moves from Preview-only into the Studio's editing canvas, for the same products (umbrellas, rainwear, wrap-printed drinkware). Customers edit their artwork with the product behind it. The design is unchanged: print px, trim origin, one document.

**How it works**
- **One transform:** the editor already maps design px straight to the screen (the viewport).
  - On the product, the photo is drawn in design space, around the print area: `productBounds` = the whole photo in print px, from the M1 placement (`productToDesign` of its corners).
  - Artwork, guides, selection, handles, size labels and the text editor keep using the same design-px viewport, so they can't drift from the photo.
  - No editing code changed.
- **Coordinate spaces** (`product-view/product-view.ts`):
  - design (print px): saved;
  - product (photo px): the original boxes;
  - screen (CSS px).
  - `designToProduct` and `productToDesign` convert between design and product; tests round-trip design → product → screen → product → design.
- **Mockup layer:** the photo is a Konva image in the canvas's workspace layer, behind the artwork and guides.
  - That layer is never exported and never listens.
  - Picking uses the design's geometry, so the photo can't be selected, moved, deleted or listed: pressing on it deselects, and dragging it pans, as on empty canvas.
  - An empty background lets the product show through (`Artwork blank="none"`); a background colour fills the print area as before.
  - Hiding guides hides only the guides.
- **Fit, zoom and pan:** the viewport's content box becomes the photo's bounds, so Fit shows the whole product, and pan limits cover the photo.
  - Zoom keeps its controls, steps, presets and shortcuts; 100 % is still the artwork at real size.
  - Each side fits its own photo.
  - Switching Flat ↔ On the product fits again.
- **Shared with the Preview:**
  - `useProductView` / `useProductViewOffered`: the same rights gate, placement and image cache, so only the shown side's photo loads, and only once asked for;
  - `ProductViewToggle`: the same choice;
  - the Preview now uses them too, unchanged in behaviour.
- **The choice:**
  - "Canvas view: Flat / On the product" in the canvas footer, on every layout (44 px targets on touch). Delete, Backspace and arrow keys pressed on it never reach the selection.
  - It is view state in the viewport store, like zoom: not in the design, not undoable, not autosaved. A new session starts Flat.
- **Fallbacks:** unsupported products, blocked or missing photos, a missing or invalid placement, and no media library (Pages) show no choice; the Studio is exactly as in Phase 3. A photo that fails to load keeps the flat sheet, with "On-product view unavailable for this product."
- **Proof and persistence:**
  - Proofs render the design (byte-for-byte the same file from either view).
  - Saved designs and versions hold no photo, placement, view or viewport (checked in IndexedDB).
  - Edits made on the product undo, redo, autosave and version exactly like flat edits.

**Tests**
- **Unit** (`product-view.test.ts`, 3 new): the photo's bounds in design px; placement centre, scale and proportions, front and back; the design → product → screen → product → design round trip.
- **Store level** (`product-workspace.test.tsx`, 6), with the real viewport store, gestures, selection overlay and shortcuts:
  - Fit shows the whole photo, with the trim at the placement;
  - zoom 100 %, pan and Fit;
  - per-side photos;
  - a drag moves an element by screen distance ÷ zoom in print px, as one undo step;
  - arrow nudges are 0.5 mm;
  - the photo isn't pickable (press deselects, drag pans, the design is untouched).
- **Studio** (`shell/product-workspace.test.tsx`, 7):
  - no choice for a business card or for real (unconfirmed) photos;
  - Flat first, then On the product with front and back, and back to Flat;
  - keyboard, including Delete on the choice;
  - fallbacks with the note;
  - no undo step, layer or save from switching;
  - inspector edits on the product undo normally;
  - the same proof;
  - footer placement on tablet and phone.
- **Browser** (`e2e/studio-workspace.spec.ts`, cleared stand-in from `e2e/product-fixtures.ts`, now shared with the M1 spec):
  - **Pixels:** photo mark, artwork exactly in the print area, nothing outside it, the photo intact around it; Fit shows the whole photo; hidden guides keep the photo.
  - **A and D:** select, move, resize and rotate on the product, then undo and redo.
  - **B and C:** add text, a shape and an uploaded image; Layers holds only the design.
  - **E:** autosave and reload; IndexedDB holds no photo or view; the next session starts Flat.
  - **Switching views:** writes nothing and adds no undo step.
  - **F:** the proof is identical from either view.
  - **G:** front and back photos; editing the back leaves the front alone.
  - **H:** real photos are never offered or requested; a failed photo keeps a working flat editor.
  - **Zoom:** 100 %, wheel pan and Fit.
  - **Axe:** Flat and On the product.
  - **I:** every width from 1440 to 360 px: the photo fits, the choice is on screen, artwork picks, and nothing scrolls sideways.
  - **Tablet:** touch select and drag, 44 px targets, axe.
  - **Phone:** footer choice, the photo draws, axe.
- **Manual smoke test** (real photos marked cleared in a local browser session only, never committed): umbrella front and back, rain cap and aluminium bottle at 1440 px, the umbrella at 820 and 390 px, and back to Flat.

**Timeouts:** the M1 fallbacks test (six full Studio loads) and the M2 save-and-reload test now get 60 s instead of 30 s. Measured: 17 s and 12 s alone, over 30 s when run next to other Studio tests. They pass in every serial run.

**Results:** lint and typecheck clean; 686 unit and component tests passed (61 files); 342 browser tests passed, 0 failed (329 skipped, each because it's for a different device layout); production build passes.

**Not in M2:** product colours or tint, masks, perspective or umbrella panel shapes, 3D, pens, mugs, apparel, polos, bags, signs and gifts; snapping and multi-select. Real photos stay blocked until their rights are cleared.

#### M3 — Product colour and masked tint

**Scope:** the product photo in the On-the-product view (canvas and Preview) can be shown in the product's own colours, recoloured through its fabric mask.
- **Supported:** umbrellas (15) and rainwear (20).
- **Not supported:** drinkware, mugs, pens, apparel, polos, bags, signs and gifts.
- The design, variant and price never change.

**Colour data** (copied from the original, never guessed)
- `extract-product-views.mjs` now also copies, as text, the original's umbrella and rainwear data into `product-view-placements.json`:
  - the 10-colour palette (black `#2b2b2d`, navy `#243052`, red `#b0262d`, …);
  - the colour each product's front and back photos were taken in (35 products).
- `build-studio-profiles.mjs` adds three things:
  - `productColours`: the product's own Colour option values that have a palette entry, matched by name as the original; the default is the default variant's colour;
  - each side's `photoColour`;
  - the mask's own `rights`, which are unconfirmed (new `ASSET_RIGHTS.mask`).
- 34 products have colours (2–5 each). `umbrella-photo-print` has no colour option, so it gets no choice.
- Only those 35 profiles changed.

**Mask mapping and rights**
- Each side's mask is the file beside its photo (`…-front-mask.png`, `…-back-mask.png`), already recorded by M1.
- The mask is used only when:
  - its own rights are `cleared` (`attribution-required` blocks too: masks carry no attribution line);
  - it is a library path;
  - it is the photo's exact size;
  - the media library is published.
- Otherwise the photo shows as taken.
- The photo keeps the M1 gate; a blocked photo falls back to Flat as before.
- Every recovered photo and mask is still unconfirmed, so customers see no change: no colour choice, and no mask is ever requested (checked in the browser).
- No recovered file is copied into `public/` or the build (checked).

**Tint** (`product-view/tint.ts`, pure; a clean version of the original's "natural tint", read as text)
- **Fabric:** where the mask's red × alpha is at least 128, and the photo isn't transparent. Edges are softened with 5 × 5 binomial weights.
- **Measuring:** the fabric's typical brightness (65th percentile) and its highlights (99th) are measured, and its brightness is smoothed with an edge-preserving 7-tap filter across, then down.
- **Each fabric pixel:** colour × a shade factor from the smoothed brightness, plus fine detail, with the brightest highlights blending towards white (the original's "matte" finish). Light photos get the original's stronger relief (2.6).
- **Result:** folds, seams and shadows stay, and a pixel at the typical brightness becomes exactly the chosen colour. Off the mask nothing changes, and alpha is never touched.
- **When there is no tint:** the side's photo is already the chosen colour (as the original), or the side has no usable mask.
- **Left out:** the original's mask-noise clean-up (the masks are clean black and white), and its "frame" of the photo drawn over the artwork (the artwork stays on top here).

**Rendering, sharing and cache**
- **One shared pipeline:** `useProductView` (shared since M2) takes the colour and returns the tinted photo, so the canvas and the Preview draw the same pixels.
- **Draw order:** photo (tinted), artwork, guides, selection.
- **Shared choice:** "Product colour" swatches sit next to the view choice in the canvas footer and the Preview.
  - Each swatch is a radio with its colour's name, and the chosen one has a tick and a ring.
  - Arrow keys choose; targets are 44 px on touch.
  - Delete or Backspace on a swatch never reaches the selection.
- **Viewport-store state:** the choice is view state like zoom: not in the design, undo, autosave or versions. A new session starts from the variant's colour.
- **Cache** (`product-view/tint-renderer.ts`):
  - decoded pixels per URL (6);
  - the colour-independent preparation per photo + mask (4);
  - tinted canvases per photo + mask + colour (12, oldest dropped; no object URLs).
  - Work happens only when a photo, mask or colour is first needed, never on render or pointer moves.
  - While a new colour is prepared, the photo's last tint stays on screen.
  - The first colour on a photo takes about 0.1–0.4 s (measured locally); later switches to a colour already made are instant.
  - A tint that fails (e.g. a CDN without CORS) shows the photo as taken, with "Colour preview unavailable for this side."

**Tests**
- **Unit:**
  - `tint.test.ts` (12): fabric pixels become the colour; off-mask pixels and alpha are unchanged; edge feathering; mask and photo transparency; an empty mask; front and back masks; shadow, midtone and highlight keep their order; shade curve and light-photo relief.
  - `colours.test.ts` (13): the original data; which 34 products; options and default; validation; choosing (session, then variant, then default); the mask gate (rights, size, path, media); when a side is tinted; the cache (once per photo + mask + colour, failures remembered).
  - The M1 view test now also expects `mask: null` for the real (unconfirmed) mask.
- **Component** (`shell/product-colour.test.tsx`, 10):
  - the choice and its names;
  - the variant's colour first;
  - tinting with each side's own mask, reused when switching back;
  - keyboard, including Delete on a swatch;
  - no choice for real photos, unconfirmed masks or the photo-print umbrella;
  - a side without a cleared mask, and a failed tint, with the note;
  - no undo step, save or layer, and undo still undoes the edit;
  - the Preview shares the choice and the tinted photo;
  - tablet and phone footer.
- **Browser** (`e2e/studio-colour.spec.ts`; stand-in fabric photo and masks in `e2e/product-fixtures.ts`):
  - **A · Pixels:** midtone = the colour; shadow and highlight keep their order; off-mask pixels and the corner mark untouched; alpha kept; artwork pixels identical before and after; masks only loaded once needed.
  - **B · Front and back:** each side uses its own mask.
  - **C · G · Editing:** move, resize, rotate and add a shape on a coloured product; undo undoes the move, not the colour.
  - **D · Preview:** the same pixels as the canvas, and the choice is shared.
  - **E · Rights:** real photos and masks are never offered or requested.
  - **F · Saving:** IndexedDB unchanged after colour changes and the autosave delay.
  - **H · Proof:** byte-for-byte the same flat, on the product, and in Black, Red and Navy.
  - Widths 1440 to 360 px; tablet touch; phone; axe on the canvas and the Preview.
- **Manual smoke test** (real photos and masks marked cleared in a local browser session only, never committed): golf umbrella in Red (front) and Navy (back), two-fold umbrella in Green, waterproof jacket in Safety Yellow, rain cap in Black; the Preview matches.

**Results:** lint and typecheck clean; 721 unit and component tests passed (64 files); 356 browser tests passed, 0 failed (351 skipped, each because it's for a different device layout); production build passes.

**Not in M3:** drinkware, mug or pen colours; apparel and polos; perspective, umbrella panels and 3D; the original's frame over the artwork; changing the variant from the swatches (that belongs with the Phase 4 options panel). Real photos and masks stay blocked until their rights are cleared.

#### M4 — Pens and mugs product view

**Scope:** the M1–M2 product view (Preview and editing canvas) now also covers pens (49) and mugs (9), using the original Studio's photo maps and print-area formulas, copied as text from a second chunk (`3zkk7bvc_w-nw.js`) into `product-view-placements.json`. The photo is a visual layer only.

**Pens**
- **Frame and box:** the original draws a pen photo across a 2000 × 700 frame. The print box is the same for every pen: centred at (1160, 350), at most 700 × 104 frame px. So a 1200 × 240 print area lands as 520 × 104 at (900, 298); tests check this exactly against the original formula for every pen print size.
- **Photos:** the recovered photos are 2118–2120 × 742, the same proportions within 0.2 %. They are drawn across the frame, as the original did.
- **Families:**
  - The original has 10 pen families with front and back photos, not 9 as the audit said: multicolor, classic, metal, roller, fountain, highlighter, stylus, gel, paper and wheat.
  - It maps 50 slugs. All 49 of our pens are among them; the 50th, `gift-pen-wooden-ball`, is a gift here, and gifts aren't in M4.
  - The `paper` family's photos (`paper-front-v2.png`, `paper-back-v2.png`) aren't in the recovered folders. So `pen-recycled-paper` has no photo and stays flat: 48 pens have both sides.
- **Front and back:** each side uses its family's front or back photo, with the same box.
- **Colour (deferred):** the original recolours pen parts (body, clip, tip, buttons) by pixel analysis inside hand-drawn part shapes per family and side. That is a new tint system, which M4 excludes. Pens show their family photo as taken, and the original part colours per family and pen are recorded in the data for later. Pens get no colour choice (the M3 choice is umbrella and rainwear only).

**Mugs**
- **Frame and photo:** the original's frame is 900 × 1086. Each mug has one paired photo (1448 × 1086) holding both sides as 724 px halves:
  - the front is the left half, drawn at x 0;
  - the back is the right half, drawn 176 px in.
- **Print boxes:** both sides use the same box, centred at x 450, with each mug's own centre y and maximum size (e.g. 390 × 245 at y 515; the insulated travel mug 365 × 285). A 2700 × 1050 wrap lands as 390 × 151.7 at (255, 439.2).
- **Photos:** only 5 of the 9 paired photos are recovered (custom black, custom decorative, colour-changing magic, personalised, magic colour change). The other 4 mugs (classic photo, insulated travel, large latte 15 oz, two-tone colour) get no photo and stay flat. Nothing is guessed.
- **Left out:** the original also cut each mug out with hand-drawn shapes and recoloured its parts; that is the masks and recolouring M4 excludes, so the photo half is shown as taken. Mugs stay a flat 2D photo: no cylinder warp, curve, perspective or 3D.

**Architecture**
- **Photo frames:** a side may now carry a `photoFrame`: the frame its placement box is measured in, where the photo is drawn in it (`at`), and an optional crop of the photo (mugs).
  - Without one (M1 products), the frame is the photo, so nothing changes for umbrellas, rainwear or drinkware.
  - `frameFor` validates frames: positive sizes, the crop inside the photo, `at` inside the frame, and no stretching beyond 1 %. A frame that fails these checks makes the side invalid, so it stays flat.
- **Unchanged pieces:** placement (contain, centred), the design ↔ product transforms, Fit over the whole frame, the rights gate and the shared hook all work as before. The editor draws the photo (or crop) at `photoRect` in design px; the Preview draws it at `at` in frame px.
- **Profiles:** `productView` gains `pen` and `mug`. Only the 58 pen and mug profiles changed; `profiles-meta.json` lists the photos the original refers to that aren't recovered.

**Rights:** every recovered pen and mug photo is unconfirmed, so customers see no change: no choice, and no photo is requested (checked in the browser). No photo is copied into `public/` or the build (checked).

**Persistence, undo and proof** (unchanged from M2): the view, photo and frame are never in the design, versions, undo or autosave (checked in IndexedDB). Proofs are byte-for-byte the same flat and on the product, for a pen and a mug.

**Tests**
- **Unit** (`pens-mugs.test.ts`, 15):
  - the extracted frames, boxes, families, slugs and mug cuts;
  - every pen's family mapping and placement;
  - placement against the original formula for every pen print size, plus small and oversized artwork;
  - mug cuts, front and back, and placement;
  - round trips;
  - rights;
  - frame validation;
  - no colour choice for pens and mugs.
- **Updated:** the M1 tests now expect the pen and mug kinds, and the profile counts include the 53 pens and mugs with photos.
- **Component** (`shell/pens-mugs-view.test.tsx`, 6):
  - only the shown side's photo loads, and there is no colour choice;
  - the Preview draws the pen frame and the mug halves at the original boxes;
  - unrecovered photos and real rights stay flat with no request;
  - no undo step, layer or save.
- **Browser** (`e2e/studio-penmug.spec.ts`; stand-in pen and mug photos in `e2e/product-fixtures.ts`):
  - **A · Pen pixels:** photo and corner mark; artwork exactly in the 520 × 104 box, nothing outside. Then add, move, resize, rotate and undo, with the photo unmoved.
  - **B · Pen front and back:** the back photo; editing the back leaves the front unchanged.
  - **C · D · Mug pixels:** the front's left half with nothing past x 724; the back's right half drawn from x 176; one paired photo loaded once.
  - **E · Preview:** the same crop, place and box as the editor, front and back.
  - **F · Rights:** real pens and mugs, and unrecovered ones, are flat and never requested.
  - **G · Saving:** autosave, reload, nothing about the view saved.
  - **H · Proof:** identical flat and on the product, for a pen and a mug.
  - Axe on the canvas and the Preview; widths 1440 to 360 px for a pen and a mug; tablet touch; phone.
- **Manual smoke test** (real photos marked cleared in a local browser session only, never committed): gold click and fountain pens front, highlighter back; custom black mug front, back and Preview; personalised mug on a phone.

**Results:** lint and typecheck clean; 742 unit and component tests passed (66 files); 367 browser tests passed, 0 failed (373 skipped, each because it's for a different device layout); production build passes.

**Test stability:**
- **Load timeouts:** with four parallel workers, each of three full runs lost one different heavy Phase 3 Studio test to a 30 s timeout (a tablet proof test, a phone Preview test, a templates test). Each takes about 9 s alone and passes when repeated. The browser suite now uses three workers locally (`playwright.config.ts`; CI keeps its default): the full run then passes with no failures, in the same time.
- **Phone Preview race:** that test (M14, test 36) also polled the drawing before the Preview's separately loaded chunk had mounted. It now waits for the stage, as the spec's own `openPreview()` does.

**Source gaps:**
- 10 pen families, not 9; the paper family's photos are missing.
- Only 5 of the 9 mug photos are recovered.
- Pen and mug recolouring needs the original's part shapes, so it is deferred.
- Mug cut-outs are not used.

**Not in M4:** pen and mug colours, drinkware colour, apparel, polos, bags, signs, gifts, perspective, umbrella panels, cylinder warping and 3D; the options and price panel.

#### Corrective fix — product view not visible in the running app

**Reported:** opening Custom Photo Umbrella or Customized Pen, the Studio and Preview showed only the flat print area, with no "On the product" choice.

**Reproduced on the real routes** (product page → Start designing → Studio → Preview): exactly as reported.

**Root cause:** two things together.
1. Every recovered product photo and mask has `unconfirmed` rights. So `productViewFor` returns `rights` for every side of every product, and the choice is (correctly) not offered. Production behaves as designed and stays that way.
2. The only way to give the product view a cleared photo was Playwright swapping the profile inside the automated tests. So nobody could see or check the feature in the running app, and it looked missing.

When the same real routes were served with the photos marked cleared, the choice appeared and the umbrella and pen photos rendered correctly. No rendering, registry, frame, Preview or colour code was at fault (colour is optional: a photo without a usable mask still shows).

**Fix** (no architecture change, no new product-view system, real rights untouched):
- **Switch:** in development only (`npm run dev`), `?product-view-fixtures=1` on any page (remembered for the tab; `=0` turns it off) swaps the Studio profile's photo and mask refs for generated stand-ins marked cleared (`product-view/dev-fixtures.ts`).
  - Sizes, placements and frames are unchanged, so the rights gate, placement, editing, Preview and tint run exactly as on cleared photos.
  - The swap runs in the Studio loader behind `import.meta.env.DEV`; the app root remembers the switch, so "Start designing" keeps it.
- **Stand-in images:** the dev media server draws them on request (`tooling/product-view-fixtures.ts`, served only by `vite dev`, not `vite preview`). Each has the real photo's size, a neutral product shape (umbrella dome, garment, bottle, pen barrel, mug bodies on the paired photo's halves) around the real print box, and orange stripes in the corner. Masks are white over the product.
- **Note on screen:** "on a stand-in photo (development only)" appears in the canvas and Preview footers.
- **Real photos:** never requested in this mode.
- **Production builds:** contain none of it (checked: no stand-in path, switch or caption in `build/`).

**Tests**
- **Unit:** `dev-fixtures.test.ts` (4): the switch (URL, tab memory, blocked storage); the swap keeps sizes, placements and frames, adds cleared masks, keeps mug sides paired, and leaves missing photos missing.
- **Generator:** `tooling/product-view-fixtures.test.ts` (4): pen, umbrella (and mask) and mug stand-ins at the real sizes around the real print boxes; nothing served for other paths, unknown names or traversal.
- **Browser** (`e2e/studio-userflow.spec.ts`), starting on the product page and clicking Start designing, as a customer does:
  - **Umbrella and pen:** the choice; On the product with pixel checks (photo behind, artwork exactly over the print area, nothing outside); front and back; the Preview at the back's placement; back in the Studio with the artwork unchanged; axe on both.
  - **Rights:** the real routes stay flat with no choice in the Studio or Preview, and the Studio requests no product photo.
  - **Touch:** tablet and phone by touch, with axe.
- **Manual check:** on `npm run dev`, from each product page with the switch: umbrella flat, On the product, text added, colour Green (tinted through M3), back, Preview; pen the same without colour.

**Results:** lint and typecheck clean; 750 unit and component tests passed (68 files); 372 browser tests passed, 0 failed (380 skipped, each because it's for a different device layout); production build passes.

**Found, not changed (needs a decision):** product pages (Phase 2) show the same recovered photos in their galleries. The pen and umbrella pages request `/media/products/pens-2d/…` and `/media/products/umbrellas-rainwear-2d/…`. These are catalogue images, outside the Studio's rights gate.

**Phase 4 status:** M1–M4 complete, with the product-view corrective fix. M5 has not started.
