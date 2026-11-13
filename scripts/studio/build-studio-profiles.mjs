#!/usr/bin/env node
/**
 * Build one Design Studio profile per customisable product.
 *
 * Reads (read-only):
 *   public/api/v1/catalogue/products/<slug>.json   catalogue products (print config, options)
 *   ../recovered-additional, ../recovered          mockups, masks and 3D models (headers only)
 *   src/data/generated/studio/product-view-placements.json
 *                                                  where artwork sits on each mockup photo
 *                                                  (scripts/studio/extract-product-views.mjs), and the
 *                                                  umbrella and rainwear colour palette and photo colours,
 *                                                  and the pen and mug photo maps (M4)
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
import { ASSET_RIGHTS, rightsForMockup, familyFor, familyMockups, geometryOptionsFor, hasProductColours, modeFor, productViewFor, RIGHTS_NOTES, sideLabels, sizeCheckFor, trimFor } from './studio-rules.mjs';

const ROOT = process.cwd();
const rootsArg = process.argv.includes('--roots') ? process.argv[process.argv.indexOf('--roots') + 1] : null;
const MEDIA_ROOTS = (rootsArg?.split(path.delimiter) ?? ['../recovered-additional', '../recovered']).map((r) => path.resolve(r));
const CATALOGUE = path.join(ROOT, 'public', 'api', 'v1', 'catalogue', 'products');
const OUT_PUBLIC = path.join(ROOT, 'public', 'api', 'v1', 'studio');
const OUT_META = path.join(ROOT, 'src', 'data', 'generated', 'studio', 'profiles-meta.json');
const PLACEMENTS = path.join(ROOT, 'src', 'data', 'generated', 'studio', 'product-view-placements.json');

const POLO_MODEL = 'models/polo-shirt.glb';
const HEADER_BYTES = 64;

async function main() {
  for (const root of MEDIA_ROOTS) {
    if (!(await exists(root))) throw new Error(`Media root not found: ${root}`);
  }
  const placements = JSON.parse(await fs.readFile(PLACEMENTS, 'utf8'));
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
    profiles.push(await buildProfile(product, missing, placements));
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

async function buildProfile(product, missing, placements) {
  const family = familyFor(product);
  const mode = modeFor(product);
  const productView = productViewFor(family, mode);
  const labels = sideLabels(family);
  const print = product.print;
  const fallback = familyMockups(family);
  const colours = hasProductColours(family) ? productColoursFor(product, placements.umbrellaRainwearColours) : null;
  const photoColours = colours ? placements.umbrellaRainwearColours.photoColours[product.slug] : null;
  const sides = [];
  for (const [index, id] of ['front', 'back'].entries()) {
    if (family === 'pen' || family === 'mug') {
      sides.push({ id, label: labels[id], ...(await framedSide(family, product.slug, id, placements)) });
      continue;
    }
    const ref = print.mockups?.[id] ?? fallback?.[id] ?? null;
    const mockup = await mockupAsset(ref, missing, product.slug);
    // Only products with an on-product preview carry placements (others stay as in Phase 3); only
    // those with colours say what colour each photo was taken in (M3).
    sides.push({
      id,
      label: labels[id],
      mockup,
      ...(productView ? { placement: placementFor(mockup, placements) } : {}),
      ...(colours ? { photoColour: photoColours?.[index] ?? null } : {}),
    });
  }
  return {
    schemaVersion: 1,
    slug: product.slug,
    productId: product.id,
    name: product.name,
    mode,
    family,
    ...(productView ? { productView } : {}),
    ...(colours ? { productColours: colours } : {}),
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
    mask: mask ? { ref: maskRef, width: mask.width, height: mask.height, rights: rightsForMockup(maskRef, 'mask') } : null,
    rights: rightsForMockup(ref),
  };
}

/**
 * The original's box for this exact photo, or null. Matched by file name within the photo set,
 * and only when the photo is the size the box was measured on. No fallbacks are guessed.
 */
function placementFor(mockup, placements) {
  if (!mockup) return null;
  for (const set of Object.values(placements.sets)) {
    if (!mockup.ref.startsWith(set.folder) || !mockup.ref.endsWith(set.extension)) continue;
    const box = set.entries[mockup.ref.slice(set.folder.length, -set.extension.length)];
    if (!box || mockup.width !== set.mockupSize.width || mockup.height !== set.mockupSize.height) return null;
    const [centerX, centerY, maxWidth, maxHeight] = box;
    return { centerX, centerY, maxWidth, maxHeight };
  }
  return null;
}

