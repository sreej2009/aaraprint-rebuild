# Aaraprint Workflow Specification

**Original workflow, modern UI.** This is the permanent source of truth for how Aaraprint must *behave*. The look can be redesigned; the workflow, business rules and product logic must match the original wherever it can be verified.

**Audit date:** 11 Nov 2026. **Repository state audited:** `235b3db` (Phase 3 complete; Phase 4 M1–M4 and the product-view corrective fix).

**Evidence labels**
- **[L]** observed on the live original site (`http://200.234.38.165/`), driven in a real browser, guest only, read-only (no cart writes, sign-ins or orders);
- **[S]** read as text from the recovered bundles in `../recovered/_next/static/chunks/` (never executed);
- **[D]** from the earlier reconnaissance (`AARAPRINT_RECONNAISSANCE.md`, static analysis);
- **[U]** unknown, still to be verified.

Status values used throughout: **MATCH, PARTIAL, MISSING, WRONG, UNKNOWN.**

---

## 1. Executive summary

The original Aaraprint is a **product-first** design tool. Choosing a product and pressing **Design it** asks for required options, then opens the Studio on the actual product:
- **The workspace is the product photo** with its print area marked, for pens, mugs, drinkware, umbrellas, rainwear, the round mouse pad and flat gifts. Perspective products (signs, labels, bags, caps, stamps, perspective gifts) open with an editable product preview, "On product" by default, with a "Flat artwork" switch.
- **The Studio opens on "Product options"**, a panel of real product choices (colour, size, lid type, envelope size, ink colour, part colours). Many of these change the ordered SKU and price, are saved with the design, and are undoable like any edit.
- **The Studio ends with Next**, which opens a **Review your design** dialog (product preview, sides, low-resolution warning, Download proof, Continue editing, Approve and continue). Approval attaches the design to the product page for Add to cart; a guest is first asked to sign in.

Our rebuild has a solid editing engine:
- text, images, graphics, shapes, templates, layers, history;
- autosave, versions, Preview and proof;
- front/back sides, tablet and phone layouts;
- exact copies of the original placement data.

But it was built **flat-first**: every product opens on a flat print area, the product photo is an optional view (and rights-blocked), product colour is a preview that is never saved, there are no product options inside the Studio, and **Continue** is a placeholder.

**The three most important corrections**
1. The workspace must be product-first for the families where the original is.
2. Studio product options (including colour) must be real, saved, undoable choices that set the variant and price.
3. Next must lead to Review → Approve → design attached to the product page.

The rights status of the recovered photos is a **business decision**, separate from workflow: the workflow must be product-first, and without cleared photos it falls back to the print area.

---

## 2. Original customer journey

1. **Homepage → category → product** [D][L]: category grids with filters; the product page has breadcrumbs, a gallery, option groups as buttons ("included" or "+ ₹X"), a quantity stepper ("Batches" for tiered products), a live price ("incl. print", dispatch in 2–3 days), **Add to cart** and **Design it**, bulk price-break tables, print specifications and product details.
2. **Design it → required options** [L][S]: for every customisable product, **Design it** opens a dialog: "*Please select all required options.*"
   - **Product Orientation\*** (horizontal / vertical, default horizontal);
   - **Quantity** (a select, with "N pcs — starting at ₹X") when the product has quantity tiers;
   - then **Next**.
   - Source: `40mjs_h36bgnb.js`, the `onNext` handler.
3. **Studio URL** [L][S]: `/products/{slug}/design?orientation=horizontal&variantId={variant}` (+ `&designId=` when a design is attached). The variant from the product page options and the dialog's quantity is carried in.
4. **Studio** (§4–§9): Product options first, artwork tools, front/back, autosave, history.
5. **Next → Review your design** [L]: the product preview per side with element counts, a blurry-image alert, **Download proof**, **Continue editing**, **Approve and continue**.
6. **Approve and continue** [L][S]:
   - **Guest:** the draft is kept in this browser, the session flag `aaraprint:restore-design-after-sign-in` is set, a toast says "*Sign in to save and continue with your design.*", and the page goes to `/login?redirect=/products/{slug}/design?variantId={effective variant}`. Observed: after choosing Red in the Studio, the redirect carried the **Red** variant.
   - **Signed in:** waits for the save, then `/products/{slug}?designId=…&variantId=…`. The product page shows "*Your design is attached and ready to order.*" with Edit → **Add to cart**.
7. **Cart → checkout → confirmation** [D]: a cart drawer and page ("Design ready" tag, chosen options, quantity, remove); checkout by guest or account; pay on delivery (Razorpay "where available"); GST and shipping shown before ordering. Order tracking by order number + email; statuses Awaiting payment / Confirmed / Processing / Shipped / Delivered. The checkout UI itself was not observable [U].

