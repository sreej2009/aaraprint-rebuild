#!/usr/bin/env node
/**
 * Build the Studio graphics library (M9, decision D5).
 *
 * Reads (read-only):
 *   ../recovered/_next/static/chunks/<chunk>.js   the original Studio's inline SVGs
 *   scripts/studio/graphics-register.mjs          names, groups, tags and usage rights
 *
 * Writes:
 *   public/api/v1/graphics.json                   the library the Studio loads: cleared graphics only
 *   public/studio/graphics/<id>.svg               sanitised SVG, for cleared graphics only
 *   src/data/generated/studio/graphics-meta.json  audit: every graphic found, its rights and size
 *
 * Graphics whose rights aren't confirmed are listed in the audit and counted as `withheld` in the
 * library, but their artwork is never copied into the app.
 *
 * Usage: node scripts/studio/extract-graphics.mjs [--root ../recovered]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { sanitiseSvg } from '../../src/features/studio/assets/svg-sanitise.ts';
import { GRAPHICS, GRAPHICS_SOURCE, graphicId } from './graphics-register.mjs';

const ROOT = process.cwd();
const rootArg = process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : '../recovered';
const SOURCE = path.resolve(rootArg, GRAPHICS_SOURCE.chunk);
const OUT_LIBRARY = path.join(ROOT, 'public', 'api', 'v1', 'graphics.json');
const OUT_FILES = path.join(ROOT, 'public', 'studio', 'graphics');
const OUT_META = path.join(ROOT, 'src', 'data', 'generated', 'studio', 'graphics-meta.json');
const USABLE = new Set(['cleared', 'attribution-required']);

const { window } = new JSDOM('');
const env = { parser: new window.DOMParser(), serialize: (node) => new window.XMLSerializer().serializeToString(node) };

/** `eJ("Name", "<svg …>")` entries; the quote may be ", ' or `. */
function findGraphics(code) {
  const found = new Map();
  for (const match of code.matchAll(/eJ\("([^"]+)",(["'`])(<svg[\s\S]*?<\/svg>)\2\)/g)) found.set(match[1], match[3]);
  return found;
}

const code = await fs.readFile(SOURCE, 'utf8');
const found = findGraphics(code);
const missing = GRAPHICS.filter((g) => !found.has(g.name)).map((g) => g.name);
const unknown = [...found.keys()].filter((name) => !GRAPHICS.some((g) => g.name === name));
if (missing.length || unknown.length) {
  console.error(`Register and source disagree. Missing: ${missing.join(', ') || '—'}. Not in register: ${unknown.join(', ') || '—'}.`);
  process.exit(1);
}

await fs.rm(OUT_FILES, { recursive: true, force: true });
const library = [];
const audit = [];
for (const entry of GRAPHICS) {
  const id = graphicId(entry.name);
  const clean = sanitiseSvg(found.get(entry.name), env);
  const usable = USABLE.has(entry.rights);
  audit.push({ id, name: entry.name, group: entry.group, rights: entry.rights, width: clean.width, height: clean.height, bytes: clean.svg.length, removed: clean.removed, included: usable });
  if (!usable) continue;
  await fs.mkdir(OUT_FILES, { recursive: true });
  await fs.writeFile(path.join(OUT_FILES, `${id}.svg`), clean.svg);
  library.push({
    id,
    name: entry.name,
    group: entry.group,
    tags: entry.tags,
    width: clean.width,
    height: clean.height,
    url: `/studio/graphics/${id}.svg`,
    rights: entry.rights,
    ...(entry.attribution ? { attribution: entry.attribution } : {}),
  });
}

await fs.writeFile(OUT_LIBRARY, `${JSON.stringify({ graphics: library, withheld: GRAPHICS.length - library.length }, null, 2)}\n`);
await fs.mkdir(path.dirname(OUT_META), { recursive: true });
await fs.writeFile(OUT_META, `${JSON.stringify({ source: GRAPHICS_SOURCE, total: audit.length, included: library.length, graphics: audit }, null, 2)}\n`);
console.log(`Graphics: ${audit.length} found, ${library.length} cleared and included, ${audit.length - library.length} withheld (rights not confirmed).`);
