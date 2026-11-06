import type { RightsStatus, StudioFamily } from '../profile/types';
import type { DesignElement, SurfaceBackground, SurfacePrint } from '../schema/types';

/**
 * Studio templates (Plan M13): ready-made layouts stored as design-document data (M2 elements,
 * a side background and the print geometry they were laid out on). Never Konva nodes, HTML,
 * object URLs, Blobs or embedded images. Applying one copies its elements into the design with
 * fresh ids (templates/apply.ts); the template itself is never changed.
 */

export const TEMPLATE_CATEGORIES = ['Business', 'Events', 'Promotions', 'Stationery', 'Labels & stamps'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_SIDES = ['front', 'back'] as const;
export type TemplateSide = (typeof TEMPLATE_SIDES)[number];

/** One side of a template, laid out on a known finished size (print px at its DPI, origin at the trim's top-left). */
export interface TemplateSurface {
  print: SurfacePrint;
  background: SurfaceBackground;
  /** Bottom to top, as in a design. Ids are the template's own and are never reused in designs. */
  elements: DesignElement[];
}

export interface StudioTemplate {
  /** Stable, e.g. "card-minimal-centred". */
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  /** Product families it was laid out for (M1 profiles). Other families can't use it. */
  families: StudioFamily[];
  /** Usage rights: only cleared templates are offered. */
  rights: RightsStatus;
  /** The original site's template this one was re-authored from (layout reference only), if any. */
  basedOn: string | null;
  /** Front is required; a back makes it a two-sided template. Both sides share one print size. */
  surfaces: { front: TemplateSurface; back?: TemplateSurface };
}

export function isTwoSided(template: StudioTemplate): boolean {
  return Boolean(template.surfaces.back);
}

/** Graphics (M9) a template uses; it's only offered while every one of them is in the approved library. */
export function templateGraphicIds(template: StudioTemplate): string[] {
  const ids = new Set<string>();
  for (const surface of [template.surfaces.front, template.surfaces.back]) {
    for (const element of surface?.elements ?? []) if (element.type === 'image' && element.source.kind === 'graphic') ids.add(element.source.graphicId);
  }
  return [...ids];
}
