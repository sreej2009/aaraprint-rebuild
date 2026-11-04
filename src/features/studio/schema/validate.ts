import {
  CURRENT_SCHEMA_VERSION,
  DESIGN_FORMAT,
  FONT_WEIGHTS,
  SHAPE_KINDS,
  TEXT_ALIGNS,
  UPLOAD_MIME_TYPES,
  type AssetStorage,
  type DesignAsset,
  type DesignDocument,
  type DesignElement,
  type ImageSource,
  type SurfaceDesign,
  type SurfacePrint,
  type TrimShapeName,
} from './types';

/**
 * Parsing and validation for design documents loaded from storage (IndexedDB now, the backend
 * later). Hand-written checks keep the bundle free of a schema library. The result is rebuilt
 * from known fields only, so unknown keys are dropped and the output is always canonical.
 */

export type IssueCode =
  | 'invalid-json'
  | 'not-a-design'
  | 'unsupported-version'
  | 'too-large'
  | 'invalid-field'
  | 'duplicate-id'
  | 'missing-asset'
  | 'embedded-data';

export interface ValidationIssue {
  code: IssueCode;
  /** JSON path, e.g. "surfaces[0].elements[2].fontSize". */
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; document: DesignDocument; migratedFrom: number | null; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[] };

/** Upgrades a raw document from version N to N + 1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Registered upgrades, keyed by the version they upgrade *from*. None yet: v2 is the first. */
export const MIGRATIONS: ReadonlyMap<number, Migration> = new Map();

/** Generous: a busy design is ~100 KB. Anything near this limit is almost certainly embedded data. */
export const MAX_DOCUMENT_CHARS = 1_000_000;
export const MAX_TEXT_LENGTH = 5_000;
const MAX_COORDINATE = 1_000_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const SURFACE_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const TRIM_SHAPES: readonly TrimShapeName[] = ['rectangle', 'rounded-rectangle', 'ellipse'];

interface ParseOptions {
  migrations?: ReadonlyMap<number, Migration>;
}

export function parseDesign(input: unknown, options: ParseOptions = {}): ParseResult {
  let raw: unknown = input;
  let size: number;
  if (typeof input === 'string') {
    size = input.length;
    if (size > MAX_DOCUMENT_CHARS) return failure('too-large', '', `The design is too large to open (${size} characters).`);
    try {
      raw = JSON.parse(input);
    } catch {
      return failure('invalid-json', '', 'The design file is not valid JSON.');
    }
  } else {
    size = JSON.stringify(input)?.length ?? 0;
    if (size > MAX_DOCUMENT_CHARS) return failure('too-large', '', `The design is too large to open (${size} characters).`);
  }

  if (!isRecord(raw)) return failure('not-a-design', '', 'This is not an Aaraprint design.');
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) return failure('not-a-design', 'schemaVersion', 'This is not an Aaraprint design.');
  if (version === 1) {
    return failure('unsupported-version', 'schemaVersion', 'Designs saved by the previous Aaraprint site can’t be opened yet.');
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return failure('unsupported-version', 'schemaVersion', `This design was saved by a newer version of the Studio (format ${version}). Reload the page to update.`);
  }

  let migratedFrom: number | null = null;
  if (version < CURRENT_SCHEMA_VERSION) {
    const migrations = options.migrations ?? MIGRATIONS;
    let current = raw;
    for (let v = version; v < CURRENT_SCHEMA_VERSION; v += 1) {
      const migrate = migrations.get(v);
      if (!migrate) return failure('unsupported-version', 'schemaVersion', `Design format ${version} is no longer supported.`);
      current = { ...migrate(current), schemaVersion: v + 1 };
    }
    raw = current;
    migratedFrom = version;
  }

  if ((raw as Record<string, unknown>).format !== DESIGN_FORMAT) return failure('not-a-design', 'format', 'This is not an Aaraprint design.');

  const checker = new Checker();
  const document = readDocument(checker, raw as Record<string, unknown>);
  if (checker.errors.length || !document) return { ok: false, errors: checker.errors };
  return { ok: true, document, migratedFrom, warnings: checker.warnings };
}

