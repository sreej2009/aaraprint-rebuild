# Aaraprint rebuild

A new storefront and Design Studio for Aaraprint — custom print and merchandise for India — with a completely new, light, accessible UI. The original site is used only as a reference for business rules and data.

**Source of truth:** the four reports in this folder — `AARAPRINT_RECONNAISSANCE.md`, `AARAPRINT_UI_UX_BLUEPRINT.md`, `AARAPRINT_ASSET_INVENTORY.md`, `AARAPRINT_IMPLEMENTATION_PLAN.md`. For workflow behaviour, `AARAPRINT_CLONE_WORKFLOW_AUDIT.md` (the verified audit of the original, all 533 products) comes first.

**Status:** Phases 1 (Foundations) and 2 (Catalogue, product pages and content) complete. See [Phase plan](#phases) and the phase reports in `AARAPRINT_IMPLEMENTATION_PLAN.md` §17.

## Quick start

Requires Node ≥ 22.22 and, for end-to-end tests, Google Chrome.

```sh
npm install
npm run dev            # http://localhost:5173
npm run check          # lint + typecheck + unit tests
npm run build          # production build with pre-rendered pages
npm run preview        # serve the build with production routing rules (http://localhost:4173)
npm run test:e2e       # Playwright + axe against the preview server (run `npm run build` first);
                       # projects: desktop 1440×900, mobile (Pixel 7), tablet 820×1180 (Studio specs)
```

Useful pages: `/`, `/categories/view-all`, any `/categories/<slug>`, `/products/<slug>`, `/products/<slug>/design` (Design Studio, in progress: canvas, selection, inspector, layers, text, shapes and graphics; add `?sample=1` to start from a sample card), `/search?q=mug`, `/privacy`, and `/design-system` (tokens, components and the Studio canvas demo).

**Seeing the Studio's product view locally.** Every recovered product photo and mask has unconfirmed usage rights, so the Studio and Preview show the flat print area and offer no "On the product" choice. That is correct, and production stays that way. To check the product view (umbrellas, rainwear, wrap drinkware, pens, mugs) with generated stand-in photos, run `npm run dev` and open a product with `?product-view-fixtures=1`, e.g. `/products/umbrella-photo-custom?product-view-fixtures=1`, then **Start designing**:
- The choice appears in the canvas footer, and the footer says "on a stand-in photo (development only)".
- The setting is remembered for the browser tab; `?product-view-fixtures=0` turns it off.
- Real photos are never used, and production builds leave this out.

## Stack

| Concern | Choice |
|---------|--------|
| UI | React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`) |
| Build & routing | Vite 8 + React Router 8 framework mode — `ssr: false` with build-time pre-rendering |
| Styling | Tailwind CSS 4, tokens in `src/styles/theme.css` (default palettes removed) |
| Accessible primitives | Radix UI (`radix-ui`), icons from `lucide-react` |
| State | Zustand (toasts now; Studio later) |
| Canvas (Phase 3+) | Konva / react-konva (already installed) |
| Tests | Vitest + Testing Library (jsdom), Playwright + axe-core using the installed Chrome |
| Lint | oxlint with react, jsx-a11y, import, vitest plugins |

## Project structure

```
src/
  root.tsx                 document, fonts, providers, error boundary, loading fallback
  routes.ts                route map — mirrors the original site's URLs
  routes/                  route modules: home, category, product, search, content-page, faq, contact, credits,
                           design-system, planned (Phase 6 placeholders), 404, studio (Design Studio)
  features/catalogue/      listing logic (filters, facets, sort, pages), search, product card/image, filter panel, listing view
  features/product/        option selection & price display, gallery, purchase panel, details, print specs
  features/product-workflow/ product families (26), their options and capabilities, the product configuration
                           saved in designs, and variant/price resolution (data and pure functions; plan §21)
  features/studio/         Design Studio (Phase 3): print geometry, profiles, design schema & commands,
                           store & undo history, shell (layouts, panels, sheets), Konva canvas, zoom/pan, guides,
                           selection, move/resize/rotate, editing shortcuts, inspector and layers panel
  components/content/      prose renderer for imported content blocks
  config/business.ts       business details (support email, hours, shipping rules)
  design-system/           tokens.ts + ~30 components (Button, Field, OptionChips, QuantityTiers, Dialog, Sheet, Toast …)
  components/shell/        header, products menu, mobile menu, search, utility bar, footer, skip link
  components/docs/         sections of the /design-system reference page
  lib/                     cn, INR formatting, contrast, media URLs, SEO meta, pricing, API client, catalogue types;
                           *.server.ts = build-time data access (never bundled for the browser)
  data/generated/          slim navigation data bundled into the shell (generated)
  styles/                  app.css → Tailwind + fonts + theme.css (tokens) + base.css
public/api/v1/catalogue/   mock catalogue API: categories, collections, 533 products (generated)
public/api/v1/studio/      mock Studio API: 532 product profiles (generated)
scripts/
  catalogue/import-catalogue.mjs        builds the catalogue data from ../recovered (+ print configs)
  catalogue/product-types.mjs           product-type rules used for the "Type" filter
  content/import-content.mjs            converts the original content/policy pages into structured blocks
  studio/build-studio-profiles.mjs      builds a Design Studio profile per product (print area, trim, sides, mockups, rights, product-view placements)
  studio/build-product-families.mjs     assigns every product to a product family from the catalogue and the audit's live survey
  studio/extract-product-views.mjs      copies the original's on-product placements (umbrella, rainwear, drinkware, pens, mugs) and umbrella/rainwear colours into data
  recovery/recover-additional-assets.mjs downloads assets missing from ../recovered into ../recovered-additional
  serve-build.mjs                       production preview server (static-hosting rules)
tooling/local-media.ts     serves /media/* from the recovered folders in dev/preview
e2e/                       Playwright specs (routing, navigation, keyboard, axe accessibility, visual review)
```

## Data and media

- `npm run data:import` regenerates `public/api/v1/catalogue/**` and `src/data/generated/navigation.json`; `npm run content:import` regenerates `src/data/generated/content/**`; `npm run studio:profiles` regenerates `public/api/v1/studio/**` and `src/data/generated/studio/profiles-meta.json` (run it after `data:import`); `npm run studio:families` regenerates `src/data/generated/studio/product-families.json` from the catalogue and `scripts/studio/data/original-studio-survey.json`. The catalogue and profile scripts read `../recovered` (and the print configs in `../recovered-additional`). Generated files are committed so the app runs without the recovered folders.
- Media are referenced by path (e.g. `products/pens-2d/classic-front.png`) and resolved by `mediaUrl()`. In dev/preview `/media/*` is served from `../recovered-additional` then `../recovered` (override with `AARAPRINT_MEDIA_ROOTS`). In production set `VITE_MEDIA_BASE_URL` to the CDN.
- `../recovered/` is read-only. Recovery scripts refuse to write inside it.

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_API_BASE_URL` | Catalogue API base | `/api/v1` (static mock) |
| `VITE_MEDIA_BASE_URL` | Product media base | `/media` |
| `VITE_SITE_URL` | Origin for canonical / Open Graph URLs | unset (tags omitted) |
| `VITE_SUPPORT_EMAIL` | Support / grievance email shown on content pages | unset (links to /contact) |
| `AARAPRINT_MEDIA_ROOTS` | Local media folders for dev/preview | `../recovered-additional;../recovered` |

## Deploying the build

`build/client` is a static site. The host must apply the same rules as `scripts/serve-build.mjs`:

1. serve existing files (cache `/assets/*` immutably);
2. serve `<path>/index.html` for pre-rendered pages;
3. serve `__spa-fallback.html` for every other path (client-rendered routes like `/cart`);
4. route `/media/*` to the media CDN.

## Conventions

- Use only design tokens (`bg-surface-subtle`, `text-fg-muted`, `text-h2`, `rounded-md`, `shadow-2`). Tailwind's default palette is intentionally unavailable.
- Merge classes with `cn()` — it understands the custom type scale and shadows.
- Every form control goes inside `<Field>`; option pickers use the choice-group components so keyboard and screen-reader behaviour is consistent.
- Money is integer paise; format with `formatINR()`.
- Keep the original URL structure (`/categories/:slug`, `/products/:slug`, `/products/:slug/design`).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundations — tokens, components, shell, routing + pre-rendering, data layer, tests, asset recovery | ✅ Done |
| 2 | Catalogue, product pages and content pages | ✅ Done |
| 3 | Design Studio core — all customisable products, flat artwork view, desktop/tablet/phone | ✅ Done (plan §18.19) |
| 4 | Studio advanced (snapping, QR, preflight, on-product apparel & wrap modes, options panel) | In progress: M1 product view, M2 on-product workspace, M3 product colour, M4 pens and mugs done (plan §19); workflow parity track M1 schema v3 + product family registry done (plan §21) |
| 5 | 3D previews and remaining product modes | — |
| 6 | Cart, checkout (pay on delivery), accounts, tracking — needs backend | — |
| 7 | Polish, performance, SEO and launch | — |

## Test results (end of Phase 2)

| Check | Result |
|-------|--------|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 97 passed (11 files), including all 5,546 SKU prices |
| `npm run build` | 555 pre-rendered pages |
| `npm run test:e2e` | 112 passed, 10 skipped by design (desktop/mobile only), including axe WCAG 2.2 AA on 19 page types |

Known limitations are listed in `AARAPRINT_IMPLEMENTATION_PLAN.md` §17.

## Public preview (GitHub Pages)

Every push to `main` rebuilds the site and publishes it at https://sreej2009.github.io/aaraprint-rebuild/ (`.github/workflows/pages.yml`). It's built under the `/aaraprint-rebuild/` sub-path (`PAGES_BASE`) and without the recovered media library, which isn't in this repository, so product photos show their placeholders there. To check that build locally:

```bash
PAGES_BASE=/aaraprint-rebuild/ VITE_API_BASE_URL=/aaraprint-rebuild/api/v1 VITE_MEDIA_BASE_URL=none npm run build
node scripts/pages/prepare-pages.mjs && node scripts/pages/serve-pages.mjs   # http://localhost:4174/aaraprint-rebuild/
```
