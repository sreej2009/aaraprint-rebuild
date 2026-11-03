# Aaraprint — New UI/UX Blueprint

**Status:** Proposal for approval · **Date:** 31 Oct 2026 · **Companion docs:** `AARAPRINT_RECONNAISSANCE.md`, `AARAPRINT_ASSET_INVENTORY.md`, `AARAPRINT_IMPLEMENTATION_PLAN.md`

This blueprint keeps every business capability found on the current site (533 configurable products, option-driven pricing, quantity price breaks, a multi-product Design Studio, 2D/3D proofing, guest + account flows, pay-on-delivery) and redesigns how people experience them. It does **not** reuse the original look (dark navy/coral gradient, Archivo + IBM Plex type, "REG MARK" print-shop styling, shimmer buttons).

---

## 1. Design principles

| # | Principle | What it means in practice |
|---|-----------|---------------------------|
| 1 | **Clear in five seconds** | Every page answers "what is this, what does it cost, what do I do next" above the fold. One primary action per view. |
| 2 | **Price is never a surprise** | Live price on every configuration change, per-unit + total, savings shown, shipping threshold progress visible from PDP to checkout. |
| 3 | **Beginner first, expert ready** | Studio shows 5 essential tools by default; advanced controls (CMYK, line spacing, exact X/Y, curve) open on demand (progressive disclosure). |
| 4 | **Print-safe by default** | The system prevents bad prints: safe-zone snapping, DPI badges on images, blocking checks before approval, plain-language warnings. |
| 5 | **Never lose work** | Autosave locally every change, cloud-save when signed in, visible status, restore after sign-in, version history. |
| 6 | **Quiet, premium surfaces** | White and soft grey, one accent colour, thin borders, restrained shadows, real product imagery. No gradients on controls, no gold. |
| 7 | **Mobile is its own layout** | Bottom sheets and a bottom tool bar on phones — not a squeezed desktop. |
| 8 | **Accessible by construction** | WCAG 2.2 AA tokens, full keyboard support, visible focus, screen-reader labels on every canvas action. |

---

## 2. Visual identity

### 2.1 Colour palette (refined from the brief)

> **Implemented in Phase 1** as Tailwind tokens in `src/styles/theme.css` (names: `fg`, `fg-muted`, `accent`, `accent-strong`, `success-strong`, `border-strong` …). Every pairing below is verified by `src/design-system/tokens.test.ts`; four values were darkened slightly during implementation to pass on all surfaces.

The suggested palette is a good base. Contrast checks found two values that fail WCAG for text, so the system splits "fill" and "text" variants.

| Token | Hex | Use | Contrast note |
|-------|-----|-----|---------------|
| `--surface` | `#FFFFFF` | Page and card background | — |
| `--surface-subtle` | `#F5F6F8` | Section bands, sidebars, canvas backdrop | — |
| `--surface-sunken` | `#EEF0F3` | Wells, inactive tabs, skeletons | — |
| `--text` | `#171C26` | Primary text, headings | 16.9:1 on white |
| `--text-muted` | `#626A7A` | Secondary text, captions | ≥4.5:1 on every surface (adjusted in Phase 1 from `#687080`, which drops to 4.4:1 on `#EEF0F3`) |
| `--text-subtle` | `#8B93A1` | Placeholders, disabled hints | ≈3.1:1 — never for essential text |
| `--accent` | `#635BFF` | Primary buttons, selected states, focus ring | ≈4.7:1 with white text (passes AA) |
| `--accent-hover` | `#5249E8` | Button hover/pressed | — |
| `--accent-text` | `#4B43D6` | Accent-coloured links and text on white | ≈6.3:1 |
| `--accent-soft` | `#EFEEFF` | Selected chip background, active tool tile | — |
| `--success` | `#20B486` | Success icons, progress fills, badges (fill only) | ≈2.7:1 — **not for text** |
| `--success-text` | `#0A7454` | "Saved", "In stock", success messages | ≥5:1 on white and on the success background (adjusted in Phase 1 from `#0B7F5C`) |
| `--warning` | `#A14A07` (text) / `#FEF3C7` (bg) / `#E8930C` (icon) | Low DPI, near safe-zone, stock low | ≈5.4:1 on its background (adjusted in Phase 1 from `#B45309`, which only reaches 4.5:1) |
| `--danger` | `#C8283B` (text) / `#FDECEE` (bg) | Errors, destructive actions | — |
| `--border` | `#E6E8ED` | Card outlines, dividers | Decorative only |
| `--border-control` | `#848C9A` | Inputs, selects, steppers, checkboxes | ≥3:1 on white and `#F5F6F8` (WCAG 1.4.11); adjusted in Phase 1 from `#C3C8D2` (1.7:1) |
| `--focus` | `#635BFF` @ 2px + 2px white offset | Keyboard focus | ≥3:1 against both surfaces |

