# Aaraprint — Website Reconnaissance Report

**Target:** http://200.234.38.165 (live, inspected 31 Oct 2026) · **Recovered copy:** `../recovered/`
**Purpose:** document what the current platform does so the rebuild preserves its business capabilities. This is not a design reference.

Legend used throughout: **[C]** confirmed from live responses, page data or code · **[I]** inferred from code/markup but not exercised in a browser · **[U]** unknown / not observable.

---

## 1. Executive summary

- Aaraprint is a **custom print & merchandise store for India**: 533 products in 11 categories (visiting cards, stationery, stamps, signage, labels/packaging, apparel/bags, mugs/gifts, pens, drinkware, polos, umbrellas/rainwear). Every product but one is customisable in a browser **Design Studio**. **[C]**
- Pricing is option-driven: each product has option groups (Quantity, Size, Colour, Finish, Lid type…) with price deltas, expanded into SKU variants. Price = base + Σ deltas, multiplied by a "Batches/Quantity" stepper. 307 products show a quantity price-break table. **[C]**
- Commerce model: **pay on delivery** is the stated default ("no payment collected online"); free shipping ≥ ₹1,999, otherwise ₹99; dispatch in 2–3 days; 7-day reprint/refund for damaged/wrong/late items. Policies also describe **Razorpay** online payments and **Google sign-in** — online payment status is unclear. **[C]** (policy text) / **[U]** (whether live)
- The **Design Studio** (`/products/{slug}/design`) is the core asset: a react-konva editor with templates (95), text (incl. curved), uploads (PNG/JPG/WEBP/GIF/SVG ≤20 MB), graphics (33 SVGs), shapes, QR codes, tables, backgrounds (swatches + CMYK), layers, undo/redo, keyboard shortcuts, front/back and multi-panel sides, product-part recolouring, DPI warnings, 2D/3D review, proof download, local (IndexedDB) drafts and cloud saves. **[C]**
- Product-specific editor modes exist for polos (GLB 3D), apparel/bags (mockups), drinkware/mugs/pens (wrap + cylinder 3D + part colours), umbrellas/rainwear (masks + cone 3D), signs/posters (material/colour), notebooks/diaries/folders/envelopes (multi-panel + opened views), stamps (ink, impression), gifts (perspective faces), cards (orientation/oval/two-sided). **[C]**
- Technology: **Next.js (App Router, Turbopack build, React Server Components + Server Actions)** behind nginx 1.24 on Ubuntu; **Supabase** (auth + storage); Tailwind CSS, Radix UI, lucide icons, sonner toasts, Zustand + Immer, Konva/react-konva, three.js + React Three Fiber + drei, framer-motion (homepage). **[C]**
- Site appears to be a **demo/staging build**: credits page says "this demo storefront", support email is a placeholder (`support@nexuz.example.com`), the internal codename "nexuz" appears in class names and the IndexedDB name, 86 product pages have no image and 67 use Unsplash stock photos, homepage bestsellers show "Design pending". Built by a3fusiontech.com. **[C]**
- Inspection limits: no browser automation was available in this session, so the site was inspected through HTTP requests, decoded page data and static analysis of the JavaScript bundles. Cart contents, checkout, and signed-in account pages could not be observed without creating server-side data, which the rules forbid. **[C]**

---

## 2. Method and limitations

| Step | What was done |
|------|---------------|
| Recovered folder | Read-only review of `../recovered/` (681 HTML snapshots, 45 JS chunks, assets) and `recover.mjs`. Nothing modified. |
| Live HTTP | GET of public pages (home, categories, product pages, design pages for 532 products, cart, track-order, auth pages, policies), `robots.txt`, `sitemap.xml`; HEAD checks on assets. Throttled. |
| Page data | Decoded React Server Component payloads (`self.__next_f`) to extract product, variant, price and print-config JSON. |
| JS bundles | Static analysis of all chunks (+16 lazily-loaded 3D chunks downloaded to a scratch folder, not to `recovered/`). |
| Not done | No form submissions, no add-to-cart, no sign-up/sign-in, no orders, no payments, no enquiries. No credentials or private data accessed. No anon keys were found in the bundles. |

**Browser automation:** not available in this environment (no browser tools connected). Consequences: no screenshots, no visual responsive testing, no runtime observation of the editor; behaviours are derived from code and are marked **[I]** where not directly observable.

---

## 3. Complete sitemap

### 3.1 Route table

| Route pattern | Purpose | Access | Evidence |
|---------------|---------|--------|----------|
| `/` | Homepage | Public | sitemap, snapshot |
| `/categories/{slug}` | Category listing (11 slugs + `view-all`) | Public | sitemap (12) |
| `/categories/{slug}?type={subtype}` | Sub-type view (e.g. `caps`, `bags`, `printed-t-shirts`, `custom-office-shirts`, `reflective-safety-vest`, `invitations-announcements`, `notebooks-diaries`, `technology`, `weddings`, `mugs`, `calendars`, `gift-hampers`, `magnets`, `passport-size-photographs`, `skechers-tipping-polo-t-shirts`, `ideas-and-advice`, `qr-code-generator`) | Public | links in snapshots. **Server-rendered results are identical to the unfiltered page** (checked for `clothing-caps-bags?type=caps`) **[C]**; client-side filtering **[U]** |
| `/categories/{slug}?sort=&custom=&featured=&min=&max=&page=` | Sort/filter/paginate | Public | FilterSort component **[C]** |
| `/products/{slug}` (+ `?variantId=&designId=`) | Product detail; with `designId` shows the attached design | Public | 533 in sitemap |
| `/products/{slug}/design` (+ `?variantId=&designId=`) | **Design Studio** | Public (guest drafts local) | code, live 200 |
| `/search?q={query}&page=` | Search results (12 per page; empty query lists all, 46 pages) | Public (disallowed in robots) | snapshots |
| `/cart` | Cart (empty state observed) | Public | live 200 |
| `/checkout` | Checkout — redirects to `/cart` when empty | Public | live 307 |
| `/track-order` | Order tracking (order number + email) | Public | snapshot |
| `/login` (+ `?redirect=`) | Sign in (email/password, Google) | Public | snapshot |
| `/signup` (+ `?redirect=`) | Create account | Public | snapshot |
| `/forgot-password` | Request reset link | Public | snapshot |
| `/account` | Account home | Auth (307 → `/login?redirect=%2Faccount`) | live |
| `/account/orders` (+ `?reorder={slug}`) | Orders, reorder | Auth | links, code |
| `/account/designs` | Saved designs ("Design studio" header link) | Auth | links |
| `/account/addresses` | Address book | Auth | links |
| `/account/settings` | Account settings | Auth | links |
| `/about`, `/contact` (`#grievance`), `/faq`, `/shipping`, `/refund-policy`, `/privacy`, `/terms`, `/credits` | Content & policy | Public | sitemap |
| `/admin`, `/auth` | Disallowed in robots.txt (admin back office and auth callbacks) | Private | robots.txt **[I]** |
| `/sitemap.xml`, `/robots.txt` | SEO | Public | live (sitemap host is `localhost:3000` in robots — misconfiguration) |
| Not found (404): `/design-studio`, `/design`, `/studio`, `/editor`, `/api` | — | — | live |

### 3.2 Navigation relationships

```
Header: Utility strip (Free shipping ₹1,999 · Pay on delivery · Track order · Design studio→/account/designs · About · Contact · email)
        Logo → /   Search (suggestions)   Sign in / Account menu   Cart (drawer: lines, subtotal, View cart, Checkout)
        Category bar: Home · View All (dropdown) · 11 categories
Home → category → product → Design it → studio → Review → Approve → (login if guest) → product?designId → Add to cart → cart → checkout
Product → Add to cart (without design) → cart
Footer: Shop (4 categories) · Company (About, Credits, Contact, Grievance) · Support (Track, Shipping & returns, FAQ) · Legal (Privacy, Terms, Refund)
Account menu: Account · Orders · Saved designs · Reorder · Sign out
```

---

## 4. Page-by-page inspection

