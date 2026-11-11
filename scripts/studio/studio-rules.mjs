/**
 * Rules used to build Studio profiles from catalogue products.
 *
 * Families mirror the product detectors in the original Studio code (isPoloProduct,
 * isPenProduct, isMugProduct, isDrinkwareProduct, isUmbrellaRainwear…, isSignPoster…,
 * isRoundMousePad…, isOvalCardProduct). They are recorded now so Phase 4 can pick the
 * on-product workspace; in Phase 3 every product opens on its flat print area.
 */

/** @param {{ slug: string, categorySlug: string | null, print: { category: string } }} product */
export function familyFor(product) {
  const { slug, categorySlug: category } = product;
  const kind = product.print.category;
  if (slug === 'gift-mousepad-round-photo') return 'round-pad';
  if (category === 'custom-polo-t-shirts' || slug.includes('polo')) return 'polo';
  if (category === 'pens') return 'pen';
  if (category === 'drinkware' || /bottle/.test(slug)) return 'drinkware';
  if (/(^|-)mug-/.test(slug)) return 'mug';
  if (category === 'umbrellas-rainwear') return kind === 'wrap' ? 'umbrella' : 'rainwear';
  if (category === 'clothing-caps-bags') return kind === 'apparel' ? 'apparel' : 'bag';
  if (category === 'signs-posters-marketing-materials') return 'sign-poster';
  if (category === 'labels-stickers-packaging') return 'label-packaging';
  if (category === 'stamps-and-ink') return 'stamp';
  if (category === 'visiting-cards') return 'visiting-card';
  if (category === 'stationery-letterheads-notebooks') return 'stationery';
  return 'gift';
}

const MODE_BY_PRINT_CATEGORY = { flat_print: 'flat', apparel: 'apparel', wrap: 'wrap' };

export function modeFor(product) {
  const mode = MODE_BY_PRINT_CATEGORY[product.print.category];
  if (!mode) throw new Error(`${product.slug}: unknown print category "${product.print.category}"`);
  return mode;
}

/**
 * Products that get the "On the product" view: umbrellas, rainwear and wrap-printed drinkware
 * (Phase 4 M1), pens and mugs (M4). Flat-printed drinkware, apparel, bags, signs and gifts don't, yet.
 */
export function productViewFor(family, mode) {
  if (family === 'umbrella' || family === 'rainwear' || family === 'pen' || family === 'mug') return family;
  if (family === 'drinkware' && mode === 'wrap') return 'drinkware-wrap';
  return null;
}

/** Products whose photo can be recoloured with its fabric mask (Phase 4 M3). Not drinkware (yet). */
export function hasProductColours(family) {
  return family === 'umbrella' || family === 'rainwear';
}

/** Side labels. Polos keep the original's placement names. */
export function sideLabels(family) {
  if (family === 'polo') return { front: 'Left chest', back: 'Upper back' };
  return { front: 'Front', back: 'Back' };
}

/** Default corner radius for rounded trims; matches the "Standard (3mm)" corner option. */
export const DEFAULT_CORNER_RADIUS_MM = 3;

/**
 * Trim profile. The print config only says rectangle / rounded-rectangle / circle.
 * Overrides follow the original Studio, which drew oval cards as ellipses by slug.
 * Size is never changed here (decision D2).
 */
export function trimFor(product) {
  const { trimShape, canvasWidthPx: w, canvasHeightPx: h, dpi } = product.print;
  if (product.slug === 'business-card-oval') {
    return { shape: 'ellipse', cornerRadiusPx: 0, source: 'product-override', note: 'Oval card: drawn as an ellipse, as in the original Studio.' };
  }
  if (trimShape === 'circle') {
    return { shape: 'ellipse', cornerRadiusPx: 0, source: 'print-config', ...(w !== h ? { note: 'Circle trim on a non-square canvas: drawn as an ellipse.' } : {}) };
  }
  if (trimShape === 'rounded-rectangle') {
    const radius = Math.min(Math.round((DEFAULT_CORNER_RADIUS_MM / 25.4) * dpi), Math.floor(Math.min(w, h) / 2));
    return { shape: 'rounded-rectangle', cornerRadiusPx: radius, source: 'print-config' };
  }
  if (trimShape === 'rectangle') return { shape: 'rectangle', cornerRadiusPx: 0, source: 'print-config' };
  throw new Error(`${product.slug}: unknown trim shape "${trimShape}"`);
}