**Studio-only guide colours** (chosen so they never clash with customer artwork):

| Guide | Colour | Style |
|-------|--------|-------|
| Trim line | `#171C26` @ 60% | 1px solid |
| Bleed area | `#E5484D` @ 12% fill + 1px dashed `#E5484D` | outside trim |
| Safe zone | `#0B7F5C` 1px dashed | inside trim |
| Smart guides / snapping | `#F23DA4` (magenta) | 1px solid, only while dragging |
| Selection | `--accent` | 1.5px, 8px square handles, round rotate handle |

Avoid: gradients on buttons, gold/bronze, dark hero bands, glassmorphism, coloured shadows.

### 2.2 Typography

| Role | Font | Weights | Why |
|------|------|---------|-----|
| UI + body | **Inter** (self-hosted, variable) | 400 / 500 / 600 | Highly legible at small sizes, tabular figures for prices. |
| Display headings | **Manrope** (self-hosted) | 600 / 700 | Friendly geometric character, distinct from the original Archivo. |
| Numerals in prices | Inter `font-variant-numeric: tabular-nums` | 600 | Prices don't jitter as options change. |

Type scale (rem, 16px base, 1.25 ratio, clamp for fluid headings):

| Token | Size / line-height | Use |
|-------|-------------------|-----|
| `display` | clamp(2.25rem, 4vw, 3.5rem) / 1.1 | Homepage hero only |
| `h1` | 2rem / 1.2 | Page titles, PDP product name |
| `h2` | 1.5rem / 1.3 | Section titles |
| `h3` | 1.125rem / 1.4 | Card titles, panel titles |
| `body` | 1rem / 1.6 | Paragraphs |
| `body-sm` | 0.875rem / 1.5 | UI labels, table cells |
| `caption` | 0.75rem / 1.4 | Badges, meta, helper text (min 12px) |

Design Studio fonts (customer artwork) are a separate, curated library — see §11.6.

### 2.3 Spacing, radius, elevation, motion

- **Spacing scale (4px base):** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96. Section padding: 64–96 desktop, 40–48 mobile.
- **Layout grid:** 12 columns, max content width 1280px, gutters 24px desktop / 16px mobile.
- **Radius:** `sm 6px` (chips, inputs), `md 10px` (cards, buttons), `lg 16px` (modals, sheets). Pills only for status badges and filter chips. Not everything is rounded.
- **Elevation:** `e1` 0 1px 2px rgba(23,28,38,.06) (cards on hover), `e2` 0 8px 24px rgba(23,28,38,.10) (popovers, sheets), `e3` 0 16px 48px rgba(23,28,38,.16) (modals). Default cards are flat with a border.
- **Motion:** 150ms (hover, toggles), 200ms (panels, sheets), 250ms (modals). Ease `cubic-bezier(.2,.8,.2,1)`. Respect `prefers-reduced-motion`. No parallax, no auto-rotating 3D on load.
- **Iconography:** Lucide, 1.5px stroke, 20px default (16px in dense lists, 24px in the Studio tool rail).
- **Imagery:** product shots on `#F5F6F8` seamless backgrounds, consistent 4:5 card ratio, one lifestyle image per category banner.

---

## 3. Core components

| Component | Variants / states | Notes |
|-----------|------------------|-------|
| Button | primary, secondary (outline), ghost, destructive · sm 36px / md 44px / lg 52px · loading, disabled | Min target 44×44px. Loading keeps width. |
| Icon button | ghost, outline · with tooltip | Tooltip shows label + shortcut (e.g. "Undo · Ctrl Z"). |
| Option selector | **chip** (text), **swatch** (colour), **tile** (image + label + price delta), **dropdown** (>8 values) | Shows price delta inline ("+₹150"). Out-of-stock values struck through, still focusable with reason. |
| Quantity tier picker | tier cards with per-unit price + savings %, or stepper for free quantities | Replaces the separate "price breaks" table. |
| Price block | live total, per-unit, compare-at, savings, "incl. print", GST note | `aria-live="polite"` announces changes. |
| Product card | image (front, hover = back/mockup), name, short benefit, "from ₹", badges (Bestseller, Customisable, New), quick-view button | Whole card clickable; quick view is a separate button. |
| Filter panel | checkbox groups, price range, chips row on mobile | URL-synced. |
| Search | input + autocomplete popover (products, categories, recent searches) | `combobox` ARIA pattern. |
| Toast | success, info, warning, error, with optional action ("Undo") | Max 1–2 visible; never the only place an error appears. |
| Dialog / Sheet | centred modal (desktop), bottom sheet (mobile), side drawer (cart) | Focus trap, Esc closes, returns focus. |
| Stepper | checkout steps (Contact → Delivery → Payment → Review) | Shows completed steps as editable. |
| Empty state | illustration-free: icon + one sentence + one action | "Nothing on the canvas yet — add text or upload your logo." |
| Skeletons | card, PDP gallery, canvas | Match final layout to avoid shift. |
| Status pill | Confirmed, Printing, Shipped, Delivered, Cancelled, Awaiting payment | Colour + icon + text (never colour alone). |

