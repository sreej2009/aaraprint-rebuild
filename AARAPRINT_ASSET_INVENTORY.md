# Aaraprint — Asset Inventory

**Date:** 31 Oct 2026 · **Scope:** `../recovered/` (parent workspace) compared with what the live site (http://200.234.38.165) and its code reference.
**Method:** file listing + binary header inspection (dimensions, alpha) + cross-check against (a) every product's `printConfig` fetched from `/products/{slug}/design` and (b) asset paths hard-coded in the Studio bundles. Missing files were checked with HTTP `HEAD` only — **nothing was downloaded into, moved within, or deleted from `recovered/`.**

---

## 1. Summary

| Group | Location (`recovered/…`) | Files | Size | Reusable? |
|-------|--------------------------|-------|------|-----------|
| Product mockups — drinkware | `drinkware-2d/` | 220 PNG | 210 MB | ✅ Studio mockups (all 48 drinkware products covered) |
| Product mockups — clothing, caps, bags | `clothing-caps-bags-2d/` | 96 PNG | 70 MB | ✅ partial (48 of 65 products) |
| Product mockups — labels & packaging | `labels-packaging-2d/` | 80 PNG | 40 MB | ✅ partial (40 of 60) |
| Product mockups — signs & posters | `signs-posters-2d/` | 90 PNG | 27 MB | ✅ partial (45 of 69) |
| Product mockups + masks — umbrellas & rainwear | `umbrellas-rainwear-2d/` | 70 WebP + 70 mask PNG | 4.5 MB | ✅ complete (35 of 35) |
| Pen family mockups | `pens-2d/` | 10 PNG (RGBA) | 3.8 MB | ✅ 5 of 9 families |
| Mug mockups | `mugs-2d/` | 4 PNG | 4.1 MB | ✅ 3–4 of 4 (one name mismatch) |
| Gift mockups (frames, albums, magnets, coasters, acrylics…) | `gifts-2d/{first-five,more,more2}/` | 7 PNG + 26 WebP | 16 MB | ✅ partial (33 of ~73 referenced) |
| Polo flat mockups | `apparel-polo/` | 2 PNG | 3.2 MB | ✅ (`/products/polo/front.png`, `back.png`) |
| Product photography (Supabase bucket `product-media`) | `product-media/` | 149 images | 81 MB | ✅ gallery images for 149 products |
| ↳ exact duplicate | `supabase-media/product-media/` | 149 | 81 MB | ⚠ duplicate — use one copy |
| Homepage 3D shirt | `shirt_baked.glb` | 1 | 1.0 MB | ⚠ optional (hero only) |
| Brand | `brand/logo-color.svg`, `brand/logo-white.png` | 2 | 0.13 MB | ✅ if the brand mark is kept |
| App icons | `favicon.ico`, `icon.png`, `apple-icon.png` | 3 | 34 KB | ✅ |
| Site UI fonts (Archivo, IBM Plex Sans/Mono) | `_next/static/media/` | 9 WOFF2 | 172 KB | ❌ not in new identity |
| Compiled JS/CSS (Next.js/Turbopack) | `_next/static/chunks/` | 45 JS + 2 CSS | 4.2 MB | 📖 reference only |
| HTML snapshots | `pages/` | 681 pages (71 route folders) | — | 📖 reference only (content, data) |
| Studio shell snapshot | `design-studio.html` | 1 | 142 KB | 📖 reference only (client-rendered shell) |
| Verified samples | `verified-images/` | 2 JPG | 0.7 MB | 📖 reference |
| Crawl metadata | `report.json`, `pages-inventory.txt`, `extracted-urls.txt` | 3 | — | 📖 reference |

**Totals:** 1,722 files, ≈663 MB. About **81 MB is a duplicate** (`supabase-media/product-media` = `product-media`, verified identical with `diff -r`).

Working files from earlier analysis also sit in the parent folder `Scrab/` (not part of `recovered/`): `recover.mjs`, `asset-trace.txt`, `all-product-media-urls.txt`, `glb-analysis.txt`, `*-context.txt`, test renders (`mug-test.png`, `tshirt-test.png`, `umbrella-test.webp`, `umbrella-mask-test.png`, `drinkware-contact-sheet.jpg`).

---

## 2. Product mockups (front/back images used by the Studio)

### 2.1 How the original uses them (confirmed in code)

- Each product's print config has `mockupBackgroundUrl` (front) and `mockupBackgroundUrlBack` (back) — e.g. `/products/clothing-caps-bags-2d/apparel-cap-printed-front.png`.
- Server path `/products/<folder>/…` maps to local `recovered/<folder>/…`. Exception: `/products/polo/*` → `recovered/apparel-polo/*`.
- Mockups are **opaque product photos on light backgrounds** (1024×1024 for clothing/labels/signs, 1122×1402 for drinkware/umbrellas, 1254×1254 for gifts/polo, 2119×742 for pens, 1448×1086 for mugs). Many already contain **sample artwork** printed on the product (e.g. the printed cap). The original Studio has "Remove default artwork" and recolours products by pixel analysis (`drinkwareSilhouette`, `drinkwareParts`, `applyNaturalTint`), not by separate layers.
- 255 of 532 customisable products have **no mockup** (`null`) and render a flat canvas or a procedural 3D shape instead (visiting cards, stationery, mugs/pens via profiles, gifts via hard-coded profiles).

### 2.2 Coverage by folder

| Folder | Naming | Recovered | Referenced by print configs | Missing locally (exist live) |
|--------|--------|-----------|-----------------------------|-------------------------------|
| `drinkware-2d/` | `<slug>[-<lid>]-front|back.png` (lid = flip / screw / sipper variants) | 220 | 96 | 0 — plus extra lid variants |
| `umbrellas-rainwear-2d/` | `<slug>-front|back.webp` + `-front|back-mask.png` | 140 | 70 | 0 |
| `clothing-caps-bags-2d/` | `<slug>-front|back.png` | 96 | 130 | **34** |
| `signs-posters-2d/` | `<slug>-front|back.png` | 90 | 138 | **48** |
| `labels-packaging-2d/` | `<slug>-front|back.png` | 80 | 120 | **40** |
| `pens-2d/` | `<family>-front|back.png` | 10 | via pen profiles | **8** (gel, highlighter, stylus, wheat) |
| `mugs-2d/` | `<profile>.png` (front+back on one image) | 4 | via mug profiles | **1** (`colour-changing-magic.png`; local file is named `magic-colour-change.png` and differs in size — verify) |
| `gifts-2d/…` | `first-five/`, `more/`, `more2/n1-*`, `n2-*`, `default-art/` | 33 | ~73 | **~39** |
| `apparel-polo/` | `front.png`, `back.png` | 2 | 43 polos | 0 |

### 2.3 Products whose mockups are missing (exist on the live server)

- **Clothing, caps & bags (17 products):** apparel-cap-dad-hat, apparel-cap-structured, apparel-hoodie-pullover, apparel-hoodie-zipup, apparel-sweatshirt-crew, apparel-tshirt-classic-cotton, apparel-tshirt-performance, bag-cotton-canvas-tote, bag-drawstring-backpack, bag-garment-suit, bag-insulated-cooler, bag-jute-tote, bag-mini-gift, bag-non-woven-carry, bag-paper-kraft, bag-paper-laminated, bag-zippered-tote.
- **Signs, posters & marketing (24 products):** banner-backlit-fabric, banner-feather-flag, banner-mesh-windproof, banner-table-throw, banner-vinyl-standard, brochure-bifold-a4, brochure-trifold-a4, brochure-zfold-a4, flyer-a4-standard, flyer-a5-heavyweight, flyer-a5-matte, flyer-a5-recycled, flyer-a5-standard, flyer-a6-mini, flyer-dl-slim, sign-acrylic-premium, sign-banner-vinyl, sign-corrugated-yard, sign-foam-board, sign-poster-bulk, sign-poster-standard, sign-standee-rollup, standee-rollup-retractable, standee-x-stand.
- **Labels, stickers & packaging (20 products):** label-jar-bottle, label-roll-product, label-shipping, packaging-branded-tape, packaging-hang-tag, packaging-kraft-shipping-box, packaging-label-foil-stamped, packaging-label-roll, packaging-label-tamper-seal, packaging-mailer-box, packaging-poly-mailer, packaging-rigid-gift-box, packaging-tissue-paper, sticker-bumper, sticker-circle-glossy, sticker-clear-vinyl, sticker-die-cut-vinyl, sticker-holographic, sticker-kraft-paper, sticker-square-matte.
- **Pens:** `gel`, `highlighter`, `stylus`, `wheat` family front/back (8 files).
- **Gifts:** `default-art/` (calendar-flip-desk, calendar-wall-new-size, lamp-journal-led front/back, water-bottle-steel), `first-five/canvas-print-*`, `more/coaster-acrylic-printed-*`, `more/coaster-customized-*`, `more/framed-photo-print-*`, `more/water-bottle-*`, `more2/calendar-magnet-*`, `more2/n1-3,5,6,7-*`, `more2/n2-1..4,6,7,8-*`, `round-photo-mouse-pad-front|back-v2.png`. (`more2/n2-1-back.webp` did not respond to HEAD — may not exist.)

Total: **122** print-config mockups + **49** code-referenced 2D assets + **1** 3D model ≈ 172 files (≈21 MB for the code-referenced set; the 122 print-config mockups are likely 40–60 MB more based on typical sizes).

---

## 3. Masks

| Asset | Files | Format | Purpose (confirmed) |
|-------|-------|--------|---------------------|
| Umbrellas & rainwear | 70 (`<slug>-front-mask.png`, `<slug>-back-mask.png`) | RGB PNG 1122×1402, white = printable/recolourable fabric, black = everything else | Restricts tint/artwork to canopy or garment fabric ("The colour applies to the canopy fabric. The frame, shaft, handle and tips stay as photographed.") |
| All other families | — | — | No mask files. The original computes silhouettes and part regions at runtime from pixels (drinkware), or uses hard-coded quads/rounded-rect "keep" regions (gifts), or rect maths (pens, mugs). |

**Recommendation:** produce masks for every apparel/bag/drinkware/mug/pen mockup as part of the rebuild (part-separated: body, cap/lid, handle, trim). Runtime pixel analysis is fragile and slow on phones.

---

## 4. 3D models

| Model | Local | Live | Used for | Licence |
|-------|-------|------|----------|---------|
| `/models/polo-shirt.glb` (649 KB) | ❌ **missing** | ✅ | Studio 3D preview for all 43 polo products (decal projection of front/back) | "POLO SHIRT" by **arvintriyoga**, **CC BY 4.0** (attribution shown in the original UI) |
| `/shirt_baked.glb` (1.0 MB) | ✅ `recovered/shirt_baked.glb` | ✅ | Homepage hero "InteractiveProduct3D"; also `model3d` for one product (`apparel-tshirt-classic-cotton`, UV offset/scale for front print) | Unknown — confirm before reuse. Blender glTF exporter v1.8.19, 1 mesh, material `lambert1`, 2 JPEG textures, `KHR_texture_transform`. |
| Other 3D previews | n/a | n/a | Procedural geometry in code: card (extruded shape), cylinder (mugs, bottles, pens), cone (umbrellas), box (packaging), stamp, round mouse pad | No assets needed |

Draco decoder is loaded from `https://www.gstatic.com/draco/versioned/decoders/1.5.5/` by the original; neither GLB above needs it (verify after recovery).

---

## 5. Product photography (gallery images)

| Source | Count | Notes |
|--------|-------|-------|
| Supabase public bucket `product-media/<category>/<slug>/1.<ext>` | 149 products (stationery 65, visiting cards 31, signs 23, stamps 16, mugs/gifts 14) | Recovered in `product-media/`. Mixed PNG (palette, often 1254×1254), JPEG, WebP, 1 AVIF. |
| Server mockups shown as the PDP image (`/_next/image?url=/products/...`) | 233 products | Same files as §2 (front mockup). |
| **Unsplash stock photos** (`images.unsplash.com`) | 67 products + 11 category banners | Credited on `/credits` ("this demo storefront"). Not recovered. Replace with real product photography. |
| No image at all | 86 product pages render without a product image ("Photo coming soon"; homepage bestsellers show "Design pending") | Need photography or generated mockups. |

---

## 6. Fonts

| Font | Where | Files | Reuse |
|------|-------|-------|-------|
| Archivo 500/600/700/800 | Original site UI (headings) | `_next/static/media/archivo_*.woff2` | ❌ new identity uses Inter + Manrope |
| IBM Plex Sans 400/500/600 | Original site UI (body) | `ibm_plex_sans_*.woff2` | ❌ |
| IBM Plex Mono 400/500 | Original site UI (specs, numbers) | `ibm_plex_mono_*.woff2` | ❌ |
| Studio fonts | Original Studio offers 7 **system** fonts: Arial, Georgia, Courier New, Times New Roman, Verdana, Trebuchet MS, Impact. Templates reference **Plus Jakarta Sans** and **Fraunces** (mapped to Arial/Georgia in the picker; not loaded). | none | Build a new curated, self-hosted library (Blueprint §11.6). |

All are OFL-licensed if needed for reference.

---

## 7. Logos, icons, graphics

| Asset | Details | Reuse |
|-------|---------|-------|
| `brand/logo-color.svg` (2.6 KB) | Primary Aaraprint mark (light backgrounds) | ✅ unless a brand refresh is decided |
| `brand/logo-white.png` (5964×2320 RGBA, 128 KB) | Reversed mark | ✅ convert to SVG if possible |
| `favicon.ico`, `icon.png`, `apple-icon.png` | App icons | ✅ regenerate from SVG for the new theme colour |
| UI icons | Lucide (bundled in JS) | ✅ same library (`lucide-react` installed) |
| Category icons | Lucide icons per category slug (`CategoryIcon`) | ✅ concept only |
| Studio graphics library | **33 inline SVGs** in the editor bundle: Sunset, Leaves, Abstract, Marble, Ocean gradient, Paper texture, Luxury navy, Soft geometry, Heart, Star, Check, Camera, Bolt, Location, Phone, Website, Email, Calendar, Secure, Delivery, Flower, Rocket, Gift, Business growth, Customer support, Creative teamwork, Global delivery, Priority mail, Air mail, Verified seal, Leaf monogram, Express stamp, Premium crest | ⚠ can be extracted as SVG files; restyle to the new palette or replace with a licensed set |
| Shapes | rect ("Brand block"), ellipse ("Outline seal"), line ("Fine divider") | Rebuild (expanded set) |
| Templates | 95 layout templates defined in code (relative geometry) | ⚠ content/layout reference; restyle (list in Reconnaissance Appendix B) |

---

## 8. Recovery still needed

> **Update (Phase 1):** items 1–5 below were recovered into `../recovered-additional/` by `aaraprint-rebuild/scripts/recovery/recover-additional-assets.mjs` — 189 files, 75.7 MB, 0 failures (122 Studio mockups, 49 Studio assets, the polo GLB, 17 reference JS chunks), plus `data/print-configs.json`. `../recovered/` was not modified. In development and preview both folders are served at `/media/*` by `tooling/local-media.ts`.

| # | Item | Count | Priority | How (when approved) |
|---|------|-------|----------|---------------------|
| 1 | Polo 3D model `/models/polo-shirt.glb` | 1 | High | GET from live; keep CC BY 4.0 attribution |
| 2 | Missing print-config mockups (clothing 34, signs 48, labels 40) | 122 | High | Extend `recover.mjs` to read `printConfig` from each `/products/{slug}/design` page and download into a **new** folder (e.g. `recovered-extra/`) so `recovered/` stays untouched |
| 3 | Pen family mockups (gel, highlighter, stylus, wheat) | 8 | High | Same |
| 4 | Gift mockups (`gifts-2d/**`, round mouse pad v2, default art) | ~39 | Medium | Same |
| 5 | Mug profile `colour-changing-magic.png` | 1 | Medium | Same; compare with local `magic-colour-change.png` |
| 6 | Category hero images (`hero_image_url`) | 11 | Low | From category data (currently Unsplash) |
| 7 | Unsplash product photos | 67 products | Low | Replace rather than recover |
| 8 | Product/variant colour imagery for apparel colour swatches | unknown | Medium | Not observed as separate files; generated by tinting — decide on real photos vs tinting |

A full machine-readable list of the 122 + 50 missing URLs was produced during inspection (scratch files, not part of the deliverable) and can be regenerated in the recovery step.

---

## 9. Reuse recommendations

1. **Use recovered mockups as interim Studio backgrounds**, converted to WebP/AVIF at 1600 px (current PNGs are 0.3–1.6 MB each; drinkware alone is 210 MB). Keep originals as masters outside the app bundle (object storage/CDN).
2. **Prefer blank mockups.** Many mockups have sample artwork baked in. For a premium editor, commission or generate blank, evenly-lit mockups per colour, with layered masks (fabric, trim, hardware).
3. **Normalise naming** into a manifest, e.g. `mockups/<productSlug>/<variantKey>/<side>.webp` + `mask-<part>.png`, and reference it from product data (`print.mockups`), not from hard-coded paths in code.
4. **Deduplicate** `supabase-media/product-media` (identical to `product-media`).
5. **Do not reuse** the original UI fonts, colours or decorative assets (Blueprint requires a new identity).
6. **Rights check before launch:** brand-name products (Adidas, Puma, Levi's, U.S. Polo Assn., Arrow, Woodland, Marks & Spencer, American Tourister, Targus, Cello…) appear in product names/photos; Unsplash images need attribution or replacement; polo GLB requires CC BY 4.0 credit; `shirt_baked.glb` licence unknown; origin/licence of AI-looking mockups unknown.

---

## 10. Asset locations quick reference

```
Scrab/
├─ recovered/                         (read-only reference — do not modify)
│  ├─ apparel-polo/{front,back}.png                  → served as /products/polo/*
│  ├─ clothing-caps-bags-2d/<slug>-{front,back}.png
│  ├─ drinkware-2d/<slug>[-<lid>]-{front,back}.png
│  ├─ labels-packaging-2d/<slug>-{front,back}.png
│  ├─ signs-posters-2d/<slug>-{front,back}.png
│  ├─ umbrellas-rainwear-2d/<slug>-{front,back}.webp + -mask.png
│  ├─ pens-2d/<family>-{front,back}.png
│  ├─ mugs-2d/<profile>.png
│  ├─ gifts-2d/{first-five,more,more2}/…
│  ├─ product-media/<category>/<slug>/1.<ext>        (= supabase-media/product-media)
│  ├─ brand/logo-color.svg, logo-white.png
│  ├─ favicon.ico, icon.png, apple-icon.png
│  ├─ shirt_baked.glb
│  ├─ _next/static/{chunks,media}/                   (compiled app, fonts)
│  ├─ pages/…/index.html                             (681 HTML snapshots)
│  └─ design-studio.html, report.json, pages-inventory.txt, extracted-urls.txt
└─ aaraprint-rebuild/                 (new app — assets will live in object storage, not in src/)
```