/**
 * The product's own colour options that the original could show (Phase 4 M3): its colour option
 * group's values with an entry in the original palette, matched by name. The default is the
 * default variant's colour (as the original), else the first. Null when none match.
 */
function productColoursFor(product, register) {
  const group = product.optionGroups?.find((g) => /colou?r/i.test(g.name) && g.values.length > 0);
  if (!group) return null;
  const options = group.values.flatMap((value) => {
    const hex = register.palette[value.label.trim().toLowerCase()];
    return hex ? [{ id: value.id, label: value.label.trim(), hex }] : [];
  });
  if (!options.length) return null;
  const defaultVariant = product.variants?.find((v) => v.isDefault);
  const defaultOption = options.find((o) => defaultVariant?.optionValueIds.includes(o.id)) ?? options[0];
  return { options, defaultId: defaultOption.id };
}

/**
 * A pen or mug side (Phase 4 M4), from the original's photo maps:
 *   pens — the family's front or back photo, filling a 2000 × 700 frame; the print box is the same
 *          for every pen (centre 1160, 350; at most 700 × 104 frame px);
 *   mugs — one paired photo holding both sides: the front is its left half drawn at x 0 of a
 *          900 × 1086 frame, the back its right half drawn 176 px in; each mug has its own box.
 * Sides whose photo isn't in the recovered folders (the paper pen; four mugs) get no photo, and so
 * stay flat. No photo, frame or box is ever guessed.
 */
async function framedSide(family, slug, sideId, placements) {
  const none = { mockup: null, placement: null, photoFrame: null };
  let ref;
  let box;
  let frame;
  let crop = null;
  let at;
  if (family === 'pen') {
    const pen = placements.pens.products[slug];
    if (!pen) return none;
    const photos = placements.pens.families[pen.family];
    ref = `products/pens-2d/${sideId === 'back' ? photos.back : photos.front}`;
    frame = placements.pens.frame;
    box = placements.pens.box;
    at = { x: 0, y: 0, width: frame.width, height: frame.height };
  } else {
    const mug = placements.mugs.products[slug];
    if (!mug) return none;
    const { sideWidth, backOffsetX } = placements.mugs;
    ref = `products/mugs-2d/${mug.photo}`;
    frame = placements.mugs.frame;
    box = mug.box;
    crop = { x: sideId === 'back' ? sideWidth : 0, y: 0, width: sideWidth, height: null };
    at = { x: sideId === 'back' ? backOffsetX : 0, y: 0, width: sideWidth, height: frame.height };
  }
  const info = await imageInfo(ref);
  if (!info) {
    unavailablePhotos.add(`${slug}: ${ref}`);
    return none;
  }
  if (crop) crop = { ...crop, height: info.height };
  const shown = crop ?? { width: info.width, height: info.height };
  const fits = (crop ? crop.x + crop.width <= info.width : true) && Math.abs(shown.width / shown.height / (at.width / at.height) - 1) < 0.01;
  const [centerX, centerY, maxWidth, maxHeight] = box;
  return {
    mockup: { ref, format: info.format, width: info.width, height: info.height, mask: null, rights: rightsForMockup(ref) },
    placement: fits ? { centerX, centerY, maxWidth, maxHeight } : null,
    photoFrame: fits ? { width: frame.width, height: frame.height, crop, at } : null,
  };
}

/** Pen and mug photos the original refers to that aren't in the recovered folders (reported, not errors). */
const unavailablePhotos = new Set();

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
    productViews: {
      byKind: count((p) => p.productView ?? 'none'),
      withPlacements: profiles.filter((p) => p.productView && p.sides.every((s) => s.placement)).length,
      withoutPlacements: profiles.filter((p) => p.productView && !p.sides.every((s) => s.placement)).map((p) => p.slug),
      withColours: profiles.filter((p) => p.productColours).length,
      unavailablePhotos: [...unavailablePhotos].sort(),
      withoutColours: profiles.filter((p) => hasProductColours(p.family) && !p.productColours).map((p) => p.slug),
    },
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