---

## 3. Product workflow matrix

Per family, from live Studio sessions [L] and the source [S]. "Stage" is what the editing workspace shows.

| Family (sample) | Product page options | Colour | Size | Front/Back | Print area | Stage / mockup | Special behaviour | Next flow |
|---|---|---|---|---|---|---|---|---|
| Umbrella (`umbrella-golf`) | Canopy Colour | **Canopy colour in Studio = colour ordered**; masked tint of the canopy only | — | Front "Canopy panel" / Back "Inside panel", designed separately | 15.2 × 20.3 cm | **Product photo frame** (1122 × 1402 photo px, M1 boxes) | Frame, shaft, handle and tips stay as photographed; "Upload design" button on the print area | Review shows the product; Approve |
| Rainwear (`rainwear-waterproof-jacket-standard`) | Size, Colour, Quantity | **Colour in Studio = colour ordered**; masked fabric tint | Size via variant | Front/back separate | 15.2 × 15.2 cm | Product photo frame | Zips, buttons, cords, tape and linings stay as photographed | same |
| Polo (`apparel-polo-6-degree`) | Size, Colour | **Shirt colours** (body, collar/cuffs, feature colour, custom hex) | Variant | Left chest / Upper back | Area × 1.5 | **Stage 3.6 × the larger print side**, area at 51 % height; drawn polo (`/products/polo/front.png`, 4320 px) | Features: reflective stripes, shoulder stripes, chest pocket, side tab, piped placket, candy-stripe cuffs, sleeve patch; **2D Edit / 3D Preview** | Review with 2D/3D |
| Apparel & caps (`apparel-cap-cotton`) | Colour (+ Size) | **Colour = colour ordered**; custom colour "saved with the design" | One size / variant | Front/back; **Same design on both sides** toggle | per product | **Editable product preview: On product (default) / Flat artwork**, perspective | "Size, material, finish and printed-side choices update the SKU that is ordered. Quantity stays as selected" | Review |
| Bags (`bag-backpack-american-tourister`) | Quantity, Colour | Colour = ordered; custom colour saved with design | — | Front/back; Same design on both sides | per product | On product (default) / Flat artwork | "Upload design · Fills the product face" | Review |
| Mug (`gift-mug-custom-black`) | Finish | **Mug colours: body, handle, inside & rim** (presets + custom hex), Studio-only, no price | **Product options: Size in cm/in (22.9 × 8.9, 25.4 × 8.9), custom width/height**; artwork scales with size | "Edit front of mug / Edit back of mug" | 22.9 × 8.9 cm (2700 × 1050 px) | **Mug photo frame 900 × 1086**; paired photo halves (724 px; back drawn 176 px in); mug cut out by drawn shapes | "Product shading and highlights remain visible on both sides" | Review |
| Pen (`pen-gold-click`) | Quantity, Barrel Colour | **Pen colours: body, clip, tip, click button…** (12 presets + custom hex), "apply to both sides", Studio-only | Fixed 10.2 × 2.0 cm | "Edit front of pen / Edit back of pen" | 1200 × 240 px | **Pen frame 2000 × 700**, box centre (1160, 350), at most 700 × 104 | "Design directly on the pen barrel" | Review |
| Drinkware (`drinkware-bottle-aluminium`) | Capacity, Lid Type | **Bottle body colour** and **cap/lid colour** (presets + custom) | Capacity via variant | Front/back separate; "Physical choices stay shared while front and back artwork remain independent" | 19.1 × 17.8 cm | **Drinkware photo frame 1122 × 1402** per lid photo | **Cap/lid type in Studio (Screw included, Flip +₹15, Sipper +₹10) changes the SKU and price** | Review |
| Sign / poster (`sign-poster-standard`) | Size, Quantity | **Paper colour** (Original + 12 + custom): "*saved with the design as a production reference*" | **Size in Studio with price deltas** (12×18 in included, 18×24 +₹150, 24×36 +₹320) | Front/back; Same design on both sides | per size | On product (default) / Flat artwork | Substrate shows wherever artwork leaves gaps | Review |
| Label / packaging (`label-shipping`) | Quantity | **Sticker colour** (substrate), saved with design | variants | Front/back; Same design on both sides | 4 × 6 in | On product / Flat artwork; "*Artwork follows the product angle automatically*" | Perspective | Review |
| Gift (`gift-acrylic-photo-block`) | Size | **Product colours: finish/edge** (16 + custom), Studio-only | **Size cm/in presets + custom 1–100 cm, keep proportions, Apply size** | Front/back | per size | On product (default) / Flat artwork, perspective; default sample art | DPI alert shown in Review (e.g. "about 254 DPI") | Review |
| Visiting card (`business-card-classic`) | Quantity, Ink Style | — | Orientation from the entry dialog; card sizes [S] | Front/back | 3.5 × 2 in (1050 × 600) | **Flat print area** (stage = print area) | Opens on the **Text** panel; **2D Edit / 3D Preview** | Review with 2D/3D |
| Envelope (`stationery-envelope-dl`) | Quantity, Window | — | **Envelope size in Studio** (DL included, #10 +₹42, C5 +₹63, 19 × 12 cm, 14.6 × 11 cm) + **Confirm selection**; "*existing design will be resized proportionally*" | **Front, back, flap** | per size | Flat print area | "Choose the envelope size before continuing your design." | Review with 2D/3D |
| Stamp (`stamp-date`) | Ink Colour, Preset Text | **Seal/ink colour** (variant) + **stamp body colour** (Studio-only) | Size/diameter variants | Front view / back view | per stamp | On product / **Seal design** | "*Choices here update the stamp photo straight away and are carried to your cart*"; preset text RECEIVED/PAID/Custom | Review |
| Round mouse pad | — | — | — | Front | round | **Round pad photo frame** | — | Review |
| Stationery: folders, notebooks [D] | Material, Finish, Pockets… | — | Cover sizes | cover-front, cover-back, inside, pockets | per product | Flat with special guides (spine/hinge) | "Folder opened flat"; pocket glue zones | Review with 3D (book hinge) |

---

## 4. Studio workflow

### Entry
- **How:** through **Design it** on the product page and the required-options dialog (§2); also "Design studio" (header) → saved designs, and links with `?designId=`.
- **What is carried:**
  - the product, its print config and variant;
  - `orientation` (from the dialog) and the quantity tier (folded into the variant);
  - `designId` when continuing.
- **Effect of orientation [S]:** card and stationery products resize to it (their size panel offers Horizontal/Vertical, "Your front and back designs resize together"). For other products, the umbrella ignored it [L]; the general effect is **[U]**.
- **Preserved:** the selected variant's options appear pre-selected in Studio Product options. Observed: choosing Navy on the umbrella product page showed "Canopy colour: Navy" in the Studio.

### Layout (to be redesigned freely; content must match)
- **Top bar:**
  - Exit and the design name, with a **project menu** (My projects, Rename, Duplicate, Download proof);
  - **Save now** (cloud) and **Open saved designs** (history);
  - Undo and Redo;
  - **2D Edit / 3D Preview** where 3D exists;
  - the product · print size, the **price** and the save status;
  - **Next**.
- **Tool rail:** **Product options** (first and **open by default** for products with options; otherwise **Text**), Text, Uploads, Graphics, Background, Templates, **More** (Quick edits · QR code · Table).
- **Workspace:** the side tabs, the stage (§6), the **Upload design** button on the empty print area (drag-and-drop too), and zoom (− % + fit).
- **Right panel:** properties and layers.

### Canvas
- **Printable area:** the product's print area in print px at its DPI, drawn inside the product stage (§6).
- **Artwork:** positioned in print px; cm shown as px ÷ dpi × 2.54.
- **Bleed and safe zone:** from the print config; guides are drawn for flat products. On photo-frame products (drinkware, umbrella, rainwear) the bleed/safe legend isn't shown [S].
- **Out-of-area warning:** "Part of this layer is outside the print area and may be cut off."

### Front / back
- **Sides:** most products have front and back; envelopes add a flap; folders, notebooks and stamps have their own named areas. Each tab shows its element count.
- **Artwork is per side.** A **Same design on both sides** toggle exists on perspective products (Replace / Keep both) [S][L].
- **Physical choices** (colour, lid, size) are shared by both sides.
- **Option changes:** a size change resizes artwork proportionally on both sides (envelopes, mugs, gifts, cards) [L][S].

### Artwork
- **Text** [D]:
  - Add text; edit in a textarea or by double-clicking;
  - font (7 system fonts), size (minimum 6), colour, bold, italic, alignment, line spacing 0.5–3;
  - **curved text** (straight / arc over / arc under);
  - a clipping warning.
- **Images** [D][L]:
  - **Upload design** on the print area or the Uploads panel; drag and drop;
  - PNG, JPG, WEBP, GIF, SVG up to **20 MB**; "Recently uploaded";
  - placement **Fill product / Fit whole image**; Replace (keeps proportions);
  - crop by panning inside Fill; opacity; rotation; logo colour tint;
  - "Effective resolution N DPI", with a blurry-image warning in Review.
- **Graphics:** a searchable library (33 SVGs). **Shapes:** brand block, outline seal, fine divider (editable fill and stroke).
- **Background:** swatches and **CMYK** tabs, design colours, recent colours, hex.
- **Templates:** 95, filtered by style, with product-specific sets; confirmation before replacing.
- **QR code:** generated locally, high error correction. **Table:** comma-separated input.
- **Layers:** z-order, bring forward / send backward, show/hide (as opacity 0), lock, delete.
- **Properties:** X, Y, W, H, rotation, opacity, duplicate, delete, centre horizontally and vertically, **Align to product**, **Fit inside safety area**, **Expand image to bleed**.
- **Undo/redo:** buttons, Ctrl/⌘ Z, Shift Z and Y. **Product option changes are undoable** [L].
- **Shortcuts:** duplicate (D), Delete, Esc, arrows 1 px, Shift 10 px.
- **Not present:** multi-select and snapping [D].

---

## 5. Product mockup workflow (exact formulas)

The stage is built per family by one function in `10tigen5gn4-f.js` (around offset 403 000 [S]). In every case:

```
artwork (print px)  →  print area  →  placed in a product frame (contain fit, centred)  →  stage = whole frame in print px  →  screen (fit, zoom)
```

| Family | Frame (photo px) | Print box (frame px) | Placement | Photo drawing |
|---|---|---|---|---|
| Pen | 2000 × 700 (`PEN_MOCKUP_SIZE`) | centre (1160, 350), max 700 × 104 | scale = min(700/w, 104/h); x = 1160 − w·s/2; y = 350 − h·s/2 | the family photo (≈2120 × 742) stretched to the frame; front/back photos per family; parts recoloured by drawn regions |
| Mug | 900 × 1086 (`MUG_MOCKUP_SIZE`) | centre (450, profile centreY), profile max w × h | scale = min(maxW/w, maxH/h) | the paired photo (1448 × 1086): the front uses its left 724 px at x 0, the back its right half at x 176; cut out by drawn body/handle shapes; parts recoloured |
| Drinkware | 1122 × 1402 | per-photo box (220 entries) or per-kind fallback | contain | per-lid photo (`drinkware-2d/<slug>-<lid>-front.png`) |
| Umbrella / rainwear | 1122 × 1402 | per-photo box (70 entries) | contain | WebP photo + mask; canopy/fabric tinted (natural tint) |
| Round mouse pad | `ROUND_MOUSE_PAD_MOCKUP_SIZE` | `roundMousePadPrintRect` | contain | round photo |
| Gift (flat profile) | `GIFT_FLAT_MOCKUP_SIZE` | `giftFlatPrintRect` per side | contain | gift photo |
| Gift (perspective), signs, labels, bags, caps, stamps | stage = print area | — | — | **On product**: artwork warped onto the product face quad (perspective), with shade overlays and "keep" regions; **Flat artwork / Seal design**: the print area |
| Apparel | stage = 2.4 × area ÷ multiplier | x centred; y = 32 % of the stage height − h/2 | — | garment photo (`mockupBackgroundUrl`) with colour tint |
| Polo | stage = 3.6 × max(w, h) ÷ 1.5 | x centred; y = 51 % − h/2 | — | drawn polo (`/products/polo/front|back.png`) + feature paths; 3D GLB preview |
| Flat print (cards, stationery, …) | stage = print area | — | — | none; 3D flat card in preview |

**Placement data held in this repository [S → MATCH]:** `src/data/generated/studio/product-view-placements.json` holds:
- the 290 drinkware, umbrella and rainwear boxes;
- the pen frame and box, the 10 pen families with their part colours, and 50 pen slugs;
- the mug frame, side cut and 9 mug boxes;
- the umbrella/rainwear palette and photo colours.

**Not yet captured:** the gift-flat, round-pad, perspective-face, sign/poster colour, apparel and polo data (all in `3zkk7bvc_w-nw.js` and `10tigen5gn4-f.js`).

---

## 6. Product colour workflow

Two different things exist in the original. They must not be merged.

| Kind | Families | Where chosen | Changes variant / SKU | Changes price | Saved with design | Undoable | Shown |
|---|---|---|---|---|---|---|---|
| **Variant colour** (the colour that is ordered) | umbrella, rainwear, apparel, caps, bags, stamp ink, drinkware lid type (not colour) | product page option **and** Studio Product options | **Yes**: the effective variant is computed from the design's choice (`umbrellaRainwearVariantFor`, `drinkwareVariantFor`, `signPosterVariantFor`, `stampVariantFor`) and passed on save and approval | when the option has a delta | **Yes** (`design.umbrellaRainwear.colorLabel`, `design.drinkware`, `design.signPoster.options`, the stamp selection) | **Yes** [L] | mockup tinted (umbrella/rainwear masks; garment tint) |
| **Part / substrate colour** (visual or production reference) | mug body/handle/inside, pen body/clip/tip/buttons, drinkware body/cap colour, gift finish/edge, stamp body, sign paper colour, sticker colour, custom colours | Studio Product options only | No | No | **Yes** ("saved with the design as a production reference"; "a custom colour is saved with the design") | Yes | photo parts recoloured; substrate under gaps |

- **Artwork:** never changes; "Your artwork colours stay independent".
- **Sides:** colour applies to both ("Colors apply to both sides").
- **Checkout:** the cart line shows the chosen part options (e.g. Flip Cap, Matte Black, Royal Blue) [D].

---

## 7. Product options workflow

- **Product page:** every option group is part of the SKU; price = base + Σ deltas. The quantity stepper multiplies tiers ("Batches").
- **Entry dialog:** orientation (always) and quantity (when tiered).
- **Studio Product options:** per family (§3). Options that change the physical product or SKU update the **effective variant and price** in the top bar. Quantity stays as selected on the product page ("Quantity stays as selected").

| Option | Physical size | Print area | Mockup | Price | Artwork |
|---|---|---|---|---|---|
| Colour (variant) | — | — | tinted | if delta | kept |
| Size (signs, gifts, mugs) | yes | **resized** | yes | if delta | **resized proportionally**, both sides |
| Envelope size | yes | resized after **Confirm selection** | — | if delta | resized proportionally |
| Lid type (drinkware) | — | per-photo box | photo changes | +₹10/+₹15 | kept |
| Orientation (cards) | swapped | swapped | — | — | both sides resize together |
| Part / substrate colour | — | — | recoloured | — | kept |
| Ink colour (stamps) | — | — | photo updated | variant | text prints as ink |

- **Undo:** option changes are undoable and mark the design dirty (save runs) [L].
- **Next step:** the effective variant goes into Approve (§2.6).
- **Not observed [U]:** product page quantity and SKU changes made after the design is attached.

---

## 8. Front/back workflow

- **Tabs:** front/back (and flap, covers, pockets, seal views) with element counts.
- **Independence:** artwork is independent per side; **Same design on both sides** on perspective products; physical choices are shared.
- **Review:** shows each side.
- **Scaling:** size or orientation changes scale both sides together.

---

## 9. Save / history workflow

- **Guest:**
  - autosave to IndexedDB (`nexuz-design-studio` / `draft-versions`);
  - status "Local draft" / "Saved on this device" / "Unsaved changes";
  - **Save now** (cloud icon) stores a **local version**;
  - history dialog: "Local versions saved in this browser on this device… Select the cloud icon to save one."
- **Signed in:** cloud save with a preview PNG; status "Saving… / Saved / Couldn't save — retrying" with retry.
- **Approval:** designs are saved with the **effective variant** (§6).
- **Leaving:** a `beforeunload` warning while unsaved.
- **Returning:**
  - after reload or sign-in, the latest local draft is restored ("Restored your last design from this device." / "Your design is back — save it to your account.", with **Start fresh**);
  - `?designId=` reopens a saved design;
  - a foreign design is view-only.
- **Not a workflow:** the "*Couldn't save this design on your device*" seen during this audit came from the automation browser lacking IndexedDB. It is an infrastructure failure and must not be copied.

## 10. Preview workflow

- **No separate full-screen 2D preview in the original.** The editing workspace already shows the product.
- **3D:** **2D Edit / 3D Preview** in the top bar where a 3D model exists (polo, cards, envelopes…).
- **Review your design** (on Next): the product preview for each side (side tabs with element counts); 2D/3D where supported; not editable; blurry-image alert with DPI per side; **Download proof** (PNG, `{name}-proof.png`); **Continue editing** closes it and changes nothing; **Approve and continue** (§2.6).

## 11. Next / order workflow

- **Next** → Review → **Approve and continue**.
  - **Guest:** keep the draft and the restore flag, then sign in.
  - **Signed in:** save, then the product page with `designId` ("*Your design is attached and ready to order.*" + Edit).
- **Add to cart** → cart drawer → **Checkout** (guest or account; pay on delivery; GST and shipping shown).
- **Exit:** leaves the Studio (back to the product); the draft stays.
- **Unknown [U]:** the checkout UI, payment step, confirmation page, cart line editing, and account saved designs.

---

## 12. Product-family behaviour (rules)

1. **Photo-frame families** (pen, mug, drinkware, umbrella, rainwear, round pad, flat gifts) **always edit on the product**; there is no flat mode.
2. **Perspective families** (signs, labels, bags, caps, apparel mockups, stamps, perspective gifts) open **On product**, with **Flat artwork** (or **Seal design**) as the alternative.
3. **Apparel and polo** use enlarged stages with the garment around the print area (2.4× / 3.6×).
4. **Flat families** (cards, stationery, notebooks, folders, envelopes) edit the print area flat, with special guides; 3D in preview.
5. **Photo stays as photographed:** what isn't the coloured part keeps its photographed look (frames, shafts, zips, rims, screens).

---

## 13. Current implementation comparison

| Workflow | Original | Our implementation | Status | Gap |
|---|---|---|---|---|
| Product selection & product page | Options, price, tiers, Add to cart, Design it | Same data, options, price, tiers; **Start designing** link; Add to cart placeholder (Phase 6) | PARTIAL | cart/checkout |
| Required-options dialog | Orientation\* + quantity before the Studio | none: goes straight to the Studio | MISSING | dialog; orientation param |
| Variant carried into Studio | `variantId` | `variantId` | MATCH | — |
| Studio Product options panel | first tool, open by default, real choices | "Product" tool = read-only info | MISSING | whole panel |
| Effective variant / price from Studio choices | yes, saved and undoable | no | MISSING | — |
| Default workspace | product photo (photo families) / On product (perspective) | flat print area for all | **WRONG** | product-first |
| Product view for pens, mugs, drinkware, umbrella, rainwear | always on product | optional toggle, Flat default; rights-blocked | **WRONG** | make default/only; rights decision |
| Product view for apparel, polo, bags, caps, signs, labels, gifts, stamps, round pad | yes (enlarged/perspective) | flat only | MISSING | per family |
| Placement data (pen, mug, drinkware, umbrella, rainwear) | exact | exact copies | MATCH | — |
| Product colour (variant) | Studio choice = ordered colour, saved, undoable | M3: view state, not saved, not undoable, no variant | **WRONG** | semantics |
| Part / substrate colours | Studio choices, saved | none (pens and mugs deferred) | MISSING | — |
| Masked tint (umbrella/rainwear) | natural tint | clean re-implementation (frame omitted) | PARTIAL | frame overlay above artwork |
| Size / envelope / lid options in Studio | yes, resize artwork | none (sizes fixed, D2) | MISSING | — |
| Front/Back | tabs with counts; per-side artwork; shared physical choices | front/back with counts; copy front→back; clear side | PARTIAL | "Same design on both sides"; flap/cover/pocket areas |
| Upload | Upload design on print area, drag-drop, 20 MB, PNG/JPG/WEBP/GIF/SVG, Fill/Fit, crop by pan | Uploads panel, 10 MB, PNG/JPEG/WEBP, DPI, missing-file handling | PARTIAL | limits, types, on-canvas upload, Fill/Fit, crop |
| Text | 7 fonts, curve, line spacing | 4 bundled families, rich controls; no curve | PARTIAL | curved text; font list |
| Graphics | 33 SVGs | library with rights-withheld graphics | PARTIAL | rights decision |
| Shapes | 3 | many | MATCH | superset |
| Templates | 95 | 16 | PARTIAL | more templates |
| Background | swatches, CMYK, recent, hex | swatches, recent, hex | PARTIAL | CMYK |
| QR code / Table | yes | no | MISSING | — |
| Layers | order, hide, lock, delete | same + rename, drag-free reorder | MATCH | — |
| Properties | X/Y/W/H/rotation/opacity, centre, align to product, fit to safe area, expand to bleed | X/Y/W/H/rotation/opacity, centre H/V, lock-ratio | PARTIAL | fit-to-safe, expand-to-bleed, align to product |
| Undo/redo | yes; option changes undoable | yes (design edits) | PARTIAL | option changes |
| Zoom/pan | − % + fit | 10–400 %, presets, pan, pinch | MATCH | — |
| Save (local) | IndexedDB autosave, status, Save now → version | IndexedDB autosave, status, Save now, versions | MATCH | — |
| Save (cloud), sign-in restore | yes | none (Phase 6) | MISSING | accounts |
| History / versions | local versions, restore | versions, restore with undo | MATCH | — |
| Preview | Review dialog + 2D/3D toggle; product shown | full-screen Preview (flat default; on-product optional); Print check & proof | PARTIAL | Review on Next; product by default; 3D |
| Proof download | in Review / project menu | in Print check | MATCH | placement only |
| Next / Approve | Review → Approve → attached to product page | **Continue = "coming soon"** | MISSING | whole flow |
| Product page "design attached" | yes | no | MISSING | — |
| Cart / checkout | yes | placeholders (Phase 6) | MISSING | backend |
| Responsive | desktop layout stacked on phones | dedicated tablet/phone layouts | MATCH | UI only (redesign allowed) |

---

## 14. Incorrect assumptions in our implementation

1. **WRONG — Flat-first Studio.** We open every product on a flat print area. The original opens photo-frame families on the product photo and perspective families "On product".
2. **WRONG — Product view as an optional toggle for pens, mugs, drinkware, umbrellas and rainwear (M1–M4).** The original has no flat mode for them; the product photo *is* the workspace.
3. **WRONG — Product colour as view state (M3).** M3 made colour "never saved, never undone, never changes the variant". In the original, the colour chosen in the Studio *is the colour ordered*, is saved in the design, is undoable and sets the effective variant.
4. **WRONG — Product options deferred to a later "options panel" while the Studio shows read-only product info.** The original Studio opens on Product options.
5. **WRONG — Direct entry to the Studio.** The original always asks for required options (orientation, quantity) first.
6. **WRONG — Continue as a placeholder.** The original's Next → Review → Approve is a core step, not a later feature.
7. **WRONG — Upload limits** (10 MB; no GIF/SVG) versus the original's 20 MB and PNG/JPG/WEBP/GIF/SVG.
8. **WRONG — Phase placement.** The plan put umbrella, sign and gift product modes in Phase 5 and the Studio options panel "later". These are the original's *core* Studio, not advanced features; 3D alone is the later work.
9. **Simplified — Fixed print size (decision D2 extended too far).** D2 kept catalogue sizes unchanged (correct), but the original *also* lets customers change size in the Studio (signs, gifts, mugs, envelopes), scaling the artwork. That workflow is missing.
10. **Simplified — Mug and pen parts.** The original cuts mugs out and recolours parts using drawn shapes; we show photo halves as taken.
11. **Not a workflow difference (decision needed):** the original shows the recovered photos; ours blocks them by rights. The workflow must be product-first regardless. *Which* photos may be shown is a business decision.
12. **Extra, acceptable:** our full-screen Preview, Print check, shapes set, zoom range and phone/tablet layouts are UI improvements that don't change the workflow, as long as Review/Approve exist.

## 15. Missing functionality (to reach parity)

1. The required-options dialog and the orientation parameter.
2. The Studio Product options panel per family, with effective variant and price, saved and undoable.
3. A product-first workspace for every family (photo frames; enlarged apparel and polo stages; perspective "On product" with Flat artwork).
4. Variant-colour semantics, plus part/substrate colours saved in the design.
5. Size, envelope and lid choices that resize the artwork.
6. Next → Review your design → Approve → design attached to the product page → Add to cart (with a local stand-in for sign-in until accounts exist).
7. QR code, Table, curved text, CMYK background, Fill/Fit and crop for images, fit-to-safe-area and expand-to-bleed, "Same design on both sides", on-canvas Upload design, 20 MB and GIF/SVG uploads.
8. The remaining templates (95).
9. 3D previews (polo, cards, cylinders, cones, boxes, stamps, round pad).
10. Cloud save, accounts, cart, checkout (Phase 6).

## 16. Recovered-source evidence

| Workflow | Source (`../recovered/_next/static/chunks/`) | Evidence | Ours | Status |
|---|---|---|---|---|
| Required-options dialog | `40mjs_h36bgnb.js` (~9 700–22 600) | `Product Orientation*`, quantity select, `onNext` → `/products/${slug}/design?orientation=…&variantId=…&designId=…` | none | MISSING |
| Studio stage per family | `10tigen5gn4-f.js` (~403 000) | pen/mug/drinkware/umbrella/round-pad/gift-flat frames; apparel 2.4×/32 %; polo 3.6×/51 % | M2 product bounds (5 families, optional) | PARTIAL |
| Editing view default | `10tigen5gn4-f.js` (~403 500) | `useState("product")`; "On product" / "Flat artwork" / "Seal design" for perspective and stamp profiles | Flat default | WRONG |
| Effective variant from design | `10tigen5gn4-f.js` (~440 400) | `umbrellaRainwearVariantFor(…, design.umbrellaRainwear.colorLabel)`, drinkware/sign/stamp equivalents | none | MISSING |
| Save with variant | `10tigen5gn4-f.js` (~448 000) | `saveDesign({productId, variantId: effective, name, canvasJson, previewImageUrl})`; local save toasts | local save without variant choices | PARTIAL |
| Umbrella/rainwear placement and colour | `1mx9q60dex768.js` | 70 boxes, palette, photo colours, `umbrellaRainwearTint` | `product-view-placements.json`, tint | MATCH (data) / WRONG (colour semantics) |
| Drinkware placement | `1mx9q60dex768.js` | 220 boxes, kind fallbacks, lids, colours | placements (wrap only) | PARTIAL |
| Natural tint | `3zkk7bvc_w-nw.js` (~80 000) | `buildNaturalSource`, `applyNaturalTint` (matte, relief 2.6) | `product-view/tint.ts` | PARTIAL (frame overlay omitted) |
| Pens | `3zkk7bvc_w-nw.js` (~87 800) | `PEN_MOCKUP_SIZE` 2000 × 700, `penPrintRect`, 10 families, 50 slugs, part colours | placements + frames | MATCH (geometry) / MISSING (parts) |
| Mugs | `3zkk7bvc_w-nw.js` (~77 700, ~534 000) | `MUG_MOCKUP_SIZE` 900 × 1086, side 724, back offset 176, 9 boxes, cut-out paths | frames (5 photos) | MATCH (geometry) / MISSING (cut-out, parts) |
| Review / approve | `10tigen5gn4-f.js` | "Approve and continue", guest sign-in redirect, restore flag | none | MISSING |

## 17. MUST MATCH vs CAN REDESIGN

**MUST MATCH ORIGINAL**
- the customer journey and the required-options step;
- the variant, price and SKU rules, including Studio choices that change the SKU;
- product-family workspaces (photo frame, enlarged apparel/polo stages, perspective On product / Flat);
- print dimensions, DPI, bleed, safe zone and print areas;
- placement formulas and boxes;
- colour semantics (variant colour vs part/substrate colour; saved; undoable);
- front/back and multi-area semantics, shared physical choices and per-side artwork;
- the artwork tools and their behaviour (text, images, graphics, shapes, background, templates, QR, table, layers, properties);
- undo/redo coverage;
- save, history and restore behaviour;
- Next → Review → Approve → design attached → cart;
- the Review content (sides, DPI warning, proof, approve);
- product-specific copy rules (what stays "as photographed").

**CAN BE REDESIGNED**
- visual design, layout, typography, colours, spacing, icons;
- navigation style, panel placement (rail, sheets, drawers);
- dialog styling, responsive presentation (our tablet/phone layouts);
- animations and micro-interactions;
- extra conveniences that don't change outcomes: the full-screen Preview, Print check advice, a larger zoom range, keyboard help, more shapes.

## 18. Final target architecture / workflow

```
Product page (options, price) ─ Design it ─▶ Required options (orientation, quantity) ─▶ Studio
Studio = Product options (first) + artwork tools + product-family workspace
   design document = artwork per side (print px) + product choices (variant colour, size, lid, part/substrate colours)
   effective variant = f(product-page variant, design product choices) → price in top bar, saved with the design
   workspace = family stage (photo frame | enlarged garment | perspective On product/Flat | flat print area)
   photos: shown when rights are cleared; otherwise the same workspace falls back to the print area (+ dev stand-ins)
Next ─▶ Review (product per side, 2D/3D, DPI alert, proof) ─▶ Approve
   ─▶ (guest: keep draft → sign in → restore) ─▶ product page "design attached" ─▶ Add to cart ─▶ checkout
```

**Schema implication:** product choices must live in the design document, as in the original; today the document holds artwork only. This needs a versioned schema change (v3) with migration, decided before implementation.

## 19. Recommended implementation order

1. **Schema v3 for product choices** (design document + migration) and the **effective-variant** function per family, with price in the top bar. Change undoable; saved.
2. **Studio Product options panel**, first tool and open by default: umbrella/rainwear/apparel/bag/cap colour (variant), drinkware lid + colours, stamp ink + preset, sign/label substrate + size. Rework M3 colour onto it (saved, undoable).
3. **Product-first workspaces** for the photo-frame families (pen, mug, drinkware incl. per-lid photos, umbrella, rainwear, round pad, flat gifts): the product stage as the only mode, falling back to the print area when the photo isn't available. Keep the Preview product-first as well.
4. **Required-options dialog** and the orientation parameter (cards first).
5. **Next → Review → Approve → design attached → Add to cart** (local, until accounts exist).
6. **Size-changing options** (signs, gifts, mugs, envelopes, card orientation) with proportional artwork resize.
7. **Apparel and polo stages** (2.4× / 3.6×) with garment tint, then polo features.
8. **Perspective On product / Flat artwork** for signs, labels, bags, caps, stamps and gifts.
9. **Artwork-tool parity:** QR, Table, curved text, CMYK, image Fill/Fit and crop, fit-to-safe, expand-to-bleed, Same design on both sides, 20 MB + GIF/SVG uploads, on-canvas Upload design, templates to 95.
10. **3D previews** (Phase 5) and **accounts, cloud, cart, checkout** (Phase 6).

**Business decisions needed before step 3 shows photos to customers:** the rights for recovered photos, masks and graphics, and the product-page gallery images (which today show recovered photos outside the Studio's rights gate).

## 20. Unknowns requiring future verification

- What `orientation` does for non-card products.
- Checkout UI, payment, confirmation, emails; cart line editing; account saved designs and orders.
- Cloud autosave cadence and retry policy; undo depth.
- 3D preview details per family (only names and components are known).
- Perspective face data for signs, labels, bags and caps (in source, not yet extracted); sign/poster colour tables.
- Whether quantity can be changed after a design is attached.
- The price shown in the Studio top bar when the quantity tier differs (observed ₹899 unchanged for colour).
- Server-side print-file generation (what production receives).
- The mobile workflow beyond the stacked layout observed on the umbrella.
