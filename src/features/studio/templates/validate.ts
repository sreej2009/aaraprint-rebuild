import { emptyConfiguration } from '@/features/product-workflow/configuration';
import { fontByFamily } from '../assets/fonts';
import { printBoxes } from '../geometry/boxes';
import { canUseAsset, type RightsStatus, type StudioFamily } from '../profile/types';
import { samePrint } from '../schema/compat';
import { CURRENT_SCHEMA_VERSION, DESIGN_FORMAT, type DesignElement, type SurfaceDesign } from '../schema/types';
import { parseDesign, type ValidationIssue } from '../schema/validate';
import { TEMPLATE_CATEGORIES, TEMPLATE_SIDES, type StudioTemplate, type TemplateCategory, type TemplateSurface } from './types';

/**
 * Checking template definitions (Plan M13). Template data is treated as untrusted: each one is
 * checked on its own, and one that fails is left out of the panel without affecting the others.
 * The sides go through the same M2 parser as saved designs (so the elements are exactly what the
 * Studio can edit), plus the rules only templates have:
 * - only cleared rights, known product families and the Studio's own fonts;
 * - no uploaded images (a template can't rely on files in someone's browser);
 * - every element at least partly inside the bleed box, and both sides on one print size.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,59}$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9 &'-]{0,29}$/;
const MAX_TAGS = 12;
const RIGHTS: readonly RightsStatus[] = ['cleared', 'attribution-required', 'unconfirmed'];
export const TEMPLATE_FAMILIES: readonly StudioFamily[] = [
  'visiting-card',
  'stationery',
  'stamp',
  'sign-poster',
  'label-packaging',
  'bag',
  'apparel',
  'polo',
  'rainwear',
  'umbrella',
  'gift',
  'mug',
  'drinkware',
  'pen',
  'round-pad',
];

export type TemplateCheck = { ok: true; template: StudioTemplate } | { ok: false; id: string; reason: 'invalid' | 'rights'; errors: ValidationIssue[] };

const issue = (path: string, message: string): ValidationIssue => ({ code: 'invalid-field', path, message });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function checkTemplate(raw: unknown): TemplateCheck {
  if (!isRecord(raw)) return { ok: false, id: '?', reason: 'invalid', errors: [issue('', 'must be an object')] };
  const id = typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? raw.id : null;
  const errors: ValidationIssue[] = [];
  if (!id) errors.push(issue('id', 'must be a lower-case id like "card-minimal"'));

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > 60) errors.push(issue('name', 'must be 1–60 characters'));
  const description = raw.description === undefined ? '' : raw.description;
  if (typeof description !== 'string' || description.length > 200) errors.push(issue('description', 'must be at most 200 characters'));
  if (!TEMPLATE_CATEGORIES.includes(raw.category as TemplateCategory)) errors.push(issue('category', `must be one of ${TEMPLATE_CATEGORIES.join(', ')}`));
  const tags = Array.isArray(raw.tags) ? raw.tags : null;
  if (!tags || tags.length > MAX_TAGS || !tags.every((t) => typeof t === 'string' && TAG_PATTERN.test(t))) errors.push(issue('tags', `must be up to ${MAX_TAGS} short lower-case words`));
  const families = Array.isArray(raw.families) ? raw.families : null;
  if (!families || families.length === 0 || !families.every((f) => TEMPLATE_FAMILIES.includes(f as StudioFamily))) errors.push(issue('families', 'must list known product families'));
  if (!RIGHTS.includes(raw.rights as RightsStatus)) errors.push(issue('rights', `must be one of ${RIGHTS.join(', ')}`));
  if (raw.basedOn !== null && (typeof raw.basedOn !== 'string' || !ID_PATTERN.test(raw.basedOn))) errors.push(issue('basedOn', 'must be an original template id or null'));

  const surfaces = isRecord(raw.surfaces) ? raw.surfaces : null;
  let parsed: { front: TemplateSurface; back?: TemplateSurface } | null = null;
  if (!surfaces || !surfaces.front) {
    errors.push(issue('surfaces.front', 'is required'));
  } else {
    const extra = Object.keys(surfaces).filter((key) => !TEMPLATE_SIDES.includes(key as never));
    if (extra.length) errors.push(issue('surfaces', `has unknown sides: ${extra.join(', ')}`));
    parsed = readSurfaces(surfaces, errors);
  }

  if (errors.length || !id || !parsed) return { ok: false, id: id ?? String(raw.id ?? '?'), reason: 'invalid', errors };
  // Checked last, so a template that is both broken and withheld reports what's broken.
  if (!canUseAsset(raw.rights as RightsStatus)) return { ok: false, id, reason: 'rights', errors: [issue('rights', 'usage rights aren’t confirmed')] };
  return {
    ok: true,
    template: {
      id,
      name,
      description: description as string,
      category: raw.category as TemplateCategory,
      tags: [...(tags as string[])],
      families: [...(families as StudioFamily[])],
      rights: raw.rights as RightsStatus,
      basedOn: (raw.basedOn as string | null) ?? null,
      surfaces: parsed,
    },
  };
}

/** Both sides as one throwaway design, so the M2 parser checks them together (ids unique across sides). */
function readSurfaces(surfaces: Record<string, unknown>, errors: ValidationIssue[]): { front: TemplateSurface; back?: TemplateSurface } | null {
  const sides = TEMPLATE_SIDES.filter((side) => surfaces[side] !== undefined);
  const designSurfaces = sides.map((side) => {
    const s = isRecord(surfaces[side]) ? surfaces[side] : {};
    return { id: side, label: side === 'front' ? 'Front' : 'Back', print: s.print, background: s.background, elements: s.elements };
  });
  const result = parseDesign({
    format: DESIGN_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'template',
    name: 'Template',
    product: { slug: 'template', productId: 'template', familyId: null, variantId: null, sku: null, configuration: emptyConfiguration() },
    surfaces: designSurfaces,
    assets: {},
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', revision: 0 },
  });
  if (!result.ok) {
    errors.push(...result.errors.map((e) => ({ ...e, path: e.path.replace(/^surfaces\[(\d)\]/, (_, i: string) => `surfaces.${sides[Number(i)]}`) })));
    return null;
  }
  const [front, back] = result.document.surfaces as [SurfaceDesign, SurfaceDesign | undefined];
  for (const surface of result.document.surfaces) checkElements(surface, errors);
  if (back && !samePrint(front.print, back.print)) errors.push(issue('surfaces.back.print', 'must be the same size as the front'));
  if (errors.length) return null;
  const toTemplate = (s: SurfaceDesign): TemplateSurface => ({ print: s.print, background: s.background, elements: s.elements });
  return back ? { front: toTemplate(front), back: toTemplate(back) } : { front: toTemplate(front) };
}

