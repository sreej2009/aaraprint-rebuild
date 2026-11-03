#!/usr/bin/env node
/**
 * Recover assets that exist on the original Aaraprint site but are missing
 * from the earlier crawl in `../recovered/`.
 *
 * - Writes ONLY to the output directory (default `../recovered-additional/`).
 * - Reads `../recovered/` only to check which files already exist. It never
 *   writes, moves or deletes anything there (guarded below).
 * - Output mirrors the server URL path, e.g.
 *     /products/pens-2d/gel-front.png -> recovered-additional/products/pens-2d/gel-front.png
 *
 * Usage (from the project root):
 *   node scripts/recovery/recover-additional-assets.mjs [options]
 *
 * Options:
 *   --base <url>             Original site (default http://200.234.38.165)
 *   --recovered <dir>        Existing crawl, read-only (default ../recovered)
 *   --out <dir>              Output directory (default ../recovered-additional)
 *   --seed-configs <file>    Use a previously fetched {slug: printConfig} JSON
 *                            instead of fetching every design page again
 *   --seed-fetched-at <iso>  Fetch time to record for seeded configs
 *   --refresh-configs        Re-fetch print configs from the live site
 *   --force                  Re-download files that already exist in --out
 *   --dry-run                List what would be downloaded, write nothing
 *   --delay <ms>             Pause between requests (default 150)
 */
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const BASE = String(args.base ?? 'http://200.234.38.165').replace(/\/$/, '');
const RECOVERED = path.resolve(String(args.recovered ?? '../recovered'));
const OUT = path.resolve(String(args.out ?? '../recovered-additional'));
const DELAY_MS = Number(args.delay ?? 150);
const DRY_RUN = Boolean(args['dry-run']);
const FORCE = Boolean(args.force);

// --- Safety guard: never write into the original recovered directory -------
const rel = path.relative(RECOVERED, OUT);
if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
  console.error(`Refusing to write into ${OUT}: it is inside the read-only ${RECOVERED}.`);
  process.exit(1);
}

/** Assets hard-coded in the original Design Studio bundles (found during research). */
const STUDIO_ASSETS = [
  '/models/polo-shirt.glb',
  '/products/gifts-2d/default-art/calendar-flip-desk-front.webp',
  '/products/gifts-2d/default-art/calendar-wall-new-size-front.webp',
  '/products/gifts-2d/default-art/lamp-journal-led-mockup-back-editable.png',
  '/products/gifts-2d/default-art/lamp-journal-led-mockup-front.png',
  '/products/gifts-2d/default-art/water-bottle-steel-front.webp',
  '/products/gifts-2d/first-five/canvas-print-back.png',
  '/products/gifts-2d/first-five/canvas-print-front.png',
  '/products/gifts-2d/more/coaster-acrylic-printed-back.webp',
  '/products/gifts-2d/more/coaster-acrylic-printed-front.webp',
  '/products/gifts-2d/more/coaster-customized-back.webp',
  '/products/gifts-2d/more/coaster-customized-front.webp',
  '/products/gifts-2d/more/framed-photo-print-back.webp',
  '/products/gifts-2d/more/framed-photo-print-front.webp',
  '/products/gifts-2d/more/water-bottle-back.webp',
  '/products/gifts-2d/more/water-bottle-front.webp',
  '/products/gifts-2d/more2/calendar-magnet-back.png',
  '/products/gifts-2d/more2/calendar-magnet-front.png',
  '/products/gifts-2d/more2/n1-3-back.webp',
  '/products/gifts-2d/more2/n1-3-front.webp',
  '/products/gifts-2d/more2/n1-5-back.webp',
  '/products/gifts-2d/more2/n1-5-front.webp',
  '/products/gifts-2d/more2/n1-6-back.webp',
  '/products/gifts-2d/more2/n1-6-front.webp',
  '/products/gifts-2d/more2/n1-7-back.webp',
  '/products/gifts-2d/more2/n1-7-front.webp',
  '/products/gifts-2d/more2/n2-1-back.webp',
  '/products/gifts-2d/more2/n2-1-front.webp',
  '/products/gifts-2d/more2/n2-2-back.webp',
  '/products/gifts-2d/more2/n2-2-front.webp',
  '/products/gifts-2d/more2/n2-3-back.webp',
  '/products/gifts-2d/more2/n2-3-front.webp',
  '/products/gifts-2d/more2/n2-4-back.webp',
  '/products/gifts-2d/more2/n2-4-front.webp',
  '/products/gifts-2d/more2/n2-6-back.webp',
  '/products/gifts-2d/more2/n2-6-front.webp',
  '/products/gifts-2d/more2/n2-7-back.webp',
  '/products/gifts-2d/more2/n2-7-front.webp',
  '/products/gifts-2d/more2/n2-8-front.webp',
  '/products/gifts-2d/round-photo-mouse-pad-back-v2.png',
  '/products/gifts-2d/round-photo-mouse-pad-front-v2.png',
  '/products/mugs-2d/colour-changing-magic.png',
  '/products/pens-2d/gel-back.png',
  '/products/pens-2d/gel-front.png',
  '/products/pens-2d/highlighter-back.png',
  '/products/pens-2d/highlighter-front.png',
  '/products/pens-2d/stylus-back.png',
  '/products/pens-2d/stylus-front.png',
  '/products/pens-2d/wheat-back.png',
  '/products/pens-2d/wheat-front.png',
];