/** Issues in an in-memory document (e.g. before saving). Empty when valid. */
export function validateDesign(document: DesignDocument): ValidationIssue[] {
  const result = parseDesign(document);
  return result.ok ? [] : result.errors;
}

function failure(code: IssueCode, path: string, message: string): ParseResult {
  return { ok: false, errors: [{ code, path, message }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class Checker {
  readonly errors: ValidationIssue[] = [];
  readonly warnings: ValidationIssue[] = [];

  fail(path: string, message: string, code: IssueCode = 'invalid-field'): undefined {
    this.errors.push({ code, path, message });
    return undefined;
  }

  record(path: string, value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : this.fail(path, 'must be an object');
  }

  array(path: string, value: unknown): unknown[] | undefined {
    return Array.isArray(value) ? value : this.fail(path, 'must be a list');
  }

  string(path: string, value: unknown, { pattern, max = 200, empty = false }: { pattern?: RegExp; max?: number; empty?: boolean } = {}): string | undefined {
    if (typeof value !== 'string') return this.fail(path, 'must be text');
    if (!empty && value.trim() === '') return this.fail(path, 'must not be empty');
    if (/^\s*data:/i.test(value)) return this.fail(path, 'must not contain embedded file data', 'embedded-data');
    if (value.length > max) return this.fail(path, `must be at most ${max} characters`);
    if (pattern && !pattern.test(value)) return this.fail(path, 'has an invalid format');
    return value;
  }

  number(path: string, value: unknown, { min = -Infinity, max = Infinity, integer = false }: { min?: number; max?: number; integer?: boolean } = {}): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return this.fail(path, 'must be a number');
    if (integer && !Number.isInteger(value)) return this.fail(path, 'must be a whole number');
    if (value < min || value > max) return this.fail(path, `must be between ${min} and ${max}`);
    return value;
  }

  boolean(path: string, value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : this.fail(path, 'must be true or false');
  }

  oneOf<T extends string | number>(path: string, value: unknown, allowed: readonly T[]): T | undefined {
    return allowed.includes(value as T) ? (value as T) : this.fail(path, `must be one of ${allowed.join(', ')}`);
  }

  color(path: string, value: unknown, { nullable = false } = {}): string | null | undefined {
    if (value === null && nullable) return null;
    if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) return this.fail(path, 'must be a colour like #1b1f27');
    return value.toLowerCase();
  }
}

function readDocument(c: Checker, raw: Record<string, unknown>): DesignDocument | undefined {
  const id = c.string('id', raw.id, { pattern: ID_PATTERN });
  const name = c.string('name', raw.name, { max: 120 });

  const productRaw = c.record('product', raw.product);
  const product = productRaw && {
    slug: c.string('product.slug', productRaw.slug, { pattern: /^[a-z0-9-]{1,120}$/ }),
    productId: c.string('product.productId', productRaw.productId, { pattern: ID_PATTERN }),
    variantId: productRaw.variantId === null ? null : c.string('product.variantId', productRaw.variantId, { pattern: ID_PATTERN }),
  };

  const metaRaw = c.record('meta', raw.meta);
  const meta = metaRaw && {
    createdAt: readTimestamp(c, 'meta.createdAt', metaRaw.createdAt),
    updatedAt: readTimestamp(c, 'meta.updatedAt', metaRaw.updatedAt),
    revision: c.number('meta.revision', metaRaw.revision, { min: 0, integer: true }),
  };

  const assets = readAssets(c, raw.assets);
  // Assets present but invalid are reported on their own; only report references to absent ones.
  const assetKeys = new Set(isRecord(raw.assets) ? Object.keys(raw.assets) : []);

  const surfacesRaw = c.array('surfaces', raw.surfaces);
  const surfaces: SurfaceDesign[] = [];
  if (surfacesRaw) {
    if (surfacesRaw.length === 0) c.fail('surfaces', 'must have at least one surface');
    if (surfacesRaw.length > 24) c.fail('surfaces', 'must have at most 24 surfaces');
    surfacesRaw.forEach((s, i) => {
      const surface = readSurface(c, `surfaces[${i}]`, s);
      if (surface) surfaces.push(surface);
    });
  }

  // Cross-references: unique ids and asset references.
  const surfaceIds = new Set<string>();
  const elementIds = new Set<string>();
  surfaces.forEach((surface, si) => {
    if (surfaceIds.has(surface.id)) c.fail(`surfaces[${si}].id`, `surface "${surface.id}" appears twice`, 'duplicate-id');
    surfaceIds.add(surface.id);
    surface.elements.forEach((element, ei) => {
      const path = `surfaces[${si}].elements[${ei}]`;
      if (elementIds.has(element.id)) c.fail(`${path}.id`, `element "${element.id}" appears twice`, 'duplicate-id');
      elementIds.add(element.id);
      if (element.type === 'image' && element.source.kind === 'asset' && !assetKeys.has(element.source.assetId)) {
        c.fail(`${path}.source.assetId`, `refers to an uploaded file that is missing from the design ("${element.source.assetId}")`, 'missing-asset');
      }
    });
  });

  if (c.errors.length) return undefined;
  return {
    format: DESIGN_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: id!,
    name: name!,
    product: product as DesignDocument['product'],
    surfaces,
    assets: assets!,
    meta: meta as DesignDocument['meta'],
  };
}

function readTimestamp(c: Checker, path: string, value: unknown): string | undefined {
  const text = c.string(path, value, { max: 40 });
  if (text !== undefined && Number.isNaN(Date.parse(text))) return c.fail(path, 'must be a date and time');
  return text;
}

function readSurface(c: Checker, path: string, raw: unknown): SurfaceDesign | undefined {
  const s = c.record(path, raw);
  if (!s) return undefined;
  const id = c.string(`${path}.id`, s.id, { pattern: SURFACE_ID_PATTERN });
  const label = c.string(`${path}.label`, s.label, { max: 60 });
  const print = readPrint(c, `${path}.print`, s.print);
  const backgroundRaw = c.record(`${path}.background`, s.background);
  const background = backgroundRaw && { color: c.color(`${path}.background.color`, backgroundRaw.color, { nullable: true }) };
  const elementsRaw = c.array(`${path}.elements`, s.elements);
  const elements: DesignElement[] = [];
  if (elementsRaw) {
    if (elementsRaw.length > 500) c.fail(`${path}.elements`, 'must have at most 500 elements');
    elementsRaw.forEach((e, i) => {
      const element = readElement(c, `${path}.elements[${i}]`, e, print);
      if (element) elements.push(element);
    });
  }
  if (id === undefined || label === undefined || !print || !background || background.color === undefined) return undefined;
  return { id, label, print, background: { color: background.color }, elements };
}

function readPrint(c: Checker, path: string, raw: unknown): SurfacePrint | undefined {
  const p = c.record(path, raw);
  if (!p) return undefined;
  const widthPx = c.number(`${path}.widthPx`, p.widthPx, { min: 1, max: 100_000, integer: true });
  const heightPx = c.number(`${path}.heightPx`, p.heightPx, { min: 1, max: 100_000, integer: true });
  // Only range-check bleed, safe zone and radius once the size itself is valid.
  const half = widthPx && heightPx ? Math.floor(Math.min(widthPx, heightPx) / 2) : Infinity;
  const dpi = c.number(`${path}.dpi`, p.dpi, { min: 50, max: 1200, integer: true });
  const bleedPx = c.number(`${path}.bleedPx`, p.bleedPx, { min: 0, max: half, integer: true });
  const safeZonePx = c.number(`${path}.safeZonePx`, p.safeZonePx, { min: 0, max: Math.max(half - 1, 0), integer: true });
  const trimRaw = c.record(`${path}.trim`, p.trim);
  const shape = trimRaw && c.oneOf(`${path}.trim.shape`, trimRaw.shape, TRIM_SHAPES);
  const cornerRadiusPx = trimRaw && c.number(`${path}.trim.cornerRadiusPx`, trimRaw.cornerRadiusPx, { min: 0, max: half });
  if ([widthPx, heightPx, dpi, bleedPx, safeZonePx, shape, cornerRadiusPx].some((v) => v === undefined)) return undefined;
  return { widthPx: widthPx!, heightPx: heightPx!, dpi: dpi!, bleedPx: bleedPx!, safeZonePx: safeZonePx!, trim: { shape: shape!, cornerRadiusPx: cornerRadiusPx! } };
}

function readElement(c: Checker, path: string, raw: unknown, print: SurfacePrint | undefined): DesignElement | undefined {
  const e = c.record(path, raw);
  if (!e) return undefined;
  const errorsBefore = c.errors.length;
  const coordinate = { min: -MAX_COORDINATE, max: MAX_COORDINATE };
  const size = { min: Number.MIN_VALUE, max: MAX_COORDINATE };
  const base = {
    id: c.string(`${path}.id`, e.id, { pattern: ID_PATTERN }),
    name: e.name === null ? null : c.string(`${path}.name`, e.name, { max: 80 }),
    x: c.number(`${path}.x`, e.x, coordinate),
    y: c.number(`${path}.y`, e.y, coordinate),
    width: c.number(`${path}.width`, e.width, size),
    height: c.number(`${path}.height`, e.height, size),
    rotation: c.number(`${path}.rotation`, e.rotation, { min: -360, max: 360 }),
    opacity: c.number(`${path}.opacity`, e.opacity, { min: 0, max: 1 }),
    locked: c.boolean(`${path}.locked`, e.locked),
    hidden: c.boolean(`${path}.hidden`, e.hidden),
  };
  const type = c.oneOf(`${path}.type`, e.type, ['text', 'shape', 'image'] as const);
  let element: DesignElement | undefined;
  if (type === 'text') {
    const maxFont = print ? print.heightPx * 4 : MAX_COORDINATE;
    element = {
      ...(base as Omit<DesignElement, 'type'>),
      type,
      text: c.string(`${path}.text`, e.text, { max: MAX_TEXT_LENGTH, empty: true }) ?? '',
      fontFamily: c.string(`${path}.fontFamily`, e.fontFamily, { max: 60, pattern: /^[A-Za-z0-9 ]+$/ }) ?? '',
      fontSize: c.number(`${path}.fontSize`, e.fontSize, { min: 1, max: maxFont }) ?? 0,
      fontWeight: c.oneOf(`${path}.fontWeight`, e.fontWeight, FONT_WEIGHTS) ?? 400,
      italic: c.boolean(`${path}.italic`, e.italic) ?? false,
      underline: c.boolean(`${path}.underline`, e.underline) ?? false,
      color: c.color(`${path}.color`, e.color) ?? '',
      align: c.oneOf(`${path}.align`, e.align, TEXT_ALIGNS) ?? 'left',
      lineHeight: c.number(`${path}.lineHeight`, e.lineHeight, { min: 0.5, max: 3 }) ?? 1,
      letterSpacing: c.number(`${path}.letterSpacing`, e.letterSpacing, { min: -0.5, max: 2 }) ?? 0,
      placeholder: c.boolean(`${path}.placeholder`, e.placeholder) ?? false,
    };
  } else if (type === 'shape') {
    element = {
      ...(base as Omit<DesignElement, 'type'>),
      type,
      shape: c.oneOf(`${path}.shape`, e.shape, SHAPE_KINDS) ?? 'rect',
      fill: c.color(`${path}.fill`, e.fill, { nullable: true }) ?? null,
      stroke: c.color(`${path}.stroke`, e.stroke, { nullable: true }) ?? null,
      strokeWidth: c.number(`${path}.strokeWidth`, e.strokeWidth, { min: 0, max: MAX_COORDINATE }) ?? 0,
      cornerRadius: c.number(`${path}.cornerRadius`, e.cornerRadius, { min: 0, max: MAX_COORDINATE }) ?? 0,
      points: c.number(`${path}.points`, e.points, { min: 3, max: 24, integer: true }) ?? 5,
    };
  } else if (type === 'image') {
    const source = readImageSource(c, `${path}.source`, e.source);
    if (source) element = { ...(base as Omit<DesignElement, 'type'>), type, source };
  }
  return c.errors.length === errorsBefore ? element : undefined;
}

function readImageSource(c: Checker, path: string, raw: unknown): ImageSource | undefined {
  const s = c.record(path, raw);
  if (!s) return undefined;
  const kind = c.oneOf(`${path}.kind`, s.kind, ['asset', 'graphic'] as const);
  if (kind === 'asset') {
    const assetId = c.string(`${path}.assetId`, s.assetId, { pattern: ID_PATTERN });
    return assetId === undefined ? undefined : { kind, assetId };
  }
  if (kind === 'graphic') {
    const graphicId = c.string(`${path}.graphicId`, s.graphicId, { pattern: /^[a-z0-9-]{1,60}$/ });
    return graphicId === undefined ? undefined : { kind, graphicId };
  }
  return undefined;
}

function readAssets(c: Checker, raw: unknown): Record<string, DesignAsset> | undefined {
  const record = c.record('assets', raw);
  if (!record) return undefined;
  const assets: Record<string, DesignAsset> = {};
  for (const [key, value] of Object.entries(record)) {
    const path = `assets.${key}`;
    const a = c.record(path, value);
    if (!a) continue;
    const id = c.string(`${path}.id`, a.id, { pattern: ID_PATTERN });
    if (id !== undefined && id !== key) c.fail(`${path}.id`, 'must match its key');
    const kind = c.oneOf(`${path}.kind`, a.kind, ['upload'] as const);
    const name = c.string(`${path}.name`, a.name, { max: 255 });
    const mime = c.oneOf(`${path}.mime`, a.mime, UPLOAD_MIME_TYPES);
    const bytes = c.number(`${path}.bytes`, a.bytes, { min: 1, max: 20 * 1024 * 1024, integer: true });
    const naturalWidth = c.number(`${path}.naturalWidth`, a.naturalWidth, { min: 1, max: 100_000, integer: true });
    const naturalHeight = c.number(`${path}.naturalHeight`, a.naturalHeight, { min: 1, max: 100_000, integer: true });
    const storage = readStorage(c, `${path}.storage`, a.storage);
    // Any extra field holding file data (e.g. a data: URL or a long base64 string) is refused, not dropped.
    for (const [field, fieldValue] of Object.entries(a)) {
      if (typeof fieldValue === 'string' && (/^\s*data:/i.test(fieldValue) || (fieldValue.length > 1024 && /^[A-Za-z0-9+/=\s]+$/.test(fieldValue)))) {
        c.fail(`${path}.${field}`, 'must not contain embedded file data', 'embedded-data');
      }
    }
    if ([id, kind, name, mime, bytes, naturalWidth, naturalHeight, storage].some((v) => v === undefined)) continue;
    assets[key] = { id: id!, kind: kind!, name: name!, mime: mime!, bytes: bytes!, naturalWidth: naturalWidth!, naturalHeight: naturalHeight!, storage: storage! };
  }
  return assets;
}

function readStorage(c: Checker, path: string, raw: unknown): AssetStorage | undefined {
  const s = c.record(path, raw);
  if (!s) return undefined;
  const kind = c.oneOf(`${path}.kind`, s.kind, ['local', 'remote'] as const);
  if (kind === 'local') {
    const blobId = c.string(`${path}.blobId`, s.blobId, { pattern: ID_PATTERN });
    return blobId === undefined ? undefined : { kind, blobId };
  }
  if (kind === 'remote') {
    // A storage path inside our bucket, never a URL with inline data.
    const path_ = c.string(`${path}.path`, s.path, { max: 500, pattern: /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/ });
    return path_ === undefined ? undefined : { kind, path: path_ };
  }
  return undefined;
}