/** ISO paper sizes and DL, portrait, in mm. DL also matches the DL envelope. */
const NAMED_SIZES = {
  A3: [[297, 420]],
  A4: [[210, 297]],
  A5: [[148, 210]],
  A6: [[105, 148]],
  A7: [[74, 105]],
  DL: [
    [99, 210],
    [110, 220],
  ],
};
const SIZE_TOLERANCE_MM = 2;

/**
 * Compares a size named in the product slug ("flyer-a5-…", "…-dl") with the canvas.
 * Returns null when the product doesn't name a size.
 */
export function sizeCheckFor(product) {
  const match = /(?:^|-)(a[3-7]|dl)(?:-|$)/i.exec(product.slug);
  if (!match) return null;
  const namedSize = match[1].toUpperCase();
  const { canvasWidthPx: w, canvasHeightPx: h, dpi } = product.print;
  const actual = [w, h].map((px) => Math.round((px / dpi) * 25.4 * 10) / 10);
  const [short, long] = [...actual].sort((a, b) => a - b);
  const expected = NAMED_SIZES[namedSize];
  const matches = expected.some(([es, el]) => Math.abs(es - short) <= SIZE_TOLERANCE_MM && Math.abs(el - long) <= SIZE_TOLERANCE_MM);
  return { namedSize, expectedMm: expected, actualMm: actual, matches };
}

/**
 * Option groups whose real-world effect is a different print size or shape. The catalogue
 * has one canvas per product, so in Phase 3 these options don't change the canvas.
 */
const GEOMETRY_OPTION = /^(size|diameter|corner radius|impression size|shape|width|height|table size|stand width|bag size|head size|frame shape|oval style|leaf style)$/i;

/** On garments "Size" means S / M / L, not print size. */
const GARMENT_FAMILIES = new Set(['polo', 'apparel', 'rainwear']);

export function geometryOptionsFor(product, family) {
  return product.optionGroups
    .map((g) => g.name.trim())
    .filter((name) => GEOMETRY_OPTION.test(name) && !(name === 'Size' && GARMENT_FAMILIES.has(family)));
}

/** Polos have no mockup in their print config; the original fell back to one shared polo mockup. */
export function familyMockups(family) {
  return family === 'polo' ? { front: 'products/polo/front.png', back: 'products/polo/back.png' } : null;
}

/**
 * Usage rights per asset. Only "cleared" and "attribution-required" assets may be shown in the
 * Studio; "unconfirmed" assets are recorded but not used (Phase 3 rule for D5). Profiles carry the
 * status only; notes are kept here and in the profiles meta file.
 */
export const RIGHTS_NOTES = {
  unconfirmed: 'Origin and licence not confirmed. Do not use in the Studio until the business confirms the rights.',
  'attribution-required': 'Usable with the attribution shown on /credits.',
  cleared: 'Rights confirmed.',
};

export const ASSET_RIGHTS = {
  mockup: { status: 'unconfirmed', source: 'Product mockups from the original site; several show brand-name products (Asset Inventory §9).' },
  mask: { status: 'unconfirmed', source: 'Fabric masks next to the umbrella and rainwear mockups, from the original site (Asset Inventory §9).' },
  'polo-shirt.glb': { status: 'attribution-required', source: '"POLO SHIRT" by arvintriyoga, CC BY 4.0.', attribution: '"POLO SHIRT" by arvintriyoga, licensed under CC BY 4.0' },
  'shirt_baked.glb': { status: 'unconfirmed', source: 'Homepage 3D shirt from the original site; licence unknown (Asset Inventory §4).' },
};
