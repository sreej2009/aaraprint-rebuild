#!/usr/bin/env node
/**
 * Build the app's catalogue data from the recovered original site.
 *
 * Reads (read-only):
 *   ../recovered/pages/products/<slug>/index.html   product data embedded in each page
 *   ../recovered/pages/index.html                  category navigation tree
 *   ../recovered/pages/categories/<slug>/index.html category descriptions
 *   ../recovered-additional/data/print-configs.json per-product print configuration
 *
 * Writes:
 *   public/api/v1/catalogue/categories.json        category list (+ nav groups, sub-types)
 *   public/api/v1/catalogue/products.json          product summaries (listing / search)
 *   public/api/v1/catalogue/products/<slug>.json   full product (options, variants, print spec)
 *   src/data/generated/navigation.json             compact nav data bundled into the app shell
 *   src/data/generated/catalogue-meta.json         counts + provenance
 *
 * Usage: node scripts/catalogue/import-catalogue.mjs [--recovered ../recovered] [--additional ../recovered-additional]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const ROOT = process.cwd();
const RECOVERED = path.resolve(String(args.recovered ?? '../recovered'));
const ADDITIONAL = path.resolve(String(args.additional ?? '../recovered-additional'));
const OUT_PUBLIC = path.join(ROOT, 'public', 'api', 'v1', 'catalogue');
const OUT_SRC = path.join(ROOT, 'src', 'data', 'generated');

const SUPABASE_MEDIA = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/(product-media\/.+)$/;

async function main() {
  const printConfigs = JSON.parse(await fs.readFile(path.join(ADDITIONAL, 'data', 'print-configs.json'), 'utf8'));

  const homePayload = decodeRscPayload(await readText(path.join(RECOVERED, 'pages', 'index.html')));
  const navCategories = findArrayWith(homePayload, '"categories":[', ['"groups"']) ?? [];
  const categoryPayload = decodeRscPayload(await readText(path.join(RECOVERED, 'pages', 'categories', 'view-all', 'index.html')));
  const categoryRecords = findArrayWith(categoryPayload, '"categories":[', ['"hero_image_url"']) ?? [];
  if (!navCategories.length || !categoryRecords.length) throw new Error('Could not find category data in recovered pages.');

  const newProductSlugs = new Set();
  for (const category of navCategories) {
    for (const group of category.groups ?? []) {
      for (const item of group.items ?? []) {
        const slug = productSlugFromHref(item.href);
        if (slug && item.isNewEffective) newProductSlugs.add(slug);
      }
    }
  }

  const productDirs = (await fs.readdir(path.join(RECOVERED, 'pages', 'products'), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const categoryByName = new Map(categoryRecords.map((c) => [c.name, c]));
  const products = [];
  const problems = [];

  for (const slug of productDirs) {
    const html = await readText(path.join(RECOVERED, 'pages', 'products', slug, 'index.html'));
    const payload = decodeRscPayload(html);
    const at = payload.indexOf(`"productSlug":"${slug}"`);
    const raw = at >= 0 ? enclosingObject(payload, at, ['"variants"', '"optionGroups"']) : null;
    if (!raw) {
      problems.push(`${slug}: product data not found`);
      continue;
    }
    const category = categoryByName.get(raw.categoryName);
    if (!category) problems.push(`${slug}: unknown category "${raw.categoryName}"`);

    const page = readProductPage(html);
    const optionGroups = (raw.optionGroups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      values: group.values.map((value) => ({
        id: value.id,
        key: value.valueKey,
        label: value.label,
        priceDeltaCents: value.priceDeltaCents ?? 0,
        ...(group.name === 'Quantity' ? { quantity: parseQuantity(value.label) } : {}),
      })),
    }));
    const variants = (raw.variants ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      priceCents: v.priceCents,
      compareAtPriceCents: v.compareAtPriceCents ?? null,
      stockStatus: v.stockStatus,
      isDefault: Boolean(v.isDefault),
      optionValueIds: [...v.optionValueIds].sort(),
    }));
    const prices = variants.map((v) => v.priceCents);
    const printConfig = printConfigs.configs?.[slug];

    products.push({
      id: raw.productId,
      slug,
      name: raw.productName,
      categorySlug: category?.slug ?? null,
      shortDescription: raw.description ?? '',
      description: page.details || raw.description || '',
      isCustomizable: Boolean(raw.isCustomizable),
      isFeatured: Boolean(raw.isFeatured),
      isNew: newProductSlugs.has(slug),
      basePriceCents: raw.basePriceCents,
      fromPriceCents: prices.length ? Math.min(...prices) : raw.basePriceCents,
      toPriceCents: prices.length ? Math.max(...prices) : raw.basePriceCents,
      freeShippingThresholdCents: raw.freeShippingThresholdCents ?? null,
      quantityStepper: page.stepperLabel === 'Batches' ? 'sets' : 'units',
      hasPriceBreaks: page.hasPriceBreaks,
      dispatchDays: page.dispatchDays,
      images: page.images,
      optionGroups,
      variants,
      print: normalisePrintConfig(printConfig),
    });
  }

  const productsByCategory = groupBy(products, (p) => p.categorySlug);

  // Sub-type links (`/categories/<slug>?type=<type>`) appear anywhere in the nav tree,
  // mostly inside the "View All" menu, so collect them globally.
  const subTypesByCategory = new Map();
  for (const navCategory of navCategories) {
    for (const group of navCategory.groups ?? []) {
      for (const item of group.items ?? []) {
        const match = /^\/categories\/([^?]+)\?type=([^&]+)$/.exec(item.href ?? '');
        if (!match || match[1] === match[2]) continue; // `?type=<same slug>` just means "all"
        const list = subTypesByCategory.get(match[1]) ?? [];
        if (!list.some((s) => s.slug === match[2])) list.push({ slug: match[2], name: item.name });
        subTypesByCategory.set(match[1], list);
      }
    }
  }

  // "View All" is a pseudo-category in the original data; its groups are curated collections.
  const viewAll = navCategories.find((n) => n.slug === 'view-all');
  const collections = (viewAll?.groups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    items: (group.items ?? []).map((item) => ({ name: item.name, href: item.href, isNew: Boolean(item.isNewEffective) })),
  }));

  const categories = categoryRecords
    .filter((record) => record.slug !== 'view-all')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((record) => {
      const nav = navCategories.find((n) => n.slug === record.slug);
      const items = productsByCategory.get(record.slug) ?? [];
      const subTypes = subTypesByCategory.get(record.slug) ?? [];
      return {
        id: record.id,
        slug: record.slug,
        name: record.name,
        description: record.description ?? '',
        sortOrder: record.sort_order,
        isFeatured: Boolean(record.is_featured),
        productCount: items.length,
        fromPriceCents: items.length ? Math.min(...items.map((p) => p.fromPriceCents)) : null,
        heroImage: record.hero_image_url ? toImage(record.hero_image_url, record.name) : null,
        subTypes,
        navGroups: (nav?.groups ?? []).map((group) => ({
          id: group.id,
          name: group.name,
          items: (group.items ?? []).map((item) => ({ name: item.name, href: item.href, isNew: Boolean(item.isNewEffective) })),
        })),
      };
    });

  const summaries = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    categorySlug: p.categorySlug,
    shortDescription: p.shortDescription,
    fromPriceCents: p.fromPriceCents,
    toPriceCents: p.toPriceCents,
    isCustomizable: p.isCustomizable,
    isFeatured: p.isFeatured,
    isNew: p.isNew,
    image: p.images[0] ?? null,
    printCategory: p.print?.category ?? null,
    optionGroupNames: p.optionGroups.map((g) => g.name),
  }));

  await fs.rm(path.join(OUT_PUBLIC, 'products'), { recursive: true, force: true });
  await fs.mkdir(path.join(OUT_PUBLIC, 'products'), { recursive: true });
  await fs.mkdir(OUT_SRC, { recursive: true });
  await writeJson(path.join(OUT_PUBLIC, 'categories.json'), categories);
  await writeJson(path.join(OUT_PUBLIC, 'products.json'), summaries);
  for (const product of products) await writeJson(path.join(OUT_PUBLIC, 'products', `${product.slug}.json`), product);

  await writeJson(path.join(OUT_PUBLIC, 'collections.json'), collections);
  // Slim list bundled into the app shell (header, footer, home). The full nav tree stays in the API.
  await writeJson(
    path.join(OUT_SRC, 'navigation.json'),
    categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      productCount: c.productCount,
      fromPriceCents: c.fromPriceCents,
    })),
    true,
  );
  const meta = {
    generatedAt: new Date().toISOString(),
    sources: {
      pages: path.relative(ROOT, path.join(RECOVERED, 'pages')).replaceAll('\\', '/'),
      printConfigs: path.relative(ROOT, path.join(ADDITIONAL, 'data', 'print-configs.json')).replaceAll('\\', '/'),
      printConfigsFetchedAt: printConfigs.fetchedAt,
    },
    counts: {
      categories: categories.length,
      collections: collections.length,
      products: products.length,
      variants: products.reduce((n, p) => n + p.variants.length, 0),
      customisable: products.filter((p) => p.isCustomizable).length,
      withPrintConfig: products.filter((p) => p.print).length,
      withImage: products.filter((p) => p.images.length).length,
    },
    problems,
  };
  await writeJson(path.join(OUT_SRC, 'catalogue-meta.json'), meta, true);
  console.log(JSON.stringify(meta, null, 2));
}

/**
 * Facts printed on the product page that are not in the embedded product object.
 * (The original layout renders product content outside its <main> element, so the whole document is scanned.)
 */