---

## 4. Global navigation

### Desktop header (72px, sticky, white, bottom border)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ▢ Aaraprint   Products ▾   Business   Events   Gifts   Bulk orders │ [ Search visiting cards, mugs… ⌘K ]  ♡  👤  🛒 2 │
└──────────────────────────────────────────────────────────────────────────────────┘
  Utility strip (32px, subtle grey, dismissible): Free shipping over ₹1,999 · Pay on delivery · Track order
```

- **Products ▾** opens a mega-menu: 11 categories in 3 columns with top sub-types and a thumbnail; right column "Popular right now" (4 products) and "Start from a template".
- Use-case entries (**Business, Events, Gifts**) solve discovery for people who think in occasions, not product types (data already supports this: weddings, invitations, corporate gifts, welcome kits).
- Account menu: Orders, Saved designs, Addresses, Settings, Sign out.
- Cart opens a **drawer** (not a page jump) with line items, design thumbnails, free-shipping progress bar and "Checkout".

### Mobile header (56px)

`☰  Aaraprint  🔍  🛒` — search expands full-width; ☰ opens a full-height sheet with categories as large rows, then account links. A **bottom tab bar is not used** on storefront pages (keeps content space); it is used inside the Studio.

### Footer

Four columns: Shop (categories), Help (Track order, Shipping, Returns, FAQ, Contact), Company (About, Credits, Grievance), Trust (Pay on delivery, secure checkout, GST invoices, 7-day reprint promise). Newsletter field is optional (no evidence it exists today — not required).

---

## 5. Homepage structure

Goal: a visitor understands "custom print and merch, designed online, delivered across India" in under five seconds.

```
1  HERO (2-column on desktop)
   Left:  H1 "Custom printing for your brand and big days"
          Sub: "Design visiting cards, apparel, mugs and signage in your browser. Free shipping over ₹1,999."
          [ Search products… ]            ← primary search field, large
          [Start designing] (primary)  [Browse products] (secondary)
          Trust row: ★ 4.8 reviews · Pay on delivery · Print-checked files
   Right: Calm product collage (card, polo, mug) on soft grey — static images, no autoplay 3D

2  POPULAR CATEGORIES     8 tiles (image + name + "from ₹99"), "View all 11 categories →"
3  BESTSELLERS            Horizontal rail of product cards, real photos only (no "Design pending")
4  HOW IT WORKS           3 steps with small UI snippets: Choose → Design or upload → We print & deliver
5  DESIGN STUDIO PROMO    Split panel: short looping screen capture of the Studio + 4 benefit bullets
                           (templates, live 3D preview, print-safe checks, autosave) + [Try the Studio]
6  SHOP BY OCCASION       Business essentials · Weddings · Birthdays · Corporate gifting · Events
7  TRUST & QUALITY        Paper/stock close-ups, "Free reprint if it's wrong", GST invoice, secure checkout
8  REVIEWS                3 review cards with name, role, product bought; link to more
9  BULK / BUSINESS CTA    "Ordering 500+ units? Get volume pricing" → contact form
10 FOOTER
```

Changes vs. the original: no fake "REG MARK" decoration, no autoplaying 3D shirt, no invitation mini-editor competing with the hero; bestsellers only show products with real images; occasion-based entry points added.

---

## 6. Product listing (category, sub-type, search results)

```
Breadcrumb: Home / Visiting Cards
H1 Visiting Cards  ·  33 products            [Sort: Recommended ▾]
Short intro (1 line)                          Grid / List toggle (desktop)