function checkElements(surface: SurfaceDesign, errors: ValidationIssue[]) {
  const bleed = printBoxes(surface.print).bleed;
  surface.elements.forEach((element: DesignElement, index) => {
    const path = `surfaces.${surface.id}.elements[${index}]`;
    if (element.type === 'image' && element.source.kind === 'asset') errors.push(issue(`${path}.source`, 'templates can’t use uploaded images'));
    if (element.type === 'text' && !fontByFamily(element.fontFamily)) errors.push(issue(`${path}.fontFamily`, `“${element.fontFamily}” isn’t a Studio font`));
    const inside = element.x < bleed.x + bleed.width && element.x + element.width > bleed.x && element.y < bleed.y + bleed.height && element.y + element.height > bleed.y;
    if (!inside || element.width <= 0 || element.height <= 0) errors.push(issue(path, 'must be at least partly on the printed area'));
  });
}

export interface TemplateCatalogue {
  templates: StudioTemplate[];
  /** Templates left out: broken data, or rights not confirmed. For tests and development. */
  rejected: { id: string; reason: 'invalid' | 'rights'; errors: ValidationIssue[] }[];
}

/** Check every definition; keep the good ones in order, drop duplicates (the first one wins). */
export function buildCatalogue(raw: readonly unknown[]): TemplateCatalogue {
  const templates: StudioTemplate[] = [];
  const rejected: TemplateCatalogue['rejected'] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const check = checkTemplate(entry);
    if (!check.ok) {
      rejected.push({ id: check.id, reason: check.reason, errors: check.errors });
    } else if (seen.has(check.template.id)) {
      rejected.push({ id: check.template.id, reason: 'invalid', errors: [issue('id', 'is used by another template')] });
    } else {
      seen.add(check.template.id);
      templates.push(check.template);
    }
  }
  return { templates, rejected };
}
