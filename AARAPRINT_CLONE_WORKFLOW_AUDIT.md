# Aaraprint Clone Workflow Audit

**What this is.** An independent, evidence-based reverse-engineering of the **original** Aaraprint workflow (`http://200.234.38.165/`), done with the `clone-website` skill's method: map, observe, compare (its "build" step was deliberately skipped). It specifies how our Vite + React Router app must **behave**; the UI can be redesigned freely.

**Audit date:** 11 Nov 2026. **Our repository state compared:** `ca3c819` (Phase 4 M1–M4 + workflow spec). No source, data or asset files were changed; nothing was committed.

**Evidence labels used throughout**

| Label | Meaning |
|---|---|
| **LIVE** | Observed on the live original in a real Chrome browser (Playwright), guest only. |
| **SOURCE** | Read as text from the recovered bundles in `../recovered/_next/static/chunks/`. The live site serves the **same chunk file names** (18/18 Studio chunks matched), so the recovered code is the code that runs live. |
| **INFERRED** | Reasoned from LIVE + SOURCE together; not directly seen. |
| **UNKNOWN** | Not observable without a write (account, cart, order) and not settled by source. |

**Safety.** Every browser session aborted all non-GET requests at the network layer and logged them. **Zero** write requests were attempted by the site during any run (all `blocked-writes` logs are empty). No account was created, nothing was added to a cart, no sign-in, no order. Local browser storage (IndexedDB/sessionStorage) in throw-away browser profiles was the only thing written.

**Evidence folder:** [docs/research/aaraprint-original/](docs/research/aaraprint-original/) — `screens/` (346 PNG screenshots) and `survey-shots/` (one Studio-initial JPEG per product, 532), `notes/` (JSON step logs), and [product-matrix.md](docs/research/aaraprint-original/product-matrix.md) (all 533 products, one row each).

---

## 1. Executive summary

The original is a **product-first** design tool with a **single, consistent entry** and a **single, consistent exit**:

1. **Entry (LIVE, 532 of 533 products — only the accessory `card-accessory-metal-holder` has no Design it):** every customisable product page has **Design it** → a dialog "*Please select all required options.*" with **Product Orientation\*** (Horizontal default) and, for products with quantity tiers, a **Quantity** select → **Next** → `/products/{slug}/design?orientation=…&variantId=…`.
2. **Studio (LIVE, 532/532):** opens on the product in one of **five workspace types** (photo frame, perspective "On product", polo stage, gift photo frame, flat print area), and for **455 of 532 products (86 %)** opens on a **Product options** panel (73 open on Text, 4 letterheads on Uploads) whose choices are real ordered choices (colour, size, lid, print placement, ink, pockets…). Many change the **price in the top bar and the ordered variant**, are **saved inside the design** and are **undoable**.
3. **Exit (LIVE):** **Next → "Review your design"** (product preview per side, element counts, 2D/3D, blurry-image alert, Download proof, Continue editing) → **Approve and continue** → a guest is sent to **sign in** with the effective `variantId`; a signed-in user (SOURCE) goes to the **product page with `designId`**, which shows "*Your design is attached and ready to order.*" → **Add to cart**.

**Our app** has a strong editing engine, but its workflow differs from the original at every one of these three points: no entry dialog, a flat-first Studio that opens on Templates with no Product options, product choices not in the design document, and **Continue is a placeholder**.

**New findings this audit adds** (beyond `AARAPRINT_WORKFLOW_SPEC.md`):
- The **Studio price is `base price + Studio option deltas`**, not the selected variant's price: a 500-card tier (₹629 on the product page) shows **₹229** in the Studio (LIVE + SOURCE).
- **Two classes of priced Studio options behave differently** (LIVE):
  - *Variant options* (umbrella/rainwear colour; drinkware lid; the large "sign/poster" group = signs, posters, labels, packaging, **t-shirts, caps, bags**; stamps) change the ordered variant, are saved and undoable.
  - *Stationery options* (envelope size, invitation size/fold, folder pockets) change only the displayed price, are **not** passed to the variant, **not** saved (price resets on reload) and their price **is not undone** by Undo. This is an inconsistency **in the original**, not a rule to copy (decision B1).
- The "*Couldn't save this design on your device*" error is **not** an IndexedDB/automation issue (as the previous spec stated) but a **deployment defect**: the original is served over plain HTTP, so `crypto.randomUUID` is unavailable and every guest local save fails. With the origin treated as secure, local save works (LIVE). **Our production must be HTTPS.**
- **Curved text exists only for stamps**, not as a general text feature (SOURCE).
- **Selection is single-element only**; there is no multi-select, grouping or snapping in the original (SOURCE).
- **Apparel, caps, bags, labels, packaging and most signs start with "Same design on both sides" ON** (LIVE: 187 products), so the back mirrors the front by default. Perspective gifts and stamps have no such switch.
- Several families open with **seeded sample artwork** (stamps, many gifts, calendars, coasters) (LIVE).
- The product page shows "*Your design is attached*" for **any** `designId` in the URL, even a made-up one (LIVE).

---

## 2. Original workflow (end to end)

```
Category / search ─▶ Product page
   options (radio chips "included" / "+ ₹X") · Quantity or "Batches" stepper · live price
   [Add to cart]   [Design it]
                       │
                       ▼
   Dialog "Please select all required options."
     Product Orientation*  (Horizontal | Vertical; resets to Horizontal every time)
     Quantity              (only when the product has ≥ 2 numeric quantity tiers)
     [Next]
                       │  /products/{slug}/design?orientation={o}&variantId={v}[&designId={d}]
                       ▼
   Studio  (workspace by family · Product options first for most products)
     edit artwork per side · change product options (price/variant/saved/undoable)
     autosave 2.5 s after a change (guest: this browser; signed in: account)
     [Next]
                       │
                       ▼
   Dialog "Review your design"  [Download proof] [Continue editing] [Approve and continue]
                       │
          ┌────────────┴───────────────┐
        guest                        signed in (SOURCE)
   save locally; set restore flag   save to account (must succeed)
   toast "Sign in to save and       /products/{slug}?designId={d}&variantId={effective}
   continue with your design."      "Your design is attached and ready to order." [Edit]
   /login?redirect=/products/{slug}/design?variantId={effective}
          │                              │
   after sign-in: Studio restores        ▼
   "Your design is back — save it      [Add to cart] → cart drawer → checkout (UNKNOWN)
    to your account." → Next → Approve
```

All arrows above are LIVE except the signed-in branch (SOURCE) and checkout (UNKNOWN).

---

## 3. Product entry workflow

### 3.1 Product page (LIVE + SOURCE `40mjs_h36bgnb.js`)

| Element | Behaviour |
|---|---|
| Option groups | Radix radio chips, each value shows "included" or "+ ₹X". Selecting changes the variant and the price. |
| Initial selection | From `?variantId=` if present (LIVE: `?variantId=<navy>` pre-selected Navy), else the default variant. |
| Quantity stepper | 1–99. Labelled **Batches** when the product has quantity tiers (LIVE: visiting cards "₹229 × 2 batches" = ₹458), else **Quantity**. Price = variant price × stepper. |
| Price breaks | When tiers exist: "Quantity price breaks" table (per unit, total, savings %, Choose) and a "Bulk pricing (N+)" link. |
| Add to cart | Server action `addToCart({productId, variantId, quantity, savedDesignId})` → cart lines set → cart drawer opens → toast "Added to cart" (SOURCE). **Not gated on having a design** (SOURCE): a customisable product can be added without designing. Not exercised live (write). |
| Design it | Opens the required-options dialog (only when `isCustomizable`; 532/533 products — LIVE; `card-accessory-metal-holder` has none). |
| Design attached | With `?designId=` the panel shows a green banner "*Your design is attached and ready to order.*" + **Edit** (→ `/products/{slug}/design?variantId=…&designId=…`). LIVE: shown even for a fabricated id (no validation on display). Evidence: `screens/misc-product-with-designid.png`. |