┌ Filters (sticky, 264px) ┐  ┌ Results grid (3–4 cols) ─────────────────────────┐
│ Type        ☐ Standard  │  │ [card] [card] [card] [card]                      │
│             ☐ Premium   │  │ [card] [card] [card] [card]                      │
│ Finish      ☐ Matte …   │  │ … "Load more" + page numbers (SEO-friendly URLs) │
│ Price       ₹ [  ]–[  ] │  └──────────────────────────────────────────────────┘
│ Delivery    ☐ Dispatch ≤2 days
│ Customise   ☐ Design online  ☐ Upload ready artwork
│ [Clear all]             │
└─────────────────────────┘
Active filter chips row above the grid: [Matte ×] [₹200–₹500 ×]
```

- **Filters are generated from option groups** (Finish, Material, Size, Colour, Capacity, Lid type…) present in the current result set — the catalogue data already has these (see Reconnaissance §4).
- Sort: Recommended, Price low→high, Price high→low, Newest, Name A–Z.
- Sub-types become real filters (the current `?type=` links appear not to change results).
- **Quick view** (desktop modal / mobile sheet): gallery, key options, "from" price, buttons *Customise* and *View details*.
- **Compare** (optional, Phase 4): for visiting cards and drinkware only — stock, thickness, finish, capacity, price for 100/500 units.
- Recently viewed rail at the bottom (local storage).
- Search results page reuses the grid and adds "Did you mean" and category suggestions; zero-result state offers popular categories and a "Request a product" link.

---

## 7. Product detail page

### Desktop (two columns, 7/5 split)

```
Breadcrumb
┌ Gallery (sticky) ───────────────┐  ┌ Purchase panel ───────────────────────────┐
│  Large image (4:5)              │  │ CATEGORY · ★ 4.7 (128)                     │
│  ◻ ◻ ◻ ◻  thumbnails            │  │ H1 Classic Visiting Cards                  │
│  [2D mockup] [3D view] toggle   │  │ 300gsm card · single/two-colour print      │
│                                  │  │                                            │
│                                  │  │ 1  Ink style   (Classic black)(Two-colour +₹8)(Full colour +₹18)
│                                  │  │ 2  Quantity    ┌100┐ ┌250┐ ┌500┐ ┌1000┐   │
│                                  │  │                ₹2.29 ₹1.52 ₹1.26 ₹0.98/card │
│                                  │  │                       –34%  –45%  –57%     │
│                                  │  │ ───────────────────────────────────────── │
│                                  │  │ ₹229  incl. print · GST incl./extra (TBC)  │
│                                  │  │ Dispatch in 2–3 days · Delivery to [560001] by Thu 6 Nov │
│                                  │  │                                            │
│                                  │  │ How do you want to add your design?        │
│                                  │  │ (●) Design online  ( ) Upload print-ready file  ( ) Get it designed (₹149) │
│                                  │  │ [ Start designing → ] (primary, full width)│
│                                  │  │ ✓ Free reprint if it arrives wrong · Pay on delivery │
└──────────────────────────────────┘  └────────────────────────────────────────────┘
Tabs/accordions below: Overview · Print specifications · Delivery & returns · FAQ · Reviews
Rail: Templates for this product · Related products · Recently viewed
```

Key decisions:

- **Numbered option steps** make the order of choices obvious; options that change price show the delta; options that change the SKU vs. options that only affect rendering are flagged in data (see Implementation Plan §6).
- **Quantity tiers merge with the price-break table** (the original shows them separately). Per-unit price and savings sit on each tier.
- **"Batches" stepper** (original: multiplies a tier) is renamed "Number of sets" and only appears when a product allows it.
- **Three ways to provide artwork** are explicit (the original only exposes "Design it"; FAQ mentions uploads; *Design Services* and *Logo Maker* exist as separate products). "Upload print-ready file" opens the Studio in "Upload" mode with one big drop zone.
- When a saved design is attached (`?designId=`), the panel shows a design thumbnail, "Edit design" and "Add to cart" becomes primary.
- **Print specifications** shown in human terms ("Finished size 8.9 × 5.1 cm, 3 mm bleed, keep text 2 mm inside the edge") with the raw px/DPI in an expandable "For designers" row.
- Sticky mobile buy bar: price + primary button.

---

## 8. Cart and checkout

### Cart drawer / page

- Line item: design thumbnail (front/back toggle), product name, chosen options as chips, quantity tier, unit + line price, *Edit design*, *Duplicate*, *Remove* (with Undo toast).
- Free-shipping progress: "Add ₹420 more for free shipping" bar (threshold ₹1,999; flat ₹99 below, per the shipping policy).
- Order summary: subtotal, shipping, GST, discount code field (privacy policy mentions discount codes), total.
- Warnings shown on the line item if a design has open print issues.

### Checkout (single page, 4 collapsible steps)

```
1 Contact      Email / phone (guest) or signed-in summary        [Sign in for faster checkout]
2 Delivery     Address form with PIN-code lookup (auto-fill city/state), saved addresses for members
               Delivery estimate per PIN code
