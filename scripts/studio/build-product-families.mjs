#!/usr/bin/env node
/**
 * Assign every catalogue product to a product family (Phase 4 M1) and record what the original
 * Studio was observed to do for it.
 *
 * Reads (read-only):
 *   public/api/v1/catalogue/products.json             catalogue products (slug, id, category)
 *   scripts/studio/data/original-studio-survey.json   live survey of the original Studio, one
 *                                                     entry per product (AARAPRINT_CLONE_WORKFLOW_AUDIT.md §7)
 *
 * Writes:
 *   src/data/generated/studio/product-families.json   slug → family + observed facts
 *
 * Family behaviour (options, capabilities, …) lives in src/features/product-workflow/families.ts;
 * this script only decides membership. The rules below use the catalogue category and slug, and —
 * where the original itself told products apart by behaviour (mugs vs. other gifts, invitations
 * vs. other stationery) — the observed workspace and first panel. Every family's members must
 * share one workspace and every product must be assigned, or nothing is written.
 *
 * Usage: node scripts/studio/build-product-families.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CATALOGUE = path.join(ROOT, 'public', 'api', 'v1', 'catalogue', 'products.json');
const SURVEY = path.join(ROOT, 'scripts', 'studio', 'data', 'original-studio-survey.json');
const OUT = path.join(ROOT, 'src', 'data', 'generated', 'studio', 'product-families.json');

/** Workspace every member of a family was observed in. */
const FAMILY_WORKSPACE = {
  'visiting-card': 'flat',
  stationery: 'flat',
  letterhead: 'flat',
  invitation: 'flat',
  envelope: 'flat',
  notebook: 'flat',
  folder: 'flat',
  'mouse-pad': 'flat',
  'round-mouse-pad': 'gift-frame',
  stamp: 'perspective-seal',
  sign: 'perspective',
  poster: 'perspective',
  'marketing-print': 'perspective',
  label: 'perspective',
  packaging: 'perspective',
  apparel: 'perspective',
  cap: 'perspective',
  bag: 'perspective',
  polo: 'polo-stage',
  umbrella: 'photo-frame',
  rainwear: 'photo-frame',
  mug: 'photo-frame',
  drinkware: 'photo-frame',
  pen: 'photo-frame',
  gift: 'perspective',
  'gift-frame': 'gift-frame',
};

const FOLDERS = new Set(['stationery-presentation-folder', 'stationery-presentation-folders', 'stationery-ring-binder-file', 'stationery-presentation-file-pocket']);

/** The family for one product, or null when no rule matches (generation then fails). */
function familyFor(product, observed) {
  const { slug, categorySlug: category } = product;
  const surfaces = observed?.surfaces ?? [];
  switch (category) {
    case 'visiting-cards':
      return 'visiting-card';
    case 'stamps-and-ink':
      return 'stamp';
    case 'custom-polo-t-shirts':
      return 'polo';
    case 'drinkware':
      return 'drinkware';
    case 'pens':
      return 'pen';
    case 'umbrellas-rainwear':
      return slug.startsWith('umbrella-') ? 'umbrella' : 'rainwear';
    case 'clothing-caps-bags':
      if (slug.startsWith('apparel-cap-')) return 'cap';
      if (slug.startsWith('bag-')) return 'bag';
      return 'apparel';
    case 'signs-posters-marketing-materials':
      if (slug.startsWith('sign-poster-')) return 'poster';
      if (/^(sign|banner|standee)-/.test(slug)) return 'sign';
      return 'marketing-print';
    case 'labels-stickers-packaging':
      return /^(label|sticker|packaging-label)-/.test(slug) ? 'label' : 'packaging';
    case 'mugs-albums-gifts':
      if (slug === 'gift-mousepad-round-photo') return 'round-mouse-pad';
      if (observed?.panel === 'Mug colors') return 'mug';
      if (observed?.panel === 'Pen colors') return 'pen';
      if (observed?.workspace === 'gift-frame') return 'gift-frame';
      if (observed?.workspace === 'perspective') return 'gift';
      return null;
    case 'stationery-letterheads-notebooks':
      if (slug.includes('letterhead')) return 'letterhead';
      if (/^stationery-envelopes?-(dl|standard)$/.test(slug)) return 'envelope';
      if (FOLDERS.has(slug)) return 'folder';
      if (slug === 'stationery-mouse-pad-custom') return 'mouse-pad';
      if (surfaces.some((s) => /^(Cover|Outside cover)/.test(s))) return 'notebook';
      if (observed?.tool === 'product-options') return 'invitation';
      return 'stationery';
    default:
      return null;
  }
}

async function main() {
  const catalogue = JSON.parse(await fs.readFile(CATALOGUE, 'utf8'));
  const survey = JSON.parse(await fs.readFile(SURVEY, 'utf8'));
  const problems = [];
  const products = {};
  const counts = {};

  for (const product of [...catalogue].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const observed = survey.products[product.slug];
    if (!observed) {
      problems.push(`${product.slug}: not in the survey`);
      continue;
    }
    if (observed.designIt !== product.isCustomizable) problems.push(`${product.slug}: customisable ${product.isCustomizable}, original Design it ${observed.designIt}`);
    const family = familyFor(product, observed);
    if (!family) {
      problems.push(`${product.slug}: no family rule matches (${product.categorySlug})`);
      continue;
    }
    if (observed.designIt && observed.workspace !== FAMILY_WORKSPACE[family]) {
      problems.push(`${product.slug}: family ${family} opens on ${FAMILY_WORKSPACE[family]}, original opened ${observed.workspace}`);
    }
    counts[family] = (counts[family] ?? 0) + 1;
    products[product.slug] = {
      productId: product.id,
      family,
      category: product.categorySlug,
      ...(observed.designIt
        ? {
            observed: {
              tool: observed.tool,
              surfaces: observed.surfaces,
              preview3d: observed.preview3d,
              sameDesignSwitch: observed.sameDesignSwitch,
              entryQuantityTiers: observed.entryQuantityTiers,
            },
          }
        : { observed: null }),
    };
  }
  for (const slug of Object.keys(survey.products)) {
    if (!products[slug] && !catalogue.some((p) => p.slug === slug)) problems.push(`${slug}: surveyed but not in the catalogue`);
  }
  if (problems.length) {
    console.error(`Family assignment failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }

  const out = {
    generatedBy: 'scripts/studio/build-product-families.mjs',
    source: survey.source,
    counts: Object.fromEntries(Object.entries(counts).sort()),
    products,
  };
  // One product per line keeps diffs readable.
  const lines = Object.entries(products).map(([slug, value]) => `    ${JSON.stringify(slug)}: ${JSON.stringify(value)}`);
  const head = JSON.stringify({ generatedBy: out.generatedBy, source: out.source, counts: out.counts }, null, 2).replace(/\n}$/, '');
  await fs.writeFile(OUT, `${head},\n  "products": {\n${lines.join(',\n')}\n  }\n}\n`);
  console.log(`Wrote ${Object.keys(products).length} products in ${Object.keys(counts).length} families → ${path.relative(ROOT, OUT)}`);
  console.log(out.counts);
}

await main();
