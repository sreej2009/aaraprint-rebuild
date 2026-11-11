#!/usr/bin/env node
/**
 * Extract the original product-view placements (Phase 4 M1) into a clean data file.
 *
 * Reads (read-only, as text — the recovered JavaScript is never executed):
 *   ../recovered/_next/static/chunks/<chunk>.js   the original Studio's placement tables
 *
 * Writes:
 *   src/data/generated/studio/product-view-placements.json
 *     per mockup image, the box the artwork is fitted into on the photo:
 *     [centerX, centerY, maxWidth, maxHeight] in mockup pixels, for the drinkware and the
 *     umbrella and rainwear photo sets, plus the photo size each set was measured on;
 *     and for umbrellas and rainwear (Phase 4 M3) the original's colour palette (name → hex) and
 *     the colour each product's front and back photos were taken in.
 *
 * Numbers are copied exactly as found; nothing is estimated. The original's drinkware
 * fallbacks by bottle kind are recorded for reference but not used (every M1 product has its
 * own entries). build-studio-profiles.mjs reads this file.
 *
 * Usage: node scripts/studio/extract-product-views.mjs [--root ../recovered]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const rootArg = process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : '../recovered';
const CHUNK = '_next/static/chunks/1mx9q60dex768.js';
const SOURCE = path.resolve(rootArg, CHUNK);
const OUT = path.join(ROOT, 'src', 'data', 'generated', 'studio', 'product-view-placements.json');

/** The two photo sets: the folder the original keys its table by, and the size constant's name. */
const SETS = [
  { id: 'drinkware', folder: '/products/drinkware-2d/', sizeName: 'DRINKWARE_MOCKUP_SIZE', extension: '.png' },
  { id: 'umbrella-rainwear', folder: '/products/umbrellas-rainwear-2d/', sizeName: 'UMBRELLA_RAINWEAR_MOCKUP_SIZE', extension: '.webp' },
];

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const ENTRY = new RegExp(String.raw`"([a-z0-9]+(?:-[a-z0-9]+)*-(?:front|back))":\[(${NUMBER}),(${NUMBER}),(${NUMBER}),(${NUMBER})\]`, 'g');

function fail(message) {
  console.error(`Product views: ${message}`);
  process.exit(1);
}

/** The table object literal directly before `,<name>="<folder>"`. */
function tableBefore(code, folder) {
  const marker = new RegExp(String.raw`\},[A-Za-z_$][\w$]*="${folder.replace(/[/.-]/g, '\\$&')}"`);
  const end = code.search(marker);
  if (end < 0) fail(`no placement table found before ${folder}`);
  const start = code.lastIndexOf('={"', end);
  if (start < 0) fail(`placement table for ${folder} has no start`);
  const body = code.slice(start + 1, end + 1);
  // Nothing but entries: a strict check that this is the table, not code.
  const leftover = body.replace(ENTRY, '').replace(/[{},]/g, '');
  if (leftover) fail(`unexpected content in the ${folder} table: ${leftover.slice(0, 60)}`);
  const entries = {};
  for (const match of body.matchAll(ENTRY)) {
    const [, key, ...values] = match;
    const box = values.map(Number);
    if (key in entries && entries[key].join() !== box.join()) fail(`conflicting entries for ${key}`);
    entries[key] = box;
  }
  return entries;
}

function sizeOf(code, name) {
  const match = new RegExp(String.raw`"${name}",0,\{width:(\d+),height:(\d+)\}`).exec(code);
  if (!match) fail(`size ${name} not found`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function kindFallbacks(code) {
  const match = /\{(bottle:\{centerX:[\s\S]*?\})\}/.exec(code);
  if (!match) return {};
  const out = {};
  for (const m of match[1].matchAll(new RegExp(String.raw`([a-z]+):\{centerX:(${NUMBER}),centerY:(${NUMBER}),maxWidth:(${NUMBER}),maxHeight:(${NUMBER})\}`, 'g'))) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
  }
  return out;
}

/**
 * The umbrella and rainwear colours: the palette `{black:"#2b2b2d",…}` the original used for
 * swatches and tints, and each product's `[slug, name, kind, frontPhotoColour, backPhotoColour]`.
 */
function umbrellaRainwearColours(code) {
  const start = code.indexOf('="/products/umbrellas-rainwear-2d/",');
  if (start < 0) fail('umbrella and rainwear module not found');
  const module = code.slice(start, code.indexOf('UMBRELLA_RAINWEAR_MOCKUP_SIZE', start));
  const rows = [...module.matchAll(/\["([a-z0-9]+(?:-[a-z0-9]+)*)","[^"\\]+","([a-z-]+)","([A-Za-z ]+)","([A-Za-z ]+)"\]/g)];
  if (!rows.length) fail('no umbrella and rainwear photo colours found');
  const photoColours = Object.fromEntries(rows.map((m) => [m[1], [m[3], m[4]]]).sort(([a], [b]) => a.localeCompare(b)));
  const literal = /\{black:"#[0-9a-f]{6}"(?:,(?:[a-z]+|"[a-z ]+"):"#[0-9a-f]{6}")*\}/.exec(module);
  if (!literal) fail('umbrella and rainwear palette not found');
  const palette = Object.fromEntries([...literal[0].matchAll(/(?:([a-z]+)|"([a-z ]+)"):"(#[0-9a-f]{6})"/g)].map((m) => [m[1] ?? m[2], m[3]]));
  return {
    note: "Swatches are the product's own colour options that have a palette entry (matched by name, case-insensitive). No tint is drawn on a side whose photo is already that colour.",
    palette,
    photoColours,
  };
}

const code = await fs.readFile(SOURCE, 'utf8');
const sets = {};
for (const set of SETS) {
  const size = sizeOf(code, set.sizeName);
  const entries = tableBefore(code, set.folder);
  for (const [key, [cx, cy, w, h]] of Object.entries(entries)) {
    const inside = w > 0 && h > 0 && cx - w / 2 >= 0 && cy - h / 2 >= 0 && cx + w / 2 <= size.width && cy + h / 2 <= size.height;
    if (!inside) fail(`${key} is not inside the ${size.width} × ${size.height} photo`);
  }
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  sets[set.id] = { folder: set.folder.replace(/^\/+/, ''), extension: set.extension, mockupSize: size, entries: sorted };
}

const register = {
  source: { chunk: CHUNK, note: 'Copied exactly from the original Studio. Entry: [centerX, centerY, maxWidth, maxHeight] in mockup px; the artwork is fitted inside (contain) and centred.' },
  sets,
  drinkwareKindFallbacks: { note: 'Recorded for reference; not used.', boxes: kindFallbacks(code) },
  umbrellaRainwearColours: umbrellaRainwearColours(code),
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
// One box per line: `[561, 781, 270, 236]`; photo colours too: `["White", "Royal Blue"]`.
const json = JSON.stringify(register, null, 2)
  .replace(/\[\s+([\d.,\s]+?)\s+\]/g, (_, inner) => `[${inner.trim().split(/,\s*/).join(', ')}]`)
  .replace(/\[\s+("[^"]*"),\s+("[^"]*")\s+\]/g, '[$1, $2]');
await fs.writeFile(OUT, `${json}\n`);
console.log(
  `Product views: ${Object.entries(sets)
    .map(([id, s]) => `${id} ${Object.keys(s.entries).length}`)
    .join(', ')} placements written.`,
);
