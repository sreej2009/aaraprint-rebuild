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
| **2. Catalogue, PDP & content** (≈2 wks) | Header/mega-menu/search with suggestions, home, listing with real filters/sort/pagination, quick view, PDP with option stepper, tiers, pricing engine, specs, mockup gallery; static content pages | All 533 products render from mock data; pricing engine tests match original prices; Lighthouse ≥ 90 on PDP. |
| **3. Studio core — flat mode** (≈3 wks) | Stage, zoom/pan, guides, text/image/shape nodes, selection/transform, inspector, layers, undo/redo (patches), keyboard shortcuts, uploads (local blob), IndexedDB drafts, autosave indicator, templates engine + first 15 templates, proof PNG | A visiting card and an A5 flyer can be designed front/back, survive reload, export a proof. |
| **4. Studio advanced** (≈3 wks) | Smart guides/snapping, multi-select/align/group, crop, curved text, QR, tables, background/CMYK, Studio fonts incl. Indic, preflight + review modal, apparel mode (mockups, placements, colours), wrap mode (unwrap + parts), product options panel, mobile Studio layout | Polo, mug, bottle, pen editable with correct mockups; preflight blocks placeholder text; mobile usability test passes. |
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
