#!/usr/bin/env node
/**
 * Build one Design Studio profile per customisable product.
 *
 * Reads (read-only):
 *   public/api/v1/catalogue/products/<slug>.json   catalogue products (print config, options)
 *   ../recovered-additional, ../recovered          mockups, masks and 3D models (headers only)
 *
 * Writes:
 *   public/api/v1/studio/<slug>.json               Studio profile (mock API, like the catalogue)
 *   src/data/generated/studio/profiles-meta.json   counts, size audit, option-driven sizes,
 *                                                  rights summary and missing files
 *
 * Print sizes are copied unchanged from the catalogue (decision D2): mismatches are reported,
 * never corrected here.
 *
 * Usage: node scripts/studio/build-studio-profiles.mjs [--roots ../recovered-additional;../recovered]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { readGlbInfo, readImageInfo } from '../../tooling/media-info.ts';
import { resolveMediaFile } from '../../tooling/local-media.ts';
import { ASSET_RIGHTS, familyFor, familyMockups, geometryOptionsFor, modeFor, RIGHTS_NOTES, sideLabels, sizeCheckFor, trimFor } from './studio-rules.mjs';

const ROOT = process.cwd();
const rootsArg = process.argv.includes('--roots') ? process.argv[process.argv.indexOf('--roots') + 1] : null;
const MEDIA_ROOTS = (rootsArg?.split(path.delimiter) ?? ['../recovered-additional', '../recovered']).map((r) => path.resolve(r));
const CATALOGUE = path.join(ROOT, 'public', 'api', 'v1', 'catalogue', 'products');
const OUT_PUBLIC = path.join(ROOT, 'public', 'api', 'v1', 'studio');
const OUT_META = path.join(ROOT, 'src', 'data', 'generated', 'studio', 'profiles-meta.json');

const POLO_MODEL = 'models/polo-shirt.glb';
const HEADER_BYTES = 64;

async function main() {
  for (const root of MEDIA_ROOTS) {
    if (!(await exists(root))) throw new Error(`Media root not found: ${root}`);
  }
  const files = (await fs.readdir(CATALOGUE)).filter((f) => f.endsWith('.json')).sort();
  const products = await Promise.all(files.map(async (f) => JSON.parse(await fs.readFile(path.join(CATALOGUE, f), 'utf8'))));

  const missing = [];
  const profiles = [];
  const skipped = [];
  for (const product of products) {
    if (!product.isCustomizable || !product.print) {
      skipped.push(product.slug);
      continue;
    }
    profiles.push(await buildProfile(product, missing));
  }

  await fs.rm(OUT_PUBLIC, { recursive: true, force: true });
  await fs.mkdir(OUT_PUBLIC, { recursive: true });
  for (const profile of profiles) {
    await fs.writeFile(path.join(OUT_PUBLIC, `${profile.slug}.json`), `${JSON.stringify(profile)}\n`);
  }

  const meta = buildMeta(profiles, skipped, missing);
  await fs.mkdir(path.dirname(OUT_META), { recursive: true });
  await fs.writeFile(OUT_META, `${JSON.stringify(meta, null, 2)}\n`);

  console.log(`Studio profiles: ${profiles.length} written, ${skipped.length} not customisable (${skipped.join(', ')}).`);
  console.log(`Size audit: ${meta.sizeAudit.mismatches.length} named-size mismatches (kept unchanged, decision D2).`);
  if (missing.length) {
    console.error(`Missing media (${missing.length}):\n  ${missing.join('\n  ')}`);
    process.exitCode = 1;
  }
}

async function buildProfile(product, missing) {
  const family = familyFor(product);
  const labels = sideLabels(family);
  const print = product.print;
  const fallback = familyMockups(family);
  const sides = [];
  for (const id of ['front', 'back']) {
    const ref = print.mockups?.[id] ?? fallback?.[id] ?? null;
    sides.push({ id, label: labels[id], mockup: await mockupAsset(ref, missing, product.slug) });
  }
  return {
    schemaVersion: 1,
    slug: product.slug,
    productId: product.id,
    name: product.name,
    mode: modeFor(product),
    family,
    print: {
      widthPx: print.canvasWidthPx,
      heightPx: print.canvasHeightPx,
      dpi: print.dpi,
      bleedPx: print.bleedPx,
      safeZonePx: print.safeZonePx,
      printAreaSizeMultiplier: print.printAreaSizeMultiplier ?? 1,
    },
    trim: trimFor(product),
    sides,
    model3d: await modelAsset(product, family, missing),
    sizeCheck: sizeCheckFor(product),
    geometryOptions: geometryOptionsFor(product, family),
  };
}

async function mockupAsset(ref, missing, slug) {
  if (!ref) return null;
  const info = await imageInfo(ref);
  if (!info) {
    missing.push(`${slug}: ${ref}`);
    return null;
  }
  // Umbrella and rainwear mockups ship a fabric mask next to the photo.
  const maskRef = ref.replace(/\.(png|webp)$/i, '-mask.png');
  const mask = maskRef !== ref ? await imageInfo(maskRef) : null;
  return {
    ref,
    format: info.format,
    width: info.width,
    height: info.height,
    mask: mask ? { ref: maskRef, width: mask.width, height: mask.height } : null,
    rights: ASSET_RIGHTS.mockup.status,
  };
}

async function modelAsset(product, family, missing) {
  const configured = product.print.model3d;
  const ref = configured?.src ?? (family === 'polo' ? POLO_MODEL : null);
  if (!ref) return null;
  const file = resolveMediaFile(ref, MEDIA_ROOTS);
  const header = file ? readGlbInfo(await readHead(file)) : null;
  const bytes = file ? (await fs.stat(file)).size : 0;
  if (!header || header.version !== 2 || header.byteLength !== bytes) {
    missing.push(`${product.slug}: ${ref} (${file ? 'invalid GLB header' : 'not found'})`);
    return null;
  }
  const rights = ASSET_RIGHTS[path.posix.basename(ref)] ?? { status: 'unconfirmed' };
  return {
    ref,
    format: 'glb',
    bytes,
    rights: rights.status,
    ...(rights.attribution ? { attribution: rights.attribution } : {}),
    colorMaterialName: configured?.colorMaterialName ?? null,
    printAreas: configured?.printAreas ?? [],
  };
}

async function imageInfo(ref) {
  const file = resolveMediaFile(ref, MEDIA_ROOTS);
  return file ? readImageInfo(await readHead(file)) : null;
}

async function readHead(file) {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
  } finally {
    await handle.close();
  }
}

function buildMeta(profiles, skipped, missing) {
  const count = (pick) => {
    const out = {};
    for (const p of profiles) {
      const key = pick(p);
      out[key] = (out[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  };
  const checks = profiles.filter((p) => p.sizeCheck);
  const rights = {};
  for (const p of profiles) {
    for (const asset of [...p.sides.map((s) => s.mockup), p.model3d]) {
      if (!asset) continue;
      const entry = (rights[asset.ref] ??= { status: asset.rights, products: 0 });
      entry.products += 1;
    }
  }
  const byStatus = {};
  for (const { status } of Object.values(rights)) byStatus[status] = (byStatus[status] ?? 0) + 1;
  return {
    profiles: profiles.length,
    notCustomisable: skipped,
    byMode: count((p) => p.mode),
    byFamily: count((p) => p.family),
    byTrim: count((p) => p.trim.shape),
    trimOverrides: profiles.filter((p) => p.trim.source === 'product-override').map((p) => ({ slug: p.slug, shape: p.trim.shape, note: p.trim.note })),
    withMockups: profiles.filter((p) => p.sides.some((s) => s.mockup)).length,
    with3dModel: profiles.filter((p) => p.model3d).length,
    sizeAudit: {
      checked: checks.length,
      mismatches: checks
        .filter((p) => !p.sizeCheck.matches)
        .map((p) => ({ slug: p.slug, namedSize: p.sizeCheck.namedSize, actualMm: p.sizeCheck.actualMm, expectedMm: p.sizeCheck.expectedMm })),
    },
    optionDrivenSizes: profiles.filter((p) => p.geometryOptions.length).map((p) => ({ slug: p.slug, options: p.geometryOptions })),
    assetRights: {
      notes: RIGHTS_NOTES,
      sources: ASSET_RIGHTS,
      byStatus,
      files: Object.fromEntries(Object.entries(rights).sort(([a], [b]) => a.localeCompare(b))),
    },
    missing,
  };
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

await main();