### 3.2 Required-options dialog (LIVE on all 532 customisable products; SOURCE `40mjs_h36bgnb.js` ≈ 9 500–12 300)

| Question | Answer |
|---|---|
| Does a dialog appear? | **Yes, for every customisable product** (532/532). |
| Title / text | Product name; "Please select all required options." |
| Orientation | **Product Orientation\*** — Horizontal / Vertical buttons; **Horizontal pre-selected; resets to Horizontal every time the dialog opens** (SOURCE). |
| Quantity | A select **only** when the product has ≥ 2 numeric quantity tiers: items "250 pcs (₹349)", default = the tier selected on the page; footer "*250 pcs — starting at ₹349*". Choosing a tier also updates the page selection (SOURCE). |
| Other options | None. Colour/size/etc. are chosen on the product page or in the Studio. |
| Validation | None needed; both fields always have a value. |
| Next | `router.push('/products/{slug}/design?orientation={o}&variantId={variant(page options + tier)}[&designId]')`. |
| URL stored | `orientation`, `variantId`, and `designId` when a design is attached. Quantity is folded into `variantId` (LIVE: 500 cards → different variantId). The **Batches** count is not carried. |
| Close | X closes; nothing stored. |

**What orientation does (LIVE samples):** visiting card vertical → Studio **5.1 × 8.9 cm** (swapped from 8.9 × 5.1); poster vertical → unchanged 30.5 × 45.7 cm; umbrella → ignored. Invitations/greeting cards also have an orientation choice **inside** the Studio (SOURCE `isCardOrientationProduct`). For all other products the effect is UNKNOWN (only the three samples were driven vertically). **Orientation is dropped** from the Approve redirect URL (LIVE).

Evidence: `screens/flow-umbrella-02-dialog.png`, `screens/tier-card-dialog-500.png`, `notes/smoke-*.json`.

---

## 4. Required-options behaviour by product (LIVE, survey of 533)

Counts measured live per category (each product opened and its dialog read):

| Category | Products | Design it | Dialog shown | Orientation* | Quantity select | Reached Studio |
|---|---|---|---|---|---|---|
| clothing-caps-bags | 65 | 65 | 65 | 65 | 24 | 65 |
| custom-polo-t-shirts | 43 | 43 | 43 | 43 | 0 | 43 |
| drinkware | 48 | 48 | 48 | 48 | 7 | 48 |
| labels-stickers-packaging | 60 | 60 | 60 | 60 | 60 | 60 |
| mugs-albums-gifts | 46 | 46 | 46 | 46 | 1 | 46 |
| pens | 49 | 49 | 49 | 49 | 49 | 49 |
| signs-posters-marketing-materials | 69 | 69 | 69 | 69 | 44 | 69 |
| stamps-and-ink | 17 | 17 | 17 | 17 | 0 | 17 |
| stationery-letterheads-notebooks | 68 | 68 | 68 | 68 | 68 | 68 |
| umbrellas-rainwear | 35 | 35 | 35 | 35 | 27 | 35 |
| visiting-cards | 33 | 32 | 32 | 32 | 27 | 32 |
| **Total** | **533** | **532** | **532** | **532** | **307** | **532** |

Rule (SOURCE; checked against the catalogue option data for all 532 products: **532 agree, 0 disagree**): the Quantity select appears exactly when the product has an option group named "Quantity" with ≥ 2 numeric values; otherwise the dialog asks only for orientation.

Per-product detail (quantity tiers offered in the dialog, first tier and price) is in [product-matrix.md](docs/research/aaraprint-original/product-matrix.md), column "Dialog qty tiers".

---

## 5. Studio state machine

### 5.1 Initial state (LIVE 532/532 + SOURCE `10tigen5gn4-f.js` ≈ 462 900)

**Initial tool** (SOURCE): `"product-options"` for pens, mugs, drinkware, umbrellas/rainwear, the sign/poster group, polo, gift profiles (photo frames, perspective gifts, stamps), the round mouse pad, and these stationery products with format panels: `stationery-envelope-dl` (only this envelope), `invitation-wedding-classic`, `invitation-birthday-fun`, `invitation-corporate-event`, compliment slips, the four folder products (`stationery-presentation-folder(s)`, `stationery-ring-binder-file`, `stationery-presentation-file-pocket`) and the card-orientation products (invitations/announcements/cards with an in-Studio orientation choice); `"uploads"` when the slug contains `letterhead`; otherwise `"text"`. LIVE confirmed per product in the matrix ("Opens on").

**Initial workspace** — five types (LIVE; see §7 and §8):

| Workspace | What the stage is | View switch | Families |
|---|---|---|---|
| **Photo frame** | The product photo; print area marked on it; "Upload design" button on the print area | none (no flat mode) | umbrellas, rainwear, drinkware, pens, mugs |
| **Gift photo frame** | Product photo drawn in the canvas, print area + Safety Area/Bleed legends, size presets + **Apply size**, product part colours | none | coasters, magnets, round mouse pad, photo frames, albums, some calendars |
| **Perspective "On product"** | Artwork warped onto the product photo face; "Edit product — front side" | **On product** (default) / **Flat artwork** (stamps: **Seal design**) | signs, posters, flyers, banners, labels, stickers, packaging, t-shirts, hoodies, shirts, caps, bags, many gifts/calendars, stamps |
| **Polo stage** | Drawn polo (front/back) with feature overlays | **2D Edit / 3D Preview** in the top bar | all polos |
| **Flat print area** | The print area at print size with **Safety Area** and **Bleed** legends | **2D Edit / 3D Preview** (most) | visiting cards, letterheads, invitations, envelopes (+flap), notebooks/diaries (covers/inside), folders (covers/pockets), mouse pads (rect), ID cards, etc. |

### 5.2 States and transitions

| State | Entered by | Shown (top bar status, LIVE + SOURCE) | Leaves by |
|---|---|---|---|
| Loading | URL | — | product + config loaded |
| Clean (guest) | load / after save | **Local draft** | any edit or option change |
| Clean (signed in) | load / after save | *(empty)* | any edit |
| Dirty | edit, option change, undo/redo | **Unsaved changes** | autosave (2.5 s) or Save now |
| Saving | autosave/Save now/Approve | **Saving…** (Next shows "Saving…" and is disabled) | success / error |
| Saved | save success | **Saved on this device** (guest) / **Saved** (signed in) | next edit |
| Save error | save failure | **Couldn't save — retrying** (red); retries at 5 s·2ⁿ⁻¹ ≤ 60 s and on `online` | success |
| View only | `designId` of another user | **View only — not saved**; toast | Approve blocked with message |
| Review | **Next** | Review dialog | Continue editing / Approve |
| Approving (guest) | Approve | save → toast → redirect to `/login` | — |
| Approving (signed in) | Approve | save must succeed ("*Save all changes successfully before continuing.*") → product page | — |
| Exit | **Exit** | — | → `/products/{slug}` (LIVE; variant not kept in URL) |

`beforeunload` warns when dirty (SOURCE).

### 5.3 Top bar, rail and canvas (LIVE)

- **Top bar:** Exit · logo · design name (editable) · project menu (**My projects, Rename project, Duplicate design, Download proof**) · **Save now** (cloud icon) · **Open saved designs** (clock) · Undo · Redo · **2D Edit** [/ **3D Preview**] · "{Product} · {size}" · price tag · status · **Next**.
- **Rail:** **Product options** (when the family has one) · Text · Uploads · Graphics · Background · Templates · More.
- **Canvas:** side tabs (Front/Back, or Front/Back/Flap, Cover Front/Cover Back/Inside Page, Cover Front/Cover Back/Pocket Inside, Front View/Back View for stamp photos); **Same design on both sides** switch (clothing/caps/bags, labels/packaging, most signs; ON by default); **On product / Flat artwork** (or Seal design); **Upload design** on the empty print area ("Fills the product face" on perspective); side thumbnails under pens and mugs; zoom − % + and fit.
- **Right panel:** properties of the selected element and **Layers**.