### 4.1 Homepage `/` **[C]**
| Block | Content |
|-------|---------|
| Utility strip | "Free shipping over ₹1,999 · Pay on delivery", Track an order, Design studio, About, Contact, support email |
| Header | Logo, Sign in, Cart (count), category navigation bar (Home, View All, 11 categories) |
| Hero | "Interactive Print Studio · Live Preview", H1 "Your brand, printed sharp.", copy, **interactive mini-customiser** (brand text input, 5 colour buttons, tabs Business Card / Premium Tee / Coffee Mug, live 3D mockup — GLB shirt, procedural mug), CTAs "Start Designing Now" (→ visiting cards) and "Browse Catalog" (#categories), badges "Live Mockup updating", "100% Vector Print-Safe" |
| Bestsellers | "Trending now / Bestsellers" rail of 8 products (6 show "Design pending" instead of an image), "View all products" → `/search` |
| Categories | "Everything you need to look sharp." — carousel of category cards with descriptions (scroll left/right) |
| Workflow | "Bespoke printing, simplified." 3 steps: Pick Your Canvas, Personalize Live, Print-Perfect Ship (24–48h print, COD) |
| Invitation maker demo | Mini birthday-invitation editor (styles Playful Pop / Disco Night / Garden Party, fields Celebrant/Turning/Date & time/Venue, trims Standard/Rounded/Ticket, front/back, safe-area toggle, "105 × 148 mm · 300 DPI"), CTA "Explore birthday invitations" |
| Testimonials | "What our builders print." filter chips (Show All, Startups, Creators, Corporate), carousel of 5 testimonials (names/companies appear illustrative) |
| CTA band | "Launch Special: Free Shipping Over ₹1,999", USPs: No minimum order, Print-margin checked, Express pan-India delivery; CTAs Start Designing / Talk to Print Experts |
| Catalog grid | "Browse all collections" — 11 categories + View All |
| Footer | Trust row (Free shipping, Pay on delivery, Secure checkout), brand blurb, link columns, © 2026, "Built by a3fusiontech.com" |

Not present: promotional discount banners with codes, search box in the hero, newsletter, ratings on product cards.

### 4.2 Category listing `/categories/{slug}` **[C]**
- Left "Categories" list with product counts (Visiting Cards 33 · Stationery 68 · Stamps 17 · Signs 69 · Labels 60 · Clothing 65 · Mugs/Gifts 46 · Pens 49 · Drinkware 48 · Polos 43 · Umbrellas 35 · View All 533).
- "Refine": toggles **Customisable in studio**, **Featured**; **Starting price** min–max with "Apply price"; "Clear filters".
- Sort: Featured, Price: Low to High, Price: High to Low, Name: A to Z.
- Header: H1, category description, hero image, product count.
- Card: image, Bestseller badge, category, name, short description, "from ₹X", CTA "Configure & price" (or "View product" for non-customisable).
- Pagination via `?page=N` (page sizes in snapshots are inconsistent — 48 then 1 on Pens page 3; needs live check). **[U]**

### 4.3 Search `/search?q=` **[C]**
12 results per page; header search shows suggestions via the `getSearchSuggestions` server action ("See all results for …", "Clear search"). Example: "birthday party invitations" → 1 result.

### 4.4 Product detail `/products/{slug}` **[C]**
See §6.

### 4.5 Design Studio `/products/{slug}/design`
See §7–8.

### 4.6 Cart `/cart` **[C] empty state only**
"Browse our catalog and start designing — everything you add will show up here." + "Browse products". Cart drawer in the header: "Your cart", lines, Subtotal, View cart, Checkout, "Your cart is empty.", Continue shopping. Cart line UI (from code **[I]**): quantity −/+, Remove (toast "Removed from cart"), "Design ready" tag, chosen part options (e.g. Flip Cap, Matte Black, Royal Blue). Server actions: `addToCart`, `updateCartItemQuantity`, `removeCartItem`.

### 4.7 Checkout `/checkout` **[U]**
Redirects to `/cart` when the cart is empty. The checkout UI was not observable without adding an item (a server write). From policies: guest checkout allowed; email collected for guests; payment methods "Pay on delivery" and "Pay online (Razorpay: UPI, card, netbanking)" "where available"; discount codes mentioned; GST and shipping shown before ordering.

### 4.8 Order tracking `/track-order` **[C]**
Form: Order number (placeholder `e.g. NX261023-C8883A`), Email used at checkout, "Track order"; link to sign in to see all orders. Result view (code **[I]**): Order number, Placed date, status, **Status history**, **Shipment tracking** (Courier, Tracking number, "Track with the courier"), Items, Subtotal, Shipping, GST, payment method (`cod`), "Need help?" with contact links and Refund policy. Statuses in code: Awaiting payment, Confirmed, Processing, Shipped, Delivered.

### 4.9 Auth pages **[C]**
- `/login`: "Welcome back", **Continue with Google**, email + password, Forgot password?, link to sign up; Google sign-in creates an account and implies agreement to Terms/Privacy. Server actions `signIn`, `resendConfirmation` (email confirmation required for email sign-ups **[I]**).
- `/signup`: Google, Full name, Email, Password, Confirm password, Create account (`signUp`).
- `/forgot-password`: Email, "Send reset link" (`requestPasswordReset`).
- `redirect` query param returns the user to the original page (used by the Studio).

### 4.10 Account pages `/account/*` **[U]**
Require sign-in (307 to login). Known from links/code: Orders (with Reorder `?reorder={slug}`), Saved designs, Addresses, Settings; refund policy says pay-on-delivery orders can be cancelled from "your orders" while status is Confirmed.

### 4.11 Content pages **[C]**
| Page | Key content |
|------|-------------|
| About | Mission ("make print feel personal again"), live studio, network of print partners across India, small team |
| Contact | Email (placeholder address), reply within one business day, hours Mon–Sat 10–7 IST, Grievance redressal (ack 48 h, resolve within one month), National Consumer Helpline 1915, e-Daakhil |
| FAQ | 8 Q&As: how the studio works; guest checkout allowed; formats PNG/JPG/SVG at 300 DPI; print 24–48 h + delivery 3–6 business days; bulk pricing via contact; cancellation while Confirmed (COD via account, others by email); late delivery → full refund; damaged/incorrect → reprint or refund within 7 days |
| Shipping & Returns | Pan-India couriers; 3–6 business days after printing; free ≥ ₹1,999 else flat ₹99; print within 24–48 h; no change-of-mind returns; reprint/refund within 7 days |
| Refund & Cancellation (updated 29 Oct 2026) | Cancel free while Confirmed; Processing usually not; no returns for correctly made items (wrong size/colour chosen, approved typos, low-res uploads, shade differences, wrong address); refunds to original method |
| Privacy (29 Oct 2026) | IT Act 2000 / DPDP Act 2023; data collected (account, contact/delivery, orders incl. discount codes and payment method, designs/uploads, messages); Google sign-in; Razorpay handles cards; no ad/analytics trackers; cookies only for session + cart; rights incl. deletion |
| Terms (29 Oct 2026) | 18+; guest or account; INR pricing, GST and shipping shown upfront; COD or Razorpay; you own your designs (limited licence to print); prohibited content (counterfeit logos, currency, govt IDs/seals…); team checks designs before printing and may hold orders; screen vs print colour differences; 300 DPI advice |
| Credits | Unsplash photo credits for categories and many products — "this demo storefront" |

---

## 5. Product category matrix

| Category | Products | Featured | Price range (₹) | Main option groups (count of products) | Print type(s) | DPI | Bleed px | Trim shapes | Studio mockups (✓ recovered / ✗ missing / · none) |
|---|---|---|---|---|---|---|---|---|---|
| Visiting Cards | 33 | 9 | 99–1,679 | Quantity (27), Colour (3), Stock Shade (2), Foil Colour (2), Finish (2) | flat_print 32 | 300 | 0–18 | rectangle 27, circle 1, rounded-rect 4 | 0 / 0 / 33 |
| Stationery, Letterheads & Notebooks | 68 | 17 | 149–1,679 | Quantity (68), Envelopes (15), Material (9), Finish (7), Cover Material (5) | flat_print 68 | 300 | 0–36 | rectangle 59, circle 2, rounded-rect 7 | 0 / 0 / 68 |
| Stamps and Ink | 17 | 4 | 199–999 | Ink Colour (14), Size (4), Diameter (3), Preset Text (2), Impression Size (2) | flat_print 17 | 300 | 0 | rectangle 12, circle 5 | 0 / 0 / 17 |
| Signs, Posters & Marketing Materials | 69 | 16 | 199–4,899 | Quantity (44), Size (36), Material (10), Sides Printed (4), Stand Width (4) | flat_print 69 | 100, 150, 200, 300 | 20–36 | rectangle 67, circle 1, rounded-rect 1 | 45 / 24 / 0 |
| Labels, Stickers & Packaging | 60 | 15 | 149–2,149 | Quantity (60), Size (23), Finish (13), Material (10), Board Weight (4) | flat_print 60 | 300 | 12–24 | rectangle 52, circle 5, rounded-rect 3 | 40 / 20 / 0 |
| Clothing, Caps & Bags | 65 | 15 | 99–3,149 | Colour (54), Size (39), Quantity (24), Print Placement (3), Logo Application (1) | apparel 41, flat_print 24 | 300 | 0 | rectangle 65 | 48 / 17 / 0 |
| Mugs, Albums & Gifts | 46 | 10 | 149–5,099 | Size (16), Pack Size (6), Frame Colour (4), Handle Colour (4), Colour (3) | flat_print 35, wrap 11 | 300 | 0–40 | rectangle 42, circle 3, rounded-rect 1 | 0 / 0 / 46 (profile-based assets) |
| Pens | 49 | 9 | 49–749 | Quantity (49), Barrel Colour (16), Finish (14), Print Colour (4), Nib Size (3) | flat_print 49 | 300 | 0 | rectangle 49 | profile-based (`pens-2d/<family>`) |
| Drinkware | 48 | 12 | 199–1,469 | Lid Type (31), Capacity (29), Colour (21), Quantity (7), Finish (2) | wrap 48 | 300 | 0 | rectangle 48 | 48 / 0 / 0 |
| Custom Polo T-shirts | 43 | 8 | 349–1,149 | Size (43), Colour (43), Embroidery vs Print (1) | apparel 43 | 300 | 0 | rectangle 43 | shared `polo/front|back.png` + GLB |
| Umbrellas & Rainwear | 35 | 8 | 199–4,134 | Quantity (27), Colour (20), Size (16), Canopy Colour (14), Canopy Size (1) | apparel 20, wrap 15 | 300 | 0 | rectangle 35 | 35 / 0 / 0 (+ masks) |
| **Total** | **533** | **123** | 49–5,099 | 101 distinct option-group names · 5,546 variants (SKUs) | flat 354 · apparel 104 · wrap 74 | | | | |

Observations **[C]**: all 533 products are "in stock"; no compare-at (sale) prices; dispatch "2–3 days" everywhere; free-shipping threshold ₹1,999 everywhere; only `card-accessory-metal-holder` is not customisable; three gift hampers have no print specs. Sub-types per category exist as `?type=` links (see §3.1). Full per-product data: **Appendix A**.

Categories mentioned in the brief but **not found** as separate categories: Photo albums (inside Mugs, Albums & Gifts), Invitations (inside Stationery), Rainwear (with Umbrellas), Stickers/Labels/Packaging (one category), Marketing materials (with Signs). No "Bags" or "Caps" category of their own (inside Clothing, Caps & Bags).

---

## 6. Product detail analysis

### 6.1 Data model **[C]**

```json
{
  "productId": "uuid", "productSlug": "business-card-classic", "productName": "Classic Visiting Cards",
  "categoryName": "Visiting Cards", "description": "…", "isCustomizable": true, "isFeatured": false,
  "basePriceCents": 22900, "freeShippingThresholdCents": 199900,
  "optionGroups": [
    { "id": "uuid", "name": "Quantity", "values": [
      { "id": "uuid", "label": "100 cards", "valueKey": "qty-100", "priceDeltaCents": 0 },
      { "id": "uuid", "label": "250 cards", "valueKey": "qty-250", "priceDeltaCents": 15000 } ] },
    { "name": "Ink Style", "values": [ { "label": "Classic Black", "priceDeltaCents": 0 },
      { "label": "Two-Colour", "priceDeltaCents": 800 }, { "label": "Full Colour", "priceDeltaCents": 1800 } ] } ],
  "variants": [ { "id": "uuid", "sku": "BUSINESS-CARD-CLASSIC-QTY-100-INK-TWO-COLOUR", "priceCents": 23700,
      "compareAtPriceCents": null, "stockStatus": "in_stock", "isDefault": false,
      "optionValueIds": ["…", "…"] } ],
  "savedDesignId": null, "initialVariantId": null
}
```

- Variant = one value from each group; `priceCents = basePriceCents + Σ priceDeltaCents` (verified: 22,900 + 800 = 23,700). Up to 60 variants per product (umbrellas). SKUs are generated from slug + value keys.
- **All option groups in the data affect the SKU and price.** Some options additionally change the Studio (garment colour → mockup tint, lid type → drinkware image, size/orientation → canvas size, envelope size, pockets, fold). Studio-only "product options" (mug/pen part colours, CMYK backgrounds) do not change price **[C]**; some Studio pickers carry their own price deltas (e.g. photo sizes `10.2 × 20.3 cm +₹0`, `12.7 × 17.8 cm +₹30`) **[C]**.

### 6.2 Page layout and behaviour **[C]**

| Element | Observation |
|---------|-------------|
| Breadcrumb | Home / Category / Product |
| Gallery | One image (mockup, Supabase photo or Unsplash); "Photo coming soon" placeholder; **3D preview** for some products ("Drag to rotate the 3D preview", error fallback) |
| Badges | Category label, "Customizable", "Bestseller", "Made to order" |
| Title + short description | H1 + one line |
| Options | Each group as buttons showing label and "included" or "+ ₹X"; "Product Orientation*" required for some cards; "Select…" dropdown variant; validation "Please select all required options." |
| Quantity stepper | Labelled **"Batches"** (multiplies the chosen quantity tier) or "Quantity" for unit products |
| Price | "Your price ₹229 incl. print", "dispatch in 2–3 days" |
| CTAs | **Add to cart** (toast "Added to cart") and **Design it** (→ Studio). With `designId`: "Your design is attached and ready to order." + Edit |
| Trust | Pay on delivery · free shipping over ₹1,999; Easy 7-day returns on unused items; "Pay on delivery — no payment collected online" |
| Bulk pricing | Link "Bulk pricing (1,000+)" → table **"Quantity price breaks"**: Quantity · Per unit · Order total · Savings (e.g. "57% off unit") with Selected/Choose buttons — on 307 products |
| Print specifications | Canvas (px), Resolution (dpi), Bleed (px), Safe zone (px), Trim shape, Print type (Flat print/Apparel/Wrap), Customisable (Yes — design studio) |
| Product details | Longer description paragraph |
| Unavailable state | "This product isn't available for purchase yet — options are still being configured." |
| Related products / reviews / delivery date estimate / artwork upload on PDP | **Not observed** |

---

## 7. Design Studio analysis

### 7.1 Entry, data and layout **[C]**

- URL `/products/{slug}/design?variantId=…&designId=…`. The server sends `product`, `printConfig`, optional `initialDesign`, variant options and `signedIn`.
- **printConfig** example: `{"category":"flat_print","canvasWidthPx":1050,"canvasHeightPx":600,"dpi":300,"bleedPx":18,"safeZonePx":24,"trimShape":"rectangle","mockupBackgroundUrl":null,"mockupBackgroundUrlBack":null,"model3d":null}`. Polos add `printAreaSizeMultiplier: 1.5`; one product (`apparel-tshirt-classic-cotton`) has `model3d: {modelUrl:"/shirt_baked.glb", printAreas:[{id:"front", uvOffset:[0.5,0.42], uvScale:[0.45,0.45]}], colorMaterialName:"lambert1"}`.

```
┌ Top bar: Exit/Close · Design name (editable) ▾ project menu · Save now (cloud) · [2D/3D Preview] · product · variant · ₹price · status · [Next] ┐
├ Tool rail + panel (md: 404px) ┬ Workspace (canvas / product mockup, side tabs, zoom pill bottom-centre) ┬ Properties + Layers ┤
```

| Area | Contents |
|------|----------|
| Top bar **[C]** | Close editor/Exit; **Design name** input; **Project menu**: My projects, Rename project, Duplicate design, Download proof; **Save now** (cloud icon); Preview / "3D Preview" toggle; product name · variant label; price with tag icon; status text; **Next** (primary, "shimmer" style) |
| Tool rail **[C]** | `product-options` (when applicable), **Templates**, **Text**, **Uploads**, **Graphics**, **Background**, **More** (Quick edits · QR code · Table); 84px-tall rail buttons |
| Workspace **[C]** | Konva stage with print area, bleed/safe guides, mockup background, side switcher (front/back/flap/cover-front/inside…, each showing element count), "On product / Flat" artwork editing view for some products, zoom control (− % + reset; **50–200 %, 10 % steps**) |
| Right panel **[C]** | "Click an element on the canvas to edit its properties." → properties; **Layers** list |
| Dialogs **[C]** | Review your design; Design history (local versions); Replace your current design?; envelope/size choosers ("Choose the envelope size before continuing your design."); Confirm selection |

### 7.2 Canvas engine **[C]**

| Topic | Finding |
|-------|---------|
| Library | **Konva + react-konva** (lazy chunk `CanvasStage`), `Transformer` for selection handles. (Fabric.js is **not** used — earlier keyword matches were the word "fabric".) |
| Units | Print pixels at product DPI; cm shown via `px / dpi × 2.54` |
| Print area / trim | Rectangle, rounded rectangle, circle/ellipse (oval cards); per-side areas |
| Bleed / safe zone | From printConfig (bleed 0–40 px, safe 18–60 px); guides drawn; notebook covers have special guides (spine/hinge ≈0.7 cm) |
| Background | Colour per side; "Extend background colours to the bleed edge." tip; Reset to white |
| Zoom / pan | Zoom 50–200 % buttons; pan/pinch **not found** **[I]** |
| Drag / resize / rotate | Yes (Transformer); arrow keys nudge 1 px, Shift+arrow 10 px; locked elements can't move |
| Alignment | Center horizontally / vertically; "Align to product" (reset rotation); "Fit inside safety area"; "Make image fit safe area"; "Expand image to bleed" |
| Snapping / smart guides | **Not found in code** **[I]** |
| Multi-select | **Not found** (single `selectedElementId`) **[C]** |
| Front/back | Per-side designs in `printAreas`; "Same design on both sides" toggle with Replace / Keep both; "Physical choices stay shared while front and back artwork remain independent." |
| Out-of-bounds warning | "Part of this layer is outside the print area and may be cut off. Reposition or resize it before saving." |

### 7.3 Text tools **[C]**
Add text (presets in Text panel), edit content (textarea), **Font** select of 7 system fonts (Arial, Georgia, Courier New, Times New Roman, Verdana, Trebuchet MS, Impact; templates use Plus Jakarta Sans/Fraunces which map to Arial/Georgia in the picker), **Size** (min 6), colour (picker or ink/paper for one-ink products like stamps: "Prints as"), **Bold**, **Italic**, **alignment** (left/centre/right), **Line spacing** 0.5–3, **Curve** (Straight / Arc over top / Arc under bottom — "The text runs around the circle inside its box"), overflow warning ("The text box may clip this text…"). Letter-spacing control **not found**. Double-click on canvas to edit text **[I]**.

### 7.4 Image tools **[C]**
Upload via button or **drag-and-drop** onto print area/product; types PNG, JPG, WEBP, GIF, SVG; **max 20 MB**; "Recently uploaded"; placement **Fill product** (cover) / **Fit whole image** (contain); **Replace** (keeps proportions); **Fit image / Fill face**; "Fill crops the image at the printable boundary. Drag to choose which part is visible." (crop by panning **[I]**); opacity; rotation; **Logo / artwork colour** tint with "Keep original colours"; **Effective resolution: N DPI** in properties and a review alert "N images may print blurry … about N DPI — we recommend at least 300 DPI"; guests: "Local upload mode", "Cloud upload failed. The image is available in this local draft."; uploads go to `uploadDesignAsset`, private images read via `getSignedImageUrl`.

### 7.5 Graphics & shapes **[C]**
Search box ("Search graphics"); **Shapes**: Brand block (rect), Outline seal (ellipse, stroke), Fine divider (line) — "Editable fill & stroke"; **Graphics**: 33 inline SVG illustrations/icons/backgrounds (list in Asset Inventory §7). Fill, stroke, stroke width editable; no corner radius, polygon, star, arrow.

### 7.6 Additional tools **[C]**
- **QR code**: input "Enter a website, email, phone number or message."; "Generated locally with high error correction for reliable printing."; toast "Scannable QR code added to the canvas."
- **Table**: "Separate headings and cell values with commas."; Add/Edit/Update table.
- **Quick edits**: fit/expand image, remove selected element.
- **Background**: Swatches / **CMYK** tabs ("CMYK values are converted to the on-screen RGB preview…"), Design colours, **Recent colours** ("Saved across products", localStorage `aaraprint:recent-design-colours`), hex input.
- **Templates**: 95 templates, filter by style; product-specific (wedding, corporate, birthday, envelopes, folders, compliment slips, bookmarks, calendars, letterheads, notebooks, certificates, ID cards, keychains, lanyards, wristbands…) and generic (Minimal centered, Bold left-aligned, Photo + text, Centered badge, Logo + tagline, Diagonal spotlight, Classic emblem, Blank canvas). Confirm before replacing ("…autosave will overwrite the saved version once it runs."). List: **Appendix B**.
- **Print-ready tips**: "Use a high-resolution design at 300 DPI. Keep important text inside the safe zone. Extend background colours to the bleed edge."
- **Product options panel** (per family, §8).

### 7.7 Layers & properties **[C]**
Layers sorted by z-index; per row: name (text content / image label / shape type), **Bring forward / Send backward**, **Show/Hide** (implemented as opacity 0), **Lock/Unlock** ("This layer is locked. Unlock it to change it."), **Delete**. Properties: **X, Y, Width, Height**, **Rotation°**, **Opacity** slider (0–1, step 0.05), Duplicate (Ctrl/Cmd D), Delete, Center H/V, size in cm and active side shown.

### 7.8 History & saving **[C]**

| Feature | Behaviour |
|---------|-----------|
| Undo / Redo | Buttons + Ctrl/Cmd Z, Ctrl/Cmd Shift Z, Ctrl/Cmd Y; depth **[U]** |
| Other shortcuts | Ctrl/Cmd D duplicate, Delete/Backspace remove, Esc deselect, arrows nudge (ignored while typing in inputs) |
| Store | `useDesignStudioStore` (Zustand + Immer), `isDirty` flag; `beforeunload` warning when dirty |
| Local drafts | IndexedDB **`nexuz-design-studio`** v1, store **`draft-versions`** (keyPath `id`, index `productId`); record `{id, productId, name, savedAt, design}` |
| Guest save | Saves to IndexedDB; status "Saved on this device" / "Local draft" |
| Signed-in save | Server action **`saveDesign`** `{designId, productId, variantId, name, canvasJson, previewImageUrl}` after **`uploadDesignPreview`** (PNG of the stage at pixelRatio 2, transformer hidden, waits for `document.fonts.ready`); status "Saving…", "Saved", "Unsaved changes", "Couldn't save — retrying" (toast "Couldn't save your design. We'll keep trying."). Autosave interval **[U]** (autosave confirmed by copy) |
| Foreign design | "This design belongs to another account, so changes here aren't saved." → "View only — not saved"; server error "Not your design." |
| Design history | Dialog "Local versions saved in this browser on this device." — restore a version (toast "Saved version restored."). Signed-in users are sent to `/account/designs` instead |
| Duplicate | Clears design id, renames "… copy", toast "A new copy is ready. Save it to add it to your projects." |
| Restore after reload / sign-in | On reload (guest) or after sign-in (sessionStorage flag **`aaraprint:restore-design-after-sign-in`** = product id) the latest local draft is loaded: toast "Restored your last design from this device." / "Your design is back — save it to your account." with action **Start fresh** |

### 7.9 Preview & approval **[C]**

Sequence:
1. User clicks **Next** in the top bar → save flush.
2. **Review your design** dialog: brand mark, "Check positioning, spelling and the safe area before continuing.", **2D / 3D** toggle (where supported), side tabs with element counts, upload status per side ("Design uploaded" / "Awaiting design"), **blurry-image alert** with DPI per side.
3. Footer: **Download proof** (PNG, `{name}-proof.png`, pixelRatio 2) · **Continue editing** · **Approve and continue**.
4. Approve as **guest** → draft saved locally, sessionStorage flag set, toast "Sign in to save and continue with your design.", redirect `/login?redirect=/products/{slug}/design?variantId=…`.
5. Approve **signed in** → waits for save ("Save all changes successfully before continuing." on failure; "We couldn't prepare the design. Please try again.") → navigates to `/products/{slug}?designId={id}&variantId={id}`.
6. Product page shows "Your design is attached and ready to order." → **Add to cart**.

3D preview components (lazy React-Three-Fiber chunks, "Couldn't load the 3D preview for this product." fallback): **PoloCanvas** (GLB `/models/polo-shirt.glb`, 360° preview, Rotate/Stop, Reset view, "Drag to rotate · Scroll or pinch to zoom", CC BY 4.0 credit), **FlatCardCanvas** (extruded card with thickness, book/flap hinge, open spread), **CylinderProductCanvas** (mugs, bottles, pens; body/cap colours, cap type), **ConeProductCanvas** (umbrellas), **BoxProductCanvas** (packaging), **StampProductCanvas** ("Approximate 3D shape · drag to rotate, scroll to zoom"), **RoundMousePadCanvas**, **DesignPreview3D** (generic GLB with UV print areas). Lighting: drei `Environment`, `ContactShadows`, `OrbitControls`, auto-rotate option, tone mapping.

---

## 8. Product-specific editor differences **[C]**

| Family (detector in code) | Products | Print areas | Product options panel | Workspace | 3D |
|---------------------------|----------|-------------|-----------------------|-----------|----|
| Polo (`isPoloProduct/Config`) | 43 polos | front = "Left chest", back = "Upper back"; area ×1.5 | **Shirt colors** (body/trim; White, Black, Navy, Maroon, Royal blue, Red, Bottle green, Olive, Sky blue, Pink, Grey…), pocket rendering | Shared flat mockup `/products/polo/front|back.png` drawn with Konva paths (placket, collar) | PoloCanvas (GLB) |
| Apparel & bags (mockup) | 41 apparel + 24 bags/caps | front / back | Garment colour via variant | Product photo mockups 1024² | 2D only (except one t-shirt with GLB) |
| Drinkware (`isDrinkwareProduct/Config`) | 48 | front / back (wrap) | **Drinkware options**: cap/lid type (Flip, Screw, Sipper), body & cap colours ("Choose a physical part to recolour. Your artwork colours stay independent.") | Photo mockups per lid; runtime silhouette & part detection | Cylinder |
| Mugs (`isMugProduct/Config`) | gift-mug-* (4 profiles) + mug-* | front / back (`MUG_BACK_OFFSET_X`) | **Mug colors**: Mug body, Handle, Inside & rim; reset | `mugs-2d/<profile>.png` | Cylinder |
| Pens (`isPenProduct/Config`) | 49 | barrel front / back (narrow 1200×240) | **Pen colors**: part (body, clip, tip…) — "Colors apply to both sides." | `pens-2d/<family>` (classic, fountain, metal, multicolor, roller, gel, highlighter, stylus, wheat) | Cylinder |
| Umbrellas & rainwear (`isUmbrellaRainwear…`) | 35 | front / back (umbrella "Back panel"; bag cover Front/Back) | Canopy / fabric colour ("frame, shaft, handle and tips stay as photographed"); "Zips, buttons, cords, reflective tape and linings stay…" | WebP mockups + **masks** | Cone (umbrellas) |
| Signs & posters (`isSignPosterProduct/Config`) | 69 | front / back | Size, material, colour groups mapped to photos/shades (`SIGN_POSTER_COLOURS`, custom colour) with price deltas | Photo + shade overlays, perspective faces | Flat card where configured **[I]** |
| Labels & packaging | 60 | front / back | Size/material via variants | Mockups | Box for packaging / flat card **[I]** (exact product mapping not determined) |
| Visiting cards (`isCardOrientationProduct`, `isOvalCardProduct`, `isTwoSidedCardProduct`, `isEngagementCardProduct`) | 33 + invitations | front / back | **Product orientation** Horizontal/Vertical (resizes both sides: "Your front and back designs resize together."), card sizes (`CARD_SIZES`) | Flat canvas; oval cards render as ellipse | FlatCard |
| Envelopes | stationery-envelope-* | front, back, **flap** | Envelope size (DL 22×11 cm, C5 22.9×16.2 cm, #10 24.1×10.5 cm), window, "Recipient address", "Return address", "Postage" zones | Envelope graphics | Flap hinge |
| Folders | stationery presentation folders | cover-front, cover-back, pocket-inside / pocket-left-inside + pocket-right-inside | Pockets: Single / Double ("Pocket — glued here, keep clear") | "Folder opened flat" views | Book hinge |
| Notebooks, diaries, bill/invoice books, booklets, desk calendar | 9 slugs | cover-front, cover-back, inside-page; outside-cover-1…6 for hardcover | Cover material etc. | "Notebook outside cover guides", "Preview notebook covers" | Book hinge, open spread |
| Stamps | 17 | impression (front) + product photo side | Ink colour ("Choices here update the stamp photo straight away and are carried to your cart."), size/diameter, preset text, seal colour (embosser) | Stamp photo with perspective quad; text "Prints as" ink | Stamp |
| Gifts (`isGiftFlatProduct`, perspective profiles) | frames, cushions, magnets, coasters, acrylics, calendars, canvas, phone case, lamp… | front / back (some single-sided) | Part colours (frame, base, metal bands, product finish), sizes with price deltas (e.g. 10.2×20.3 cm, 12.7×17.8 cm) | Mockup with perspective face quads, rounded "keep" regions, gloss | FlatCard / where configured |
| Round mouse pad (`isRoundMousePad…`) | 1 | front | — | Round mockup | RoundMousePadCanvas |

**Reusable across all:** canvas engine, element types, inspector, layers, history, saving, review, proof, templates engine, QR/table/graphics. **Product-specific:** print-area resolution, mockup/tint pipeline, options panel, 3D component, a few copy strings.

---

## 9. Technical observations

| Topic | Finding | Evidence |
|-------|---------|----------|
| Framework | Next.js App Router with React Server Components (`self.__next_f` payloads), **Turbopack** production build (`turbopack-*.js`, `globalThis.TURBOPACK`), `next/image` (`/_next/image?url=…&w=3840&q=75`) | HTML, chunks |
| Server | nginx/1.24.0 (Ubuntu); HSTS, X-Frame-Options SAMEORIGIN, nosniff, strict referrer, Permissions-Policy (camera/mic/geo off); `Cache-Control: private, no-store` on HTML | Response headers |
| Styling | Tailwind CSS (utility classes incl. v4 syntax like `bg-linear-to-r`, `size-4`), CSS variables (`--primary`, `coral`), class `container-nexuz` | HTML/CSS |
| UI libs | Radix UI (Dialog, Select, Separator…), lucide icons, sonner toasts, framer-motion (homepage), cmdk-like search **[I]** | chunks |
| State | Zustand (`useDesignStudioStore`, cart store), Immer | chunks |
| Canvas | Konva + react-konva | chunk `1xuflikv9jx4m.js` |
| 3D | three.js, @react-three/fiber, @react-three/drei (Environment, ContactShadows, Lightformer, Float, OrbitControls, useGLTF), DRACO loader (gstatic 1.5.5 decoders), DecalGeometry for polo | lazy chunks |
| Validation | zod present | chunk |
| Auth | Supabase (project `jkwytjiwxagoptligsym.supabase.co`), email/password + Google OAuth, email confirmation, password reset | chunks, policies |
| Storage | Supabase Storage public bucket `product-media`; private design assets via signed URLs (`getSignedImageUrl`) | URLs, code |
| Server actions | `signIn`, `signUp`, `signOut`, `resendConfirmation`, `requestPasswordReset`, `getSearchSuggestions`, `addToCart`, `updateCartItemQuantity`, `removeCartItem`, `trackOrder`, `saveDesign`, `uploadDesignPreview`, `uploadDesignAsset`, `getSignedImageUrl` (Next.js action IDs in bundles) | chunks |
| REST/API routes | None public (`/api` 404) | live |
| Browser storage | IndexedDB `nexuz-design-studio`/`draft-versions`; localStorage `aaraprint:recent-design-colours`; sessionStorage `aaraprint:restore-design-after-sign-in`; cookies for session + cart (privacy policy) | code, policy |
| Design JSON | `{schemaVersion:1, productId, printAreaId, canvasWidth, canvasHeight, backgroundColor, elements[], printAreas{[id]:{backgroundColor, elements}}}` + product state (`giftPartColors`, `mugColors`, `penColors`, `drinkware{capColor, bodyColor, capType}`). Element: `{id, type: text|image|shape(+qr/table as image/text variants), x, y, width, height, rotation, opacity, locked, zIndex, content:{…}}`; text content `{text, fontFamily, fontSize, fontWeight, fontStyle, color, align, lineHeight, curve?}`; shape `{shapeType: rect|ellipse|line, fill, stroke, strokeWidth}`; image `{storagePath, naturalWidth, naturalHeight, tint?, label}` | code |
| Fonts (site) | Archivo 500–800, IBM Plex Sans 400–600, IBM Plex Mono 400–500 (self-hosted woff2, preloaded) | headers |
| SEO | sitemap with 553 URLs (robots points to `localhost:3000/sitemap.xml` — bug); robots disallows admin, account, checkout, cart, auth, search | live |
| Source maps | None available | recovery report |
| Order numbers | Format `NX<yymmdd>-<6 hex>` (e.g. `NX261023-C8883A`) | placeholder |
| Analytics | None found ("No ad or analytics trackers") | policy, chunks |

---

## 10. Customer journeys

For each: action → page/modal → system response → validation → success → error. **[C]** unless noted.

### J1. New visitor → Homepage → Category → Product
| Step | Detail |
|------|--------|
| Action | Opens `/`, clicks a category card or nav item |
| Page | `/categories/{slug}` with filters/sort |
| Response | Server-rendered grid, counts, "from ₹" prices |
| Validation | Price filter needs min/max; "Apply price" |
| Success | Click card → `/products/{slug}` |
| Error | Empty filter result **[U]** (copy not observed); unknown slug → 404 page |

### J2. Product → Select options → Design Studio
| Step | Detail |
|------|--------|
| Action | Choose option values (each shows included / +₹), Batches stepper, click **Design it** |
| Response | Price updates live; navigates to `/products/{slug}/design?variantId=…` **[I]** |
| Validation | "Please select all required options." (e.g. Product Orientation*) |
| Success | Studio loads with product print config; "Loading design studio…" while client boots |
| Error | Product not purchasable: "This product isn't available for purchase yet…" |

### J3. Studio → Create artwork → Save
| Step | Detail |
|------|--------|
| Action | Apply template / add text / upload image / graphics; edit properties |
| Response | Canvas updates; toasts ("Image added to canvas.", "Table added…"); status "Unsaved changes" → "Saving…" → "Saved"/"Saved on this device" |
| Validation | Upload type/size ("Choose a PNG, JPG, WEBP, GIF or SVG image.", "Choose an image smaller than 20 MB."), "Select an element first.", "Add text to the canvas first.", out-of-print-area warning, text clipping warning, locked layer |
| Success | Draft persisted (IndexedDB or cloud) |
| Error | "Couldn't save this design on your device.", "Couldn't save your design. We'll keep trying.", "Cloud upload failed. The image is available in this local draft.", "Could not read that image." |

### J4. Guest → Design → Login → Return to editor
| Step | Detail |
|------|--------|
| Action | Guest clicks **Next** → **Approve and continue** |
| Response | Draft saved locally; sessionStorage flag; toast "Sign in to save and continue with your design."; redirect `/login?redirect=/products/{slug}/design?variantId=…` |
| Validation | Login form fields **[I]** |
| Success | After sign-in, Studio reloads and restores the local draft: "Your design is back — save it to your account." (action Start fresh) |
| Error | Login errors **[U]**; if IndexedDB unavailable the draft can't be restored **[I]** |

### J5. Signed-in → Design → Save to account
| Step | Detail |
|------|--------|
| Action | Edits; autosave or **Save now** |
| Response | Preview PNG uploaded (`uploadDesignPreview`) then `saveDesign` |
| Success | "Saved"; design listed in `/account/designs` **[I]** |
| Error | "Couldn't save — retrying"; foreign design → view-only banner |

### J6. Design → Review → Approve → Product page
| Step | Detail |
|------|--------|
| Action | **Next** → Review dialog (2D/3D, sides, DPI alert) → **Approve and continue** |
| Response | Waits for save → `/products/{slug}?designId=…&variantId=…` |
| Validation | Must be signed in; all changes saved; blurry-image alert is advisory **[C]** |
| Success | PDP shows "Your design is attached and ready to order." |
| Error | "Save all changes successfully before continuing.", "We couldn't prepare the design. Please try again." |

### J7. Product → Add to cart → Checkout
| Step | Detail |
|------|--------|
| Action | **Add to cart** |
| Response | `addToCart` server action; toast "Added to cart"; cart drawer count **[I]** |
| Validation | Required options |
| Success | Cart shows line with "Design ready", options, quantity controls; Checkout button |
| Error | **[U]** (not exercised) |

### J8. Checkout → Payment → Confirmation **[U]**
Not observable without a cart. Policies indicate: guest or account checkout, contact + delivery details, payment by **Pay on delivery** (default) or **Razorpay** "where available", GST and shipping shown before placing the order, confirmation email with order number, statuses Awaiting payment (online only) → Confirmed → Processing → Shipped → Delivered.

### J9. Customer → Account → Saved designs **[I]**
Header "Design studio" link → `/account/designs` (login redirect if guest) → list of designs → open `/products/{slug}/design?designId=…&variantId=…` (URL pattern confirmed in code).

### J10. Customer → Orders → Track order
| Step | Detail |
|------|--------|
| Action | Public `/track-order`: order number + checkout email → **Track order**; or `/account/orders` when signed in **[I]** |
| Response | `trackOrder` server action → order card: status, status history, courier & tracking number, items, subtotal, shipping, GST, payment method |
| Validation | Both fields required **[I]** |
| Error | Not-found copy **[U]** |
| Extras | Reorder (`/account/orders?reorder={slug}`), Cancel while Confirmed (COD) |

---

## 11. Responsive behaviour

Visual testing was not possible (no browser automation). From markup/classes **[I]**:
- Storefront uses Tailwind breakpoints `sm`/`md`/`lg`; header has "Open menu" (mobile menu), "Open cart"; category bar scrolls horizontally; homepage carousels have scroll buttons.
- Studio: left tools column becomes fixed width from `md` (`md:w-[404px]`); design-name field widens at `sm`/`lg`; save status text hidden below `sm` (except errors); top-bar "3D Preview" label shortens; review dialog `max-w-5xl` (96 vw for some products); 3D hint mentions pinch-zoom (touch-aware). No dedicated mobile tool layout (bottom bar/sheets) was found.

---

## 12. Missing information / not inspected

| Item | Why | How to close the gap |
|------|-----|---------------------|
| Checkout UI, payment step, order confirmation | Needs a non-empty cart (server write) | Staging account/test cart with permission, or the original source/backend docs |
| Account pages UI (orders, designs, addresses, settings) | Needs sign-in | Test account on staging |
| Admin back office (`/admin`) | Private | Ask business for access/requirements (product, order, print-file workflows) |
| Visual design at breakpoints, runtime editor behaviour | No browser automation | Run a browser session (Claude in Chrome / Playwright) if allowed |
| Undo depth, autosave interval, exact pagination size | Not determinable statically | Runtime test |
| Online payment availability | Contradictory copy | Business confirmation |
| GST inclusive/exclusive | Not stated on PDP | Business confirmation |
| Print-file generation (what goes to production) | Server-side | Backend/source access |
| Email templates (confirmation, reset) | Not public | Business |
| Order status workflow beyond listed statuses, courier integration | Server-side | Business/backend |
| 122 product mockups + 50 Studio assets + polo GLB not in `recovered/` | Incomplete crawl | Recovery step (Asset Inventory §8) |

---

## 13. Confirmed facts vs assumptions

### Confirmed
- 533 products / 11 categories / sitemap 553 URLs; product, option, variant and print-config data for all products.
- Pricing formula (base + deltas), quantity price-break tables, ₹1,999 free-shipping threshold, ₹99 flat shipping (policy), dispatch 2–3 days.
- Studio route, feature set (tools, limits, shortcuts, templates, graphics, fonts), IndexedDB/localStorage/sessionStorage keys, server-action names, guest/sign-in approval flow, review dialog actions, 3D component types, polo GLB path and licence.
- Next.js/Turbopack/RSC, nginx, Supabase, Konva, R3F, Zustand, Radix, Tailwind.
- Demo indicators (placeholder email, "demo storefront", Unsplash images, missing images).

### Inferred (from code, not exercised)
- Exact cart line UI, account page contents, track-order result layout, checkout fields.
- Pan/pinch absent in 2D editor; no snapping/multi-select; crop by panning image within fill.
- `?type=` filtering not effective server-side (client-side unknown).

### Unknown
- Live online payment, GST handling, admin workflows, print-file pipeline, notification emails, analytics, real reviews, undo depth, autosave cadence.

---

## Appendix A — Product catalogue matrix (all 533 products)

Source: decoded page data of every `/products/{slug}` page (recovered snapshots) + print config from `/products/{slug}/design` (fetched 31 Oct 2026). Prices are variant prices (base + option deltas) for one set. **Img** = what the product page shows: Mockup (server mockup), Photo (Supabase product photo), Unsplash (stock), — (none). **Mock** = Studio mockup front/back: ✓ recovered, ✗ exists live but not recovered, · none (flat canvas / profile-based). All products: dispatch in 2–3 days, in stock, free shipping ≥ ₹1,999, no compare-at prices.

### Visiting Cards (33)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `business-card-bulk` | Bulk Visiting Cards | 199–964 | Quantity (4); Packaging (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-circle` | Circle Visiting Cards | 439–1,196 | Quantity (4); Diameter (2) | 8 | flat | 700×700 @300 | 18/24 | circle | Photo | · |
| `business-card-classic` | Classic Visiting Cards | 229–997 | Quantity (4); Ink Style (3) | 12 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-custom-shape` | ★ Custom Shape Visiting Cards | 599–1,389 | Quantity (4); Die-Cut Complexity (3) | 12 | flat | 1000×1000 @300 | 18/24 | rounded | Photo | · |
| `business-card-diamond` | Diamond Visiting Cards | 899–1,679 | Quantity (4); Sparkle Finish (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-eco-recycled` | Eco Recycled Business Cards | 329–1,079 | Quantity (4); Stock Shade (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-extra-thick` | Extra Thick Business Cards | 449–1,244 | Quantity (4); Edge Colour (3) | 12 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-foil` | ★ Foil Business Cards | 599–1,364 | Quantity (4); Foil Colour (4) | 16 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-glossy` | Glossy Visiting Cards | 269–1,029 | Quantity (4); Gloss Level (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-kraft` | Kraft Visiting Cards | 329–1,079 | Quantity (4); Stock Shade (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-leaf` | Leaf Visiting Cards | 459–1,221 | Quantity (4); Leaf Style (3) | 12 | flat | 900×1100 @300 | 18/24 | rounded | Photo | · |
| `business-card-linen-textured` | Linen Textured Business Cards | 349–1,104 | Quantity (4); Colour (3) | 12 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-magnetic` | Magnetic Visiting Cards | 699–1,461 | Quantity (4); Magnet Thickness (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-matte` | Matte Visiting Cards | 259–1,015 | Quantity (4); Matte Weight (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-non-tearable` | Non-Tearable Visiting Cards | 649–1,407 | Quantity (4); Material (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-oval` | Oval Visiting Cards | 429–1,185 | Quantity (4); Oval Style (2) | 8 | flat | 1080×660 @300 | 18/24 | rounded | Photo | · |
| `business-card-pearl` | Pearl Visiting Cards | 479–1,236 | Quantity (4); Pearl Shade (3) | 12 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-premium-matte` | ★ Premium Matte Business Cards | 399–1,184 | Quantity (4); Lamination (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Unsplash | · |
| `business-card-premium-plus` | Premium Plus Visiting Cards | 799–1,574 | Quantity (4); Card Weight (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-qr-code` | ★ QR Code Visiting Cards | 349–1,124 | Quantity (4); QR Placement (3) | 12 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-raised-foil` | ★ Raised Foil Visiting Cards | 599–1,364 | Quantity (4); Foil Colour (4) | 16 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-rounded-corner` | ★ Rounded Corner Visiting Cards | 279–1,034 | Quantity (4); Corner Radius (2) | 8 | flat | 1050×600 @300 | 18/24 | rounded | Photo | · |
| `business-card-spot-uv` | Spot UV Visiting Cards | 499–1,319 | Quantity (4); Spot UV Placement (3) | 12 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-square` | Square Visiting Cards | 299–1,069 | Quantity (4); Paper Stock (2) | 8 | flat | 780×780 @300 | 18/24 | rect | Photo | · |
| `business-card-standard` | ★ Standard Visiting Cards | 244–1,009 | Quantity (4); Finish (3) | 12 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `business-card-transparent` | Transparent Visiting Cards | 699–1,459 | Quantity (4); Plastic Tint (2) | 8 | flat | 1050×600 @300 | 18/24 | rect | Unsplash | · |
| `business-card-velvet-touch` | Velvet Touch Visiting Cards | 449–1,204 | Quantity (4); Texture Colour (3) | 11 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `card-accessory-engraved-metal-holder` | Engraved Metal Visiting Card Holders | 399–419 | Material Finish (3) | 3 | flat | 720×240 @300 | 0/20 | rect | Photo | · |
| `card-accessory-leatherite-holder` | Leatherite Visiting Cards Holder | 199–204 | Colour (3) | 3 | flat | 720×240 @300 | 0/20 | rect | Photo | · |
| `card-accessory-metal-holder` | (not customisable) Metal Visiting Card Holder | 249–257 | Colour (3) | 3 | — | — | — | — | Photo | · |
| `card-accessory-premium-metal-holder` | ★ Premium Metal Card Holders | 499–519 | Finish (3) | 3 | flat | 720×240 @300 | 0/20 | rect | Photo | · |
| `card-service-design` | ★ Design Services | 149–229 | Turnaround (2) | 2 | flat | 1050×600 @300 | 18/24 | rect | Photo | · |
| `card-service-logo-maker` | Logo Maker | 99–159 | Package (2) | 2 | flat | 1500×1500 @300 | 0/40 | rect | — | · |

### Stationery, Letterheads & Notebooks (68)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `announcement-engagement` | Engagement Announcement Cards | 549–1,409 | Quantity (4); Envelopes (2) | 8 | flat | 1500×2100 @300 | 36/36 | rect | Photo | · |
| `announcement-grand-opening` | Grand Opening Announcement Cards | 449–1,229 | Quantity (4) | 4 | flat | 1500×2100 @300 | 36/36 | rect | Photo | · |
| `announcement-new-baby` | Baby Birth Announcement Cards | 369–1,229 | Quantity (4); Envelopes (2) | 8 | flat | 1200×1800 @300 | 36/36 | rect | Photo | · |
| `announcement-save-the-date` | Save the Date Cards | 349–1,209 | Quantity (4); Envelopes (2) | 8 | flat | 1200×1800 @300 | 36/36 | rect | Photo | · |
| `invitation-baby-shower` | Baby Shower Invitations | 379–1,239 | Quantity (4); Envelopes (2) | 8 | flat | 1200×1800 @300 | 36/36 | rect | Photo | · |
| `invitation-birthday-fun` | ★ Birthday Party Invitations | 399–1,259 | Quantity (4); Envelopes (2) | 8 | flat | 1500×1500 @300 | 36/36 | rect | Photo | · |
| `invitation-corporate-event` | Corporate Event Invitation Cards | 499–1,359 | Quantity (4); Envelopes (2) | 8 | flat | 1500×2100 @300 | 36/36 | rect | Photo | · |
| `invitation-festival-greeting` | ★ Festival Greeting Cards | 429–1,289 | Quantity (4); Envelopes (2) | 8 | flat | 1500×2100 @300 | 36/36 | rect | Photo | · |
| `invitation-housewarming` | Housewarming Invitation Cards | 379–1,239 | Quantity (4); Envelopes (2) | 8 | flat | 1500×1500 @300 | 36/36 | rect | Photo | · |
| `invitation-wedding-classic` | ★ Wedding Invitation Cards | 599–1,679 | Quantity (4); Envelopes (2); Finish (3) | 24 | flat | 1500×2100 @300 | 36/36 | rect | Unsplash | · |
| `invite-birthday-invitations` | ★ Birthday Invitations | 399–1,259 | Quantity (4); Envelopes (2) | 8 | flat | 1500×1500 @300 | 36/36 | rect | Photo | · |
| `invite-gift-tags` | Gift Tags | 149–469 | Quantity (4) | 4 | flat | 600×900 @300 | 36/36 | rect | Photo | · |
| `invite-moving-announcements` | Moving Announcements | 349–1,209 | Quantity (4); Envelopes (2) | 8 | flat | 1200×1800 @300 | 36/36 | rect | Photo | · |
| `invite-party-invitations` | Party Invitations | 369–1,229 | Quantity (4); Envelopes (2) | 8 | flat | 1500×2100 @300 | 36/36 | rect | Photo | · |
| `invite-save-the-date` | Save The Date Cards | 349–1,209 | Quantity (4); Envelopes (2) | 8 | flat | 1200×1800 @300 | 36/36 | rect | Photo | · |
| `invite-thank-you-cards` | Thank You Cards | 329–1,189 | Quantity (4); Envelopes (2) | 8 | flat | 1500×1500 @300 | 36/36 | rect | Photo | · |
| `invite-wedding-invitations` | ★ Wedding Invitations | 599–1,679 | Quantity (4); Envelopes (2); Finish (3) | 24 | flat | 1500×2100 @300 | 36/36 | rect | Photo | · |
| `invite-wedding-menu` | ★ Wedding Menu | 549–1,329 | Quantity (4) | 4 | flat | 1500×2100 @300 | 36/36 | rect | Photo | · |
| `invite-wedding-programmes` | Wedding Programmes | 449–1,229 | Quantity (4) | 4 | flat | 1500×2100 @300 | 36/36 | rect | Photo | · |
| `stationery-awards-certificate` | Awards | 329–819 | Quantity (3); Finish (3) | 9 | flat | 3508×2480 @300 | 24/48 | rect | Photo | · |
| `stationery-awards-star-performer` | Star Performer Awards | 399–919 | Quantity (3); Material (3) | 9 | flat | 1600×1200 @300 | 24/48 | rect | Photo | · |
| `stationery-bill-books-standard` | Bill Books | 299–829 | Quantity (3); Pages per Book (2) | 6 | flat | 1240×1748 @300 | 24/48 | rect | Photo | · |
| `stationery-booklets-perfect-binding` | Perfect Binding Booklets | 449–849 | Quantity (3); Page Count (3) | 9 | flat | 2530×3508 @300 | 24/48 | rect | Photo | · |
| `stationery-bookmark` | Custom Bookmarks | 199–419 | Quantity (3) | 3 | flat | 600×1800 @300 | 24/48 | rect | Photo | · |
| `stationery-card-holder-sleeve` | Business Card Holders (Printed Sleeve) | 229–529 | Quantity (3) | 3 | flat | 720×1200 @300 | 24/48 | rect | Photo | · |
| `stationery-cash-vouchers` | Cash Vouchers | 249–779 | Quantity (3); Pages per Book (2) | 6 | flat | 1240×1748 @300 | 24/48 | rect | Photo | · |
| `stationery-certificates-custom` | ★ Custom Certificates | 279–769 | Quantity (3); Finish (3) | 9 | flat | 3508×2480 @300 | 24/48 | rect | Photo | · |
| `stationery-coasters-custom` | Coasters | 179–419 | Quantity (3); Material (3) | 9 | flat | 500×500 @300 | 0/20 | circle | Photo | · |
| `stationery-compliment-slips` | Compliment Slips | 279–569 | Quantity (3) | 3 | flat | 2480×1169 @300 | 24/48 | rect | Photo | · |
| `stationery-custom-pens-basic` | Custom Pens | 179–379 | Quantity (3); Colour (3) | 9 | flat | 1000×300 @300 | 0/20 | rect | Photo | · |
| `stationery-desk-calendar` | Desk Calendars | 599–1,379 | Quantity (3) | 3 | flat | 1748×1240 @300 | 24/48 | rect | Unsplash | · |
| `stationery-diary-a5-personalised` | ★ Personalised A5 Diary | 329–979 | Quantity (3); Cover Material (2) | 6 | flat | 850×1200 @300 | 0/20 | rect | Photo | · |
| `stationery-diary-magnetic-lock` | Personalised Diary with Magnetic Lock | 399–1,049 | Quantity (3); Cover Material (2) | 6 | flat | 850×1200 @300 | 0/20 | rect | Photo | · |
| `stationery-diary-pen-holder` | Diary with Pen Holder | 349–999 | Quantity (3); Cover Material (2) | 6 | flat | 900×1200 @300 | 0/20 | rect | Photo | · |
| `stationery-employee-welcome-kit` | ★ Employee Welcome Kit | 499–1,299 | Quantity (3); Kit Size (2) | 6 | flat | 1200×800 @300 | 0/20 | rect | Photo | · |
| `stationery-envelope-dl` | Custom Envelopes | 349–659 | Quantity (3); Window (2) | 6 | flat | 2598×1299 @300 | 24/48 | rect | Photo | · |
| `stationery-envelope-seals` | Envelope Seals | 159–379 | Quantity (3); Shape (2) | 6 | flat | 400×400 @300 | 24/48 | circle | Photo | · |
| `stationery-envelopes-standard` | Envelopes | 249–519 | Quantity (3); Window (2) | 6 | flat | 2598×1299 @300 | 24/48 | rect | Photo | · |
| `stationery-gift-wrapping-paper` | Gift Wrapping Paper | 179–389 | Quantity (3); Pattern (2) | 6 | flat | 3508×4961 @300 | 24/48 | rect | Photo | · |
| `stationery-id-cards-pvc` | ID Cards | 199–419 | Quantity (3); Material (2) | 6 | flat | 1011×638 @300 | 0/20 | rounded | Photo | · |
| `stationery-invoice-books-standard` | Invoice Books | 299–829 | Quantity (3); Pages per Book (2) | 6 | flat | 1240×1748 @300 | 24/48 | rect | Photo | · |
| `stationery-keychain-acrylic` | ★ Acrylic Keychains | 159–399 | Quantity (3); Material (2) | 6 | flat | 450×450 @300 | 0/20 | rounded | Photo | · |
| `stationery-keychain-light` | Keychain with Light | 199–439 | Quantity (3); Material (2) | 6 | flat | 450×450 @300 | 0/20 | rounded | Photo | · |
| `stationery-keychain-oval-metal` | Oval Metal Keychains | 189–429 | Quantity (3); Material (2) | 6 | flat | 500×350 @300 | 0/20 | rounded | Photo | · |
| `stationery-lanyards-standard` | Lanyards | 169–369 | Quantity (3); Colour (3) | 9 | flat | 1200×300 @300 | 0/20 | rect | Photo | · |
| `stationery-laptop-skins` | Laptop Skins | 349–649 | Quantity (3); Finish (2) | 6 | flat | 1200×900 @300 | 0/20 | rect | Photo | · |
| `stationery-letterhead` | ★ Letterhead Sheets | 399–739 | Quantity (3); Paper Weight (2) | 6 | flat | 2480×3508 @300 | 24/48 | rect | Photo | · |
| `stationery-letterhead-pads-custom` | Custom Letterhead Pads | 329–709 | Quantity (3); Paper Weight (2) | 6 | flat | 2480×3508 @300 | 24/48 | rect | Photo | · |
| `stationery-letterheads-bulk` | Bulk Letterheads | 299–639 | Quantity (3); Paper Weight (2) | 6 | flat | 2480×3508 @300 | 24/48 | rect | Photo | · |
| `stationery-letterheads-standard` | ★ Letterheads | 349–689 | Quantity (3); Paper Weight (2) | 6 | flat | 2480×3508 @300 | 24/48 | rect | Photo | · |
| `stationery-mats-custom` | Mats | 279–499 | Quantity (3); Material (2) | 6 | flat | 1200×800 @300 | 0/20 | rect | Photo | · |
| `stationery-mementos-customised` | Customised Mementos | 449–969 | Quantity (3); Material (3) | 9 | flat | 1600×1200 @300 | 24/48 | rect | Photo | · |
| `stationery-mouse-pad-custom` | ★ Custom Mouse Pads | 249–549 | Quantity (3); Surface (2) | 6 | flat | 900×750 @300 | 0/20 | rounded | Photo | · |
| `stationery-note-cards-standard` | Note Cards | 179–489 | Quantity (3); Finish (3) | 9 | flat | 1050×650 @300 | 24/48 | rect | Photo | · |
| `stationery-notebook-a4` | Notebook A4 Size | 279–929 | Quantity (3); Cover Material (2) | 6 | flat | 900×1200 @300 | 0/20 | rect | Photo | · |
| `stationery-notebook-hardcover` | ★ Custom Notebooks | 449–1,049 | Quantity (3); Page Style (3) | 9 | flat | 3461×2551 @300 | 35/47 | rect | Photo | · |
| `stationery-notebooks-personalised` | Personalised Notebooks | 299–949 | Quantity (3); Cover Material (2) | 6 | flat | 900×1200 @300 | 0/20 | rect | Photo | · |
| `stationery-notepad-a5` | Notepads | 299–809 | Quantity (3); Sheet Count (2) | 6 | flat | 1748×1240 @300 | 24/48 | rect | Unsplash | · |
| `stationery-paper-id-cards` | Paper Identity Cards | 169–479 | Quantity (3); Finish (3) | 9 | flat | 1050×650 @300 | 24/48 | rect | Photo | · |
| `stationery-pen-drive-custom` | Custom Pen Drive | 399–789 | Quantity (3); Storage Size (3) | 9 | flat | 500×300 @300 | 0/20 | rounded | Photo | · |
| `stationery-plaques-recognition` | ★ Recognition Plaques | 499–1,019 | Quantity (3); Material (3) | 9 | flat | 1800×1300 @300 | 24/48 | rect | Photo | · |
| `stationery-presentation-file-pocket` | Presentation File with Pocket | 349–1,079 | Quantity (3); Pockets (2) | 6 | flat | 3000×2200 @300 | 24/48 | rect | Photo | · |
| `stationery-presentation-folder` | ★ Presentation Folders | 699–1,429 | Quantity (3); Pockets (2) | 6 | flat | 3000×2200 @300 | 24/48 | rect | Photo | · |
| `stationery-presentation-folders` | ★ Presentation Folders | 449–1,179 | Quantity (3); Pockets (2) | 6 | flat | 3000×2200 @300 | 24/48 | rect | Photo | · |
| `stationery-ring-binder-file` | Ring Binder File | 399–1,129 | Quantity (3); Pockets (2) | 6 | flat | 3200×2400 @300 | 24/48 | rect | Photo | · |
| `stationery-sticky-notes` | Sticky Notes | 249–579 | Quantity (3) | 3 | flat | 900×900 @300 | 24/48 | rect | Photo | · |
| `stationery-usb-flash-drive` | USB Flash Drive | 399–789 | Quantity (3); Storage Size (3) | 9 | flat | 500×300 @300 | 0/20 | rounded | Photo | · |
| `stationery-wrist-bands-paper` | Custom Paper Wrist Bands | 149–349 | Quantity (3); Colour (3) | 9 | flat | 1200×300 @300 | 0/20 | rect | Photo | · |

### Stamps and Ink (17)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `stamp-date` | Date Stamps | 299–329 | Ink Colour (2); Preset Text (3) | 6 | flat | 600×200 @300 | 0/15 | rect | Photo | · |
| `stamp-date-time` | Date & Time Stamp | 549–579 | Ink Colour (2); Preset Text (3) | 6 | flat | 600×200 @300 | 0/15 | rect | Photo | · |
| `stamp-embosser-seal` | Custom Embosser Seal | 899–999 | Diameter (2) | 2 | flat | 500×500 @300 | 0/15 | circle | Photo | · |
| `stamp-fabric` | Fabric Stamps | 449–499 | Ink Colour (3); Size (2) | 6 | flat | 600×200 @300 | 0/15 | rect | Photo | · |
| `stamp-flashy-pre-inking` | Flashy Pre-Inking Stamps | 349–389 | Ink Colour (4); Size (2) | 8 | flat | 450×450 @300 | 0/15 | rect | Photo | · |
| `stamp-logo-branding` | Logo Stamp | 449–499 | Ink Colour (3) | 3 | flat | 500×500 @300 | 0/15 | circle | — | · |
| `stamp-notary-official` | Notary Stamp | 649 | Ink Colour (2) | 2 | flat | 500×500 @300 | 0/15 | circle | Photo | · |
| `stamp-packaging` | Packaging Stamps | 499–569 | Ink Colour (3); Size (2) | 6 | flat | 800×300 @300 | 0/15 | rect | Photo | · |
| `stamp-pocket-mini` | Pocket Stamp | 299 | Ink Colour (2) | 2 | flat | 300×300 @300 | 0/15 | rect | Photo | · |
| `stamp-pre-inking` | ★ Pre-Inking Stamps | 399–479 | Ink Colour (3); Impression Size (2) | 6 | flat | 600×200 @300 | 0/15 | rect | Photo | · |
| `stamp-professional` | ★ Professional Stamps | 699–759 | Ink Colour (2); Diameter (2) | 4 | flat | 500×500 @300 | 0/15 | circle | Photo | · |
| `stamp-round-company-seal` | ★ Round Company Seal Stamp | 599–659 | Ink Colour (2); Diameter (2) | 4 | flat | 500×500 @300 | 0/15 | circle | Photo | · |
| `stamp-self-inking-address` | ★ Self-Inking Address Stamp | 449–529 | Ink Colour (3); Impression Size (2) | 6 | flat | 600×200 @300 | 0/15 | rect | Photo | · |
| `stamp-self-inking-pad` | Self-inking Stamp Pads | 199–219 | Ink Colour (4) | 4 | flat | 300×300 @300 | 0/15 | rect | Photo | · |
| `stamp-self-inking-signature` | Self-Inking Signature Stamp | 499 | Ink Colour (2) | 2 | flat | 600×200 @300 | 0/15 | rect | Photo | · |
| `stamp-teacher-grading-set` | Teacher's Grading Stamp Set | 349–599 | Set Size (2) | 2 | flat | 600×300 @300 | 0/20 | rect | Photo | · |
| `stamp-wood-handle-traditional` | Traditional Wood Handle Stamp | 249–339 | Size (3) | 3 | flat | 450×450 @300 | 0/15 | rect | Unsplash | · |

### Signs, Posters & Marketing Materials (69)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `banner-backlit-fabric` | Backlit Fabric Banner | 2,999–4,799 | Size (2) | 2 | flat | 2736×3600 @150 | 20/40 | rect | Mockup | ✗ |
| `banner-feather-flag` | Feather Flag | 1,499–2,049 | Height (3) | 3 | flat | 2220×6000 @100 | 20/40 | rect | Photo | ✗ |
| `banner-mesh-windproof` | Mesh Banner | 999–3,199 | Size (3) | 3 | flat | 3600×2400 @100 | 20/40 | rect | Photo | ✗ |
| `banner-table-throw` | Table Throw Banner | 1,799–2,749 | Table Size (2); Coverage (2) | 4 | flat | 5545×3803 @150 | 20/40 | rect | Photo | ✗ |
| `banner-vinyl-standard` | ★ Vinyl Banner | 899–2,379 | Size (4); Finishing (2) | 8 | flat | 3600×2400 @100 | 20/40 | rect | Photo | ✗ |
| `brochure-bifold-a4` | ★ Bi-Fold Brochures | 549–1,159 | Quantity (4); Paper Weight (2) | 8 | flat | 3508×2480 @300 | 36/36 | rect | Photo | ✗ |
| `brochure-trifold-a4` | Tri-Fold Brochures | 599–1,219 | Quantity (4); Paper Weight (2) | 8 | flat | 3508×2480 @300 | 36/36 | rect | Photo | ✗ |
| `brochure-zfold-a4` | Z-Fold Brochures | 599–1,119 | Quantity (4) | 4 | flat | 3508×2480 @300 | 36/36 | rect | Photo | ✗ |
| `flyer-a4-standard` | ★ A4 Flyers | 449–1,049 | Quantity (4); Sides (2) | 8 | flat | 2480×3508 @300 | 36/36 | rect | Photo | ✗ |
| `flyer-a5-heavyweight` | Heavyweight Flyers | 499–1,019 | Quantity (4) | 4 | flat | 1240×1748 @300 | 36/36 | rect | Photo | ✗ |
| `flyer-a5-matte` | Matte Finish Flyers | 369–949 | Quantity (4); Sides (2) | 8 | flat | 1240×1748 @300 | 36/36 | rect | Photo | ✗ |
| `flyer-a5-recycled` | Recycled Paper Flyers | 379–899 | Quantity (4) | 4 | flat | 1240×1748 @300 | 36/36 | rect | Photo | ✗ |
| `flyer-a5-standard` | ★ A5 Flyers | 349–929 | Quantity (4); Sides (2) | 8 | flat | 1240×1748 @300 | 36/36 | rect | Photo | ✗ |
| `flyer-a6-mini` | A6 Mini Flyers | 249–769 | Quantity (4) | 4 | flat | 874×1240 @300 | 36/36 | rect | Photo | ✗ |
| `flyer-booklet` | Booklets | 699–1,499 | Quantity (4); Page Count (3) | 12 | flat | 2655×3508 @300 | 36/36 | rect | Mockup | ✓ |
| `flyer-bookmark` | Custom Bookmarks | 199–749 | Quantity (4); Material (2) | 8 | flat | 279×900 @300 | 20/20 | rect | Mockup | ✓ |
| `flyer-brochure` | Brochures | 549–1,119 | Quantity (4); Fold Type (2) | 8 | flat | 3508×2480 @300 | 36/36 | rect | Mockup | ✓ |
| `flyer-bulk` | Bulk Flyers | 249–859 | Quantity (4); Size (3) | 12 | flat | 1240×1748 @300 | 36/36 | rect | Mockup | ✓ |
| `flyer-button-badge` | Button Badges | 229–799 | Quantity (4); Size (3) | 12 | flat | 700×700 @300 | 36/36 | circle | Mockup | ✓ |
| `flyer-canopy-tent` | ★ Promotional Canopy Tents | 1,499–2,969 | Quantity (4); Size (3) | 12 | flat | 9000×3358 @150 | 30/50 | rect | Mockup | ✓ |
| `flyer-car-door-decal` | Custom Car Door Decals | 349–949 | Quantity (4); Material (2) | 8 | flat | 900×474 @300 | 20/20 | rect | Mockup | ✓ |
| `flyer-custom-keychain` | ★ Custom Keychains | 269–879 | Quantity (4); Material (2) | 8 | flat | 600×600 @300 | 20/20 | rounded | Mockup | ✓ |
| `flyer-dl-slim` | DL Flyers | 299–819 | Quantity (4) | 4 | flat | 1168×2480 @300 | 36/36 | rect | Photo | ✗ |
| `flyer-gift-certificate` | Custom Gift Certificates | 319–899 | Quantity (4); Paper Stock (2) | 8 | flat | 1748×925 @300 | 36/36 | rect | Mockup | ✓ |
| `flyer-logo-flag` | Custom Logo Flags | 999–1,899 | Quantity (4); Size (3) | 12 | flat | 2322×5400 @150 | 30/50 | rect | — | ✓ |
| `flyer-loyalty-card` | ★ Loyalty Cards | 279–839 | Quantity (4); Material (2) | 8 | flat | 1050×650 @300 | 36/36 | rect | Mockup | ✓ |
| `flyer-menu-card` | Menu Cards | 329–899 | Quantity (4); Material (2) | 8 | flat | 1753×2480 @300 | 36/36 | rect | Mockup | ✓ |
| `flyer-paper-bag` | Paper Bags | 399–999 | Quantity (4); Size (3) | 12 | flat | 1536×1600 @150 | 25/40 | rect | Mockup | ✓ |
| `flyer-place-mat` | Place Mats | 339–889 | Quantity (4); Material (2) | 8 | flat | 1700×1200 @150 | 25/40 | rect | Mockup | ✓ |
| `flyer-pop-up-banner` | Foldable Pop Up Banners | 1,299–2,219 | Quantity (4); Size (2) | 8 | flat | 5400×4909 @150 | 30/50 | rect | Mockup | ✓ |
| `flyer-portable-backdrop` | Customized Portable Backdrops | 1,399–2,519 | Quantity (4); Size (3) | 12 | flat | 3360×4000 @150 | 30/50 | rect | Mockup | ✓ |
| `flyer-postcard` | Postcards | 219–769 | Quantity (4); Card Stock (2) | 8 | flat | 1800×1593 @300 | 36/36 | rect | Mockup | ✓ |
| `flyer-promo-table` | Customised Promo Tables | 449–1,079 | Quantity (4); Table Size (3) | 12 | flat | 711×900 @300 | 20/20 | rect | Mockup | ✓ |
| `flyer-standard` | ★ Flyers | 299–839 | Quantity (4); Paper Finish (2) | 8 | flat | 1240×1748 @300 | 36/36 | rect | Mockup | ✓ |
| `flyer-stretch-table-cover` | Stretch Table Covers | 899–1,599 | Quantity (4); Table Size (2) | 8 | flat | 2925×2175 @150 | 25/40 | rect | Mockup | ✓ |
| `flyer-table-mat` | Table Mats | 369–939 | Quantity (4); Material (2) | 8 | flat | 1067×1600 @150 | 25/40 | rect | Mockup | ✓ |
| `flyer-table-runner` | Table Runners | 429–1,039 | Quantity (4); Size (2) | 8 | flat | 1834×2834 @150 | 25/40 | rect | Mockup | ✓ |
| `flyer-tablecloth` | ★ Custom Tablecloths | 799–1,469 | Quantity (4); Size (2) | 8 | flat | 3660×2730 @150 | 25/40 | rect | Mockup | ✓ |
| `sign-acrylic-holder` | Acrylic Sign Holder | 499–1,299 | Size (3); Quantity (4) | 12 | flat | 1500×2100 @300 | 36/36 | rect | Mockup | ✓ |
| `sign-acrylic-premium` | Acrylic Sign | 2,499–4,899 | Size (2); Mounting (2) | 4 | flat | 2088×2400 @200 | 20/40 | rect | Photo | ✗ |
| `sign-acrylic-sign` | ★ Acrylic Signs | 1,799–3,299 | Size (3); Mounting (2) | 6 | flat | 2400×1951 @200 | 20/40 | rect | Mockup | ✓ |
| `sign-banner-fabric` | Fabric Banners | 1,499–2,979 | Size (4); Finishing (2) | 8 | flat | 3600×2880 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-banner-mesh` | Mesh Banners | 1,099–2,499 | Size (4) | 4 | flat | 3600×2400 @100 | 20/40 | rect | Mockup | ✓ |
| `sign-banner-vinyl` | ★ Banners | 899–2,379 | Size (4); Finishing (2) | 8 | flat | 3600×1800 @100 | 20/40 | rect | Photo | ✗ |
| `sign-banner-x-stand` | ★ X-Banners | 999–1,899 | Size (2); Quantity (4) | 8 | flat | 2408×5600 @100 | 20/40 | rect | Mockup | ✓ |
| `sign-board-sign` | Board Signs | 749–1,799 | Size (3); Material (3) | 9 | flat | 1800×1475 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-canvas-sign` | Canvas Signs | 1,299–2,049 | Size (3); Sides Printed (2) | 6 | flat | 2874×2296 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-corrugated-yard` | Corrugated Plastic Yard Sign | 499–849 | Size (2); Sides Printed (2) | 4 | flat | 1800×1350 @150 | 20/40 | rect | Photo | ✗ |
| `sign-foam-board` | Foam Boards | 599–1,349 | Size (3); Sides Printed (2) | 6 | flat | 1764×1800 @150 | 20/40 | rect | Photo | ✗ |
| `sign-led-clip-on-display` | LED Clip-On Displays | 1,799–2,199 | Size (3); Clip Type (2) | 6 | flat | 1500×1000 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-led-display-stand` | LED Display Stands | 2,299–3,549 | Stand Width (3); Lighting (2) | 6 | flat | 2600×6800 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-led-lollipop-display` | LED Lollipop Display | 1,599–2,499 | Head Size (2); Quantity (4) | 8 | flat | 2400×2400 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-led-translite-board` | ★ LED Translite Sign Boards | 2,499–4,799 | Size (4); Mounting (2) | 8 | flat | 3600×3600 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-magnetic-sign` | Magnetic Signs | 699–1,449 | Size (3); Sides Printed (2) | 6 | flat | 1800×1565 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-outdoor-sign` | Outdoor Signs | 899–1,949 | Size (3); Material (3) | 9 | flat | 1200×1800 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-paper-bag-full-print` | Full-Print Paper Bags | 799–1,849 | Quantity (4); Bag Size (3) | 12 | flat | 1984×1600 @200 | 20/40 | rect | Mockup | ✓ |
| `sign-plastic-signboard` | Plastic Signboards | 799–1,849 | Size (3); Material (3) | 9 | flat | 1764×1800 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-poster-bulk` | Bulk Posters | 449–1,619 | Size (3); Quantity (4) | 12 | flat | 3600×5400 @300 | 36/36 | rect | Photo | ✗ |
| `sign-poster-standard` | Posters | 499–1,369 | Size (3); Quantity (4) | 12 | flat | 3600×5400 @300 | 36/36 | rect | Photo | ✗ |
| `sign-qr-code-stand` | Customised QR Code Stand | 549–1,149 | Size (2); Quantity (4) | 8 | flat | 1200×1800 @300 | 36/36 | rect | Mockup | ✓ |
| `sign-sail-flag` | Sail Flags | 1,599–2,699 | Height (3); Quantity (4) | 12 | flat | 2760×6000 @100 | 20/40 | rect | Mockup | ✓ |
| `sign-standee-fabric-elegant` | ★ Elegant Fabric Standees | 1,899–2,899 | Stand Width (3); Carry Case (2) | 6 | flat | 3672×6800 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-standee-rollup` | ★ Standees | 1,299–2,299 | Stand Width (3); Carry Case (2) | 6 | flat | 3740×6800 @100 | 20/40 | rect | Photo | ✗ |
| `sign-standee-tabletop` | Tabletop Standees | 899–1,699 | Size (3); Quantity (4) | 12 | flat | 1740×3000 @300 | 36/36 | rect | Mockup | ✓ |
| `sign-tabletop-sign` | Tabletop Signs | 599–1,399 | Size (3); Quantity (4) | 12 | flat | 1500×2100 @300 | 36/36 | rect | Mockup | ✓ |
| `sign-tension-fabric-display` | Tension Fabric Displays | 2,199–4,199 | Size (4); Frame Shape (2) | 8 | flat | 3486×4200 @150 | 20/40 | rect | Mockup | ✓ |
| `sign-tent-card` | Tent Cards | 399–999 | Size (2); Quantity (4) | 8 | flat | 1800×1800 @300 | 36/36 | rect | Mockup | ✓ |
| `standee-rollup-retractable` | ★ Retractable Roll-Up Standee | 1,899–2,899 | Stand Width (3); Carry Case (2) | 6 | flat | 3944×6800 @100 | 20/40 | rect | Photo | ✗ |
| `standee-x-stand` | X-Stand Banner | 999–1,349 | Size (2) | 2 | flat | 2632×5600 @100 | 20/40 | rect | Photo | ✗ |

### Labels, Stickers & Packaging (60)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `label-jar-bottle` | Jar & Bottle Labels | 279–929 | Quantity (4) | 4 | flat | 880×900 @300 | 12/18 | rect | Unsplash | ✗ |
| `label-roll-product` | ★ Roll Labels | 299–969 | Quantity (4); Shape (3) | 12 | flat | 600×600 @300 | 12/18 | rect | Unsplash | ✗ |
| `label-shipping` | Shipping Labels | 349–999 | Quantity (4) | 4 | flat | 1800×1636 @300 | 12/18 | rect | Unsplash | ✗ |
| `packaging-branded-tape` | Packing Tape | 199–579 | Quantity (3) | 3 | flat | 1500×798 @300 | 24/36 | rect | Unsplash | ✗ |
| `packaging-hang-tag` | Branded Hang Tag | 279–899 | Quantity (4); String Included (2) | 8 | flat | 477×900 @300 | 24/36 | rect | Unsplash | ✗ |
| `packaging-kraft-shipping-box` | Kraft Shipping Box | 599–1,449 | Quantity (4) | 4 | flat | 3007×2285 @300 | 24/36 | rect | Unsplash | ✗ |
| `packaging-label-foil-stamped` | Foil Stamped Label | 449–1,029 | Quantity (4); Foil Colour (2) | 8 | flat | 606×900 @300 | 24/36 | rect | Unsplash | ✗ |
| `packaging-label-roll` | ★ Product Label Roll | 329–929 | Quantity (4); Shape (2) | 8 | flat | 900×748 @300 | 24/36 | rect | Unsplash | ✗ |
| `packaging-label-tamper-seal` | Tamper-Evident Seal Label | 379–959 | Quantity (4) | 4 | flat | 600×600 @300 | 24/36 | rect | Unsplash | ✗ |
| `packaging-mailer-box` | ★ Custom Mailer Box | 899–2,069 | Quantity (4); Size (3) | 12 | flat | 3075×2025 @300 | 24/36 | rect | Unsplash | ✗ |
| `packaging-poly-mailer` | Poly Mailer Bag | 249–1,179 | Quantity (4); Size (2) | 8 | flat | 1600×2000 @300 | 24/36 | rect | Unsplash | ✗ |
| `packaging-rigid-gift-box` | Rigid Gift Box | 1,099–2,149 | Quantity (4); Lid Style (2) | 8 | flat | 3115×2007 @300 | 24/36 | rect | Unsplash | ✗ |
| `packaging-tissue-paper` | Custom Tissue Paper | 299–879 | Quantity (4) | 4 | flat | 2000×2000 @300 | 24/36 | rect | Unsplash | ✗ |
| `pkg-bag-carry-printed` | Printed Carry Bags | 429–1,369 | Quantity (4); Size (2) | 8 | flat | 1216×1600 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-bag-courier` | Courier Bags | 449–1,369 | Quantity (4); Size (2) | 8 | flat | 1232×1600 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-bag-gift-premium` | Premium Gift Bags | 1,199–2,079 | Quantity (4); Finish (2) | 8 | flat | 1952×1600 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-bag-handle-die-cut` | Die Cut Handle Bags | 389–1,299 | Quantity (4); Board Weight (2) | 8 | flat | 1568×1600 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-bag-paper-custom` | ★ Custom Paper Bags | 349–1,249 | Quantity (4); Paper Stock (2) | 8 | flat | 1952×1600 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-bag-shopping-metallic` | Metallic Shopping Bags | 689–1,539 | Quantity (4); Foil Colour (2) | 8 | flat | 1888×1600 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-auto-lock-bottom` | Auto Lock Bottom Boxes | 529–1,469 | Quantity (4); Size (2) | 8 | flat | 2554×2480 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-burger` | Burger Boxes | 299–1,189 | Quantity (4); Size (2) | 8 | flat | 2564×2455 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-chocolate-bar` | Chocolate Bar Boxes | 269–1,149 | Quantity (4); Board Weight (2) | 8 | flat | 1346×668 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-corrugated` | ★ Corrugated Boxes | 899–2,029 | Quantity (4); Size (2) | 8 | flat | 2949×2535 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-lock-bottom` | Lock Bottom Boxes | 499–1,439 | Quantity (4); Size (2) | 8 | flat | 1965×1500 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-mailer-flat` | ★ Flat Mailer Boxes | 949–1,979 | Quantity (4); Size (2) | 8 | flat | 3264×1851 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-popcorn` | Popcorn Boxes | 289–1,179 | Quantity (4); Size (2) | 8 | flat | 1352×1300 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-promotional-product` | Promotional Product Boxes | 629–1,629 | Quantity (4); Size (2) | 8 | flat | 2543×1513 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-pull-out` | Pull Out Boxes | 569–1,539 | Quantity (4); Size (2) | 8 | flat | 2414×1521 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-soap` | Soap Boxes | 249–1,129 | Quantity (4); Board Weight (2) | 8 | flat | 1658×1208 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-box-tuck-top` | Tuck Top Boxes | 469–1,369 | Quantity (4); Board Weight (2) | 8 | flat | 1710×2100 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-ribbon-customised` | ★ Customised Ribbons | 169–1,049 | Quantity (4); Width (2) | 8 | flat | 1800×1286 @300 | 24/36 | rect | Mockup | ✓ |
| `pkg-tape-self-adhesive` | ★ Self Adhesive Tapes | 149–1,059 | Quantity (4); Width (2) | 8 | flat | 1800×1029 @300 | 24/36 | rect | Mockup | ✓ |
| `sticker-bumper` | Bumper Stickers | 239–694 | Quantity (4); Size (3); Finish (3) | 36 | flat | 2400×1116 @300 | 12/18 | rect | Unsplash | ✗ |
| `sticker-car` | Custom Car Stickers | 269–724 | Quantity (4); Size (3); Finish (3) | 36 | flat | 2400×1009 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-circle-glossy` | Circle Stickers | 179–509 | Quantity (4) | 4 | flat | 900×900 @300 | 12/18 | circle | Unsplash | ✗ |
| `sticker-clear-vinyl` | Clear Vinyl Stickers | 249–704 | Quantity (4); Size (3); Finish (3) | 36 | flat | 900×900 @300 | 12/18 | rect | Unsplash | ✗ |
| `sticker-die-cut-shape` | ★ Custom Shape Stickers | 219–674 | Quantity (4); Size (3); Finish (3) | 36 | flat | 900×484 @300 | 12/18 | circle | Mockup | ✓ |
| `sticker-die-cut-vinyl` | ★ Die-Cut Vinyl Stickers | 199–619 | Quantity (4); Size (3) | 12 | flat | 900×618 @300 | 12/18 | rect | Unsplash | ✗ |
| `sticker-dome` | ★ Dome Stickers | 329–749 | Quantity (4); Size (3) | 12 | flat | 900×900 @300 | 12/18 | circle | Mockup | ✓ |
| `sticker-hang-tag` | Hang Tags | 189–554 | Quantity (4); Material (3) | 12 | flat | 540×900 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-hang-tag-folded` | Folded Hang Tags | 209–574 | Quantity (4); Material (3) | 12 | flat | 780×1200 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-hang-tag-raised-foil` | ★ Raised Foil Hang Tags | 399–799 | Quantity (4); Material (3); Finish (3) | 36 | flat | 567×900 @300 | 12/18 | rounded | Mockup | ✓ |
| `sticker-holographic` | ★ Holographic Stickers | 299–754 | Quantity (4); Size (3); Finish (3) | 36 | flat | 900×900 @300 | 12/18 | rect | Unsplash | ✗ |
| `sticker-kraft` | Kraft Stickers | 169–589 | Quantity (4); Size (3) | 12 | flat | 900×900 @300 | 12/18 | circle | Mockup | ✓ |
| `sticker-kraft-paper` | Kraft Paper Stickers | 179–599 | Quantity (4); Size (3) | 12 | flat | 900×900 @300 | 12/18 | circle | Unsplash | ✗ |
| `sticker-label-industrial` | Industrial Labels | 349–1,074 | Quantity (4); Material (3); Finish (3) | 36 | flat | 1773×1800 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-label-iron-on` | Custom Iron-on Labels | 229–924 | Quantity (4); Material (3) | 12 | flat | 861×900 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-label-product-packaging` | ★ Product and Packaging Labels | 239–934 | Quantity (4); Material (3) | 12 | flat | 1097×1200 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-label-return-address` | Return Address Labels | 159–839 | Quantity (4); Finish (3) | 12 | flat | 600×389 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-label-shipping-mailing` | ★ Shipping and Mailing Labels | 299–979 | Quantity (4); Finish (3) | 12 | flat | 1800×1306 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-label-transparent` | Transparent Labels | 249–929 | Quantity (4); Finish (3) | 12 | flat | 1200×1200 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-qr-code` | QR Code Stickers | 169–534 | Quantity (4); Material (3) | 12 | flat | 600×600 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-sheet` | Sheet Stickers | 179–599 | Quantity (4); Size (3) | 12 | flat | 1080×1500 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-single` | Sticker Singles | 149–514 | Quantity (4); Material (3) | 12 | flat | 900×900 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-square-matte` | Square Stickers | 179–509 | Quantity (4) | 4 | flat | 900×900 @300 | 12/18 | rect | Unsplash | ✗ |
| `sticker-tag-baggage` | Baggage Tags | 219–584 | Quantity (4); Material (3) | 12 | flat | 540×900 @300 | 12/18 | rounded | Mockup | ✓ |
| `sticker-tag-name` | Name Tags | 179–544 | Quantity (4); Material (3) | 12 | flat | 900×545 @300 | 12/18 | rounded | Mockup | ✓ |
| `sticker-uv-ink-transfer` | UV Ink Transfer Stickers | 289–654 | Quantity (4); Finish (3) | 12 | flat | 636×900 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-visiting-card` | Visiting Card Stickers | 199–884 | Quantity (4); Finish (3) | 12 | flat | 1050×600 @300 | 12/18 | rect | Mockup | ✓ |
| `sticker-window` | Window Stickers | 249–669 | Quantity (4); Size (3) | 12 | flat | 1800×1800 @300 | 12/18 | rect | Mockup | ✓ |

### Clothing, Caps & Bags (65)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `apparel-cap-chef` | Chef Caps | 379 | Size (1); Colour (2) | 2 | apparel | 1500×1461 @300 | 0/30 | rect | Mockup | ✓ |
| `apparel-cap-cotton` | Cotton Caps | 329 | Size (1); Colour (3) | 3 | apparel | 1500×1491 @300 | 0/30 | rect | Mockup | ✓ |
| `apparel-cap-dad-hat` | Unstructured Dad Cap | 419 | Colour (3) | 3 | apparel | 1500×1349 @300 | 0/30 | rect | Unsplash | ✗ |
| `apparel-cap-embroidered` | ★ Embroidered Caps | 399 | Size (1); Colour (4) | 4 | apparel | 1466×1500 @300 | 0/30 | rect | Mockup | ✓ |
| `apparel-cap-embroidered-denim` | Embroidered Denim Caps | 449 | Size (1); Colour (2) | 2 | apparel | 1500×1414 @300 | 0/30 | rect | Mockup | ✓ |
| `apparel-cap-premium-cotton` | Premium Cotton Caps | 429 | Size (1); Colour (3) | 3 | apparel | 1500×1041 @300 | 0/30 | rect | Mockup | ✓ |
| `apparel-cap-printed` | Printed Caps | 299 | Size (1); Colour (3) | 3 | apparel | 1472×1500 @300 | 0/30 | rect | Mockup | ✓ |
| `apparel-cap-promotional-plain` | Promotional Plain Caps | 299 | Size (1); Colour (4) | 4 | apparel | 1500×1209 @300 | 0/30 | rect | Mockup | ✓ |
| `apparel-cap-puma` | Puma Caps | 599 | Size (1); Colour (3) | 3 | apparel | 1490×1500 @300 | 0/30 | rect | Mockup | ✓ |
| `apparel-cap-structured` | Structured Baseball Cap | 399–449 | Colour (3); Logo Application (2) | 6 | apparel | 1500×1412 @300 | 0/30 | rect | Unsplash | ✗ |
| `apparel-cap-woodland` | Woodland Caps | 549 | Size (1); Colour (3) | 3 | apparel | 1500×1374 @300 | 0/30 | rect | Mockup | ✓ |
| `apparel-hoodie-pullover` | ★ Pullover Hoodie | 999–1,249 | Size (5); Colour (4); Print Placement (2) | 40 | apparel | 3562×4800 @300 | 0/60 | rect | Unsplash | ✗ |
| `apparel-hoodie-zipup` | Zip-Up Hoodie | 1,099–1,149 | Size (5); Colour (2) | 10 | apparel | 3586×4800 @300 | 0/60 | rect | Unsplash | ✗ |
| `apparel-jersey-custom-team` | Custom Polo Jerseys | 499–549 | Size (5); Colour (4) | 20 | apparel | 4301×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-jersey-india-t20-cricket-fan` | India T20 Cricket Fan Jersey | 549–599 | Size (5); Colour (2) | 10 | apparel | 4094×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-jersey-sports` | ★ Sports Jersey | 449–499 | Size (5); Colour (4) | 20 | apparel | 4046×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-shirt-arrow-mens-dress` | Men's Arrow Dress Shirts | 849–899 | Size (5); Colour (3) | 15 | apparel | 4094×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-shirt-cambridge-dress` | Cambridge Dress Shirts | 749–799 | Size (5); Colour (3) | 15 | apparel | 4032×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-shirt-cambridge-oxford-dress` | Cambridge Oxford Dress Shirt | 799–849 | Size (5); Colour (3) | 15 | apparel | 3917×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-shirt-fil-a-fil` | Fil-A-Fil Shirts | 699–749 | Size (5); Colour (3) | 15 | apparel | 4056×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-shirt-mark-spencer-office` | Mark & Spencer Office Shirts | 799–849 | Size (5); Colour (3) | 15 | apparel | 3869×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-shirt-mens-dress` | ★ Men's Dress Shirts | 699–749 | Size (5); Colour (4) | 20 | apparel | 3874×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-shirt-mens-dress-half-sleeves` | Men's Dress Shirts - Half Sleeves | 649–699 | Size (5); Colour (3) | 15 | apparel | 4301×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-shirt-park-avenue` | ★ Park Avenue Shirts | 899–949 | Size (5); Colour (3) | 15 | apparel | 3605×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-shirt-womens-embroidered-dress` | Women's Embroidered Dress Shirts | 849–899 | Size (5); Colour (3) | 15 | apparel | 3902×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-sweatshirt-crew` | Crew-Neck Sweatshirt | 849–899 | Size (5); Colour (3) | 15 | apparel | 4483×4800 @300 | 0/60 | rect | Unsplash | ✗ |
| `apparel-tracksuit-adidas-personalised` | ★ Personalised Adidas Track Suit | 1,199–1,249 | Size (5); Colour (3) | 15 | apparel | 2923×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tracksuit-uspa-personalised` | Personalised U.S. Polo Track Suit | 1,099–1,149 | Size (5); Colour (3) | 15 | apparel | 3158×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-basic-polyester-colours` | Basic Polyester T-shirts - Colours | 319–369 | Size (5); Colour (5) | 25 | apparel | 4138×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-classic-cotton` | ★ Classic Cotton T-Shirt | 399–599 | Size (5); Colour (4); Print Placement (2) | 40 | apparel | 3989×4800 @300 | 0/60 | rect | Unsplash | ✗ |
| `apparel-tshirt-full-sleeves` | Full Sleeves T-Shirts | 399–449 | Size (5); Colour (3) | 15 | apparel | 3854×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-jack-jones-printed` | ★ Jack and Jones Printed T-Shirts | 899–949 | Size (5); Colour (4) | 20 | apparel | 4709×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-kids` | Kid's T-shirts | 299–349 | Size (5); Colour (4) | 20 | apparel | 4747×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-limited-edition-cotton` | Limited Edition Cotton T-Shirts | 649–699 | Size (5); Colour (3) | 15 | apparel | 4685×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-mark-spencer-round-neck` | Mark & Spencer Round Neck T-Shirts | 799–849 | Size (5); Colour (3) | 15 | apparel | 4229×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-mens` | ★ Men's T-Shirts | 349–399 | Size (5); Colour (4) | 20 | apparel | 4157×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-mens-premium-cotton` | ★ Premium Men's Cotton T-Shirts | 599–649 | Size (5); Colour (4) | 20 | apparel | 4382×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-performance` | Performance Sports T-Shirt | 499–549 | Size (5); Colour (3) | 15 | apparel | 4090×4800 @300 | 0/60 | rect | Unsplash | ✗ |
| `apparel-tshirt-polyester` | Polyester T-shirts | 329–379 | Size (5); Colour (4) | 20 | apparel | 4123×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-vneck-premium` | Premium V-Neck T-Shirt | 449–499 | Size (5); Colour (3) | 15 | apparel | 4075×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `apparel-tshirt-womens` | Women's T-Shirts | 349–399 | Size (5); Colour (4) | 20 | apparel | 3912×4800 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-backpack-american-tourister` | American Tourister Backpacks | 1,699–2,349 | Quantity (4); Colour (2) | 8 | flat | 1250×2000 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-backpack-harissons-dexter` | Harissons Dexter Laptop Backpacks | 999–1,649 | Quantity (4) | 4 | flat | 1046×2000 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-backpack-lavie-sport-duke` | Lavie Sport Duke Laptop Backpacks | 899–1,549 | Quantity (4); Colour (2) | 8 | flat | 1318×2000 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-cotton-canvas-tote` | ★ Cotton Canvas Tote Bag | 249–979 | Quantity (4); Colour (3); Print Placement (2) | 24 | flat | 2117×2400 @300 | 0/60 | rect | Unsplash | ✗ |
| `bag-drawstring-backpack` | Drawstring Backpack Bag | 229–879 | Quantity (4); Colour (2) | 8 | flat | 2110×2400 @300 | 0/60 | rect | Unsplash | ✗ |
| `bag-duffle-adidas` | Adidas Duffle Bags | 1,199–1,849 | Quantity (4); Colour (2) | 8 | flat | 2000×1353 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-garment-suit` | Garment Bag | 199–849 | Quantity (4) | 4 | flat | 2038×3200 @300 | 0/60 | rect | Unsplash | ✗ |
| `bag-insulated-cooler` | Insulated Cooler Bag | 449–1,099 | Quantity (4) | 4 | flat | 2000×1994 @300 | 0/60 | rect | Unsplash | ✗ |
| `bag-jute-custom` | Custom Jute Bags | 199–849 | Quantity (4) | 4 | flat | 1600×1388 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-jute-premium` | Premium Jute Bags | 249–899 | Quantity (4); Colour (2) | 8 | flat | 1600×1410 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-jute-tote` | Jute Tote Bag | 299–949 | Quantity (4) | 4 | flat | 2400×2182 @300 | 0/60 | rect | Unsplash | ✗ |
| `bag-laptop-american-tourister` | ★ American Tourister Laptop Bags | 1,599–2,249 | Quantity (4); Colour (2) | 8 | flat | 2000×1835 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-laptop-embroidered` | Embroidered Laptop Bags | 499–1,149 | Quantity (4); Colour (3) | 12 | flat | 2000×1810 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-laptop-harissons-embroidered` | Harissons Embroidered Laptop Bags | 799–1,449 | Quantity (4); Colour (2) | 8 | flat | 2000×1792 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-laptop-harissons-nemesis` | Harissons Nemesis Office Laptop Bags | 1,899–2,549 | Quantity (4) | 4 | flat | 2000×1807 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-laptop-targus-intellect` | ★ Custom Targus Intellect Advanced Laptop Bags | 2,499–3,149 | Quantity (4) | 4 | flat | 2000×1852 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-mini-gift` | Mini Gift Bag | 99–749 | Quantity (4) | 4 | flat | 1229×1500 @300 | 0/60 | rect | Unsplash | ✗ |
| `bag-non-woven-carry` | ★ Non-Woven Carry Bag | 129–779 | Quantity (4); Colour (3) | 12 | flat | 2100×1972 @300 | 0/60 | rect | Unsplash | ✗ |
| `bag-paper-kraft` | Kraft Paper Shopping Bag | 149–799 | Quantity (4) | 4 | flat | 1921×2200 @300 | 0/60 | rect | Unsplash | ✗ |
| `bag-paper-laminated` | Laminated Paper Shopping Bag | 179–859 | Quantity (4); Finish (2) | 8 | flat | 1921×2200 @300 | 0/60 | rect | Unsplash | ✗ |
| `bag-tote-canvas-colored` | Colored Canvas Tote Bags | 229–879 | Quantity (4); Colour (3) | 12 | flat | 1600×1521 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-tote-cotton` | ★ Cotton Tote Bags | 149–799 | Quantity (4); Colour (3) | 12 | flat | 1573×1600 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-tote-pocket` | Pocket Tote Bags | 129–779 | Quantity (4) | 4 | flat | 1600×1505 @300 | 0/60 | rect | Mockup | ✓ |
| `bag-zippered-tote` | Zippered Tote Bag | 329–979 | Quantity (4); Colour (2) | 8 | flat | 2400×2374 @300 | 0/60 | rect | Unsplash | ✗ |

### Mugs, Albums & Gifts (46)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `gift-acrylic-display-stand` | Acrylic Display Stands | 299–349 | Size (2) | 2 | flat | 900×900 @300 | 15/20 | rect | Photo | · |
| `gift-acrylic-photo-block` | ★ Acrylic Photo Blocks | 449–599 | Size (2) | 2 | flat | 1800×1800 @300 | 0/30 | rect | Mockup | · |
| `gift-acrylic-photo-print` | Acrylic Photo Prints | 799–1,249 | Size (2) | 2 | flat | 2400×3000 @300 | 0/30 | rect | Photo | · |
| `gift-album-layflat` | Layflat Photo Albums | 1,099–1,699 | Page Count (2); Cover Material (2) | 4 | flat | 3900×2400 @300 | 40/40 | rect | Mockup | · |
| `gift-album-photo` | ★ Photo Albums | 799–1,249 | Page Count (2); Cover (2) | 4 | flat | 3600×2400 @300 | 30/40 | rect | Mockup | · |
| `gift-calendar-desk` | Desk Calendars | 299 | Binding (2) | 2 | flat | 1800×1200 @300 | 20/30 | rect | Mockup | · |
| `gift-calendar-desk-new-size` | Desk Calendar - New Size | 329 | Binding (2) | 2 | flat | 2100×1400 @300 | 20/30 | rect | Photo | · |
| `gift-calendar-desk-with-frame` | Desk Calendar with Photo Frame | 349 | Frame Colour (2) | 2 | flat | 1800×1200 @300 | 20/30 | rect | Photo | · |
| `gift-calendar-flip-desk` | Flip Desk Calendars | 279–329 | Stand Material (2) | 2 | flat | 1800×1200 @300 | 20/30 | rect | Photo | · |
| `gift-calendar-magnet` | Magnet Calendars | 159–559 | Pack Size (2) | 2 | flat | 1050×1500 @300 | 15/20 | rect | Photo | · |
| `gift-calendar-perpetual` | Perpetual Calendars | 249–329 | Material (2) | 2 | flat | 1200×900 @300 | 20/30 | rect | Mockup | · |
| `gift-calendar-poster` | Poster Calendars | 399–649 | Size (2) | 2 | flat | 3000×4500 @300 | 20/30 | rect | Photo | · |
| `gift-calendar-wall` | ★ Wall Calendars | 349–449 | Size (2) | 2 | flat | 2400×3600 @300 | 20/30 | rect | Mockup | · |
| `gift-calendar-wall-four-sheeter` | Four Sheeter Wall Calendars | 429–529 | Size (2) | 2 | flat | 2400×4200 @300 | 20/30 | rect | Mockup | · |
| `gift-calendar-wall-new-size` | Wall Calendar - New Size | 379–479 | Size (2) | 2 | flat | 2700×3600 @300 | 20/30 | rect | Photo | · |
| `gift-canvas-print` | ★ Canvas Prints | 999–1,899 | Size (3) | 3 | flat | 2400×3000 @300 | 0/30 | rect | Unsplash | · |
| `gift-clock-wall-personalized` | Personalized Wall Clocks | 499–579 | Size (2); Frame Colour (2) | 4 | flat | 2400×2400 @300 | 0/30 | circle | Mockup | · |
| `gift-coaster-acrylic-printed` | Custom Printed Acrylic Coasters | 229–299 | Pack Size (2) | 2 | flat | 900×900 @300 | 15/20 | rect | Photo | · |
| `gift-coaster-customized` | Customized Coasters | 179–239 | Pack Size (2); Shape (2) | 4 | flat | 900×900 @300 | 15/20 | rect | Photo | · |
| `gift-coaster-soft` | Soft Coasters | 149–199 | Pack Size (2) | 2 | flat | 900×900 @300 | 15/20 | circle | Mockup | · |
| `gift-frame-acrylic-photo` | Acrylic Photo Frame | 549–729 | Size (2) | 2 | flat | 1800×2400 @300 | 0/30 | rect | Photo | · |
| `gift-frame-led-photo` | LED Photo Frames | 799–1,049 | Size (2); Light Colour (2) | 4 | flat | 2400×3000 @300 | 0/30 | rect | Photo | · |
| `gift-frame-photo` | Photo With Frame | 599–879 | Size (2); Frame Colour (3) | 6 | flat | 2400×3000 @300 | 0/30 | rect | Mockup | · |
| `gift-frame-photo-premium` | Premium Photo with Frame | 899–1,579 | Size (3); Frame Finish (2) | 6 | flat | 2400×3000 @300 | 0/30 | rect | Mockup | · |
| `gift-framed-photo-print` | Framed Photo Print | 899–1,379 | Size (2); Frame Colour (3) | 6 | flat | 2400×3000 @300 | 0/30 | rect | Unsplash | · |
| `gift-hamper-steel-bottle-set` | Hamper with Stainless Steel Bottle, Tea Coaster, White Mug & More | 899–1,199 | Package Size (2) | 2 | flat | 4724×3543 @300 | 0/30 | rect | Mockup | · |
| `gift-hamper-travel` | ★ Travel Accessories Hampers | 1,299–1,699 | Package Size (2) | 2 | flat | 4134×2362 @300 | 0/30 | rect | Mockup | · |
| `gift-hamper-welcome-kit` | ★ Welcome Kit (Polo T-Shirt, Water Bottle, Coffee Mug, Diary, Pen) | 1,099–5,099 | Set Size (2) | 2 | flat | 4252×3898 @300 | 0/30 | rect | Mockup | · |
| `gift-lamp-journal-led` | Customized Daily Journal LED Lamp | 599–619 | Cover Colour (2) | 2 | flat | 1200×900 @300 | 15/20 | rect | Photo | · |
| `gift-magnet-acrylic-photo` | Acrylic Photo Magnets | 249–309 | Size (2) | 2 | flat | 900×900 @300 | 15/20 | rect | Mockup | · |
| `gift-magnet-fridge` | Fridge Magnets | 149–549 | Shape (2); Pack Size (2) | 4 | flat | 900×900 @300 | 15/20 | rect | Mockup | · |
| `gift-magnet-photo` | Photo Magnets | 179–299 | Pack Size (2) | 2 | flat | 900×900 @300 | 15/20 | rect | Mockup | · |
| `gift-mousepad-round-photo` | Round Photo Mouse Pads | 199–229 | Size (2) | 2 | flat | 2400×2400 @300 | 15/20 | circle | Photo | · |
| `gift-mug-custom-black` | Custom Mugs Black | 379–399 | Finish (2) | 2 | wrap | 2700×1050 @300 | 0/60 | rect | Mockup | · |
| `gift-mug-custom-decorative` | Custom Decorative Mugs | 399–419 | Handle Colour (2) | 2 | wrap | 3000×1050 @300 | 0/60 | rect | Mockup | · |
| `gift-mug-magic-colour-change` | ★ Colour Changing Magic Mugs | 449 | Base Colour (2) | 2 | wrap | 2700×1050 @300 | 0/60 | rect | Mockup | · |
| `gift-mug-personalised` | ★ Personalised Mugs | 349–369 | Handle Colour (2) | 2 | wrap | 2700×1050 @300 | 0/60 | rect | Mockup | · |
| `gift-pen-wooden-ball` | Wooden Finish Metal Ball Pens | 199–284 | Quantity (3); Finish (2) | 6 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `gift-phone-case` | Custom Phone Case | 599–649 | Phone Model (3); Case Finish (2) | 6 | wrap | 1800×3600 @300 | 30/60 | rounded | Unsplash | · |
| `gift-photo-cushion` | Photo Cushion Cover | 649–769 | Insert Included (2) | 2 | flat | 2400×2400 @300 | 0/30 | rect | Unsplash | · |
| `gift-water-bottle-steel` | Personalised Water Bottle | 699–749 | Colour (3) | 3 | wrap | 2400×2100 @300 | 0/60 | rect | Unsplash | · |
| `mug-classic-photo` | ★ Classic Photo Mug | 349–369 | Handle Colour (2) | 2 | wrap | 2700×1050 @300 | 0/60 | rect | Unsplash | · |
| `mug-insulated-travel` | Insulated Travel Mug | 799–829 | Colour (2) | 2 | wrap | 2700×1350 @300 | 0/60 | rect | Unsplash | · |
| `mug-large-latte-15oz` | Large Latte Mug | 399–419 | Handle Colour (2) | 2 | wrap | 3000×1050 @300 | 0/60 | rect | Unsplash | · |
| `mug-magic-colour-change` | ★ Magic Colour-Changing Mug | 449 | Base Colour (2) | 2 | wrap | 2700×1050 @300 | 0/60 | rect | Unsplash | · |
| `mug-two-tone-colour` | Two-Tone Colour Mug | 379 | Colour (4) | 4 | wrap | 2700×1050 @300 | 0/60 | rect | Unsplash | · |

### Pens (49)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `pen-ballpoint-classic` | ★ Classic Ballpoint Pen | 49–199 | Quantity (4); Barrel Colour (4) | 16 | flat | 1200×240 @300 | 0/20 | rect | Unsplash | · |
| `pen-black-matte-ball` | Black Matte Ball Pens | 159–314 | Quantity (4); Print Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-black-matte-roller` | Black Matte Roller Pens | 229–384 | Quantity (4); Print Colour (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-bulk-ball` | Bulk Ball Pens | 49–199 | Quantity (4); Barrel Colour (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-custom-full-white` | Custom Full White Ball Pens | 69–219 | Quantity (4); Print Colour (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-customized-basic` | ★ Customized Pens | 59–209 | Quantity (4); Barrel Colour (4) | 16 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-executive-metal-ball` | ★ Executive Metal Ball Pen | 249–419 | Quantity (4); Finish (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-executive-roller` | Executive Roller Pen | 249–419 | Quantity (4); Finish (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Unsplash | · |
| `pen-fountain-gift-set` | Fountain Pen Gift Set | 599–749 | Quantity (4); Nib Size (2); Barrel Finish (2) | 16 | flat | 1200×240 @300 | 0/20 | rect | Unsplash | · |
| `pen-gel-ink` | Gel Ink Pen | 69–219 | Quantity (4); Ink Colour (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Unsplash | · |
| `pen-getz-cap-type` | New Getz Cap-Type Ballpoint Pens | 59–209 | Quantity (4); Barrel Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-getz-opaque-push-type` | Getz Opaque Push Type Ballpoint Pen | 69–219 | Quantity (4); Barrel Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-gold-click` | Gold Click Pens | 99–249 | Quantity (4); Barrel Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-grand-opaque-ballpoint` | Grand Opaque Ballpoint Pen | 89–239 | Quantity (4); Barrel Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-green-silver-ball` | Green with Silver Ball Pens | 74–224 | Quantity (4); Barrel Shade (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-highlighter-set` | Highlighter Set | 89–239 | Quantity (4) | 4 | flat | 1200×200 @300 | 0/20 | rect | Unsplash | · |
| `pen-marble-design-metal-ball` | Marble Design Metal Ball Pens | 209–359 | Quantity (4); Marble Colourway (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-metal-twist` | ★ Metal Twist Pen | 129–334 | Quantity (4); Finish (3); Branding (2) | 24 | flat | 1200×240 @300 | 0/20 | rect | Unsplash | · |
| `pen-multi-function` | Multi-Function Pen | 159–309 | Quantity (4); Barrel Colour (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Unsplash | · |
| `pen-multicolor-ball` | Multicolor Ball Pens | 54–204 | Quantity (4); Colour Pack (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-new-cap-plastic-ball` | New Cap Plastic Ball Pens | 59–209 | Quantity (4); Barrel Colour (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-parker-aster-deluxe` | Parker Aster Deluxe Roller Ball Pens | 459–629 | Quantity (4); Finish (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-parker-odyssey-chrome` | Parker Odyssey Laque Black Chrome Trim Ball Pen | 529–709 | Quantity (4); Engraving (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-parker-odyssey-gold` | ★ Parker Odyssey Laque Black Gold Trim Roller Ball Pen | 549–729 | Quantity (4); Engraving (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-personalised-basic` | Personalised Pens | 69–219 | Quantity (4); Ink Colour (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-plastic-basic` | Plastic Pens | 49–199 | Quantity (4); Barrel Colour (4) | 16 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-premium-brass-golden` | ★ Premium Brass Metal Golden Ball Pens | 299–449 | Quantity (4); Finish (1) | 4 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-premium-brush-stone-black` | Premium Brush Stone Black Ballpoint Pens | 239–394 | Quantity (4); Print Colour (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-premium-magnetic-roller` | ★ Premium Magnetic Metal Roller Pens | 279–444 | Quantity (4); Finish (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-premium-matte` | Premium Matte Pens | 179–329 | Quantity (4); Barrel Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-promotional-basic` | Promotional Pens | 49–199 | Quantity (4); Barrel Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-recycled-paper` | Recycled Paper Pen | 59–209 | Quantity (4) | 4 | flat | 1200×240 @300 | 0/20 | rect | Unsplash | · |
| `pen-sleek-metal-ballpoint` | Sleek Metal Ballpoint Pens | 169–319 | Quantity (4); Finish (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-stylus-combo` | Stylus Combo Pen | 99–249 | Quantity (4); Barrel Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Unsplash | · |
| `pen-submarine-artistic-round-ring` | Submarine Artistic Plastic Pens with Round Ring | 89–239 | Quantity (4); Barrel Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-submarine-fountain` | Submarine Fountain Pens | 329–479 | Quantity (4); Nib Size (2) | 8 | flat | 1300×220 @300 | 0/20 | rect | Mockup | · |
| `pen-submarine-gold-plated-ball` | Submarine Gold Plated Ball Pens | 319–469 | Quantity (4); Finish (1) | 4 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-submarine-liberty-watermark` | Submarine Liberty Watermark Ball Pens | 189–349 | Quantity (4); Finish (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-submarine-mini-rose-gold-tip` | Submarine Mini Flat Clip Rose Gold Tip Metal Pens | 219–369 | Quantity (4); Finish (2) | 8 | flat | 1000×240 @300 | 0/20 | rect | Mockup | · |
| `pen-submarine-roller-swarovski` | ★ Submarine Roller Pens with Swarovski Crystal | 349–504 | Quantity (4); Crystal Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-submarine-sleek-roller` | Submarine Sleek Metal Roller Pens | 199–349 | Quantity (4); Finish (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-submarine-xylo-steel-roller` | Submarine Premium Xylo Steel Finish Roller Pens | 289–439 | Quantity (4); Finish (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-swissbrand-eternia` | ★ SwissBrand Eternia Fountain Pens | 599–749 | Quantity (4); Nib Size (2) | 8 | flat | 1300×220 @300 | 0/20 | rect | Mockup | · |
| `pen-swissbrand-legacy` | SwissBrand Legacy Trim Roller Ball Pens | 479–644 | Quantity (4); Finish (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-swissbrand-zenith` | SwissBrand Zenith Trim Roller Ball Pens | 499–649 | Quantity (4); Finish (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-triangle-wire-clip` | Triangle Wire Clip Ball Pens | 79–229 | Quantity (4); Barrel Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-twist-plastic-ball` | Twist Plastic Ball Pens | 69–219 | Quantity (4); Barrel Colour (3) | 12 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |
| `pen-wheat-straw` | Wheat Straw Pen | 79–229 | Quantity (4); Colour (2) | 8 | flat | 1200×240 @300 | 0/20 | rect | Unsplash | · |
| `pen-white-opaque-assorted` | White Opaque Assorted Color Pens | 64–214 | Quantity (4); Trim Colour (4) | 16 | flat | 1200×240 @300 | 0/20 | rect | Mockup | · |

### Drinkware (48)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `bottle-flip-lid-sports` | Flip-Lid Sports Water Bottle | 249–369 | Capacity (3); Colour (3) | 9 | wrap | 2400×2100 @300 | 0/60 | rect | — | ✓ |
| `bottle-gym-shaker` | Gym Shaker Bottle | 219 | Colour (2) | 2 | wrap | 2100×2100 @300 | 0/60 | rect | — | ✓ |
| `bottle-sipper` | Sipper Water Bottle | 199 | Colour (3) | 3 | wrap | 2100×2100 @300 | 0/60 | rect | — | ✓ |
| `bottle-steel-classic` | ★ Classic Steel Water Bottle | 299–439 | Capacity (3); Colour (3) | 9 | wrap | 2400×2100 @300 | 0/60 | rect | — | ✓ |
| `bottle-temperature-display` | ★ Temperature Display Bottle | 699–819 | Capacity (3); Colour (2) | 6 | wrap | 2400×2100 @300 | 0/60 | rect | — | ✓ |
| `bottle-vacuum-insulated` | ★ Vacuum Insulated Water Bottle | 499–619 | Capacity (3); Finish (2) | 6 | wrap | 2400×2100 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-aluminium` | Aluminium Water Bottles | 269–404 | Capacity (3); Lid Type (3) | 9 | wrap | 2250×2100 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-cello-duro-flip` | Cello Duro Flip Water Bottles | 329–464 | Capacity (3); Lid Type (3) | 9 | wrap | 2250×2100 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-cello-duro-kent` | Cello Duro Kent Water Bottles | 349–484 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2250 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-cello-swift` | Cello Swift Bottles | 299–434 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2100 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-cola-printed-600ml` | Printed Cola Bottles 600ml | 239–374 | Capacity (3); Lid Type (3) | 9 | wrap | 2100×2250 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-gym` | Gym Bottles | 199–334 | Capacity (3); Lid Type (3) | 9 | wrap | 2100×1800 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-inox` | Inox Bottles | 499–634 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2250 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-matt-vacuum` | Custom Matt Vacuum Bottles | 629–764 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2400 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-sipper-custom` | Custom Sipper Bottles | 219–354 | Capacity (3); Lid Type (3) | 9 | wrap | 2100×1950 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-sipper-steel` | Stainless Steel Sipper Bottles | 249–384 | Capacity (3); Lid Type (3) | 9 | wrap | 2100×1950 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-temperature-display` | ★ Temperature Display Bottles | 799–934 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2100 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-thermal-suction` | Thermal Suction Bottles | 599–734 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2400 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-vacuum` | Vacuum Bottles | 549–684 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2400 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-water-custom` | ★ Custom Water Bottles | 229–364 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2100 @300 | 0/60 | rect | — | ✓ |
| `drinkware-bottle-wireless-speaker` | ★ Water Bottle with Wireless Speaker | 1,199–1,334 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2250 @300 | 0/60 | rect | — | ✓ |
| `drinkware-cup-vacuum-insulation` | Vacuum Insulation Cup | 479–514 | Colour (3); Lid Type (3) | 9 | wrap | 1950×1650 @300 | 0/60 | rect | — | ✓ |
| `drinkware-flask-cello-flip` | Cello Flip Style Water Flasks | 339–474 | Capacity (3); Lid Type (3) | 9 | wrap | 2100×1950 @300 | 0/60 | rect | — | ✓ |
| `drinkware-flask-coffee-vacuum` | Insulated Vacuum Coffee Flasks | 579–714 | Capacity (3); Lid Type (3) | 9 | wrap | 2250×2250 @300 | 0/60 | rect | — | ✓ |
| `drinkware-flask-hip-7oz-black` | Hip Flask - 7 OZ - Black | 499–1,069 | Colour (3); Quantity (3) | 9 | wrap | 1500×1200 @300 | 0/60 | rect | — | ✓ |
| `drinkware-glass-champagne` | ★ Personalised Champagne Glasses | 899–1,469 | Colour (3); Quantity (3) | 9 | wrap | 1500×2400 @300 | 0/60 | rect | — | ✓ |
| `drinkware-glass-wine` | Personalised Wine Glasses | 799–1,369 | Colour (3); Quantity (3) | 9 | wrap | 1650×2250 @300 | 0/60 | rect | — | ✓ |
| `drinkware-mug-beer-customised` | Customised Beer Mugs | 289–859 | Colour (3); Quantity (3) | 9 | wrap | 2700×1050 @300 | 0/60 | rect | — | ✓ |
| `drinkware-mug-beer-frosted` | ★ Frosted Beer Mugs | 299–869 | Colour (3); Quantity (3) | 9 | wrap | 2700×1050 @300 | 0/60 | rect | — | ✓ |
| `drinkware-mug-coffee-vacuum` | Vacuum Coffee Mugs | 449–1,019 | Colour (3); Quantity (3) | 9 | wrap | 2400×1200 @300 | 0/60 | rect | — | ✓ |
| `drinkware-mug-temperature-display` | Temperature Display Mugs | 829–1,399 | Colour (3); Quantity (3) | 9 | wrap | 2400×1200 @300 | 0/60 | rect | — | ✓ |
| `drinkware-pexpo-austin-steel` | Pexpo Austin Steel Water Bottles | 429–564 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2100 @300 | 0/60 | rect | — | ✓ |
| `drinkware-pexpo-bravo-vacuum` | Pexpo Bravo Vacuum Bottles | 589–724 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2400 @300 | 0/60 | rect | — | ✓ |
| `drinkware-pexpo-cameo-compact` | Pexpo Cameo Compact Steel Bottles | 379–514 | Capacity (3); Lid Type (3) | 9 | wrap | 2100×1800 @300 | 0/60 | rect | — | ✓ |
| `drinkware-pexpo-cocoa-tumbler` | Pexpo Cocoa Vacuum Steel Tumblers | 699–734 | Colour (3); Lid Type (3) | 9 | wrap | 2100×1800 @300 | 0/60 | rect | — | ✓ |
| `drinkware-pexpo-flamingo-vacuum` | ★ Pexpo Flamingo Vacuum Bottles | 849–984 | Capacity (3); Lid Type (3) | 9 | wrap | 2400×2400 @300 | 0/60 | rect | — | ✓ |
| `drinkware-pexpo-morocco-thermo` | Pexpo Morocco Thermo Steel Bottles | 469–604 | Capacity (3); Lid Type (3) | 9 | wrap | 2100×1950 @300 | 0/60 | rect | — | ✓ |
| `drinkware-pexpo-orio-thermo` | Pexpo Orio Thermo Steel Bottles | 469–604 | Capacity (3); Lid Type (3) | 9 | wrap | 2100×1950 @300 | 0/60 | rect | — | ✓ |
| `drinkware-pexpo-stanzy-tumbler` | Pexpo Stanzy Tumblers | 649–684 | Colour (3); Lid Type (3) | 9 | wrap | 2100×1800 @300 | 0/60 | rect | — | ✓ |
| `drinkware-tumbler-customised` | Customised Tumblers | 279–314 | Colour (3); Lid Type (3) | 9 | wrap | 2100×1800 @300 | 0/60 | rect | — | ✓ |
| `drinkware-tumbler-skinny-600ml` | ★ Personalised Skinny Tumbler 600ml | 399–434 | Colour (3); Lid Type (3) | 9 | wrap | 1800×2100 @300 | 0/60 | rect | — | ✓ |
| `drinkware-tumbler-travel` | Personalized Travel Tumbler | 369–404 | Colour (3); Lid Type (3) | 9 | wrap | 1800×2100 @300 | 0/60 | rect | — | ✓ |
| `drinkware-tumbler-vacuum-insulated` | Personalised Vacuum Insulated Tumbler | 529–564 | Colour (3); Lid Type (3) | 9 | wrap | 2100×1800 @300 | 0/60 | rect | — | ✓ |
| `drinkware-tumbler-wine` | ★ Wine Tumbler | 449–484 | Colour (3); Lid Type (3) | 9 | wrap | 2100×1950 @300 | 0/60 | rect | — | ✓ |
| `mug-frosted-beer` | Frosted Beer Mug | 299–329 | Capacity (2) | 2 | wrap | 2700×1050 @300 | 0/60 | rect | — | ✓ |
| `tumbler-insulated-coffee` | Insulated Coffee Tumbler | 399–439 | Capacity (2) | 2 | wrap | 2100×1800 @300 | 0/60 | rect | — | ✓ |
| `tumbler-skinny-travel` | ★ Skinny Travel Tumbler 600ml | 349–379 | Colour (3) | 3 | wrap | 2100×1800 @300 | 0/60 | rect | — | ✓ |
| `tumbler-wine-stemless` | Stemless Wine Tumbler | 449–469 | Finish (2) | 2 | wrap | 2100×1800 @300 | 0/60 | rect | — | ✓ |

### Custom Polo T-shirts (43)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `apparel-polo-6-degree` | 6 Degree Polo T-Shirts | 599–649 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-adidas` | ★ Adidas Polo T-Shirts | 899–949 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Unsplash | · |
| `apparel-polo-adidas-3-stripe` | Adidas 3 Stripe Polo T-shirts | 949–999 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-adidas-climalite-dryfit` | Adidas Climalite Dryfit Polo T-shirts | 999–1,049 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-adidas-mens` | Adidas Men's Polo T-Shirts | 899–949 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-adidas-polycotton` | Adidas Polycotton T-Shirts | 749–799 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-arrow-mercerized` | Arrow Mercerized Polo T-Shirts | 799–849 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-arrow-tipping` | Arrow Tipping Polo T-Shirts | 749–799 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-bulk` | Bulk Polo T-Shirts | 349–399 | Size (5); Colour (4) | 20 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-classic` | ★ Classic Polo Shirt | 599–899 | Size (5); Colour (4); Embroidery vs Print (2) | 40 | apparel | 1800×1800 @300 | 0/40 | rect | Unsplash | · |
| `apparel-polo-dryfit-golf` | Dry Fit Golf Polo T-Shirts | 699–749 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-embroidered-multi-location` | Embroidered Polos - Multi Location | 599–649 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-flying-machine-dryfit` | Flying Machine Dry Fit Polo T-Shirts | 799–849 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-full-custom` | Full Custom Polo T-Shirts | 549–599 | Size (5); Colour (4) | 20 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-golfer` | ★ Golfer Polo T-Shirts | 649–699 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Unsplash | · |
| `apparel-polo-levis` | ★ Levi's Polo T-Shirts | 1,099–1,149 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-mark-spencer` | Mark & Spencer Polo T-Shirts | 799–849 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-mens-classic` | ★ Men's Polo T-Shirts | 449–499 | Size (5); Colour (4) | 20 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-mens-scott` | Men's Scott Polo T-Shirts | 599–649 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-monte-carlo` | Monte Carlo Polo T-Shirt | 699–749 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-parx-premium` | Parx Premium Polo T-Shirts | 899–949 | Size (5); Colour (4) | 20 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-performance` | Performance Polo Shirt | 649–699 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Unsplash | · |
| `apparel-polo-pikmee-fastees-men` | Pikmee Fastees Polo T-shirts - Men | 549–599 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-pikmee-highline` | Pikmee Highline Polo T-Shirts | 599–649 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-pikmee-promo-tees` | Pikmee Promo Tees Polo T-Shirts | 499–549 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-pikmee-tipline-double-tipped-men` | Pikmee Tipline Double Tipped Polo T-shirts - Men | 599–649 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-pikmee-titlis-climate-control-men` | Pikmee Titlis Climate Control Polo T-Shirts - Men | 749–799 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-pocket` | Pocket Polo T-Shirts | 499–549 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-polyester` | Polyester Polo T-Shirts | 429–479 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-polyester-multi-location` | Polyester Polos - Multi Location | 479–529 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-premium` | ★ Premium Polo T-Shirts | 649–699 | Size (5); Colour (4) | 20 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-printed-multi-location` | Printed Polos - Multi Location | 549–599 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-puma` | ★ Puma Polo T-shirts | 849–899 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-safety-reflector` | Safety Reflector Polos | 599–649 | Size (5); Colour (2) | 10 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-sports-republic-actiplay-dryfit-men` | Sports Republic Acti-Play Dryfit Polo T-Shirts - Men | 699–749 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-sports-republic-actiplay-dryfit-neck-back` | Sports Republic ACTI-PLAY Dry-Fit Polo Neck-Back | 699–749 | Size (5); Colour (2) | 10 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-sports-republic-actiplay-dryfit-neck-front` | Sports Republic ACTI-PLAY Dry-Fit Polo Neck-Front | 699–749 | Size (5); Colour (2) | 10 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-turms-anti-stain` | TURMS Anti Stain Polo T-Shirts | 849–899 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-two-tone` | Two Tone Polo T-Shirts | 499–549 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-us-polo-assn` | ★ US POLO ASSN. Polo T-Shirts | 999–1,049 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-womens-classic` | Women's Polo T-shirts | 449–499 | Size (5); Colour (4) | 20 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-womens-scott` | Women's Scott Polo T-Shirts | 599–649 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |
| `apparel-polo-woodland` | Woodland Polo T-Shirts | 649–699 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | Mockup | · |

### Umbrellas & Rainwear (35)

| Slug | Name | Price (₹) | Options (values) | Var. | Print | Canvas px @dpi | Bleed/Safe px | Trim | Img | Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| `cap-rain-waterproof` | Waterproof Rain Cap | 199 | Colour (2) | 2 | apparel | 900×500 @300 | 0/40 | rect | — | ✓ |
| `jacket-waterproof-rain` | ★ Waterproof Rain Jacket | 1,299–1,334 | Size (5); Colour (3) | 15 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `raincoat-industrial-safety` | Industrial Safety Raincoat | 799–834 | Size (5); Colour (2) | 10 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `raincoat-kids` | Kids Raincoat | 449 | Size (3); Colour (3) | 9 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainsuit-safari` | Safari Rain Suit | 999–1,034 | Size (5); Colour (2) | 10 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-bag-cover-waterproof` | Waterproof Bag Covers | 229–2,829 | Colour (3); Quantity (4) | 12 | apparel | 1200×900 @300 | 0/40 | rect | — | ✓ |
| `rainwear-kiara-kids-raincoat` | Kiara Kids Raincoats | 449–3,049 | Size (3); Colour (3); Quantity (4) | 36 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-kiara-womens-long-raincoat` | ★ Kiara Women's Long Raincoats | 949–3,584 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-lbw-safari-suit` | Rain Suit LBW Safari | 1,199–3,834 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-mirage-safari-suit` | ★ Mirage Safari Rain Suit | 1,099–3,734 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-rain-cap-freedom` | Freedom Rain Caps | 249–2,849 | Colour (3); Quantity (4) | 12 | apparel | 900×500 @300 | 0/40 | rect | — | ✓ |
| `rainwear-rain-cap-waterproof` | Waterproof Rain Caps | 199–2,799 | Colour (3); Quantity (4) | 12 | apparel | 900×500 @300 | 0/40 | rect | — | ✓ |
| `rainwear-raincare-safari-suit` | Raincare Safari Rain Suit | 1,049–3,684 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-raincoat-industrial-safety` | Industrial Safety Raincoats | 799–3,434 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-raincoat-poncho` | Poncho Raincoats | 349–2,984 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-rainsuit-standard` | Rainsuits | 899–3,534 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-skylark-safari-suit` | Skylark Safari Rain Suit | 1,149–3,784 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-waterproof-jacket-foldable` | Foldable Waterproof Jackets | 1,399–4,034 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-waterproof-jacket-scott` | ★ Scott Waterproof Jackets | 1,499–4,134 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `rainwear-waterproof-jacket-standard` | Waterproof Jackets | 1,299–3,934 | Size (5); Colour (3); Quantity (4) | 60 | apparel | 1800×1800 @300 | 0/40 | rect | — | ✓ |
| `umbrella-golf` | ★ Golf Umbrella | 899 | Canopy Colour (3) | 3 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-golf-bulk` | Bulk Golf Umbrellas | 799–3,399 | Canopy Colour (4); Quantity (4) | 16 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-golf-classic` | ★ Golf Umbrellas | 899–3,499 | Canopy Colour (4); Quantity (4) | 16 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-golf-promotional-basic` | Basic Promotional Golf Umbrellas | 599–3,199 | Canopy Colour (4); Quantity (4) | 16 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-photo-custom` | ★ Custom Photo Umbrellas | 649–3,249 | Canopy Colour (4); Quantity (4) | 16 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-photo-print` | Photo Print Umbrella | 649–729 | Canopy Size (2) | 2 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-promotional` | ★ Promotional Umbrellas | 429–3,029 | Canopy Colour (4); Quantity (4) | 16 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-single-fold` | Single Fold Umbrellas | 499–3,099 | Canopy Colour (5); Quantity (4) | 16 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-single-fold-bulk` | Bulk Single Fold Umbrellas | 399–2,999 | Canopy Colour (4); Quantity (4) | 16 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-three-fold` | Three-Fold Travel Umbrella | 349 | Canopy Colour (2) | 2 | wrap | 1500×2000 @300 | 0/60 | rect | — | ✓ |
| `umbrella-three-fold-bulk` | Bulk Three-Fold Umbrellas | 299–2,899 | Canopy Colour (4); Quantity (4) | 16 | wrap | 1500×2000 @300 | 0/60 | rect | — | ✓ |
| `umbrella-three-fold-sun` | Sun Three Fold Umbrellas | 349–2,949 | Canopy Colour (4); Quantity (4) | 16 | wrap | 1500×2000 @300 | 0/60 | rect | — | ✓ |
| `umbrella-two-fold` | Two-Fold Umbrellas | 449–3,049 | Canopy Colour (5); Quantity (4) | 16 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-two-fold-bulk` | Bulk Two-Fold Umbrellas | 369–2,969 | Canopy Colour (4); Quantity (4) | 16 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |
| `umbrella-two-fold-sun` | Sun Two Fold Umbrellas | 399–2,999 | Canopy Colour (4); Quantity (4) | 16 | wrap | 1800×2400 @300 | 0/60 | rect | — | ✓ |

★ = featured/bestseller flag.

---

## Appendix B — Design Studio templates found in code (95)

Templates are code-defined layouts with geometry relative to canvas size; most target one product. Styles: minimal, bold, elegant, floral, photo.

| ID | Name | Style | Print categories | Products |
|---|---|---|---|---|
| `envelope-minimal-corporate` | Minimal corporate envelope | — | flat_print | stationery-envelope-dl |
| `envelope-colour-band` | Colour band envelope | — | flat_print | stationery-envelope-dl |
| `envelope-premium-monogram` | Premium monogram | — | flat_print | stationery-envelope-dl |
| `envelope-geometric-bold` | Geometric bold envelope | bold | flat_print | stationery-envelope-dl |
| `envelope-emerald-frame` | Emerald frame envelope | elegant | flat_print | stationery-envelope-dl |
| `wedding-botanical-frame` | Botanical frame | floral | flat_print | invitation-wedding-classic |
| `wedding-modern-minimal` | Modern minimal | minimal | flat_print | invitation-wedding-classic |
| `wedding-royal-monogram` | Royal monogram | elegant | flat_print | invitation-wedding-classic |
| `wedding-photo-feature` | Photo feature | photo | flat_print | invitation-wedding-classic |
| `wedding-vibrant-typographic` | Vibrant typographic | bold | flat_print | invitation-wedding-classic |
| `corporate-editorial-invite` | Editorial invite | minimal | flat_print | invitation-corporate-event |
| `corporate-bold-navy` | Bold navy | bold | flat_print | invitation-corporate-event |
| `corporate-emerald-formal` | Emerald formal | elegant | flat_print | invitation-corporate-event |
| `corporate-photo-spotlight` | Photo spotlight | photo | flat_print | invitation-corporate-event |
| `corporate-duotone-launch` | Duotone launch | bold | flat_print | invitation-corporate-event |
| `folder-corporate-navy` | Corporate navy | elegant | flat_print | (folder products list) |
| `folder-minimal-clean` | Minimal clean | minimal | flat_print | (folder products list) |
| `folder-bold-block` | Bold block | bold | flat_print | (folder products list) |
| `folder-photo-frame` | Photo frame | photo | flat_print | (folder products list) |
| `folder-charcoal-copper` | Charcoal copper | elegant | flat_print | (folder products list) |
| `birthday-confetti-bash` | Confetti bash | bold | flat_print | invitation-birthday-fun |
| `birthday-pastel-balloons` | Pastel balloons | minimal | flat_print | invitation-birthday-fun |
| `birthday-space-explorer-photo` | Space explorer photo | photo | flat_print | invitation-birthday-fun |
| `birthday-plum-gold-milestone` | Plum & gold milestone | elegant | flat_print | invitation-birthday-fun |
| `birthday-popart-blast` | Pop-art blast | bold | flat_print | invitation-birthday-fun |
| `compliment-slip-minimal-rule` | Minimal rule compliments | minimal | flat_print | stationery-compliment-slips, stationery-note-cards-standard |
| `compliment-slip-terracotta-block` | Terracotta block compliments | bold | flat_print | stationery-compliment-slips, stationery-note-cards-standard |
| `compliment-slip-navy-gold-elegant` | Navy & gold compliments | elegant | flat_print | stationery-compliment-slips, stationery-note-cards-standard |
| `compliment-slip-branded-logo` | Branded logo compliments | photo | flat_print | stationery-compliment-slips, stationery-note-cards-standard |
| `compliment-slip-sage-leaf` | Sage leaf compliments | floral | flat_print | stationery-compliment-slips, stationery-note-cards-standard |
| `minimal-centered` | Minimal centered | — | flat_print, apparel, wrap | all in category |
| `bold-left-aligned` | Bold left-aligned | — | flat_print, apparel, wrap | all in category |
| `photo-and-text` | Photo + text | — | flat_print, apparel, wrap | all in category |
| `badge-center` | Centered badge | — | flat_print | all in category |
| `logo-tagline` | Logo + tagline (apparel) | — | apparel, wrap | all in category |
| `diagonal-spotlight` | Diagonal spotlight | bold | flat_print, apparel, wrap | all in category |
| `classic-emblem` | Classic emblem | elegant | flat_print, apparel, wrap | all in category |
| `modern-bookmark-block` | Colour Block Bookmark | bold | flat_print | stationery-bookmark |
| `modern-card-holder-sleeve` | Bold Sleeve Wrap | bold | flat_print | stationery-card-holder-sleeve |
| `modern-desk-calendar-editorial` | Editorial Desk Calendar | minimal | flat_print | stationery-desk-calendar |
| `modern-letterhead-sidebar-editorial` | Editorial Sidebar Letterhead | minimal | flat_print | stationery-letterhead |
| `modern-notepad-bold-header` | Bold Header Notepad | bold | flat_print | stationery-notepad-a5 |
| `modern-sticky-note-pop` | Pop Colour Sticky Note | bold | flat_print | stationery-sticky-notes |
| `modern-housewarming-invite-two-sided` | New Address Block | bold | flat_print | invitation-housewarming |
| `modern-festival-greeting-two-sided` | Festival Lumen | bold | flat_print | invitation-festival-greeting |
| `modern-grand-opening-two-sided` | Opening Statement | bold | flat_print | announcement-grand-opening |
| `modern-new-baby-two-sided` | Little Arrival | bold | flat_print | announcement-new-baby |
| `modern-baby-shower-two-sided` | Blush Bloom Shower | elegant | flat_print | invitation-baby-shower |
| `modern-engagement-announcement` | At Last Engagement Suite | elegant | flat_print | announcement-engagement |
| `modern-birthday-bash` | Cobalt Citrus Bash | bold | flat_print | invite-birthday-invitations |
| `modern-cash-gift-voucher` | Navy Gold Voucher | bold | flat_print | stationery-cash-vouchers |
| `modern-gift-tag-duo` | Forest Blush Gift Tag | minimal | flat_print | invite-gift-tags |
| `modern-id-card-corporate` | Navy Panel ID Card | bold | flat_print | stationery-id-cards-pvc |
| `modern-thank-you-ink-bloom` | Ink & Bloom Thanks | bold | flat_print | invite-thank-you-cards |
| `modern-wedding-invitation-emerald` | Emerald Vow Edition | bold | flat_print | invite-wedding-invitations |
| `modern-wedding-menu-burgundy` | Burgundy Feast Menu | bold | flat_print | invite-wedding-menu |
| `modern-wedding-programme-navy` | Navy Order Programme | bold | flat_print | invite-wedding-programmes |
| `modern-diary-magnetic-lock-cover` | Brass Clasp Diary | elegant | flat_print | stationery-diary-magnetic-lock |
| `modern-notebook-personalised-forest-band` | Forest Blush Notebook | bold | flat_print | stationery-notebooks-personalised |
| `modern-notebook-a4-lime-corner` | Lime Corner Notebook | bold | flat_print | stationery-notebook-a4 |
| `modern-envelope-editorial-burgundy` | Editorial Burgundy Envelope | bold | flat_print | stationery-envelopes-standard |
| `modern-awards-certificate-ink-gold` | Ink & Gold Certificate | elegant | flat_print | stationery-awards-certificate |
| `modern-certificates-custom-burgundy` | Burgundy Achievement Certificate | elegant | flat_print | stationery-certificates-custom |
| `modern-plaques-recognition-bronze` | Bronze Recognition Plaque | bold | flat_print | stationery-plaques-recognition |
| `modern-awards-star-performer-lime` | Star Performer Spotlight | bold | flat_print | stationery-awards-star-performer |
| `modern-letterheads-bulk-corporate` | Ink Bar Letterhead | minimal | flat_print | stationery-letterheads-bulk |
| `modern-letterhead-pads-custom-sidebar` | Forest Sidebar Letterhead | minimal | flat_print | stationery-letterhead-pads-custom |
| `modern-keychain-oval-ink-band` | Ink Oval Monogram | bold | flat_print | stationery-keychain-oval-metal |
| `modern-keychain-light-navy-corner` | Navy Corner Glow | bold | flat_print | stationery-keychain-light |
| `modern-coaster-forest-blob` | Forest Blob Coaster | bold | flat_print | stationery-coasters-custom |
| `modern-mat-lime-band` | Lime Band Doormat | bold | flat_print | stationery-mats-custom |
| `modern-mousepad-burgundy-band` | Burgundy Team Band | bold | flat_print | stationery-mouse-pad-custom |
| `modern-pendrive-mustard-strip` | Mustard Strip Drive | minimal | flat_print | stationery-pen-drive-custom |
| `modern-moving-announcement` | New Chapter Address | bold | flat_print | invite-moving-announcements |
| `modern-paper-id-card` | Charcoal Mustard ID | bold | flat_print | stationery-paper-id-cards |
| `modern-party-invitation` | Electric Night Party | bold | flat_print | invite-party-invitations |
| `modern-save-the-date-announcement` | Rose Gold Save the Date | elegant | flat_print | announcement-save-the-date |
| `modern-save-the-date-invite` | Ink Minimal Save the Date | minimal | flat_print | invite-save-the-date |
| `modern-bill-book-ledger` | Navy Ledger Bill Book | minimal | flat_print | stationery-bill-books-standard |
| `modern-invoice-book-teal` | Teal Editorial Invoice Book | minimal | flat_print | stationery-invoice-books-standard |
| `modern-perfect-binding-booklet` | Editorial Mono Booklet | minimal | flat_print | stationery-booklets-perfect-binding |
| `modern-diary-pen-holder-leather` | Warm Leather Diary | elegant | flat_print | stationery-diary-pen-holder |
| `modern-diary-a5-monogram` | Blush Gold A5 Diary | elegant | flat_print | stationery-diary-a5-personalised |
| `modern-letterheads-standard-minimal` | Minimal Centered Letterhead | minimal | flat_print | stationery-letterheads-standard |
| `modern-employee-welcome-kit` | Welcome Aboard Cover | bold | flat_print | stationery-employee-welcome-kit |
| `modern-custom-pen-wordmark` | Sleek Pen Wordmark | minimal | flat_print | stationery-custom-pens-basic |
| `modern-memento-plaque` | Bronze Memento Plaque | elegant | flat_print | stationery-mementos-customised |
| `modern-gift-wrap-scatter` | Scattered Dot Gift Wrap | bold | flat_print | stationery-gift-wrapping-paper |
| `modern-keychain-acrylic-monogram` | Clear Acrylic Monogram | minimal | flat_print | stationery-keychain-acrylic |
| `modern-usb-drive-wordmark` | Mustard USB Wordmark | minimal | flat_print | stationery-usb-flash-drive |
| `modern-laptop-skin-corner-mark` | Corner Mark Laptop Skin | minimal | flat_print | stationery-laptop-skins |
| `modern-lanyard-repeat-strip` | Repeating Wordmark Lanyard | minimal | flat_print | stationery-lanyards-standard |
| `modern-wristband-event-name` | Bold Event Wristband | bold | flat_print | stationery-wrist-bands-paper |
| `modern-envelope-seal-monogram` | Round Wax-Look Seal | elegant | flat_print | stationery-envelope-seals |
| `blank` | Blank canvas | — | flat_print, apparel, wrap | all in category |