3 Payment      (●) Pay on delivery   ( ) Pay online — UPI, card, netbanking (Razorpay)*
4 Review       Items + design thumbnails, "I've checked spelling and layout" confirmation, Place order
Right column (desktop): sticky order summary
```
\*Online payment is referenced in the Privacy and Terms pages but every product page says "no payment collected online". Treat online payment as **to be confirmed** (Reconnaissance §11).

Order confirmation: order number (format observed `NX…-…`), what happens next timeline (Confirmed → Printing → Shipped → Delivered), "Create an account to track this order" for guests, "Download proof".

---

## 9. Account dashboard

```
Sidebar (desktop) / top tabs (mobile): Overview · Orders · Saved designs · Addresses · Settings

Overview: last order status card, "Continue your design" card (most recent draft), quick links
Orders:   list with status pills, search by order no., filters (status, date)
          Order detail: timeline, items with proofs, invoice download, tracking link, Cancel (only when Confirmed), Reorder
Saved designs: grid of thumbnails with product, last edited, status (Draft / Ordered)
          actions: Open in Studio, Duplicate, Rename, Use on another product (if compatible), Delete (confirm)
Addresses: cards with default badge, add/edit in a sheet with PIN lookup
Settings: name, email, phone, password, Google link, delete account (DPDP Act request)
```

---

## 10. Order tracking (public)

Two fields (order number + email used at checkout) → result card with status timeline, courier + tracking number + "Track with courier" link, items, totals, help links. Matches the original data (`trackOrder` returns status history, courier, tracking number, items, GST, subtotal, shipping).

---

## 11. Design Studio — complete layout

### 11.1 Desktop layout (≥1280px)

```
┌ TOP BAR (56px) ─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to product │ "Riya's visiting card" ✎ ▾ │ ● Saved │ ↶ ↷ │ − 100% + ⤢ │ Front | Back │ 👁 Preview │ ⬇ Proof │ [Continue →] │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
┌ RAIL ┐┌ PANEL (320px, collapsible) ┐┌ WORKSPACE ─────────────────────────────┐┌ INSPECTOR (300px) ┐
│ ▦ Templates                        ││                                        ││ Selected: Text    │
│ T Text     │ Search templates…     ││      ┌─────── bleed ───────┐           ││ Font  [Inter ▾]   │
│ ⇪ Uploads  │ [Minimal][Bold]…      ││      │ ┌──── trim ──────┐ │           ││ Size  [24] B I U  │
│ ◇ Graphics │  ▢ ▢ ▢                ││      │ │ ┆ safe zone  ┆ │ │           ││ Colour ● ● ● +    │
│ ▭ Shapes   │  ▢ ▢ ▢                ││      │ │ ┆  YOUR NAME ┆ │ │           ││ Align ≡ ≡ ≡       │
│ ▣ QR code  │                       ││      │ └────────────────┘ │           ││ ▸ Spacing & curve │
│ ◐ Background                       ││      └────────────────────┘           ││ ▸ Position & size │
│ ⚙ Product  │                       ││   [contextual toolbar above selection]  ││ ▸ Effects         │
│ ─────      │                       ││                                        ││ ─────────────     │
│ ? Help     │                       ││   Print checks: ✓ text inside safe zone ││ Layers  (5)       │
└────────────┘└──────────────────────┘└────────────────────────────────────────┘└───────────────────┘
```

| Region | Contents | Behaviour |
|--------|----------|-----------|
| **Top bar** | Back to product, design name (inline rename) + project menu (My designs, Duplicate, Rename, Version history), save status, undo/redo, zoom (− % + / fit), side switcher (Front/Back/Inside/Flap… from product config), Preview (2D/3D), Download proof, **Continue** | Status states: *Saving…*, *Saved*, *Saved on this device*, *Offline — changes kept on this device*, *Couldn't save — retrying*. |
| **Tool rail** (64px) | Templates, Text, Uploads, Graphics, Shapes, QR code, Background, Product options; Help at bottom | Icons + labels. Tables move to "Text → Add table" (rare use). |
| **Panel** (320px) | Content of the selected tool | Collapses to give the canvas room; remembers last tool. |
| **Workspace** | Product mockup or flat canvas, trim/bleed/safe guides, contextual toolbar, print-check strip | Zoom 10–400%, fit-to-screen, space+drag / middle-drag pan, pinch on trackpad. |
| **Inspector** (300px) | Properties of selection in grouped, collapsible sections; Layers list below | Empty state: "Select something on the canvas to edit it — or add text from the left." |

### 11.2 Canvas & guides

- Trim, bleed and safe zone drawn from product print config (`canvasWidthPx`, `canvasHeightPx`, `dpi`, `bleedPx`, `safeZonePx`, `trimShape` rectangle / rounded / circle / oval).
- Guides toggle (`Ctrl ;`), rulers in mm/cm (optional), "Show print area only" toggle that hides the product mockup.
- **Smart guides & snapping** (absent in the original): snap to canvas centre, safe-zone edges, other elements' edges/centres; equal-spacing indicators; hold `Alt` to disable snapping.
- **Multi-select** (shift-click, drag marquee) with align/distribute (absent in the original).
- Arrow keys nudge 1px, Shift+arrow 10px (kept from original).
- Elements outside the safe zone get an amber outline and an inline badge; outside trim gets red.

### 11.3 Contextual toolbar (floats above selection)

| Selection | Quick actions |
|-----------|---------------|
| Text | Font, size, colour, bold, align, *More ▸* |
| Image | Replace, Crop, Fit/Fill, DPI badge (e.g. "142 DPI ⚠"), *More ▸* |
| Shape | Fill, border, corner radius |
| Any | Duplicate, Lock, Delete, Layer up/down |
| Multiple | Align (6), Distribute, Group |

### 11.4 Tool panels

| Tool | Beginner view (default) | Advanced (progressive disclosure) |
|------|-------------------------|-----------------------------------|
| **Templates** | Filter chips by style (Minimal, Bold, Elegant, Floral, Photo); grid of thumbnails rendered on the real product; "Blank" first | Search; "Apply to front only / both sides"; confirm dialog before replacing (with Undo). |
| **Text** | Presets: Heading, Subheading, Body, "Name + title" pair; recently used styles | Add table, text on a curve (arc top/bottom with radius slider), letter spacing, line height. |
| **Uploads** | Large drop zone ("Drop your logo or photo here · PNG, JPG, SVG, WEBP · up to 20 MB"), recent uploads grid | Placement mode (Fill product / Fit inside safe area), background removal (Phase 4), one-colour tint for logos. |
| **Graphics** | Searchable icon & illustration library grouped (Business, Contact, Celebration, Badges, Backgrounds) | Recolour SVG parts. |
| **Shapes** | Rectangle, rounded rectangle, circle, line, triangle, star, arrow, badge | Border width/style, corner radius, opacity. |
| **QR code** | Type selector (Website, Phone, Email, WhatsApp, UPI, Text), live preview, "Add to design" | Colour, quiet-zone, error-correction level; scan-safety warning if too small (<2 cm) or low contrast. |
| **Background** | Colour swatches + product colours + recent colours; "Extend to bleed" automatically | CMYK input, image background. |
| **Product options** | Same option groups as the PDP (colour, size, cap type, orientation…), live price | Part recolouring (mug body/handle/inside, pen barrel/clip, bottle body/cap), envelope window, pocket style. |

### 11.5 Inspector sections

1. **Content** (text box or image preview with Replace)
2. **Style** — font, size, weight, italic, colour, alignment (text); tint/opacity (image); fill/stroke (shape)
3. **Position & size** (collapsed) — X, Y, W, H in mm with lock-ratio, rotation, "Centre on canvas", "Fit to safe area"
4. **Effects** (collapsed) — opacity, curve, letter/line spacing
5. **Layers** — drag to reorder, visibility (true hide, not opacity 0), lock, rename, delete

### 11.6 Fonts for artwork

The original offers only 7 system fonts (Arial, Georgia, Courier New, Times New Roman, Verdana, Trebuchet MS, Impact) while its templates are authored in Plus Jakarta Sans and Fraunces, which then fall back. The new Studio ships a curated, licence-safe library (≈30 Google/OFL fonts) grouped as *Modern sans*, *Classic serif*, *Display*, *Script*, *Monospace*, and **Indian scripts** (Noto Sans/Serif Devanagari, Tamil, Bengali, Gujarati, Telugu, Kannada, Malayalam, Gurmukhi). Fonts load on demand and are embedded in proofs/print files.

### 11.7 Print checks (preflight)

A strip under the canvas and a full list in the review modal:

| Check | Severity | Message example |
|-------|----------|-----------------|
| Text/logo outside safe zone | Warning | "‘+91 98…’ is 1.2 mm from the edge and may be trimmed." → *Move inside* |
| Element outside trim (not background) | Warning | "Part of this image will be cut off." |
| Image below product DPI | Warning (<75% of target) / Error (<40%) | "Photo prints at about 120 DPI — it may look blurry." → *Replace* |
| Background doesn't reach bleed | Warning | "Extend background to the edge?" → *Fix* |
| Placeholder text left (e.g. "[Your Name]") | Error | "Replace the sample text before ordering." |
| Empty side that is paid for | Info | "The back is blank. Print one side instead?" |
| QR code too small / low contrast | Warning | — |
| Text overflowing its box | Warning | (original has this) |

Errors block **Approve**, warnings require ticking "I understand".

### 11.8 Preview & approval flow

1. **Preview** button opens a full-screen review: 2D mockup per side, 3D view where supported, zoom to 100% "actual print" view.
2. Print-check list with fix buttons.
3. Checkbox: "I've checked spelling, phone numbers and layout."
4. Buttons: *Download proof (PDF/PNG)* · *Keep editing* · **Approve & add to cart** (or *Approve & return to product* when options still need choosing).
5. Guest users can approve and add to cart **without signing in** (design saved to an anonymous server session); sign-up is offered after, not forced (the original forces sign-in here, which conflicts with its own guest-checkout FAQ).

### 11.9 Saving, history and recovery

- Local autosave to IndexedDB on every committed change (debounced 500 ms); cloud save every ~5 s when signed in and dirty, plus on blur/close.
- **Version history** panel: automatic snapshots (every 5 minutes of active editing and before template replace / side copy) + named versions; restore creates a new version.
- Undo/redo up to 100 steps, history survives reloads (stored with the draft).
- Leaving with unsaved cloud changes shows the standard "unsaved changes" prompt (original does this).
- After sign-in the draft is restored automatically with a toast "Your design is back".
- Designs opened from another account are read-only with a clear "Make a copy" action.

### 11.10 Keyboard shortcuts (shown in Help → Shortcuts and tooltips)

| Action | Shortcut |
|--------|----------|
| Undo / Redo | Ctrl Z / Ctrl Shift Z, Ctrl Y |
| Duplicate | Ctrl D |
| Delete | Delete / Backspace |
| Copy / Paste | Ctrl C / Ctrl V (also paste images from clipboard) |
| Group / Ungroup | Ctrl G / Ctrl Shift G |
| Nudge | Arrows (1 px) · Shift + arrows (10 px) |
| Zoom in / out / fit | Ctrl + / Ctrl − / Shift 1 |
| Pan | Space + drag |
| Deselect | Esc |
| Add text | T |
| Toggle guides | Ctrl ; |
| Save now | Ctrl S |
| Preview | P |

### 11.11 Onboarding & help

- First visit: 3-step coach marks (Tools → Canvas → Continue), skippable, never shown again.
- Empty canvas: centred card "Start with a template, add text, or drop your logo here" with three buttons.
- Tooltips on every icon (label + shortcut), 400 ms delay.
- "Print tips" link in Help: bleed/safe zone explained with a small diagram.

### 11.12 Destructive-action safety

| Action | Protection |
|--------|-----------|
| Replace with template | Confirm dialog + Undo toast |
| Clear side | Confirm + Undo |
| Delete element | Undo toast (no dialog) |
| "Same design on both sides" overwriting a side | Confirm with *Replace* / *Keep both* (kept from original) |
| Delete saved design (account) | Confirm dialog, type-free |
| Leave Studio | Only prompts if cloud save pending |

---

## 12. Product-specific Studio modes

The Studio is one engine with **mode presets** driven by product configuration (details in the Implementation Plan):

| Mode | Products | Workspace | Extra panel options | 3D preview |
|------|----------|-----------|---------------------|-----------|
| Flat print | Cards, flyers, letterheads, labels, posters, invitations | Flat canvas with trim/bleed/safe; rounded/circle/oval trims | Orientation, size, sides | Card/sheet with thickness, flip |
| Folded / multi-panel | Folders (pockets), envelopes (front/back/flap), notebooks & diaries (covers + inside), booklets | Panel tabs (Cover front, Cover back, Inside, Pocket…) and an "opened flat" view | Fold, pocket style, window | Book/flap opening |
| Apparel | Polos, T-shirts, shirts, hoodies, jerseys, caps, bags, rainwear | Product mockup with print box per placement (left chest, back, sleeve) | Garment colour, size, print vs embroidery | Polo GLB model; others 2D front/back |
| Wrap | Mugs, bottles, tumblers, flasks, pens | Unwrapped rectangle + live wrap preview side-by-side | Part colours (body/handle/inside/cap), cap type, capacity | Cylinder with texture |
| Umbrella | Umbrellas | Panel-based canopy layout (repeat on panels) | Canopy colour, panel repeat | Cone/canopy |
| Box & packaging | Mailer boxes, tuck boxes, bags | Dieline view (faces) + 3D | Board, finish | Box |
| Stamp | Self-inking / rubber stamps | Impression area, mirrored-print note | Ink colour, size, preset text | Stamp body |
| Gift (perspective) | Frames, cushions, magnets, coasters, calendars, mouse pads, phone cases | Mockup with perspective face; "On product / Flat" toggle | Frame/base colour, size | Where supported |

---

## 13. Mobile UX

### 13.1 Storefront

- Single column, sticky header 56px, search as full-screen overlay with recent + popular searches.
- Category grid 2-up; product cards 2-up with large tap targets; filters in a bottom sheet with "Show 24 results".
- PDP: swipeable gallery (dots + count), options stacked, **sticky bottom bar** with price + "Start designing" / "Add to cart".
- Cart is a full-screen page; checkout steps as an accordion; numeric keyboards for phone/PIN; autofill attributes set.

### 13.2 Design Studio on phones (<768px)

```
┌ Top bar 52px: ←  Name ▾   ● Saved   ↶ ↷   [Next] ┐
│                                                   │
│            Canvas (fills screen, fit to width)    │
│            pinch = zoom, two-finger drag = pan    │
│            tap = select, drag = move              │
│                                                   │
│   ┌ Contextual pill above selection ┐            │
│   │  Edit  Font  Colour  ⋯           │            │
├───────────────────────────────────────────────────┤
│ Bottom tool bar 64px: Templates Text Upload Graphics Options ⋯ │
└───────────────────────────────────────────────────┘
Tools open as bottom sheets (peek 40% / expand 90%); canvas stays visible above the sheet.
```

- Text editing opens a full-width input sheet (avoids editing tiny text on canvas under the keyboard).
- Handles enlarged to 24px touch targets; rotation via a dedicated handle and a slider in the sheet.
- Side switcher as a segmented control under the top bar.
- Layers and advanced properties inside "⋯ More".
- Orientation change keeps zoom relative to fit.

### 13.3 Tablet (768–1279px)

- Rail + collapsible panel on the left; inspector becomes a right drawer that opens on selection (overlays canvas, doesn't push).
- Touch + pencil friendly: same gestures as phones.

### 13.4 Breakpoints

| Name | Width | Storefront | Studio |
|------|-------|-----------|--------|
| `sm` | <640 | 1 col, 2-up cards | Bottom bar + sheets |
| `md` | 640–1023 | 2–3 cols, filter sheet | Rail + panel overlay, inspector drawer |
| `lg` | 1024–1279 | 3 cols + filter sidebar | Rail + panel, inspector drawer |
| `xl` | ≥1280 | 4 cols | Full 4-region layout |

Modals: centred ≤ 560px on desktop; bottom sheets on phones; full-screen for preview/review on phones.

---

## 14. Accessibility (WCAG 2.2 AA)

- Colour tokens meet AA (see §2.1); never rely on colour alone (status pills have icon + text).
- Focus visible on everything (2px accent + offset); logical tab order; skip link.
- All interactive targets ≥ 24×24 CSS px (WCAG 2.5.8), primary actions ≥ 44px.
- Forms: visible labels, error text linked via `aria-describedby`, errors summarised at top on submit, input `autocomplete` tokens.
- Live regions for price changes, save status and toasts.
- **Studio:** every canvas element is mirrored in the Layers list as a keyboard-operable list (select, move with arrows, edit properties in the inspector), so the design can be built without a pointer. Canvas has `role="application"` with instructions. Announcements for "Moved 10px right", "Text outside safe zone".
- Reduced-motion: disable 3D auto-rotate, sheet springs and hover zooms.
- Language: `lang="en-IN"`; currency formatting with `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})`.
- Alt text for every product image (from product name + view, e.g. "Classic polo, navy, back").

---

## 15. Customer-journey improvements (summary)

| Journey | Original friction (observed) | New experience |
|---------|------------------------------|----------------|
| Discover product | 11 categories, sub-type links that don't filter, many products without images ("Design pending", Unsplash stock) | Mega-menu, occasion entries, working filters from option data, real mockups only, autocomplete search |
| Choose options | Options and price-break table are separate; "Batches" unclear | Numbered steps, tiers with per-unit price/savings, clear sets stepper |
| Start design | Only "Design it" | Three artwork paths: Design online · Upload file · Get it designed |
| Design | 7 system fonts, no snapping, no multi-select, no crop, hide = opacity | Curated fonts incl. Indic, smart guides, multi-select, crop, real visibility |
| Save as guest | Forced login on "Approve and continue" | Approve and add to cart as guest; optional account afterwards |
| Review | Good 2D/3D review, DPI warnings | Same plus preflight with one-click fixes and placeholder detection |
| Cart → Checkout | Not inspectable (requires a cart) | Drawer cart, free-shipping progress, single-page checkout with PIN lookup |
| After order | Track by order no. + email | Same, plus timeline, proofs, reorder, invoices in account |

---

## 16. Open design questions for the business

1. Is online payment (Razorpay) live or planned? Product pages say "no payment collected online".
2. GST: are listed prices inclusive or exclusive? (Track-order shows a separate GST line.)
3. Do we want reviews/ratings now (needs moderation) or later?
4. Should "Design Services" and "Logo Maker" stay as products or become a service flow attached to any product?
5. Brand assets: keep the current Aaraprint logo (`/brand/logo-color.svg`) or refresh it alongside the new UI?