/** Lazily-loaded Studio chunks (3D previews) absent from the first crawl. Reference only. */
const REFERENCE_CHUNKS = [
  '03n9ed-72o-gq.js', '0bwx_-nxalz48.js', '0qjz2llke07mr.js', '0zgu--cpwna_i.js',
  '15ns57ob6ecf7.js', '1gc0b7wsuaqvo.js', '1omkqkwq6zsbr.js', '1uuhgpcjb33lp.js',
  '2345mf9tiir6b.js', '24hxlke6hx04l.js', '2amww5tygmqkd.js', '2czv8816olfic.js',
  '2kyq-93-cvzt_.js', '2llq6_7qirhhz.js', '3i52zl-m9a5jh.js', '3s_msllykl9nm.js',
  '42gzwveg9zd__.js',
].map((file) => `/_next/static/chunks/${file}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`Original site : ${BASE}`);
  console.log(`Read-only     : ${RECOVERED}`);
  console.log(`Output        : ${OUT}${DRY_RUN ? ' (dry run)' : ''}`);

  const configs = await loadPrintConfigs();

  /** @type {Map<string, {category: string, products: Set<string>}>} */
  const wanted = new Map();
  const want = (urlPath, category, slug) => {
    const entry = wanted.get(urlPath) ?? { category, products: new Set() };
    if (slug) entry.products.add(slug);
    wanted.set(urlPath, entry);
  };

  for (const [slug, config] of Object.entries(configs.configs)) {
    if (!config || typeof config !== 'object' || 'error' in config) continue;
    for (const key of ['mockupBackgroundUrl', 'mockupBackgroundUrlBack']) {
      const value = config[key];
      if (typeof value === 'string' && value.startsWith('/')) want(value, 'studio-mockup', slug);
    }
    const modelUrl = config.model3d?.modelUrl;
    if (typeof modelUrl === 'string' && modelUrl.startsWith('/')) want(modelUrl, '3d-model', slug);
  }
  for (const urlPath of STUDIO_ASSETS) want(urlPath, urlPath.endsWith('.glb') ? '3d-model' : 'studio-asset');
  for (const urlPath of REFERENCE_CHUNKS) want(urlPath, 'reference-js');

  const missing = [...wanted.entries()].filter(([urlPath]) => !fss.existsSync(recoveredPathFor(urlPath)));
  console.log(`Referenced assets: ${wanted.size}; already in recovered/: ${wanted.size - missing.length}; to fetch: ${missing.length}`);

  const entries = [];
  for (const [urlPath, meta] of missing) {
    const localFile = urlPath.replace(/^\//, '');
    const target = path.join(OUT, localFile);
    const entry = {
      url: BASE + urlPath,
      path: urlPath,
      localFile,
      category: meta.category,
      products: [...meta.products].sort(),
      status: 'pending',
    };
    entries.push(entry);

    if (DRY_RUN) {
      entry.status = 'dry-run';
      continue;
    }
    if (!FORCE && fss.existsSync(target)) {
      const data = await fs.readFile(target);
      Object.assign(entry, { status: 'already-present', bytes: data.length, sha256: sha256(data) });
      continue;
    }

    const result = await download(BASE + urlPath);
    if (result.ok) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, result.body);
      Object.assign(entry, {
        status: 'downloaded',
        bytes: result.body.length,
        sha256: sha256(result.body),
        contentType: result.contentType,
      });
      console.log(`  ✓ ${urlPath} (${(result.body.length / 1024).toFixed(0)} KB)`);
    } else {
      Object.assign(entry, { status: 'failed', error: result.error });
      console.log(`  ✗ ${urlPath} — ${result.error}`);
    }
    await sleep(DELAY_MS);
  }

  if (DRY_RUN) {
    for (const entry of entries) console.log(`  · ${entry.path} [${entry.category}]`);
    return;
  }

  const summary = summarise(entries);
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(
    path.join(OUT, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), source: BASE, summary, files: entries }, null, 2),
  );
  await fs.writeFile(path.join(OUT, 'README.md'), readme(summary, configs));
  console.log('\nSummary:', JSON.stringify(summary, null, 2));
}

/** Where the same server path would live inside the original crawl. */
function recoveredPathFor(urlPath) {
  const p = urlPath.replace(/^\//, '');
  if (p.startsWith('products/polo/')) return path.join(RECOVERED, 'apparel-polo', p.slice('products/polo/'.length));
  if (p.startsWith('products/')) return path.join(RECOVERED, p.slice('products/'.length));
  return path.join(RECOVERED, p);
}

async function loadPrintConfigs() {
  const file = path.join(OUT, 'data', 'print-configs.json');

  if (args['seed-configs']) {
    const raw = JSON.parse(await fs.readFile(String(args['seed-configs']), 'utf8'));
    const doc = {
      source: BASE,
      fetchedAt: String(args['seed-fetched-at'] ?? new Date().toISOString()),
      method: 'printConfig extracted from the React Server Component payload of /products/{slug}/design',
      count: Object.keys(raw).length,
      configs: raw,
    };
    if (!DRY_RUN) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(doc, null, 1));
    }
    console.log(`Seeded ${doc.count} print configs from ${args['seed-configs']}`);
    return doc;
  }

  if (fss.existsSync(file) && !args['refresh-configs']) {
    const doc = JSON.parse(await fs.readFile(file, 'utf8'));
    console.log(`Using ${doc.count} print configs from ${file} (fetched ${doc.fetchedAt})`);
    return doc;
  }

  const productsDir = path.join(RECOVERED, 'pages', 'products');
  const slugs = (await fs.readdir(productsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  console.log(`Fetching print configs for ${slugs.length} products…`);
  const configs = {};
  for (const slug of slugs) {
    const result = await download(`${BASE}/products/${slug}/design`, { allowHtml: true });
    configs[slug] = result.ok
      ? extractJsonObject(decodeRscPayload(result.body.toString('utf8')), 'printConfig')
      : { error: result.error };
    await sleep(DELAY_MS);
  }
  const doc = {
    source: BASE,
    fetchedAt: new Date().toISOString(),
    method: 'printConfig extracted from the React Server Component payload of /products/{slug}/design',
    count: slugs.length,
    configs,
  };
  if (!DRY_RUN) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(doc, null, 1));
  }
  return doc;
}

async function download(url, { allowHtml = false } = {}) {
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (aaraprint-rebuild asset recovery)' } });
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      if (!allowHtml && contentType.includes('text/html')) return { ok: false, error: 'HTML response (not an asset)' };
      return { ok: true, body: Buffer.from(await res.arrayBuffer()), contentType };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(600 * attempt);
    }
  }
  return { ok: false, error: lastError };
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

/** Return the JSON object that follows `"key":` in a string, or null. */
function extractJsonObject(text, key) {
  const at = text.indexOf(`"${key}":`);
  if (at < 0) return null;
  const start = text.indexOf('{', at);
  if (start < 0) return null;
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
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function summarise(entries) {
  const byCategory = {};
  for (const entry of entries) {
    const bucket = (byCategory[entry.category] ??= { total: 0, downloaded: 0, alreadyPresent: 0, failed: 0, bytes: 0 });
    bucket.total++;
    if (entry.status === 'downloaded') bucket.downloaded++;
    if (entry.status === 'already-present') bucket.alreadyPresent++;
    if (entry.status === 'failed') bucket.failed++;
    bucket.bytes += entry.bytes ?? 0;
  }
  const totalBytes = entries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
  return { files: entries.length, totalBytes, byCategory, failed: entries.filter((e) => e.status === 'failed').map((e) => e.path) };
}

function readme(summary, configs) {
  const rows = Object.entries(summary.byCategory)
    .map(([category, s]) => `| ${category} | ${s.total} | ${s.downloaded + s.alreadyPresent} | ${s.failed} | ${(s.bytes / 1e6).toFixed(1)} MB |`)
    .join('\n');
  const failed = summary.failed.length ? summary.failed.map((p) => `- \`${p}\``).join('\n') : '- none';
  return `# recovered-additional

Assets from the original Aaraprint site (${BASE}) that the first crawl in \`../recovered/\` did not capture.
Generated by \`aaraprint-rebuild/scripts/recovery/recover-additional-assets.mjs\`. **Do not edit by hand** — re-run the script.

\`../recovered/\` is never modified. Files here mirror the server URL path:

| Server path | File here | Equivalent in ../recovered |
|-------------|-----------|----------------------------|
| \`/products/<folder>/<file>\` | \`products/<folder>/<file>\` | \`<folder>/<file>\` (except \`/products/polo/*\` → \`apparel-polo/*\`) |
| \`/models/<file>.glb\` | \`models/<file>.glb\` | — |
| \`/_next/static/chunks/<file>.js\` | \`_next/static/chunks/<file>.js\` | \`_next/static/chunks/<file>.js\` |

## Contents

| Category | Files | Available | Failed | Size |
|----------|-------|-----------|--------|------|
${rows}

- \`data/print-configs.json\` — print configuration for ${configs.count} products (canvas size, DPI, bleed, safe zone, trim, mockup URLs, 3D model), fetched ${configs.fetchedAt}.
- \`manifest.json\` — every file with source URL, size, SHA-256 and the products that use it.

Categories: **studio-mockup** (front/back product images referenced by print configs), **studio-asset** (images hard-coded in the Studio code: pen families, mug profiles, gift mockups), **3d-model** (GLB files), **reference-js** (compiled Studio chunks kept for reference only — not for reuse).

### Failed downloads

${failed}

## Licence notes

- \`models/polo-shirt.glb\`: "POLO SHIRT" by arvintriyoga, licensed CC BY 4.0 — attribution required wherever it is shown.
- Product mockups: origin and licence unconfirmed; several show brand-name products. Confirm rights before production use (see AARAPRINT_ASSET_INVENTORY.md §9).
- \`reference-js\`: third-party compiled code, kept only to document behaviour.
`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
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
