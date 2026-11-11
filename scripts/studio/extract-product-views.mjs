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
 *     the colour each product's front and back photos were taken in;
 *   and from a second chunk (Phase 4 M4) the pen and mug photo maps and print-area formulas:
 *     pens  — the mockup frame (2000 × 700), the print box (centre 1160, 350; at most 700 × 104),
 *             each family's front and back photo and part colours, and each pen's family;
 *     mugs  — the frame (900 × 1086), how a side is cut from the paired photo (724 px halves,
 *             the back drawn 176 px in), and each mug's paired photo and print box.
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
const PEN_MUG_CHUNK = '_next/static/chunks/3zkk7bvc_w-nw.js';
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

/** Numbers as minified: `2e3` is 2000. */
const num = (text) => {
  const value = Number(text);
  if (!Number.isFinite(value)) fail(`not a number: ${text}`);
  return value;
};
const N = String.raw`\d+(?:\.\d+)?(?:e\d+)?`;

/** The pen module: frame, print box, families (photos, part colours) and each pen's family. */
function pens(code) {
  const start = code.indexOf('="/products/pens-2d/"');
  if (start < 0) fail('pen module not found');
  const module = code.slice(code.lastIndexOf('"use strict"', start), code.indexOf('"penPrintRect"', start) + 200);
  const size = new RegExp(String.raw`"PEN_MOCKUP_SIZE",0,\{width:(${N}),height:(${N})\}`).exec(module);
  const rect = new RegExp(String.raw`"penPrintRect",0,function\(e,a\)\{let t=Math\.min\((${N})\/e,(${N})\/a\);return\{x:(${N})-e\*t\/2,y:(${N})-a\*t\/2`).exec(module);
  if (!size || !rect) fail('pen frame or print box not found');
  const folder = /([A-Za-z_$][\w$]*)="\/products\/pens-2d\/"/.exec(module)[1];
  const parts = (text) => Object.fromEntries([...text.matchAll(/(body|clip|tip|button[1-4]):(?:"(#[0-9a-f]{6})"|([a-z]))/g)].map((m) => [m[1], m[2] ?? m[3]]));
  const named = Object.fromEntries([...module.matchAll(/(?:let |,)([a-z])="(#[0-9a-f]{6})"/g)].map((m) => [m[1], m[2]]));
  const colourOf = (value) => (value.startsWith('#') ? value : (named[value] ?? fail(`unknown colour ${value}`)));
  const familyRe = new RegExp(String.raw`([a-z]+):\{id:"([a-z]+)",frontAsset:\`\$\{${folder}\}([\w.-]+)\`,backAsset:\`\$\{${folder}\}([\w.-]+)\`,sourceColors:l\(([^)]*)\)`, 'g');
  const families = {};
  for (const m of module.matchAll(familyRe)) {
    if (m[1] !== m[2]) fail(`pen family key ${m[1]} ≠ id ${m[2]}`);
    const args = m[5].split(',').map((a) => a.trim().replace(/"/g, ''));
    const keys = ['body', 'clip', 'tip', 'button1', 'button2', 'button3', 'button4'];
    const colours = Object.fromEntries(keys.map((k, i) => [k, colourOf(args[i] ?? args[3])]));
    families[m[2]] = { front: m[3], back: m[4], sourceColours: colours };
  }
  const products = {};
  for (const m of module.matchAll(/n\("([a-z0-9-]+)","([a-z]+)"(?:,\{([^}]*)\})?\)/g)) {
    if (!families[m[2]]) fail(`pen ${m[1]} has unknown family ${m[2]}`);
    const overrides = m[3] ? Object.fromEntries(Object.entries(parts(m[3])).map(([k, v]) => [k, colourOf(v)])) : {};
    products[m[1]] = { family: m[2], colours: { ...families[m[2]].sourceColours, ...overrides } };
  }
  return {
    note: 'Print box: the artwork is fitted inside [maxWidth × maxHeight] centred on (centerX, centerY), in frame px; the photo fills the frame. Part colours are recorded for reference; pen recolouring is not used (it needs part masks).',
    frame: { width: num(size[1]), height: num(size[2]) },
    box: [num(rect[3]), num(rect[4]), num(rect[1]), num(rect[2])],
    families: Object.fromEntries(Object.entries(families).sort(([a], [b]) => a.localeCompare(b))),
    products: Object.fromEntries(Object.entries(products).sort(([a], [b]) => a.localeCompare(b))),
  };
}

/** The mug module: frame, side cut, and each mug's paired photo and print box. */
function mugs(code) {
  const start = code.indexOf('"MUG_MOCKUP_SIZE"');
  if (start < 0) fail('mug module not found');
  const from = code.lastIndexOf('"use strict"', start);
  const module = code.slice(from, code.indexOf('"mugPrintRect"', start) + 300);
  const frame = new RegExp(String.raw`let a=\{width:(${N}),height:(${N})\},t=a\.width-(${N}),r="\/products\/mugs-2d\/"`).exec(module);
  const side = new RegExp(String.raw`"MUG_SIDE_WIDTH",0,(${N})`).exec(module);
  const rect = /"mugPrintRect",0,function\(e,t,r\)\{let l=Math\.min\(e\.printArea\.maxWidth\/t,e\.printArea\.maxHeight\/r\),i=t\*l,s=r\*l;return\{x:a\.width\/2-i\/2,y:e\.printArea\.centerY-s\/2/.exec(
    module,
  );
  if (!frame || !side || !rect) fail('mug frame, side or print box not found');
  const width = num(frame[1]);
  const sideWidth = num(side[1]);
  if (num(frame[3]) !== sideWidth) fail('mug side width and back offset disagree');
  const products = {};
  const re = new RegExp(String.raw`o\("([a-z0-9-]+)","[^"\\]+","([a-z0-9-]+)",[\s\S]*?\{centerY:(${N}),maxWidth:(${N}),maxHeight:(${N})\}\)`, 'g');
  for (const m of module.matchAll(re)) products[m[1]] = { photo: `${m[2]}.png`, box: [width / 2, num(m[3]), num(m[4]), num(m[5])] };
  if (Object.keys(products).length !== 9) fail(`expected 9 mugs, found ${Object.keys(products).length}`);
  return {
    note: 'The paired photo holds both sides as halves of sideWidth px. Front: the left half drawn at x 0 of the frame; back: the right half drawn at x backOffsetX. Both sides use the same print box, centred at half the frame width. The original also cut the mug out with drawn shapes and recoloured its parts; neither is used.',
    frame: { width, height: num(frame[2]) },
    sideWidth,
    backOffsetX: width - sideWidth,
    products: Object.fromEntries(Object.entries(products).sort(([a], [b]) => a.localeCompare(b))),
  };
}

const code = await fs.readFile(SOURCE, 'utf8');
const penMugCode = await fs.readFile(path.resolve(rootArg, PEN_MUG_CHUNK), 'utf8');
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
  pens: { source: PEN_MUG_CHUNK, ...pens(penMugCode) },
  mugs: { source: PEN_MUG_CHUNK, ...mugs(penMugCode) },
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