function readProductPage(html) {
  const lines = htmlToLines(html);
  const at = (label) => lines.indexOf(label);

  let details = '';
  const detailsAt = at('Product details');
  if (detailsAt >= 0) details = lines.slice(detailsAt + 1, detailsAt + 2).join(' ');

  const dispatch = lines.find((line) => /^dispatch in /i.test(line)) ?? '';
  const days = /(\d+)\s*[–-]\s*(\d+)\s*days/.exec(dispatch);

  const images = [];
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = match[0];
    const src = attr(tag, 'src');
    if (!src || !src.includes('/_next/image')) continue;
    const original = new URLSearchParams(src.split('?')[1] ?? '').get('url');
    if (!original) continue;
    const image = toImage(original, decodeEntities(attr(tag, 'alt') ?? ''));
    if (image && !images.some((i) => i.src === image.src)) images.push(image);
  }

  return {
    details,
    stepperLabel: lines.includes('Batches') ? 'Batches' : 'Quantity',
    hasPriceBreaks: lines.includes('Quantity price breaks'),
    dispatchDays: days ? { min: Number(days[1]), max: Number(days[2]) } : null,
    images,
  };
}

/** Classify an image URL: original-site mockup, Supabase product photo, or external stock photo. */
function toImage(url, alt) {
  const decoded = decodeEntities(url);
  if (decoded.startsWith('/products/')) return { kind: 'mockup', src: decoded.slice(1), alt };
  const supabase = SUPABASE_MEDIA.exec(decoded);
  if (supabase) return { kind: 'photo', src: supabase[1], alt };
  if (/^https:\/\/images\.unsplash\.com\//.test(decoded)) return { kind: 'stock', src: decoded, alt };
  return null;
}

function normalisePrintConfig(config) {
  if (!config || typeof config !== 'object' || 'error' in config) return null;
  const trimShape = { rectangle: 'rectangle', 'rounded-rect': 'rounded-rectangle', circle: 'circle' }[config.trimShape] ?? 'rectangle';
  const asMedia = (value) => (typeof value === 'string' && value.startsWith('/') ? value.slice(1) : null);
  return {
    category: config.category,
    canvasWidthPx: config.canvasWidthPx,
    canvasHeightPx: config.canvasHeightPx,
    dpi: config.dpi,
    bleedPx: config.bleedPx,
    safeZonePx: config.safeZonePx,
    trimShape,
    mockups: {
      front: asMedia(config.mockupBackgroundUrl),
      back: asMedia(config.mockupBackgroundUrlBack),
    },
    model3d: config.model3d
      ? {
          src: asMedia(config.model3d.modelUrl),
          colorMaterialName: config.model3d.colorMaterialName ?? null,
          printAreas: config.model3d.printAreas ?? [],
        }
      : null,
    printAreaSizeMultiplier: config.printAreaSizeMultiplier ?? 1,
  };
}

function parseQuantity(label) {
  const match = /([\d,]+)/.exec(label ?? '');
  return match ? Number(match[1].replaceAll(',', '')) : null;
}

function productSlugFromHref(href) {
  return /^\/products\/([^/?#]+)$/.exec(href ?? '')?.[1] ?? null;
}

// ---------------------------------------------------------------- helpers ---

async function readText(file) {
  return fs.readFile(file, 'utf8');
}

async function writeJson(file, data, pretty = false) {
  await fs.writeFile(file, JSON.stringify(data, null, pretty ? 2 : 0) + '\n');
}

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

/** Concatenate the `self.__next_f.push([1, "…"])` chunks of a Next.js page. */
function decodeRscPayload(html) {
  let out = '';
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      out += JSON.parse(`"${match[1]}"`);
    } catch {
      out += match[1];
    }
  }
  return out;
}

/** End index (inclusive) of the JSON value starting at `start` ('{' or '['), string-aware. */
function matchingBracket(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return i;
  }
  return -1;
}

/** Smallest JSON object enclosing `index` that contains all `requiredKeys`. */
function enclosingObject(text, index, requiredKeys) {
  let start = index;
  while ((start = text.lastIndexOf('{', start - 1)) >= 0) {
    const end = matchingBracket(text, start);
    if (end < index) continue;
    const slice = text.slice(start, end + 1);
    if (requiredKeys.every((key) => slice.includes(key))) {
      try {
        return JSON.parse(slice);
      } catch {
        /* keep widening */
      }
    }
    if (end - start > 2_000_000) return null;
  }
  return null;
}

/** First JSON array after `marker` whose text contains all `requiredKeys`. */
function findArrayWith(text, marker, requiredKeys) {
  let from = 0;
  for (;;) {
    const at = text.indexOf(marker, from);
    if (at < 0) return null;
    const start = at + marker.length - 1;
    const end = matchingBracket(text, start);
    if (end > start) {
      const slice = text.slice(start, end + 1);
      if (requiredKeys.every((key) => slice.includes(key))) {
        try {
          return JSON.parse(slice);
        } catch {
          /* try next occurrence */
        }
      }
    }
    from = at + marker.length;
  }
}

function htmlToLines(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, '\n');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function attr(tag, name) {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

await main();
