# Aaraprint rebuild

A new storefront and Design Studio for Aaraprint — custom print and merchandise for India — with a completely new, light, accessible UI. The original site is used only as a reference for business rules and data.

**Source of truth:** the four reports in this folder — `AARAPRINT_RECONNAISSANCE.md`, `AARAPRINT_UI_UX_BLUEPRINT.md`, `AARAPRINT_ASSET_INVENTORY.md`, `AARAPRINT_IMPLEMENTATION_PLAN.md`.

**Status:** Phase 1 (Foundations) complete. See [Phase plan](#phases).

## Quick start

Requires Node ≥ 22.22 and, for end-to-end tests, Google Chrome.

```sh
npm install
npm run dev            # http://localhost:5173
npm run check          # lint + typecheck + unit tests
npm run build          # production build with pre-rendered pages
npm run preview        # serve the build with production routing rules (http://localhost:4173)
npm run test:e2e       # Playwright + axe against the preview server (run `npm run build` first)
```

Useful pages: `/` (interim home) and `/design-system` (tokens and every component, with live catalogue data).

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
  routes/                  route modules (home, design-system, planned placeholders, 404, studio placeholder)
  design-system/           tokens.ts + ~30 components (Button, Field, OptionChips, QuantityTiers, Dialog, Sheet, Toast …)
  components/shell/        header, products menu, mobile menu, search, utility bar, footer, skip link
  components/docs/         sections of the /design-system reference page
  lib/                     cn, INR formatting, contrast, media URLs, SEO meta, pricing, API client, catalogue types
  data/generated/          slim navigation data bundled into the shell (generated)
  styles/                  app.css → Tailwind + fonts + theme.css (tokens) + base.css
public/api/v1/catalogue/   mock catalogue API: categories, collections, 533 products (generated)
scripts/
  catalogue/import-catalogue.mjs        builds the catalogue data from ../recovered (+ print configs)
  recovery/recover-additional-assets.mjs downloads assets missing from ../recovered into ../recovered-additional
  serve-build.mjs                       production preview server (static-hosting rules)
tooling/local-media.ts     serves /media/* from the recovered folders in dev/preview
e2e/                       Playwright specs (routing, navigation, keyboard, axe accessibility, visual review)
```

## Data and media

- `npm run data:import` regenerates `public/api/v1/catalogue/**` and `src/data/generated/**` from `../recovered/pages` and `../recovered-additional/data/print-configs.json`. Generated files are committed so the app runs without the recovered folders.
- Media are referenced by path (e.g. `products/pens-2d/classic-front.png`) and resolved by `mediaUrl()`. In dev/preview `/media/*` is served from `../recovered-additional` then `../recovered` (override with `AARAPRINT_MEDIA_ROOTS`). In production set `VITE_MEDIA_BASE_URL` to the CDN.
- `../recovered/` is read-only. Recovery scripts refuse to write inside it.

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_API_BASE_URL` | Catalogue API base | `/api/v1` (static mock) |
| `VITE_MEDIA_BASE_URL` | Product media base | `/media` |
| `VITE_SITE_URL` | Origin for canonical / Open Graph URLs | unset (tags omitted) |
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
| 2 | Catalogue, product pages and content pages | Next |
| 3 | Design Studio core (flat products) | — |
| 4 | Studio advanced (snapping, QR, preflight, apparel & wrap modes, mobile Studio) | — |
| 5 | 3D previews and remaining product modes | — |
| 6 | Cart, checkout (pay on delivery), accounts, tracking — needs backend | — |
| 7 | Polish, performance, SEO and launch | — |