---

## 6. Product options system

### 6.1 Three kinds of Studio option (LIVE + SOURCE)

| Kind | Examples (LIVE) | Price in Studio | Ordered variant / SKU | Saved in design | Undo |
|---|---|---|---|---|---|
| **A. Variant options** | umbrella canopy colour; rainwear colour; drinkware **cap/lid type** (Screw incl., Flip +₹15, Sipper +₹10); sign/poster group: **Size**, **Print Placement** (t-shirt Front & Back +₹150), Colour, Board weight (box 400 GSM +₹50); stamp **ink colour**, **preset text** (Custom Text +₹30), **diameter** (2" +₹60) | **changes** (t-shirt XL ₹399→₹429→Front&Back ₹579; bottle Flip ₹269→₹284; poster 18×24 ₹499→₹649; stamp Custom ₹299→₹329) | **changes** — Approve redirect carried a new `variantId` in every case (umbrella Red, t-shirt, bottle, poster, cap Navy, stamp) | **yes** (`umbrellaRainwear{colorLabel,color}`, `signPoster{color,colorLabel,options{Size,Colour…}}`, `drinkware{capType,…}`, stamp selection) — t-shirt XL/Navy and price survived reload | **yes** — t-shirt XL→S ₹399, bottle Flip→Screw ₹269, umbrella Red→Black |
| **B. Stationery format options** (need **Confirm selection**) | envelope size (DL incl., #10 +₹42, C5 +₹63, 19×12, 14.6×11); invitation size (15.2×22.9 +₹125), fold (Folded +₹180), orientation; folder pockets (Double +₹80) | **changes** after Confirm (₹349→₹391; ₹599→₹904; ₹699→₹779) | **does NOT change** (Approve kept the original `variantId`) | **only the resized canvas**; the choice and price are lost on reload (₹391→₹349 while the canvas stays #10) | canvas size undone, **price not undone** (₹391 stays) |
| **C. Part / substrate colours and features** | mug body/handle/inside & rim (12 + custom); pen body/clip/tip/click button (12 + custom); bottle body & cap colour; gift "product finish / edge", "back fabric", "spine & binding / cover", "stitched rim / pad surface"; stamp body (16 + custom); **substrate colour** (paper, sticker, fabric, board…) on perspective products; polo body/collar/feature colours, Extra feature 1/2 | none | none (exception: a bottle body colour that matches a colour option group is folded into the variant — SOURCE `drinkwareVariantFor`) | **yes** ("*saved with the design as a production reference*"; custom colour "*saved with the design as the colour to produce*") | **yes** (mug body Red → Undo → Black) |

Gift sizes (**Apply size**, presets + custom 1–100 cm, keep proportions) resize the canvas with no price delta in source (SOURCE `nl`); live price effect not exercised → UNKNOWN. Mug size presets (22.9×8.9, 25.4×8.9 cm) likewise need **Apply size** — clicking a preset alone changed nothing (LIVE).

### 6.2 Studio price rule (LIVE + SOURCE)

`Studio price = product.basePriceCents + stationery delta (B) + family delta (A)` (`10tigen5gn4-f.js` ≈ 462 238). It **ignores the selected variant's own price and quantity tier**: 500 visiting cards (₹629 variant) show ₹229 in the Studio (LIVE). The product page, not the Studio, shows the tier price.

### 6.3 Effective variant (SOURCE `1mx9q60dex768.js`, `3zkk7bvc_w-nw.js`, `1bkrcwshr57bn.js`)

`effectiveVariant = stampVariantFor | drinkwareVariantFor | umbrellaRainwearVariantFor | signPosterVariantFor | urlVariant`. Each replaces the values of the affected option groups in the current variant's value ids and looks up the variant that matches; if none matches, the URL variant is kept. It is used for saving (signed in) and in the Approve redirect. Quantity tier comes from the URL variant ("*Quantity stays as selected on the product page*").

### 6.4 Per-option detail

| Option | Where | Values (example) | Default | Price | SKU | Saved | Undo |
|---|---|---|---|---|---|---|---|
| Colour (umbrella/rainwear) | page + Studio swatches | Black/Navy/Red (golf) | page variant | none observed | yes | yes | yes (LIVE) |
| Colour (apparel, caps, bags) | page + Studio chips + custom hex | White/Black/Navy/Heather Grey | page variant | "included" | yes | yes | INFERRED yes |
| Size (apparel) | page + Studio | S/M/L incl., XL +₹30, XXL +₹50 | page variant | yes | yes | yes | yes (LIVE) |
| Print Placement | page + Studio | Front Only / Front & Back +₹150 | page variant | yes | yes | yes | INFERRED yes |
| Size (posters/signs) | page + Studio | 12×18 incl., 18×24 +₹150, 24×36 +₹320 | page variant | yes | yes | yes | INFERRED yes; **canvas size not changed** (LIVE) |
| Cap/lid type | Studio | Screw/Flip/Sipper | page variant | yes | yes | yes | yes (LIVE) |
| Envelope size | Studio + Confirm | 5 sizes | DL | display only | **no** | **no** | partial (price stays) |
| Invitation size/fold/orientation | Studio + Confirm | see 6.1 | from canvas | display only | **no** | **no** | UNKNOWN |
| Folder pockets | Studio + Confirm | Single/Double | Single | display only | **no** | **no** (not even dirty) | UNKNOWN |
| Ink colour / preset text / diameter | Studio (stamps) | Black/Blue/custom; RECEIVED/PAID/Custom +₹30; 1.5"/2" +₹60 | page variant | yes | yes | yes | INFERRED yes |
| Part colours | Studio | per family | photo colour | none | no | yes | yes (LIVE mug) |
| Substrate colour | Studio | Original + presets + custom | Original | none | no | yes | INFERRED yes |
| Quantity | page / dialog | tiers | page | page only | via URL variant | — | — |
| Orientation | dialog (+ Studio for invitations) | H/V | Horizontal | none | no | canvas only | — |

---

## 7. Product-family matrix (verified)

**Method.** Every one of the 533 sitemap products was opened live: product page → Design it → dialog → Next → Studio initial state (text, controls, stage images, screenshot). Twenty families were then walked in depth (options, view switch, sides, 3D, Review, Approve). "Studio initial mode" is LIVE for every product counted.

### 7.1 Category × workspace (LIVE, all products)

Totals (532 products that open the Studio): perspective On product/Flat **215**, perspective On product/Seal design (stamps) **17**, flat print area **100**, photo frame — pen **50**, drinkware **48**, umbrella/rainwear **35**, mug **9**, gift photo frame **15**, polo stage **43**. Initial tool: Product options **455**, Text **73**, Uploads **4**.

| Category | Studio initial mode (live) | Products | Entry dialog | Opens on | Panel heading | Sides (live) | 3D | Same design toggle | Example slugs |
|---|---|---|---|---|---|---|---|---|---|
| clothing-caps-bags | perspective(on-product\|flat) | 65 | Orientation* + Quantity / Orientation* | Product options | Product options | Front+Back | 0/65 | 65/65 | bag-tote-pocket, bag-jute-premium, bag-jute-custom |
| custom-polo-t-shirts | polo-stage | 43 | Orientation* | Product options | Shirt colors | Front+Back | 43/43 | 0/43 | apparel-polo-safety-reflector, apparel-polo-bulk, apparel-polo-two-tone |
| drinkware | photo-frame(drinkware) | 48 | Orientation* / Orientation* + Quantity | Product options | Drinkware options | Front+Back | 0/48 | 0/48 | drinkware-pexpo-bravo-vacuum, drinkware-pexpo-orio-thermo, drinkware-pexpo-morocco-thermo |
| labels-stickers-packaging | perspective(on-product\|flat) | 60 | Orientation* + Quantity | Product options | Product options | Front+Back | 0/60 | 60/60 | label-shipping, pkg-box-pull-out, pkg-box-burger |
| mugs-albums-gifts | perspective(on-product\|flat) | 21 | Orientation* | Product options | Product options | Front+Back / Front | 0/21 | 0/21 | gift-calendar-wall-four-sheeter, gift-calendar-desk-with-frame, gift-calendar-perpetual |
| mugs-albums-gifts | photo-frame(gift: size+part colours) | 15 | Orientation* | Product options | Product options | Front+Back | 0/15 | 0/15 | gift-calendar-magnet, gift-mousepad-round-photo, gift-coaster-soft |
| mugs-albums-gifts | photo-frame(mug) | 9 | Orientation* | Product options | Mug colors | Front+Back | 0/9 | 0/9 | gift-mug-custom-decorative, gift-mug-custom-black, gift-mug-personalised |
| mugs-albums-gifts | photo-frame(pen) | 1 | Orientation* + Quantity | Product options | Pen colors | Front+Back | 0/1 | 0/1 | gift-pen-wooden-ball |
| pens | photo-frame(pen) | 49 | Orientation* + Quantity | Product options | Pen colors | Front+Back | 0/49 | 0/49 | pen-multicolor-ball, pen-green-silver-ball, pen-bulk-ball |
| signs-posters-marketing-materials | perspective(on-product\|flat) | 69 | Orientation* + Quantity / Orientation* | Product options | Product options | Front+Back / Front | 0/69 | 62/69 | sign-poster-standard, flyer-stretch-table-cover, flyer-place-mat |
| stamps-and-ink | perspective(on-product\|seal) | 17 | Orientation* | Product options | Product options | Front View+Back View | 0/17 | 0/17 | stamp-date, stamp-self-inking-pad, stamp-professional |
| stationery-letterheads-notebooks | flat | 68 | Orientation* + Quantity | Product options / Text / Uploads | Product options / Text / Uploads | Front+Back / Cover Front+Cover Back+Inside Page / Cover Front+Cover Back+Pocket Inside / Front+Back+Flap | 56/68 | 0/68 | announcement-save-the-date, invite-party-invitations, invite-gift-tags |
| umbrellas-rainwear | photo-frame(umbrella/rainwear) | 35 | Orientation* + Quantity / Orientation* | Product options | Rainwear options / Umbrella options | Front+Back | 0/35 | 0/35 | rainwear-bag-cover-waterproof, umbrella-golf-promotional-basic, umbrella-three-fold-bulk |
| visiting-cards | flat | 32 | Orientation* / Orientation* + Quantity | Text | Text | Front+Back | 25/32 | 0/32 | card-accessory-premium-metal-holder, card-accessory-leatherite-holder, card-accessory-engraved-metal-holder |
| visiting-cards | no Design it | 1 |  |  |  |  | 0/1 | 0/1 | card-accessory-metal-holder |

### 7.2 Family detail (LIVE deep walks; values not walked are UNKNOWN)

| Family (sample) | Entry options | Initial Studio mode | Product options (Studio) | Surfaces | Colour | Size | Preview / product view | Next flow |
|---|---|---|---|---|---|---|---|---|
| Visiting cards (`business-card-classic`) | Orientation\* + Qty tiers (100 → …) | Flat print area; opens on **Text**; Safety Area + Bleed | none (no Product options tool) | Front, Back | — | fixed 8.9 × 5.1 cm; **vertical swaps** | 2D Edit / **3D Preview** (flat card) | Review with 2D/3D → Approve |
| Stationery: envelope (`stationery-envelope-dl`) | Orientation\* + Qty | Flat; Product options | Size (5) + **Confirm selection** | **Front, Back, Flap** | — | via Confirm (resizes canvas) | 3D Preview | Review 2D/3D (3 sides) |
| Stationery: notebook (`stationery-notebook-a4`) | Orientation\* + Qty | Flat; Text | none | **Cover Front, Cover Back, Inside Page** | — | fixed (10.2 × 7.6 cm shown) | 3D Preview ("Open cover") | Review 2D/3D |
| Stationery: folder (`stationery-presentation-folder`) | Orientation\* + Qty | Flat; Product options | Pockets Single/Double +₹80 + Confirm | **Cover Front, Cover Back, Pocket Inside** (Double → Pocket Left/Right Inside) | — | fixed | 3D Preview | Review 2D/3D |
| Invitations (`invitation-wedding-classic`) | Orientation\* + Qty | Flat; Product options | Size, Fold, **Product orientation** + Confirm; "₹24 each / 25 cards" | Front, Back | — | via Confirm | 3D Preview | Review 2D/3D |
| Mouse pad, rect (`stationery-mouse-pad-custom`) | Orientation\* + Qty | Flat; Text | none | single side (no tabs) | — | fixed | 3D Preview | Review 2D/3D |
| Mugs (`gift-mug-custom-black`) | Orientation\* | **Photo frame (mug)**; Product options | **Mug colors** (body, handle, inside & rim) + **Size** (cm/in presets + custom, Apply size) | Front, Back (+ thumbnails) | parts (C) | Apply size | mug photo; "Design directly on the mug face" | Review (product) |
| Drinkware (`drinkware-bottle-aluminium`) | Orientation\* (± Qty) | **Photo frame (drinkware)**; Product options | **Cap/lid type** (A) + body colour + cap colour (C); Material/Finish/Print mode "Cylindrical wrap" (info) | Front, Back | body/cap (C) | capacity via page | bottle photo; lid photo changes | Review (product) |
| Pens (`pen-gold-click`) | Orientation\* + Qty | **Photo frame (pen)**; Product options | **Pen colors** (body, clip, tip, click button; 12 + custom) | Front, Back (+ thumbnails) | parts (C) "apply to both sides" | fixed 10.2 × 2.0 cm | pen photo; "Design directly on the pen barrel" | Review (product) |
| Umbrellas (`umbrella-golf`) | Orientation\* (± Qty) | **Photo frame (umbrella)**; Product options | **Canopy colour** (A) | Front "Canopy panel", Back "Inside panel" | variant colour, canopy tinted | fixed 15.2 × 20.3 cm | photo; frame/shaft/handle as photographed | Review (product) → Approve carries colour variant |
| Rainwear (`rainwear-waterproof-jacket-standard`) | Orientation\* (± Qty) | **Photo frame (rainwear)**; Product options | **Colour** (A) | Front "Left chest", Back "Upper back" | variant colour | via page | photo; zips/cords as photographed | Review (product) |
| Polo (`apparel-polo-6-degree`) | Orientation\* | **Polo stage**; Product options "**Shirt colors**" | Extra feature 1/2 (Reflective safety stripes, Shoulder stripes, Chest pocket, Side tab, Piped placket, Candy-stripe cuffs, Sleeve patch) + feature colours, **Body** and **Collar & cuffs** colour, Swap colors; product-specific defaults pre-selected | Front, Back | (C) | via page | drawn polo; **3D Preview** (Front/Back/3/4 View/Rotate, CC BY 4.0 model) | Review (product) |
| T-shirts/apparel (`apparel-tshirt-classic-cotton`) | Orientation\* | **Perspective On product**; Product options | Colour (A, + custom hex), **Size** (A, +₹30/+₹50), **Print Placement** (A, +₹150); Material/Finish/Artwork template (info) | Front, Back; **Same design on both sides = ON** | variant colour | via Studio (A) | t-shirt photo; Flat artwork switch | Review → Approve carries variant |
| Caps (`apparel-cap-cotton`) | Orientation\* | Perspective On product | Colour (A), Size (A) | Front, Back; Same design ON | variant | One Size | cap photo | Review → variant |
| Bags (`bag-backpack-american-tourister`, `bag-jute-tote`) | Orientation\* + Qty | Perspective On product | Colour (A) or **Fabric colour** substrate (C) | Front, Back; Same design ON | variant or substrate | — | bag photo | Review |
| Signs/posters (`sign-poster-standard`) | Orientation\* + Qty | Perspective On product | **Paper colour** (C), **Size** (A) | Front, Back; Same design ON | substrate | Size = SKU only (canvas unchanged) | poster photo + shade | Review → variant |
| Labels/packaging (`label-shipping`, `pkg-box-tuck-top`) | Orientation\* + Qty | Perspective On product | **Sticker/Paper colour** (C), **Board Weight** (A, +₹50) | Front, Back; Same design ON | substrate | — | product photo + shade | Review |
| Gifts, perspective (`gift-acrylic-photo-block`, `gift-calendar-wall`) | Orientation\* | Perspective On product, **sample artwork seeded** | **Size** (presets + custom 1–100 cm, Apply size), **Product colours** (finish/edge) | Front, Back | parts (C) | Apply size | product photo | Review shows **blurry-image alert** for the sample (254 DPI / 89 DPI) |
| Gifts, photo frame (`gift-coaster-soft`, `gift-mousepad-round-photo`, `gift-album-photo`) | Orientation\* | **Gift photo frame**, Safety Area + Bleed, sample artwork on some | Size (Apply size) + part colours (back fabric / stitched rim / spine & binding / cover) | Front, Back | parts (C) | Apply size | photo in canvas | Review |
| Stamps (`stamp-date`, `stamp-round-company-seal`) | Orientation\* | Perspective **On product / Seal design**, **sample seal seeded** (curved company name) | **Ink colour** (A), **Preset Text** (A, Custom +₹30), **Diameter** (A, +₹60), **Stamp body** colour (C, 16 + custom) | **Front View / Back View** of the stamp photo | ink = text colour (text colour picker hidden) | Diameter (A) | stamp photo updates "straight away" | Review → variant |

Families from the brief that are **not separate families** in the original: *gifts* (split between perspective and photo-frame profiles), *mouse pads* (rect = flat, round = gift photo frame), *envelopes* (stationery), *packaging* (labels/packaging perspective).

---

## 8. Product-view / mock-up behaviour

| Aspect | Photo frame (umbrella, rainwear, drinkware, pen, mug) | Perspective (signs, labels, packaging, apparel, caps, bags, gifts, stamps) | Gift photo frame | Polo | Flat |
|---|---|---|---|---|---|
| Front/back | separate artwork; product photo per side (pen/mug thumbnails) | separate, but **Same design on both sides ON** by default on clothing/caps/bags, labels/packaging and 62/69 signs (not gifts, not stamps) | separate | separate | separate (+ flap/cover/pocket surfaces) |
| Print-area position | fixed box on the photo (SOURCE placement tables) | the product face quad; "*Artwork follows the product angle automatically*" | inset box on the photo | centred; print-area centre at **51 %** of stage height (SOURCE `10tigen5gn4-f.js` ≈ 400 000; non-polo garment stages use **32 %**) | = stage |
| Scaling | contain-fit of print area into the box | warped to face; resize handles only in **Flat artwork** | contain | stage = **3.6 × max(print w, h)** ÷ size multiplier; other garment stages **2.4 × print area** (SOURCE, same function) | fit |
| Clipping | artwork clipped to print area | to the face, with a shade overlay `*-front-shade.webp` drawn on top (LIVE asset list) | to shape (round pad = circle) | to print area | trim/bleed |
| Product colour | masked tint (umbrella/rainwear), part recolour (pen/mug/bottle) | substrate colour under transparent areas; apparel colour tint | part recolour | body/collar/features drawn | — |
| Specific controls | Upload design on print area | Upload design "Fills the product face"; **Align to product** (rotation 0), **Fill face** | Apply size | features, 3D | 3D Preview |

Photo assets live under the origin's `/products/<family>-2d/…` paths (LIVE `imgs`), e.g. `/products/labels-packaging-2d/label-shipping-front.png` + `-front-shade.webp`, `/products/signs-posters-2d/…`, `/products/stamps/stamp-date.webp`, `/products/gifts-2d/round-photo-mouse-pad-front-v2.png`, `/products/polo/front.png`. Rights to these remain a business decision (see §20).

---

## 9. Artwork editing behaviour (LIVE on `business-card-classic` + SOURCE)

| Tool | Original behaviour |
|---|---|
| **Text** | "Add text" adds "Double-click to edit". Properties: Text content (textarea), **Font** (7: Arial, Georgia, Courier New, Times New Roman, Verdana, Trebuchet MS, Impact), Size (min 6), colour picker (hidden on stamps — prints in ink colour), align L/C/R, **Line spacing 0.5–3**, overflow warning, **Curve: Straight / Arc over top / Arc under bottom — stamps only**. Inline editing by double-click; Enter commits, Shift+Enter newline, Esc cancels. |
| **Uploads** | Placement for new uploads **Fill product / Fit whole image**; "Replace default artwork when uploading"; **Remove default artwork**; **Clear artwork on this side** ("*Undo restores removed artwork. The other side keeps its design.*"); drop zone "*Drop your complete design here*"; **PNG, JPG, WEBP, GIF or SVG · up to 20 MB**; guest: "*Local upload mode — Your image stays in this browser draft*" (image stored as a data URL in the design); signed in: uploaded to storage, falls back to local with "*Cloud upload failed…*"; Print-ready tips; **Recently uploaded**. LIVE upload → "Image added to canvas." |
| **Image properties** | **Logo / artwork colour** (Keep original colours or tint, "*Best for one-colour logos*"), Fit whole image / Fill product / Center image, **crop by dragging inside Fill**, "*Effective resolution: 171 DPI…*" warning, **Fit inside safety area**, **Replace image**, centre H/V, X/Y/W/H (px), opacity, rotation. |
| **Graphics** | Search; **Shapes** (Brand block, Outline seal, Fine divider — editable fill & stroke); **Images** 8; **Icons** 12; **Illustrations** 7. |
| **Background** | Colour picker, hue, hex, reset to white (∅), **Swatches** (12) / **CMYK** (C, M, Y, K % → RGB preview, "*Printed colours can vary*"), Design colours, **Recent colours** ("Saved across products"). |
| **Templates** | Product-specific starting layouts (5 for cards: Clean & minimal, Bold statement, Photo feature, Colour spotlight, Classic emblem); confirmation before replacing (earlier recon). |
| **More** | **Quick edits** (Make image fit safe area, Expand image to bleed, Remove selected element, Select text to change); **QR code** (content field, "*Generated locally with high error correction*"); **Table** (rows 1–8, columns 1–6, comma-separated headings and values → SVG image). |
| **Layers** | Right panel list; bring forward / send backward, show/hide, lock/unlock, duplicate, delete. |
| **Selection** | **Single element only** (`selectedElementId`); **no multi-select, grouping or snapping** (SOURCE: no code). |
| **Transform** | Drag, resize, rotate (Konva); on perspective products drag on the product, resize in Flat artwork. |
| **Keyboard** | Ctrl/⌘Z undo, Ctrl/⌘Shift Z and Ctrl/⌘Y redo, Ctrl/⌘D duplicate, Delete/Backspace (not when locked), Esc deselect, arrows 1 px, Shift 10 px. |
| **Surfaces** | side tabs with element counts; flap, covers, inside page, pockets; stamp Front View/Back View. |

---

## 10. Save / autosave / version behaviour

| Topic | Original |
|---|---|
| Local save (guest) | IndexedDB `nexuz-design-studio` / store `draft-versions` (key `id`, index `productId`); **newest 5 per product kept** (SOURCE). LIVE: one record per autosave/Save now. |
| Cloud save (signed in) | SOURCE: `saveDesign({productId, variantId: effective, name, canvasJson, previewImageUrl})`; first save creates the design and writes `designId` into the URL (`history.replaceState`); then a 2× PNG preview is uploaded and the design saved again with its URL. Not exercised live (write). |
| Autosave | Debounced: 2.5 s after the **last** change while dirty (every design change restarts the timer), for guest and signed-in users alike (SOURCE). LIVE: "Unsaved changes" → "Saved on this device" within 4 s. |
| Save status | Local draft / Unsaved changes / Saving… / Saved on this device / Saved / Couldn't save — retrying / View only — not saved. |
| Retries | on error: 5 s, 10 s, 20 s, 40 s, 60 s cap; also when the browser comes back online (SOURCE). |
| Save now | runs the same save; guest toast "*Saved on this device.*" (LIVE). |
| Versions / history | Guest: "**Design history** — *Local versions saved in this browser on this device.*" list of name + date-time (LIVE). Signed in: goes to `/account/designs` (SOURCE). |
| Restore | Guest **reload** → latest non-empty local draft: "*Restored your last design from this device.*" + **Start fresh** (LIVE). After the sign-in round-trip (session flag = product id) → "*Your design is back — save it to your account.*" + Start fresh (LIVE). |
| Document format | `{schemaVersion: 1, productId, printAreaId, canvasWidth, canvasHeight, backgroundColor, elements, printAreas, umbrellaRainwear?, signPoster?, drinkware?, giftPartColors?, placeholderSeeded?}` (LIVE IndexedDB + SOURCE). Product choices live **inside** the design. |
| Project menu | My projects, Rename project, Duplicate design ("*A new copy is ready. Save it to add it to your projects.*"), Download proof. |
| Deployment defect | Over plain HTTP `crypto.randomUUID` is undefined → every guest save fails ("*Couldn't save this design on your device.*", status "Couldn't save — retrying"). Proven by re-running with the origin treated as secure: saves succeed. **Not a workflow to copy; serve over HTTPS.** |

---

## 11. Review / approval flow (LIVE on 21 products)

**Review your design** dialog:
- Logo, heading, "*Check positioning, spelling and the safe area before continuing.*"
- **2D / 3D** toggle when the product has a 3D model (cards, envelopes, notebooks, folders, invitations, mouse pads; polo).
- Side tabs with element counts (Front/Back, Flap, Cover Front/Cover Back/Inside Page, Pocket Left/Right Inside).
- Non-editable product preview of the selected side (on the product for photo/perspective families).
- Blurry-image alert: "*1 image may print blurry — front: about 254 DPI — we recommend at least 300 DPI. Use a higher-resolution image or make it smaller.*"
- **Download proof** → `{design name}-proof.png` (LIVE file saved).
- **Continue editing** (closes, nothing changes); **Close** (X).
- **Approve and continue**:
  - **Guest (LIVE):** saves locally, sets `sessionStorage['aaraprint:restore-design-after-sign-in'] = productId`, toast "*Sign in to save and continue with your design.*", navigates to `/login?redirect=/products/{slug}/design?variantId={effective}`. `orientation` is not kept.
  - **Signed in (SOURCE):** waits for the save; on failure toast "*Save all changes successfully before continuing.*"; else `/products/{slug}?designId={id}&variantId={effective}`.
  - **View only (SOURCE):** blocked with the view-only message.

Login page (LIVE): "Welcome back", **Continue with Google**, email + password, Forgot password, "*New to Aaraprint? Create an account*".

---

## 12. Cart transition

| Step | Status |
|---|---|
| Product page with `designId` shows the attached banner + Edit | LIVE (banner), SOURCE (Edit URL) |
| Add to cart with `savedDesignId` → server action → cart drawer + "Added to cart" | SOURCE; live UNKNOWN (write) |
| Cart cache | localStorage `nexuz-cart-cache` (lines only) (SOURCE) |
| `/cart` empty state | LIVE: "*Your cart is empty — Browse our catalog and start designing — everything you add will show up here.*" |
| Header "Design studio" | → `/account/designs` → guest redirected to `/login?redirect=/account/designs` (LIVE) |
| Checkout, payment, confirmation, line editing, quantity change after attaching | UNKNOWN |

---

## 13. Responsive behaviour (LIVE, umbrella + t-shirt at 1440 / 1280 / 820 / 390 / 360)

| Width | Product page | Dialog | Studio |
|---|---|---|---|
| 1440, 1280 | two columns | centred card 448 px | one-row top bar; rail 95 px + panel ~310 px + canvas |
| 820 | single column | centred | **top bar wraps**: status + Next on a second row; rail + panel + canvas side by side |
| 390, 360 | single column, hamburger | full-width card | **desktop layout stacked**: compressed header (back arrow, truncated name, undo/redo, 2D) + row 2 (price, Next); rail 79 px + panel in the top half; canvas below; the page scrolls; **Save now hidden**; no horizontal overflow |

No mobile-specific toolbar, sheet or gesture model was observed; touch gestures (pinch) are UNKNOWN. Evidence: `screens/resp-*.png`, `notes/responsive-original.json`.

---

## 14. Visual comparison with our current app

Same product, same viewport (1440 × 900 unless noted). Ours = local dev at `ca3c819`.

| Moment | Original | Ours | Difference |
|---|---|---|---|
| Product page | `screens/flow-umbrella-01-product.png` | `screens/ours-1440-umbrella-golf-01-product.png` | Ours: **Start designing** + **Upload your file**, no Add to cart (callout "being rebuilt"); same options/price. |
| Entry dialog | `screens/flow-umbrella-02-dialog.png`, `screens/tier-card-dialog-500.png` | — | **Ours has none.** |
| Studio initial (umbrella) | `screens/flow-umbrella-03-studio.png` (product photo, Umbrella options) | `screens/ours-1440-umbrella-golf-03-continue.png` (flat white print area, Templates) | Workspace and first panel differ. |
| Studio initial (t-shirt) | `screens/fam-apparel-tshirt-classic-cotton-03-studio.png` (On product, Same design ON, Product options) | `screens/ours-1440-apparel-tshirt-classic-cotton-02-studio.png` (flat 33.8 × 40.6 cm) | No product, no options. |
| Studio initial (mug, card, poster) | `fam-gift-mug-custom-black-03-studio.png`, `fam-business-card-classic-03-studio.png`, `opt-poster-c1.png` | `ours-1440-gift-mug-custom-black-02-studio.png`, `ours-1440-business-card-classic-02-studio.png`, `ours-1440-sign-poster-standard-02-studio.png` | Card is closest (both flat); mug/poster differ. |
| Option change | `flow-umbrella-04-option-changed.png`, `opt-tshirt-c1..c3.png`, `opt-drink-c1.png` | — | **Ours has no Studio options.** |
| Front/back | `flow-umbrella-06-back.png` | ours: Front/Back tabs with counts | similar |
| Review | `flow-umbrella-09-review.png`, `misc-review-3d-card.png` | `ours-1440-*-03-continue.png` (Continue disabled / coming soon) | **Ours: none.** |
| After approve | `flow-umbrella-11-after-approve.png` (login) | — | **Ours: none.** |
| Design attached | `misc-product-with-designid.png` | — | **Ours: none.** |
| Phone 390 | `resp-umbrella-golf-390-studio.png` | `ours-390-umbrella-golf-02-studio.png` | Ours has a dedicated phone layout (bottom toolbar) — a permitted redesign. |
| Tablet 820 | `resp-apparel-tshirt-classic-cotton-820-studio.png` | `ours-820-apparel-tshirt-classic-cotton-02-studio.png` | Permitted redesign; content differs as above. |

---

## 15. Current implementation: MATCH / PARTIAL / MISSING / WRONG

Ours verified by code reading and the screenshots above.

| # | Workflow item | Original | Ours | Status |
|---|---|---|---|---|
| 1 | Product page options, price, tiers | radio chips, **Batches** × tier (1–99) or Quantity (1–99), price breaks | same data, chips, tiers; "Number of sets" × tier (max 50) or Quantity (max 500) (`purchase-panel.tsx`) | PARTIAL (no Add to cart; stepper limits differ: 99 vs 50/500) |
| 2 | Design entry | **Design it** → dialog | **Start designing** link straight to Studio | **WRONG** |
| 3 | Required-options dialog (orientation\*, quantity tier) | all products | none | MISSING |
| 4 | `orientation` URL param and its effect (cards swap) | yes | none | MISSING |
| 5 | `variantId` carried into Studio | yes | yes (`designHref`) | MATCH |
| 6 | Product-page variant pre-selected in Studio | yes | yes (variant summary in top bar) | MATCH (display only) |
| 7 | Initial tool | Product options for most; Text/Uploads otherwise | **Templates** for all | **WRONG** |
| 8 | Studio Product options panel | per family, real choices | "Product" tool is read-only info | MISSING |
| 9 | Workspace: photo-frame families | product photo is the only workspace | flat by default; photo optional, rights-gated, dev fixtures only | **WRONG** |
| 10 | Workspace: perspective families (232 products) | On product default + Flat artwork | flat only | MISSING |
| 11 | Workspace: gift photo frames, polo stage | yes | flat only | MISSING |
| 12 | Variant options (A) change price/variant, saved, undoable | yes | no; variant follows product page only (`studio-app.tsx` `effectiveVariantId`) | MISSING |
| 13 | Colour semantics | variant colour = ordered colour, saved, undoable | M3 colour = view state, not saved, not undoable | **WRONG** |
| 14 | Part/substrate colours saved with design | yes | none | MISSING |
| 15 | Stationery format options (B) | Confirm + resize (inconsistent pricing) | none | MISSING (decision B1) |
| 16 | Size options that resize artwork (gifts, mugs: Apply size) | yes | sizes fixed | MISSING |
| 17 | Studio price shown | base + Studio deltas | variant price (top bar) | PARTIAL (decision B2) |
| 18 | Front/back + named surfaces | tabs with counts; flap, covers, pockets | front/back with counts; schema supports more surfaces | PARTIAL |
| 19 | Same design on both sides | live toggle, ON by default on perspective | one-off copy command (`commands/surfaces.ts`) | PARTIAL |
| 20 | Seeded sample artwork (stamps, gifts) | yes | `?sample=1` only | PARTIAL (decision B5) |
| 21 | Text tool | 7 fonts, line spacing, curve (stamps) | 4 bundled families, richer controls, no curve | PARTIAL |
| 22 | Uploads | 20 MB, PNG/JPG/WEBP/GIF/SVG, Fill/Fit, crop by drag, logo tint, remove/clear, recent | 10 MB (`UPLOAD_MAX_BYTES`), PNG/JPEG/WebP, DPI, missing-file handling | PARTIAL |
| 23 | Graphics / shapes | 3 shapes + 27 graphics | larger shape set; rights-withheld graphics | PARTIAL |
| 24 | Background | swatches, **CMYK**, recent | swatches, recent, hex | PARTIAL |
| 25 | Templates | product-specific sets | 16 templates, "for this product" filter | PARTIAL |
| 26 | QR code, Table, Quick edits (fit safe area, expand to bleed) | yes | none | MISSING |
| 27 | Layers, properties | yes | yes (+ rename) | MATCH |
| 28 | Selection | single | **multi-select** (`selectedIds`) | MATCH (superset, allowed) |
| 29 | Snapping | none | rotation snapping | MATCH (superset) |
| 30 | Undo/redo incl. option changes | yes | design edits only | PARTIAL |
| 31 | Local autosave + status + Save now + 5 versions + restore | yes | IndexedDB autosave, status, Save now, versions, restore | MATCH |
| 32 | Cloud save, sign-in restore flag | yes | none (Phase 6) | MISSING |
| 33 | Project menu (rename, duplicate, proof) | yes | rename, proof in Print check | PARTIAL |
| 34 | 3D preview (cards, stationery, polo) | yes | none (Phase 5) | MISSING |
| 35 | Next → Review your design | yes | **Continue = disabled / "coming soon"** | MISSING |
| 36 | Approve → sign-in / design attached → product page | yes | none | MISSING |
| 37 | Product page "design attached" + Edit | yes | none | MISSING |
| 38 | Add to cart / cart / checkout | yes / UNKNOWN | placeholders (Phase 6) | MISSING |
| 39 | Exit → product page | yes | "Back to product" | MATCH |
| 40 | Responsive | stacked desktop layout | dedicated tablet/phone layouts | MATCH (redesign allowed) |
| 41 | HTTPS-safe local save | broken over HTTP | uses our own ids | MATCH (ours is better) |

---

## 16. Required schema changes

Our design document (`src/features/studio/schema/types.ts`, schema v2) holds artwork only; `product` is `{slug, productId, variantId}`. The original keeps product choices **inside** the design. Proposed **schema v3** (with a v2 → v3 migration):

```ts
interface DesignDocument {
  // … existing v2 fields …
  product: {
    slug: string;
    productId: string;
    /** Variant chosen on the product page / entry dialog (carries the quantity tier). */
    baseVariantId: string | null;
    orientation: 'horizontal' | 'vertical';
  };
  /** Product choices made in the Studio. Saved, undoable, versioned with the artwork. */
  choices: {
    /** Kind A — option-group name → value label (colour, size, print placement, lid type, board weight, ink, preset text, diameter …). */
    variantOptions: Record<string, string>;
    /** Custom variant colour (hex) "saved with the design as the colour to produce". */
    customColour?: string | null;
    /** Kind B — stationery format (envelope size, invitation size/fold/orientation, folder pockets); see decision B1. */
    format?: { kind: 'envelope' | 'invitation' | 'folder' | 'card'; id: string; priceDeltaPaise: number } | null;
    /** Kind C — physical part colours, keyed by part id (mug body/handle/rim, pen body/clip/tip/button, bottle body/cap, gift parts, stamp body). */
    partColours: Record<string, string>;
    /** Substrate colour (paper, sticker, fabric…) — production reference. */
    substrateColour?: { label: string; hex: string } | null;
    /** Polo features. */
    features?: { slot: 1 | 2; feature: string; colour: string }[];
    /** Live mirror of front → back on perspective products. */
    sameDesignBothSides: boolean;
  };
  /** True while the seeded sample artwork is untouched (original: placeholderSeeded). */
  sampleSeeded?: boolean;
}
```

Derived, never stored as truth: `effectiveVariantId = resolveVariant(product options, baseVariantId, choices.variantOptions)` and `studioPrice` (see decision B2). Saved designs record `effectiveVariantId` at save time for the cart. Surfaces stay as they are; size changes resize surfaces via the existing `resizeSurface`.

Import of original v1 designs (`umbrellaRainwear`, `signPoster`, `drinkware`, `giftPartColors`, `placeholderSeeded`) maps onto `choices` 1-to-1.

---

## 17. Required architecture changes

1. **Product family registry** (data, not code branches): per product → workspace type (photo-frame / gift-frame / perspective / polo / flat), initial tool, option groups by kind (A/B/C), surfaces, 3D model, sample artwork. Generated by `scripts/studio/build-studio-profiles.mjs` from the recovered data + this audit's matrix.
2. **Choices in the store**: Studio choices become commands in the existing command/undo system (so Undo/Redo, autosave, versions and restore cover them for free).
3. **Effective-variant + price service** shared by the product page, Studio top bar, Review and cart.
4. **Workspace renderers** per type, sharing the existing canvas: photo frame (M2 work generalised and made the default), perspective (face quad warp + Flat artwork editing), gift frame, polo stage. Rights-gated fallback to the print area when a photo isn't cleared.
5. **Entry route state**: `/products/:slug/design?orientation&variantId[&designId]`; the dialog lives on the product page.
6. **Review & approve flow**: Review dialog (per-side preview, counts, DPI alert, proof, 2D/3D slot), Approve → auth gate → attach → `/products/:slug?designId&variantId`. Until accounts exist, a **local stand-in** (design attached from IndexedDB) keeps the flow testable.
7. **Product page attached state**: banner + Edit, `savedDesignId` passed to Add to cart; validate that the design exists (the original doesn't).
8. **Same design on both sides** as a persistent mirror mode, not a one-off copy.
9. **HTTPS** in every deployed environment.

---

## 18. Implementation priority

| Order | Work | Why first |
|---|---|---|
| 1 | Schema v3 `choices` + migration; effective-variant + price service; choices as undoable commands | Everything else stores into it. |
| 2 | Product family registry generated from data | Drives tool, workspace, options and surfaces for 533 products. |
| 3 | **Product options panel**, first tool and open by default; kinds A and C first (colour, size, placement, lid, ink, preset text, diameter, part & substrate colours). Rework M3 colour onto it (saved, undoable, sets the variant). | Biggest behaviour gap; affects price and SKU. |
| 4 | **Entry dialog** (orientation\* + quantity tier) and `orientation` (card swap) | Small, unblocks correct URLs. |
| 5 | **Next → Review → Approve → design attached → Add to cart** with a local auth stand-in | Completes the journey; currently a placeholder. |
| 6 | **Photo-frame workspaces as default** (umbrella, rainwear, drinkware incl. per-lid photo, pen, mug) | Data already in the repo; flip the default and remove the flat mode. |
| 7 | **Perspective On product / Flat artwork** + **Same design on both sides** (signs, posters, labels, packaging, apparel, caps, bags, perspective gifts, stamps) | 232 products. |
| 8 | Gift photo frames + **Apply size**; mug size | |
| 9 | Stationery format options (envelope, invitation, folder) — after decision B1 | |
| 10 | Polo stage + features | |
| 11 | Tool parity: QR, Table, Quick edits, CMYK, image Fill/Fit/crop/logo tint, remove/clear artwork, 20 MB + GIF/SVG, upload on the print area, stamp curved text, 7-font list decision | |
| 12 | Stamps (ink-coloured text, seeded seal) and seeded samples (decision B5) | |
| 13 | 3D previews (Phase 5); accounts, cloud save, cart, checkout (Phase 6) | Need backend. |

This document does **not** start any of these.

---

## 19. UNKNOWN items

1. Checkout UI, payment step, order confirmation, emails, order tracking states beyond earlier recon.
2. Live Add to cart with `savedDesignId`: cart line content, design thumbnail, editing, removing, quantity change after attaching.
3. Signed-in Studio live: cloud autosave timing in practice, preview upload, `designId` in URL, "Saved" state, account "My projects"/`/account/designs` page.
4. Whether a signed-in Approve of a stationery format option (kind B) reaches the cart in any other way (source suggests not).
5. Undo for kind A options other than colour/size/lid (INFERRED yes, not each verified), and for invitation/folder confirms.
6. Price effect of gift/mug **Apply size** (source: none; not exercised).
7. Effect of `orientation=vertical` on products other than the three samples.
8. 3D preview details for each 3D family beyond the polo and card views captured.
9. Touch gestures (pinch, two-finger pan) on phones; whether any mobile sheet exists in deeper states.
10. View-only foreign design behaviour live (needs another account's `designId`).
11. Server-side print-file generation (what production receives).
12. Whether the product page's `designId` banner is ever validated server-side when adding to cart.
13. Cart drawer appearance (the header Cart button did not open a dialog for an empty guest cart).

---

## 20. Business decisions required

| # | Decision | Original behaviour | Recommendation |
|---|---|---|---|
| B1 | Stationery format options (envelope size, invitation size/fold, folder pockets) | price shown but **not ordered, not saved, not undone** | Treat as kind A: save, include in the ordered SKU/price, undoable. Do **not** copy the inconsistency. |
| B2 | Studio price | base + Studio deltas, ignores tier (₹229 shown for a ₹629 tier) | Show the **effective variant price** (tier included) + Studio deltas; keep "quantity stays as on the product page". |
| B3 | Photo / mask / graphics rights | original shows recovered photos | Needed before product-first workspaces go live; fall back to print area until cleared. |
| B4 | "Same design on both sides" default ON (apparel, caps, bags, labels, packaging, most signs) | ON | Keep ON for one-sided-by-nature products? Confirm per family (prints back by default → price?). |
| B5 | Seeded sample artwork (stamps, gifts, calendars) | seeded; Review warns about its own low-DPI sample | Keep for stamps (structure); for gifts use high-res samples or start empty. |
| B6 | Add to cart without a design for customisable products | allowed | Decide: allow (plain product) or require design / "Upload your file". |
| B7 | Orientation question for products that ignore it (umbrella, poster…) | asked for every product | Ask only where it changes the canvas. |
| B8 | Sign-in required to attach a design | yes (guest → login) | Decide if guests may attach locally and check out as guest (recon says guest checkout exists). |
| B9 | Design-attached banner trusts the URL | yes | Validate the design id. |
| B10 | HTTPS | original served over HTTP (breaks local save) | Mandatory HTTPS. |
| B11 | Fonts | 7 system fonts | Keep our bundled fonts or match the original's 7 (affects reopening original designs). |
| B12 | Multi-select, snapping (ours) | absent in original | Keep as improvements (no workflow impact). |

---

## Appendix A — What was inspected

- **All 533 sitemap products**, live: product page, Design it dialog (orientation, quantity tiers), Studio initial state, controls, stage images, screenshot (scratch copies; representative ones in `screens/`).
- **Deep walks** (live): umbrella-golf (twice, incl. secure-context), business-card-classic (all tools, upload, QR/Table/CMYK, proof download, 3D, vertical), drinkware-bottle-aluminium, gift-mug-custom-black, pen-gold-click, apparel-polo-6-degree (3D), apparel-tshirt-classic-cotton, apparel-cap-cotton, bag-jute-tote, bag-backpack-american-tourister, rainwear-waterproof-jacket-standard, gift-acrylic-photo-block, gift-mousepad-round-photo, gift-calendar-wall, stationery-envelope-dl, stationery-notebook-a4, stationery-presentation-folder, invitation-wedding-classic, pkg-box-tuck-top, stationery-mouse-pad-custom, stamp-round-company-seal, stamp-date, sign-poster-standard (incl. vertical). (`label-shipping` was captured at Studio-initial depth only, like every other product in the survey.)
- **Option-effect checks** (price, title, variant via Approve, reload, undo): t-shirt, bottle, poster, mug, envelope, stamp, invitation, folder, cap; product-page pre-selection (umbrella Navy, t-shirt L); quantity tier 500 cards.
- **Responsive:** umbrella + t-shirt at 1440, 1280, 820, 390, 360 (product page, dialog, Studio, Text panel).
- **Other routes:** `/login` (via Approve), `/cart`, `/account/designs`, product page with `designId`.
- **Source:** `10tigen5gn4-f.js` (Studio, save, approve, price, tools), `40mjs_h36bgnb.js` (product page, dialog, add to cart), `1mx9q60dex768.js` (umbrella/rainwear/drinkware variants, cart store), `3zkk7bvc_w-nw.js` (sign/poster, card orientation, round pad), `1bkrcwshr57bn.js` (stamps, curved text, fonts).
- **Ours:** local dev at `ca3c819`, same products and widths.

## Appendix B — What was not observable

Anything needing a write or an account: sign-in, account creation, cloud save, Add to cart, checkout, payment, orders, another user's design. Those items are listed in §19 and described from source where possible.
